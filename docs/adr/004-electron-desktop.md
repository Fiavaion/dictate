# ADR-004: Electron for the desktop app (not Tauri, not NW.js)
**Status:** accepted
**Date:** 2026-06-18

## Context
A desktop build was wanted so users get a real app (installer, window, no browser tab)
without changing the web codebase. The app depends on the Web Speech API, which requires
a Chromium runtime. Tauri uses the OS WebView (WebView2 on Windows), where Web Speech
support is inconsistent and not guaranteed — a direct risk to the core dictation feature.
NW.js bundles Chromium but has a smaller ecosystem and tooling story than Electron.

## Decision
Use Electron for the desktop app. The main process is `electron/main.js`; an Express
server (`electron/server.js`) runs inside it on port 3001 to serve the same web app and
proxy AI calls. Packaged for Windows with an installer.

## Consequences
- **Enables:** a guaranteed Chromium runtime, so Web Speech API dictation works identically
  to the browser; the existing web UI runs unchanged inside the window; standard Windows
  installer tooling (electron-builder).
- **Rules out:** the small binary size and low memory footprint Tauri would offer — Electron
  bundles a full Chromium per app. Accepted as the cost of guaranteed STT support.
- Introduces a second server implementation (Express) alongside `server.py` (ADR-003) and
  a known launch gotcha: `ELECTRON_RUN_AS_NODE` must be cleared before launching from a
  VS Code terminal or the window silently never appears (dev-only; not an end-user issue).
