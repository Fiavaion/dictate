# Rule #0 — This file is the source of truth
Read this file first, every session. Hierarchy: (1) this file, (2) user's direct
instructions, (3) other docs, (4) config files, (5) conversation summaries. On any
conflict the higher wins. If user says you're wrong, re-read before arguing.

# FiavaionDictate

Browser-based dictation app using Web Speech API (Chrome/Edge). AI correction via local
Ollama or cloud APIs (Gemini, Anthropic). Dual deployment: localhost Python server +
GitHub Pages static mode.

# Success Metric
> A user opens FiavaionDictate, clicks Start Dictation, speaks a few sentences, clicks
> Stop, presses the AI correction button, and has polished copy-ready text on screen —
> **within 30 seconds of first opening the app.**
>
> This is the gate. Feature count and coverage % are NOT the measure.

# Architecture
- `server.py` — Python HTTP server (localhost:**31000**), static files + API proxy
- `electron/main.js` — Electron main process (desktop app, port 3001)
- `electron/server.js` — Express server inside Electron
- `js/app.js` — Main controller, global `state` object, orchestrates STT + AI + UI
- `js/stt/` — web-speech-engine, command-parser, auto-punctuation, vocabulary-manager, speak-as-you-type, ambient-detector, correction-learner, macro-recorder
- `js/ai/` — ai-client (provider router), ollama-client, correction-pipeline, prompt-structurer, prompt-templates (8 writing modes), context-injector, ghost-predictor
- `js/ui/` — api-settings, gemini-wizard, onboarding-wizard, prompt-builder, format-cards, analytics-dashboard, confidence-heatmap, diagram-renderer
- `js/utils/` — persistence (localStorage), projects, clipboard, session-search, timeline
- `css/theme.css` — Design system, dark theme
- `css/ai-panel.css` — AI sidebar styles + responsive

# Key Patterns
- `const $ = id => document.getElementById(id)` — DOM shorthand everywhere
- State in global `state` object (app.js top)
- Functions exposed to HTML via `window.functionName = functionName`
- `flashCmd(msg)` for toast notifications
- Dual-pane UI: raw dictation + AI-corrected/structured output (toggle)
- AI sidebar: corrections list, template selector, settings
- Structure button toggles refined pane between corrected text and structured prompt
- GitHub Pages mode: auto-detects missing server, hides project UI, shows setup dialog

# Server API
- `GET /api/projects` — list projects from configured root
- `GET /api/projects-root` — get projects folder path
- `POST /api/projects-root` — set projects folder (saves to config.json)
- `GET /api/browse?path=...` — list subdirectories for folder browser

# Git / Deploy
- Remote: `origin` → `https://github.com/Fiavaion/dictate.git`
- GitHub Pages enabled on `master` branch, root `/`
- Live at: https://fiavaion.github.io/dictate/
- `.gitignore`: config.json, __pycache__, FiavaionDictate.html, dist/, node_modules/

# Coding Guidelines (LLM-aware)
- Karpathy core: Think before coding · Simplicity first · Surgical changes · Goal-driven execution
- **Reviewer mode** — after writing code, re-read your diff as a senior reviewer who intends to reject it (bugs, over-engineering, scope creep, AI-slop); fix what you find, THEN declare done
- ES modules (import/export) throughout js/ — no CommonJS require() in browser code
- Keep JS files focused; one responsibility per module
- No TypeScript, no build step — vanilla JS runs directly in browser/Electron

# Zero Technical Debt (non-negotiable)
- Delete old code; never comment it out. No dead code, no "just in case" branches.
- Fix debt the moment it appears. An unresolved TODO in shipped code is debt.
- Red flags in core paths — "DEFERRED", "TODO Phase X", "TEMPORARY" — mean STOP and fix.
- Any accepted deferral goes to `TECHNICAL_DEBT.md` with a cost estimate.
- Refactors delete the old path in the same change.

# Done means verified working
- A feature is done only when its real behaviour has been seen working or user-confirmed.
- Green tests ≠ done. Tests can pass while the feature is broken.
- For UI: drive it in the browser. For server: hit the endpoint. For Electron: launch the app.
- Never build feature N+1 on a foundation feature N that hasn't been verified working.

