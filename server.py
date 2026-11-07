#!/usr/bin/env python3
"""FiavaionDictate local server — static files + API endpoints"""
import collections
import http.server
import json
import os
import pathlib
import re
import ssl
import time
import urllib.parse
import urllib.request

# ---------------------------------------------------------------------------
# Rate limiting for /api/ai/proxy (30 requests per 60-second window per IP)
# ---------------------------------------------------------------------------
_RATE_WINDOW = 60
_RATE_MAX = 30
_rate_buckets: dict = {}

def _check_rate_limit(ip: str) -> bool:
    now = time.monotonic()
    bucket = _rate_buckets.setdefault(ip, collections.deque())
    while bucket and now - bucket[0] > _RATE_WINDOW:
        bucket.popleft()
    if len(bucket) >= _RATE_MAX:
        return False
    bucket.append(now)
    return True

DEFAULT_PROJECTS_ROOT = str(pathlib.Path.home() / "AIprojects")
APP_ROOT = pathlib.Path(__file__).parent
CONFIG_FILE = APP_ROOT / "config.json"
PORT = 31000

APP_ORIGINS = {f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}"}
ALLOWED_HOSTS = {"localhost", "127.0.0.1"}
MAX_BODY_BYTES = 4 * 1024 * 1024
MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
STATIC_DIRS = ("js", "css")
# index.html carries a static meta CSP for GitHub Pages; this server sends the header instead.
META_CSP = re.compile(r'<meta http-equiv="Content-Security-Policy"[^>]*>\r?\n?')


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _load_config():
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_config(cfg):
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def get_projects_root():
    cfg = _load_config()
    return pathlib.Path(cfg.get("projectsRoot", DEFAULT_PROJECTS_ROOT))


def set_projects_root(path_str):
    p = pathlib.Path(path_str).resolve()
    if not p.is_dir():
        return False, "Directory does not exist"
    cfg = _load_config()
    cfg["projectsRoot"] = str(p)
    _save_config(cfg)
    return True, str(p)


def ollama_origin(value):
    """Return the http(s) origin of an Ollama URL, or None if it is not a valid one."""
    try:
        parts = urllib.parse.urlsplit(value)
        port = parts.port
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    if parts.username or parts.password:
        return None
    host = parts.hostname
    if ":" in host:
        host = f"[{host}]"
    default_port = 80 if parts.scheme == "http" else 443
    suffix = f":{port}" if port and port != default_port else ""
    return f"{parts.scheme}://{host}{suffix}"


def get_ollama_url():
    return ollama_origin(_load_config().get("ollamaUrl", ""))


def set_ollama_url(value):
    cfg = _load_config()
    if not value:
        cfg.pop("ollamaUrl", None)
        _save_config(cfg)
        return True, None
    origin = ollama_origin(value)
    if not origin:
        return False, "Ollama URL must be an http(s) URL"
    cfg["ollamaUrl"] = origin
    _save_config(cfg)
    return True, origin


def content_security_policy():
    """Same policy as electron/server.js; connect-src includes the saved Ollama URL."""
    connect = ["'self'", "http://localhost:*", "http://127.0.0.1:*"]
    saved = get_ollama_url()
    if saved:
        connect.append(saved)
    return "; ".join([
        "default-src 'self'",
        "script-src 'self' https://cdn.jsdelivr.net/npm/mermaid@10.9.8/dist/mermaid.min.js",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src " + " ".join(connect),
        "media-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
    ])


# ---------------------------------------------------------------------------
# Project helpers
# ---------------------------------------------------------------------------

def _read_pkg(path):
    try:
        data = json.loads((path / "package.json").read_text(encoding="utf-8"))
        deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
        tags = []
        if "electron" in deps:                              tags.append("Electron")
        if "react" in deps:                                 tags.append("React")
        if "vue" in deps:                                   tags.append("Vue")
        if "svelte" in deps:                                tags.append("Svelte")
        if "astro" in deps:                                 tags.append("Astro")
        if "next" in deps:                                  tags.append("Next.js")
        if "express" in deps:                               tags.append("Express")
        if "fastify" in deps:                               tags.append("Fastify")
        if "vite" in deps:                                  tags.append("Vite")
        if "typescript" in deps or "@types/node" in deps:   tags.append("TypeScript")
        if "tailwindcss" in deps:                           tags.append("Tailwind")
        if "better-sqlite3" in deps or "sqlite3" in deps:  tags.append("SQLite")
        return ", ".join(tags) if tags else "Node.js"
    except Exception:
        return "Node.js"


