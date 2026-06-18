---
name: fiavaion-dictate-project-profile
description: Bootstrap interview answers and project context for FiavaionDictate
metadata:
  type: project
---

# FiavaionDictate — Project Profile

**Bootstrap date:** 2026-06-18
**Re-run:** idempotent — update answers as the project evolves

## Phase 0 — Interview answers

| # | Question | Answer |
|---|----------|--------|
| Q1 | Primary focus | **B** — Full-stack app (web + Electron desktop + Python backend) |
| Q2 | Project maturity | **C** — Established codebase (30+ JS modules, Electron app, GitHub Pages deploy) |
| Q3 | Domain knowledge source | **C** — Well-written CLAUDE.md (minimal but accurate); also the codebase itself |
| Q4 | Default model profile | **A** — Sonnet-class (balanced speed/cost) |
| Q5 | Risk posture | **A** — Cautious (single developer; surgical diffs, plan first) |
| Q6 | Token-budget sensitivity | **B** — Medium (optimize on long sessions / big diffs) |
| Q7 | Autonomy level | **C** — Highly autonomous (auto-mode; agreed workflows run end-to-end) |
| Q8 | Git discipline | **B** — Git in use, direct commits to master (no PR workflow currently) |
| Q9 | Definition of done | See below |
| Q10 | Test-suite depth | **A** — Smoke-only (UI-heavy app; the workflow _is_ the thing that matters) |
| Q11 | LLM integration | **C** — Both: Ollama (local, privacy-first default) + Gemini/Anthropic (cloud, opt-in) |

## Q9 — Definition of done (Success Metric)

> **A user opens FiavaionDictate, clicks Start Dictation, speaks a few sentences, clicks
> Stop, presses the AI correction button, and has polished, copy-ready text on screen —
> within 30 seconds of first opening the app.**

This is the gate. Feature count and coverage % are not the measure.

## AI integration details (Q11)

Primary providers (checked in ai-client.js):
- **Ollama** — local, privacy-preserving, default for new users
- **Gemini** (Google) — cloud, key stored in localStorage; primary cloud option
- **Anthropic** — cloud, key stored in localStorage; secondary cloud option

Primary model baseline: `gemini-2.5-flash` (Gemini default) / local Ollama model (user-configured)

## Grill pass decisions

**Scope freeze (must-haves for "working"):**
1. Microphone capture via Web Speech API
2. AI correction via Ollama (local) or Gemini/Anthropic (cloud)
3. Copy corrected text to clipboard
4. Python server running (or GitHub Pages fallback)

**Deferred (not must-haves):**
- Electron packaged installer (built, works when env var clear)
- Prompt templates beyond freeform
- Projects/folder management
- Timeline, analytics, diagram generation
- Macro recorder, ambient detector

**Hard-to-reverse decisions already made:**
- No backend database — all state in localStorage
- Web Speech API (Chrome/Electron only — not Firefox/Safari)
- Python stdlib server (no Flask/FastAPI dependency)
- Electron for desktop (not Tauri, not NW.js)

Each of these is an ADR candidate (see docs/adr/).
