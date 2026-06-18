---
paths:
  - "js/**/*.js"
  - "*.html"
---

# JS Patterns — FiavaionDictate

Loaded when editing any file under `js/` or HTML files.

## Module system
- ES modules throughout: `import { X } from './path.js'` — always include `.js` extension
- No CommonJS `require()` in browser-side code
- No TypeScript, no build step — vanilla JS runs directly in browser and Electron

## DOM conventions
- `const $ = id => document.getElementById(id)` — use this shorthand, never `document.getElementById()` directly
- Functions called from HTML attributes must be on `window`: `window.myFunc = myFunc`
- `flashCmd(msg)` for all user-facing toast notifications — do not use alert()

## State management
- All app state in the global `state` object at the top of `js/app.js`
- Do NOT create new global state variables outside of `state`
- Persist to localStorage via `js/utils/persistence.js` helpers — no raw `localStorage.setItem()` scattered in modules

## AI client
- Route all AI calls through `js/ai/ai-client.js` — never call Ollama or Gemini APIs directly from UI code
- The active provider (ollama/gemini/anthropic) is managed by ai-client; do not read it directly
- `prompt-templates.js` contains the 8 writing modes — add new modes there, not inline

## Error handling
- Catch AI call errors and surface via `flashCmd()` — never let silent failures reach the user
- Web Speech API errors: handle `onerror` events in `web-speech-engine.js`

## GitHub Pages compatibility
- The app must degrade gracefully when `server.py` is not running (GitHub Pages mode)
- Check for server availability before calling `/api/*` endpoints
- Hide server-dependent UI (projects panel) in GitHub Pages mode