# Change Boundaries
**Never edit without explicit approval:**
- `config.json` (user's server path — not committed, but affects their data)
- `.gitignore`, `.github/` (CI/deploy config)
- `electron/main.js` permissions and security settings (sandbox, contextIsolation)
- Any production key storage logic in `js/ui/api-settings.js`

**Surgical scope:** editing a route/module → touch only that module and direct dependencies.
Do not touch `js/app.js` (global state) unless the change explicitly requires it.

**Never commit secrets.** API keys live in localStorage (user's browser), never in code.

# Architecture Decision Records
Every hard-to-reverse decision (library, persistence strategy, provider API, protocol)
gets a short ADR in `docs/adr/` written BEFORE implementation. See `docs/adr/README.md`.

Decisions already made (pending ADR write-up):
- localStorage only (no backend database)
- Web Speech API (Chrome/Electron only — not cross-browser)
- Python stdlib server (no Flask/FastAPI)
- Electron for desktop (not Tauri, not NW.js)

# Model Selection Policy
**`modelswitcher` is the authoritative rubric** — consult it before any multi-agent fan-out.
Fallback tiers:
- Opus-class: planning, architecture, hard debugging, multi-file refactors
- Sonnet-class: day-to-day coding, small refactors, rubric-driven scans (default)
- Haiku-class: log triage, file listing, trivial bulk transforms
- Advisor (on-demand): Executor may spawn a single-question Opus subagent for
  architectural forks, hard-to-reverse decisions, or repeated stalls. Keep prompt
  under 200 words; receive one recommendation and return.

# Testing
- **Runner:** `python evals/smoke-test.py` — hits server health endpoint, verifies AI call returns text
- **Smoke test** (manual UI path): open app → start dictation → speak → stop → AI correct → text appears ✓
- See `evals/` for the full eval harness
- `/test` runs the smoke test; it is the release gate minimum

# LLM Evals
- Eval set: `evals/golden.jsonl` (8 cases covering core dictation + correction workflow)
- Runner: `python evals/run_evals.py` (requires GEMINI_API_KEY or local Ollama)
- Command: `/evals` runs the suite and reports pass/fail per case
- **Baseline model:** Gemini 2.5 Flash (cloud) / Ollama user-configured (local)
- **Before upgrading a model:** run `/evals --model <new>` and confirm no regressions
- **On production failure:** add the failing input as a new eval case BEFORE fixing the prompt
- **100% pass rate consistently** = eval set is saturated — add harder/more representative cases

# Project Skills
- No project-scoped skills yet (single-dev, small repo — global skills suffice)
- Global skills available: bootstrap-project, modelswitcher, and others in ~/.claude/skills/

# Slash Commands
- `/start` — restore context (CLAUDE.md → latest session log → CURRENT_STATUS.md → debt check → health check)
- `/end` — smoke test → rewrite CURRENT_STATUS.md → write dated session log → capture lessons
- `/todos` — sync TODO/FIXME comments to notes/TODOs.md
- `/lessons` — extract LESSON-* tags to notes/lessons.md
- `/evals` — run LLM eval suite against golden.jsonl
- `/test` — run smoke test (global command; reads `# Testing` section)
- `/release` — full gate: test → evals → security-harden → slop-clean → humanize → prod-ready (global)
- `/bootstrap-sync` — propagate bootstrap-project standard updates across all managed repos (global)
- **Run `/release` before every push to master.**

# Session continuity, TODOs & lessons
- Restart package: `notes/CURRENT_STATUS.md` (rewritten at `/end`) — one page, not chat history
- Session logs: `docs/sessions/<date>-<topic>.md` (written by `/end`, trusted over CURRENT_STATUS on conflict)
- TODOs: single source of truth `notes/TODOs.md`. Inline tag: `// TODO[cl]: description`
- Lessons: inline tag `// LESSON-{ARCH|BUG|PERF|API|UI|TEST|BUILD}-NNN: summary`; ledger: `notes/lessons.md`
- Debt tracker: `TECHNICAL_DEBT.md` (near-empty = healthy; any entry is visible and costed)
- **Fix the process, not the output** — when I make a mistake, write the correction into this
  file or a rule so it can't recur.

# Token & Context Rules
- `@`-mention specific files; scope prompts on big sessions
- `/context` to inspect · `/compact` (focused instruction) after milestones · `/cost` before expensive phases
- Don't paste big logs — save to file and `@`-mention; summarize first, then zoom in
- Standard loop: Explore → Plan (Opus-class) → Implement (Sonnet-class, small diffs) →
  reviewer mode → verify working → compact/checkpoint

# Dev & Bug-Fix Discipline
- Build → test → commit, one change at a time. No `wip` commits on master.
- Bug-fixing: reproduce first; add logging/visual feedback before reading lots of code.
  If can't diagnose in ~5 min, change strategy.
- "Complete failure" = assume multiple root causes. Audit the whole integration chain.
- Refactors: delete the old path in the same change. Never leave a parallel old path.
- Electron: **always** clear `ELECTRON_RUN_AS_NODE` env var before launching in VS Code terminal
  (`$env:ELECTRON_RUN_AS_NODE = $null`). This env var is set by VS Code and silently
  prevents the Electron window from appearing — end users are not affected.