def detect_stack(project_path):
    p = pathlib.Path(project_path)
    parts = []

    if (p / "package.json").exists():
        parts.extend(_read_pkg(p).split(", "))

    if (p / "requirements.txt").exists() or (p / "pyproject.toml").exists():
        parts.append("Python")
        if (p / "backend").is_dir() and (p / "backend" / "main.py").exists():
            parts.append("FastAPI")

    if (p / "Cargo.toml").exists():   parts.append("Rust")
    if (p / "go.mod").exists():       parts.append("Go")
    if (p / "pom.xml").exists():      parts.append("Java/Maven")
    if (p / "build.gradle").exists(): parts.append("Java/Gradle")

    seen = set()
    deduped = []
    for part in parts:
        part = part.strip()
        if part and part not in seen:
            seen.add(part)
            deduped.append(part)

    return ", ".join(deduped)


def browse_directory(path_str):
    """List subdirectories of a given path for the folder browser."""
    p = pathlib.Path(path_str) if path_str else pathlib.Path.home()
    if not p.is_dir():
        return None, "Directory does not exist"
    dirs = []
    try:
        for entry in sorted(p.iterdir(), key=lambda e: e.name.lower()):
            if not entry.is_dir() or entry.name.startswith("."):
                continue
            dirs.append(entry.name)
    except PermissionError:
        pass
    parent = str(p.parent) if p.parent != p else None
    return {"path": str(p), "parent": parent, "dirs": dirs}, None


def get_drive_roots():
    """Return drive roots: Windows drive letters, or / on Unix/Mac."""
    import sys
    if sys.platform == 'win32':
        import string
        return [str(pathlib.Path(f"{l}:\\")) for l in string.ascii_uppercase
                if pathlib.Path(f"{l}:\\").exists()]
    return ['/']


def get_projects():
    results = []
    try:
        for entry in get_projects_root().iterdir():
            if not entry.is_dir() or entry.name.startswith("."):
                continue
            try:
                stat = entry.stat()
                results.append({
                    "name": entry.name,
                    "path": str(entry),
                    "modified": stat.st_mtime,
                    "stack": detect_stack(entry),
                })
            except Exception:
                pass
    except Exception:
        pass
    return results


def scan_project(project_name):
    """Walk project directory (max depth 4), return file list and stack info."""
    projects_root = get_projects_root()
    root = projects_root / project_name
    # Containment check: reject names like '../secret' that escape the projects root.
    try:
        root.resolve().relative_to(projects_root.resolve())
    except ValueError:
        return {"name": project_name, "stack": "", "files": []}
    if not root.is_dir():
        return {"name": project_name, "stack": "", "files": []}

    skip_dirs = {"node_modules", ".git", "dist", "build", "__pycache__", ".next",
                 ".nuxt", "vendor", "target", ".venv", "venv", "coverage", ".cache"}
    skip_ext = {".pyc", ".pyo", ".class", ".o", ".so", ".dll", ".exe", ".wasm",
                ".map", ".min.js", ".min.css", ".lock", ".log"}

    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        depth = len(pathlib.Path(dirpath).relative_to(root).parts)
        if depth > 4:
            dirnames.clear()
            continue
        dirnames[:] = [d for d in dirnames if d not in skip_dirs and not d.startswith(".")]
        for fname in filenames:
            if fname.startswith("."):
                continue
            ext = pathlib.Path(fname).suffix.lower()
            if ext in skip_ext:
                continue
            rel = str(pathlib.Path(dirpath, fname).relative_to(root)).replace("\\", "/")
            files.append(rel)
        if len(files) > 500:
            break

    return {
        "name": project_name,
        "stack": detect_stack(root),
        "files": files,
    }


# ---------------------------------------------------------------------------
# Cloud AI proxy — forwards browser requests to provider APIs
# ---------------------------------------------------------------------------

_SSL_CTX = ssl.create_default_context()


def _safe_error_message(status_code, raw_body):
    """Extract a safe user-facing message from an upstream API error body."""
    try:
        data = json.loads(raw_body)
        # Anthropic: {"error": {"type": "...", "message": "..."}}
        if isinstance(data.get("error"), dict):
            return data["error"].get("message", f"HTTP {status_code}")[:200]
        # OpenAI / generic: {"error": {"message": "..."}}
        if "error" in data:
            return str(data["error"])[:200]
    except Exception:
        pass
    return f"HTTP {status_code}"


