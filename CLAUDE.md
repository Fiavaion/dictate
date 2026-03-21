# FiavaionDictate

Browser-based dictation app using Web Speech API (Chrome/Edge). AI correction via local Ollama.

## Architecture
- `server.py` — Python HTTP server (localhost:8080), static files + API
- `js/app.js` — Main controller, orchestrates STT, AI, UI
- `js/stt/` — web-speech-engine.js, command-parser.js, auto-punctuation.js, vocabulary-manager.js
- `js/ai/` — ollama-client.js, correction-pipeline.js, prompt-structurer.js, prompt-templates.js
- `js/utils/` — persistence.js (localStorage), projects.js, clipboard.js
- `css/theme.css` — Design system, dark theme
- `css/ai-panel.css` — AI sidebar styles + responsive

## Key Patterns
- `const $ = id => document.getElementById(id)` — DOM shorthand
- State in global `state` object (app.js top)
- Functions exposed to HTML via `window.functionName = functionName`
- `flashCmd(msg)` for toast notifications
- Dual-pane UI: raw dictation + AI-corrected/structured output (toggle)
- AI sidebar: corrections list, template selector, settings
- Structure button toggles refined pane between corrected text and structured prompt

## Server API
- `GET /api/projects` — list projects from configured root
- `GET /api/projects-root` — get projects folder path
- `POST /api/projects-root` — set projects folder (saves to config.json)
- `GET /api/browse?path=...` — list subdirectories for folder browser
- GitHub Pages mode: auto-detects missing server, hides project UI, shows setup dialog

## Git / Deploy
- Remote: `origin` → `https://github.com/Fiavaion/dictate.git`
- GitHub Pages enabled on `master` branch, root `/`
- Live at: https://fiavaion.github.io/dictate/
- `.gitignore`: config.json, __pycache__, FiavaionDictate.html
