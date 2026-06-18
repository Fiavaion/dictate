---
paths:
  - "server.py"
  - "electron/server.js"
---

# Python Server Patterns — FiavaionDictate

Loaded when editing `server.py` or `electron/server.js`.

## server.py constraints
- Python stdlib only: `http.server`, `json`, `os`, `pathlib`, `urllib.*`, `collections`
- NO Flask, FastAPI, or third-party packages — zero new dependencies
- Port: **31000** (5-digit to avoid conflicts; was 3000 — collided with Open WebUI)
- All API endpoints must handle CORS headers for localhost:3001 (Electron cross-origin)

## Adding an API endpoint
1. Add handler in the `do_GET` or `do_POST` method of `FiavaionHandler`
2. Match the path with `self.path.startswith('/api/new-endpoint')`
3. Return JSON: `self.send_json_response({'key': 'value'})`
4. Test with `curl -s http://localhost:31000/api/new-endpoint`

## electron/server.js constraints
- Express 4.x (already a dependency)
- Serves the same static files as server.py but on port 3001
- Keep endpoints in sync with server.py — they must have the same API surface
- config.json path resolution must work from the Electron app directory

## Config file
- `config.json` is gitignored — never commit it, never reference it in code as required
- It stores only the projects root path; default gracefully if it doesn't exist
- Server must start without config.json present

## Electron launch note
When launching Electron from VS Code terminal, always clear the env var first:
`$env:ELECTRON_RUN_AS_NODE = $null`
Otherwise VS Code's ELECTRON_RUN_AS_NODE=1 silently prevents the window from appearing.
This does NOT affect end-user installs.