def _upstream_request(url, body_bytes, headers):
    """Make an HTTPS request and return the http.client.HTTPResponse."""
    req = urllib.request.Request(url, data=body_bytes, headers=headers)
    return urllib.request.urlopen(req, context=_SSL_CTX, timeout=60)


def _list_anthropic_models(api_key):
    """Fetch available models from Anthropic /v1/models (GET)."""
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/models",
        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
    )
    resp = urllib.request.urlopen(req, context=_SSL_CTX, timeout=10)
    data = json.loads(resp.read().decode("utf-8"))
    return data.get("data", [])


def _list_google_models(api_key):
    """Fetch available models from the Google Generative Language API (GET)."""
    req = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models",
        headers={"x-goog-api-key": api_key},
    )
    resp = urllib.request.urlopen(req, context=_SSL_CTX, timeout=10)
    data = json.loads(resp.read().decode("utf-8"))
    return data.get("models", [])


def _call_anthropic(api_key, model, prompt, system_prompt, stream, options):
    """Call Anthropic Messages API. Returns (response_obj, provider_name)."""
    body = json.dumps({
        "model": model,
        "system": system_prompt,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": options.get("maxTokens", 1024),
        "temperature": options.get("temperature", 0.1),
        "stream": stream,
    }).encode()
    return _upstream_request(
        "https://api.anthropic.com/v1/messages",
        body,
        {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )


def _call_openai(api_key, model, prompt, system_prompt, stream, options):
    """Call OpenAI Chat Completions API."""
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": options.get("maxTokens", 1024),
        "temperature": options.get("temperature", 0.1),
        "stream": stream,
    }).encode()
    return _upstream_request(
        "https://api.openai.com/v1/chat/completions",
        body,
        {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )


def _call_google(api_key, model, prompt, system_prompt, options):
    """Call Google Gemini API (non-streaming only)."""
    body = json.dumps({
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": options.get("temperature", 0.1),
            "maxOutputTokens": options.get("maxTokens", 1024),
        },
    }).encode()
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    return _upstream_request(url, body, {"Content-Type": "application/json", "x-goog-api-key": api_key})


def _extract_text(provider, data):
    """Pull generated text out of a provider's JSON response."""
    if provider == "anthropic":
        for block in data.get("content", []):
            if block.get("type") == "text":
                return block.get("text", "")
        return ""
    if provider == "openai":
        choices = data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "")
        return ""
    if provider == "google":
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            return "".join(p.get("text", "") for p in parts)
        return ""
    return ""


def _relay_sse(provider, upstream_resp, wfile):
    """Read SSE from upstream (Anthropic/OpenAI) and re-emit as NDJSON."""
    for raw_line in upstream_resp:
        line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
        if not line.startswith("data: "):
            continue
        payload = line[6:]
        if payload.strip() == "[DONE]":
            break

        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            continue

        text = ""
        if provider == "anthropic":
            if event.get("type") == "content_block_delta":
                text = event.get("delta", {}).get("text", "")
            elif event.get("type") == "message_stop":
                break
        elif provider == "openai":
            choices = event.get("choices", [])
            if choices:
                text = choices[0].get("delta", {}).get("content", "")

        if text:
            chunk = json.dumps({"response": text, "done": False}) + "\n"
            wfile.write(chunk.encode())
            wfile.flush()

    # Final done sentinel
    wfile.write(json.dumps({"response": "", "done": True}).encode() + b"\n")
    wfile.flush()


# ---------------------------------------------------------------------------
# HTTP Handler
# ---------------------------------------------------------------------------

