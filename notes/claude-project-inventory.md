# FiavaionDictate — Project Inventory

**Sweep date:** 2026-06-18  
**Status:** doc-light (CLAUDE.md is the primary doc; no separate PRD/spec)

## Document sweep results

| File | Type | Informs | Key points |
|------|------|---------|------------|
| `CLAUDE.md` | Architecture + conventions | Everything | Architecture, patterns, server API, git/deploy |
| `README` | N/A | — | Does not exist |
| `package.json` | Config | Stack, Electron config | Electron 33, electron-builder, express 4.x |
| `server.py` | Source (runnable doc) | Server API | Python stdlib HTTP server on port 3000 |
| `js/ai/prompt-templates.js` | Source (domain doc) | AI prompt design | 8+ writing mode templates (freeform, formal, email, etc.) |
| `js/ai/ai-client.js` | Source | AI provider config | Ollama + Gemini + Anthropic, model discovery |

## Code structure (as of 2026-06-18)

```
js/
  app.js               — Main controller, global state
  ai/
    ai-client.js       — Provider router (Ollama/Gemini/Anthropic)
    ollama-client.js   — Ollama WebSocket/HTTP client
    correction-pipeline.js
    prompt-structurer.js
    prompt-templates.js  — 8 writing mode presets
    context-injector.js
    diagram-generator.js
    ghost-predictor.js
    jargon-map.js
    multi-formatter.js
  stt/
    web-speech-engine.js  — Web Speech API wrapper
    command-parser.js
    auto-punctuation.js
    vocabulary-manager.js
    speak-as-you-type.js
    ambient-detector.js
    correction-learner.js
    macro-recorder.js
    command-composer.js
  ui/
    api-settings.js
    gemini-wizard.js
    onboarding-wizard.js
    prompt-builder.js
    format-cards.js
    analytics-dashboard.js
    confidence-heatmap.js
    diagram-renderer.js
    search-results.js
    timeline-viewer.js
    command-builder.js
  utils/
    persistence.js  — localStorage wrappers
    projects.js     — project folder management
    clipboard.js
    session-search.js
    timeline.js
css/
  theme.css           — Design system, dark theme
  ai-panel.css        — AI sidebar + responsive
  prompt-builder.css
electron/
  main.js             — Electron main process
  server.js           — Express server (port 3001) for Electron
build/
  icon.png / icon.ico
```

## Gaps identified

- No README.md
- No docs/ or architecture doc (CLAUDE.md is the only architecture reference)
- No test harness
- No eval harness
- CLAUDE.md says server runs on localhost:8080 (incorrect — it's 3000)
- No docs/adr/ directory (hard-to-reverse decisions undocumented)
