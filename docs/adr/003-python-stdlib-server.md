# ADR-003: Python stdlib HTTP server (no Flask/FastAPI)
**Status:** accepted
**Date:** 2026-06-18

## Context
The localhost mode needs a small server to serve static files, proxy AI API calls (to
keep keys and CORS sane), and expose a few project-folder endpoints. A web framework like
Flask or FastAPI would bring dependency installation, version pinning, and a virtualenv
step — friction that works against the zero-install goal and adds maintenance surface for
a server whose entire job is a handful of routes.

## Decision
Implement the server in `server.py` using only the Python standard library
(`http.server` / `BaseHTTPRequestHandler`). No third-party web framework, no pip install
to run the server. Listens on `localhost:31000` (a 5-digit port chosen to minimise
collisions with other local dev servers such as Open WebUI on 3000).

## Consequences
- **Enables:** `python server.py` runs with a stock Python install — no dependencies, no
  build, no venv. Small, auditable surface; easy to reason about for a single-dev project.
- **Rules out:** framework conveniences (routing decorators, middleware, async handlers,
  request validation). New routes are hand-written request parsing, so the route count
  should stay small; if the API grows substantially this decision should be revisited.
- The Electron desktop build uses a separate Express server (`electron/server.js`) on
  port 3001 rather than reusing this one — the two server implementations are an accepted
  parallel path because their runtimes (system Python vs. bundled Node) differ.