class Handler(http.server.SimpleHTTPRequestHandler):
    """Serves static files and API endpoints."""

    # Use HTTP/1.1 so the browser can reuse connections properly
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        """Add security headers (including the CSP) to every response."""
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Content-Security-Policy", content_security_policy())
        super().end_headers()

    def _json_ok(self, data, code=200):
        """Send a JSON response with proper headers."""
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json_error(self, code, message):
        """Send a JSON error response."""
        self._json_ok({"error": message}, code)

    # -- Request guards ---------------------------------------------------------

    def _host_allowed(self):
        """Only answer requests addressed to localhost (blocks DNS rebinding)."""
        host = self.headers.get("Host", "").rsplit(":", 1)[0].lower()
        if host in ALLOWED_HOSTS:
            return True
        self._json_error(403, "Forbidden")
        return False

    def _origin_allowed(self):
        """State-changing requests must come from the app itself (or a non-browser client)."""
        origin = self.headers.get("Origin")
        if origin is None or origin in APP_ORIGINS:
            return True
        self._json_error(403, "Forbidden origin")
        return False

    # -- Static files: only the page, its scripts and its styles ----------------

    def _serve_index(self, head_only=False):
        html = (APP_ROOT / "index.html").read_text(encoding="utf-8")
        body = META_CSP.sub("", html, count=1).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def _serve_static(self, path, head_only=False):
        if path in ("/", "/index.html"):
            self._serve_index(head_only)
        elif self._is_static_file(path):
            super().do_HEAD() if head_only else super().do_GET()
        else:
            self._json_error(404, "Not found")

    def _is_static_file(self, path):
        """True only for an existing file inside js/ or css/ (after resolving '..' and links)."""
        target = pathlib.Path(self.translate_path(path)).resolve()
        if not target.is_file():
            return False
        for folder in STATIC_DIRS:
            try:
                target.relative_to((APP_ROOT / folder).resolve())
                return True
            except ValueError:
                continue
        return False

    def list_directory(self, path):
        """Never list directories."""
        self._json_error(404, "Not found")
        return None

    def do_HEAD(self):
        if not self._host_allowed():
            return
        self._serve_static(urllib.parse.urlparse(self.path).path, head_only=True)

    # -- GET routes -----------------------------------------------------------

    def do_GET(self):
        if not self._host_allowed():
            return
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/system/check":
            import sys
            self._json_ok({
                "server": True,
                "pythonVersion": sys.version.split()[0],
            })
        elif parsed.path == "/api/projects":
            self._json_ok(get_projects())
        elif parsed.path == "/api/projects-root":
            self._json_ok({"path": str(get_projects_root())})
        elif parsed.path == "/api/ollama-url":
            self._json_ok({"url": get_ollama_url()})
        elif parsed.path == "/api/browse":
            qs = urllib.parse.parse_qs(parsed.query)
            req_path = qs.get("path", [None])[0]
            data, err = browse_directory(req_path)
            if err:
                self._json_error(400, err)
            else:
                data["drives"] = get_drive_roots()
                self._json_ok(data)
        elif parsed.path.startswith("/api/projects/") and parsed.path.endswith("/scan"):
            project_name = urllib.parse.unquote(
                parsed.path[len("/api/projects/"):-len("/scan")]
            )
            self._json_ok(scan_project(project_name))
        elif parsed.path.startswith("/api/"):
            self._json_error(404, "Not found")
        else:
            self._serve_static(parsed.path)

    # -- POST routes ----------------------------------------------------------

    def do_POST(self):
        if not self._host_allowed() or not self._origin_allowed():
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/projects-root":
            self._handle_set_projects_root()
        elif path == "/api/ollama-url":
            self._handle_set_ollama_url()
        elif path == "/api/ai/proxy":
            self._handle_ai_proxy()
        elif path == "/api/ai/models":
            self._handle_ai_models()
        else:
            self._json_error(404, "Not found")

    def _read_body_json(self):
        """Read and parse the request body as JSON."""
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            raise ValueError("Empty request body")
        if length > MAX_BODY_BYTES:
            raise ValueError("Request body too large")
        raw = self.rfile.read(length)
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object")
        return data

    def _handle_set_projects_root(self):
        try:
            data = self._read_body_json()
        except Exception:
            self._json_error(400, "Invalid JSON")
            return
        path = data.get("path", "")
        if not isinstance(path, str) or not path.strip():
            self._json_error(400, "Path is required")
            return
        ok, msg = set_projects_root(path.strip())
        if ok:
            self._json_ok({"path": msg})
        else:
            self._json_error(400, msg)

    def _handle_set_ollama_url(self):
        try:
            data = self._read_body_json()
        except Exception:
            self._json_error(400, "Invalid JSON")
            return
        url = data.get("url")
        if url is not None and not isinstance(url, str):
            self._json_error(400, "url must be a string")
            return
        ok, value = set_ollama_url((url or "").strip())
        if ok:
            self._json_ok({"url": value})
        else:
            self._json_error(400, value)

    def _handle_ai_models(self):
        """Return the list of available models for a cloud provider."""
        try:
            data = self._read_body_json()
        except Exception:
            self._json_error(400, "Invalid JSON")
            return

        provider = data.get("provider", "")
        api_key = data.get("apiKey", "")

        if not provider or not api_key:
            self._json_error(400, "Missing provider or apiKey")
            return

        try:
            if provider == "anthropic":
                models = _list_anthropic_models(api_key)
                self._json_ok({"models": models})
            elif provider == "google":
                models = _list_google_models(api_key)
                self._json_ok({"models": models})
            else:
                self._json_error(400, f"Model listing not supported for: {provider}")
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            self._json_error(e.code, _safe_error_message(e.code, raw))
        except Exception:
            self._json_error(502, "Failed to fetch models")

    def _handle_ai_proxy(self):
        """Proxy a cloud AI request to Anthropic, OpenAI, or Google."""

        # --- Rate limit ---
        if not _check_rate_limit(self.client_address[0]):
            self._json_error(429, "Rate limit exceeded — wait 60 seconds")
            return

        # --- Parse request ---
        try:
            data = self._read_body_json()
        except Exception:
            self._json_error(400, "Invalid JSON")
            return

        provider = data.get("provider", "")
        api_key = data.get("apiKey", "")
        model = data.get("model", "")
        prompt = data.get("prompt", "")
        system_prompt = data.get("systemPrompt", "")
        stream = data.get("stream", False)
        options = data.get("options", {})

        if not provider or not api_key or not model:
            self._json_error(400, "Missing provider, apiKey, or model")
            return

        if provider not in ("anthropic", "openai", "google"):
            self._json_error(400, f"Unknown provider: {provider}")
            return

        if not all(isinstance(v, str) for v in (api_key, model, prompt, system_prompt)) \
                or not isinstance(options, dict):
            self._json_error(400, "Invalid request fields")
            return

        if provider == "google" and not MODEL_ID.match(model):
            self._json_error(400, "Invalid model")
            return

        # --- Call upstream API ---
        try:
            if provider == "anthropic":
                resp = _call_anthropic(api_key, model, prompt, system_prompt, stream, options)
            elif provider == "openai":
                resp = _call_openai(api_key, model, prompt, system_prompt, stream, options)
            elif provider == "google":
                # Google Gemini doesn't support streaming — always non-stream
                resp = _call_google(api_key, model, prompt, system_prompt, options)
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            self._json_error(e.code, _safe_error_message(e.code, raw))
            return
        except Exception:
            self._json_error(502, "Upstream request failed")
            return

        # --- Return response to browser ---
        try:
            if stream and provider in ("anthropic", "openai"):
                # Stream: send NDJSON lines
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson")
                self.send_header("Transfer-Encoding", "chunked")
                self.end_headers()
                _relay_sse(provider, resp, self.wfile)
            else:
                # Non-stream (or Google): read full response, extract text
                result = json.loads(resp.read().decode("utf-8"))
                text = _extract_text(provider, result)
                if stream:
                    # Google with stream=true: fake it as two NDJSON lines
                    self.send_response(200)
                    self.send_header("Content-Type", "application/x-ndjson")
                    self.send_header("Transfer-Encoding", "chunked")
                    self.end_headers()
                    self.wfile.write(
                        json.dumps({"response": text, "done": False}).encode() + b"\n"
                    )
                    self.wfile.write(
                        json.dumps({"response": "", "done": True}).encode() + b"\n"
                    )
                    self.wfile.flush()
                else:
                    self._json_ok({"response": text, "done": True})
        except Exception as e:
            # If headers are already sent we can't send a JSON error,
            # but at least don't crash the server
            try:
                self._json_error(502, str(e))
            except Exception:
                pass
        finally:
            resp.close()

    # -- Logging --------------------------------------------------------------

    def log_message(self, format, *args):
        """Log every request for debugging."""
        try:
            print(f"[{self.command}] {self.path} -> {format % args}")
        except Exception:
            print(f"[LOG] {format} {args}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    os.chdir(pathlib.Path(__file__).parent)
    print("=" * 42)
    print("  FiavaionDictate - Starting local server")
    print("=" * 42)
    print()
    print(f"  Serving at: http://localhost:{PORT}")
    print("  Press Ctrl+C to stop")
    print()
    http.server.test(HandlerClass=Handler, port=PORT, bind="127.0.0.1")
