#!/usr/bin/env python3
"""FiavaionDictate local server — static files + /api/projects"""
import http.server
import json
import os
import pathlib
import urllib.parse

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
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/projects-root":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            try:
                data = json.loads(raw)
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
