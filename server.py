#!/usr/bin/env python3
"""FiavaionDictate local server — static files + API endpoints"""
import http.server
import json
import os
import pathlib
import ssl
import urllib.parse
import urllib.request

DEFAULT_PROJECTS_ROOT = r"C:\Users\jones\AIprojects"
CONFIG_FILE = pathlib.Path(__file__).parent / "config.json"
PORT = 8080


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
    p = pathlib.Path(path_str)
    if not p.is_dir():
        return False, "Directory does not exist"
    cfg = _load_config()
    cfg["projectsRoot"] = str(p)
    _save_config(cfg)
    return True, str(p)


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

    # Dedupe preserving order
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
    """Return available drive letters on Windows."""
    import string
    roots = []
    for letter in string.ascii_uppercase:
        drive = pathlib.Path(f"{letter}:\\")
        if drive.exists():
            roots.append(str(drive))
    return roots


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
    root = get_projects_root() / project_name
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


def _ssl_context():
    ctx = ssl.create_default_context()
    return ctx


def _proxy_anthropic(api_key, model, prompt, system_prompt, stream, options):
    body = {
        "model": model,
        "system": system_prompt,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": options.get("maxTokens", 1024),
        "temperature": options.get("temperature", 0.1),
        "stream": stream,
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode(),
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    return urllib.request.urlopen(req, context=_ssl_context())


def _proxy_openai(api_key, model, prompt, system_prompt, stream, options):
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": options.get("maxTokens", 1024),
        "temperature": options.get("temperature", 0.1),
        "stream": stream,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    return urllib.request.urlopen(req, context=_ssl_context())


def _proxy_google(api_key, model, prompt, system_prompt, options):
    body = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": options.get("temperature", 0.1),
            "maxOutputTokens": options.get("maxTokens", 1024),
        },
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    return urllib.request.urlopen(req, context=_ssl_context())


def _extract_anthropic_text(data):
    for block in data.get("content", []):
        if block.get("type") == "text":
            return block.get("text", "")
    return ""


def _extract_openai_text(data):
    choices = data.get("choices", [])
    if choices:
        return choices[0].get("message", {}).get("content", "")
    return ""


def _extract_google_text(data):
    candidates = data.get("candidates", [])
    if candidates:
        parts = candidates[0].get("content", {}).get("parts", [])
        return "".join(p.get("text", "") for p in parts)
    return ""


def _stream_anthropic(response, wfile):
    for raw_line in response:
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
        etype = event.get("type", "")
        if etype == "content_block_delta":
            text = event.get("delta", {}).get("text", "")
            if text:
                chunk = json.dumps({"response": text, "done": False}) + "\n"
                wfile.write(chunk.encode())
                wfile.flush()
        elif etype == "message_stop":
            break
    done_line = json.dumps({"response": "", "done": True}) + "\n"
    wfile.write(done_line.encode())
    wfile.flush()


def _stream_openai(response, wfile):
    for raw_line in response:
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
        choices = event.get("choices", [])
        if choices:
            delta = choices[0].get("delta", {})
            text = delta.get("content", "")
            if text:
                chunk = json.dumps({"response": text, "done": False}) + "\n"
                wfile.write(chunk.encode())
                wfile.flush()
    done_line = json.dumps({"response": "", "done": True}) + "\n"
    wfile.write(done_line.encode())
    wfile.flush()


class Handler(http.server.SimpleHTTPRequestHandler):
    def _json_response(self, code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/projects":
            self._json_response(200, get_projects())
        elif parsed.path == "/api/projects-root":
            self._json_response(200, {"path": str(get_projects_root())})
        elif parsed.path == "/api/browse":
            qs = urllib.parse.parse_qs(parsed.query)
            req_path = qs.get("path", [None])[0]
            data, err = browse_directory(req_path)
            if err:
                self._json_response(400, {"error": err})
            else:
                data["drives"] = get_drive_roots()
                self._json_response(200, data)
        elif parsed.path.startswith("/api/projects/") and parsed.path.endswith("/scan"):
            project_name = urllib.parse.unquote(parsed.path[len("/api/projects/"):-len("/scan")])
            self._json_response(200, scan_project(project_name))
        else:
            super().do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        return json.loads(raw)

    def _stream_response_start(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

    def _handle_ai_proxy(self, data):
        provider = data.get("provider", "")
        api_key = data.get("apiKey", "")
        model = data.get("model", "")
        prompt = data.get("prompt", "")
        system_prompt = data.get("systemPrompt", "")
        stream = data.get("stream", False)
        options = data.get("options", {})

        if not provider or not api_key or not model:
            self._json_response(400, {"error": "Missing provider, apiKey, or model"})
            return

        try:
            if provider == "anthropic":
                if stream:
                    resp = _proxy_anthropic(api_key, model, prompt, system_prompt, True, options)
                    self._stream_response_start()
                    _stream_anthropic(resp, self.wfile)
                    resp.close()
                else:
                    resp = _proxy_anthropic(api_key, model, prompt, system_prompt, False, options)
                    result = json.loads(resp.read().decode())
                    resp.close()
                    text = _extract_anthropic_text(result)
                    self._json_response(200, {"response": text, "done": True})

            elif provider == "openai":
                if stream:
                    resp = _proxy_openai(api_key, model, prompt, system_prompt, True, options)
                    self._stream_response_start()
                    _stream_openai(resp, self.wfile)
                    resp.close()
                else:
                    resp = _proxy_openai(api_key, model, prompt, system_prompt, False, options)
                    result = json.loads(resp.read().decode())
                    resp.close()
                    text = _extract_openai_text(result)
                    self._json_response(200, {"response": text, "done": True})

            elif provider == "google":
                resp = _proxy_google(api_key, model, prompt, system_prompt, options)
                result = json.loads(resp.read().decode())
                resp.close()
                text = _extract_google_text(result)
                if stream:
                    self._stream_response_start()
                    chunk = json.dumps({"response": text, "done": False}) + "\n"
                    self.wfile.write(chunk.encode())
                    done_line = json.dumps({"response": "", "done": True}) + "\n"
                    self.wfile.write(done_line.encode())
                    self.wfile.flush()
                else:
                    self._json_response(200, {"response": text, "done": True})

            else:
                self._json_response(400, {"error": f"Unknown provider: {provider}"})

        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            self._json_response(e.code, {"error": body})
        except Exception as e:
            self._json_response(502, {"error": str(e)})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/projects-root":
            try:
                data = self._read_json_body()
            except Exception:
                self._json_response(400, {"error": "Invalid JSON"})
                return
            path = data.get("path", "").strip()
            if not path:
                self._json_response(400, {"error": "Path is required"})
                return
            ok, msg = set_projects_root(path)
            if ok:
                self._json_response(200, {"path": msg})
            else:
                self._json_response(400, {"error": msg})
        elif parsed.path == "/api/ai/proxy":
            try:
                data = self._read_json_body()
            except Exception:
                self._json_response(400, {"error": "Invalid JSON"})
                return
            self._handle_ai_proxy(data)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, fmt, *args):
        pass  # suppress per-request noise


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
