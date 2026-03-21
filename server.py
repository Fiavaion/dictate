#!/usr/bin/env python3
"""FiavaionDictate local server — static files + /api/projects"""
import http.server
import json
import os
import pathlib
import urllib.parse

PROJECTS_ROOT = pathlib.Path(r"C:\Users\jones\AIprojects")
PORT = 8080


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


def get_projects():
    results = []
    try:
        for entry in PROJECTS_ROOT.iterdir():
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
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/projects":
            data = get_projects()
            body = json.dumps(data).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

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
