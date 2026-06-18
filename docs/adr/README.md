# Architecture Decision Records

Every hard-to-reverse decision gets an ADR written BEFORE implementation. A decision
that a pending research spike could overturn is marked "proposed — pending Spike #N",
never "accepted" (an accepted ADR a spike can reverse is a trap).

## Format

```markdown
# ADR-NNN: <title>
**Status:** proposed | accepted | superseded by ADR-NNN
**Date:** YYYY-MM-DD

## Context
Why this decision was needed.

## Decision
What was decided.

## Consequences
What this enables and what it rules out.
```

## Decision log

| # | Decision | Status | ADR |
|---|----------|--------|-----|
| 001 | localStorage only (no backend database) | accepted | [001](001-localstorage-only.md) |
| 002 | Web Speech API (Chrome/Electron only — not cross-browser) | accepted | [002](002-web-speech-api.md) |
| 003 | Python stdlib HTTP server (no Flask/FastAPI) | accepted | [003](003-python-stdlib-server.md) |
| 004 | Electron for desktop (not Tauri, not NW.js) | accepted | [004](004-electron-desktop.md) |
| 005 | Ollama as privacy-first local AI default | accepted | [005](005-ollama-privacy-first-default.md) |
