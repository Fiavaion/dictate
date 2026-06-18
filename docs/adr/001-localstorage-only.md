# ADR-001: localStorage only (no backend database)
**Status:** accepted
**Date:** 2026-06-18

## Context
FiavaionDictate must run in two modes from one codebase: a localhost Python server and
a fully static GitHub Pages deployment with no server at all. Any persistence layer that
assumed a backend database would break the static mode, which is the zero-install path
to the 30-second success metric. The data we persist is small and per-user: API keys,
prompt templates, correction history, vocabulary, session text, and UI preferences.

## Decision
Persist all client state in the browser's `localStorage`, accessed through
`js/utils/persistence.js`. No server-side database, no user accounts, no sync service.
The Python server holds no user data — it only proxies AI calls and lists project folders.

## Consequences
- **Enables:** identical behaviour in server mode and static GitHub Pages mode; zero setup;
  no privacy surface on a server (API keys never leave the user's browser); trivial deploy.
- **Rules out:** cross-device sync, multi-user collaboration, and server-side analytics on
  user content. Data is bound to one browser profile and is lost if the user clears storage.
- localStorage's ~5–10 MB quota caps how much session history we can retain; long-term
  history would need IndexedDB or export, which is a future decision, not this one.
