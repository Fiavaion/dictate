# Current Status

**Last updated:** 2026-06-18
**Phase / focus:** Full codebase audit complete + `/release` gate PASS on `audit/codebase-2026-06-18`
**Build:** ✅ server.py runs on :31000 · Electron 42 app launches · **Tests:** smoke PASS · **Release gate: PASS**

## What works right now
- [x] Web Speech API dictation (Chrome/Edge/Electron)
- [x] AI correction via Ollama (local), Gemini, Anthropic, OpenAI
- [x] Python server on localhost:**31000** (migrated from 3000 — Open WebUI conflict)
- [x] GitHub Pages static deployment
- [x] Electron desktop app — **upgraded to Electron 42** (was 34/EOL); launches, internal server + API verified
- [x] Gemini + Anthropic model discovery (live, no stale hardcoded lists)
- [x] localStorage access centralized in `js/utils/persistence.js`

## Audit outcome (this session)
95 raw findings → 75 confirmed (20 rejected by adversarial verification). Fixed across 7 commits:
1. `c6110cb` Security — path-traversal containment, openExternal scheme check, XSS escaping, headers
2. `a1b50b0` Accessibility — live regions, dialog roles+focus, labels, landmarks, prefers-reduced-motion, keyboard
3. `21ecce9` Zero-debt/bugs — removed dead diff feature + unused methods + stale comments; fixed session-timer freeze
4. `f1572c3` Performance — drawWave rAF gated to recording, ambient-detector teardown, heatmap listener-leak + cap, typo debounce
5. `aabd3d2` localStorage centralized into persistence.js (8 modules migrated)
6. `03ba472` Gemini model discovery (server + client), removed bad gemini-3-flash-preview ID
7. `4c42cf5` Electron 34→42, electron-builder 25→26, express 4.22.2 — **npm audit: 0 vulnerabilities**

## What's broken / known issues
- Server does not auto-start (TD-001 — SessionStart hook unfinished; exec-form correction unsaved in .claude/settings.json)
- Packaging (`dist:win`) prefers Node ≥22.12 (electron-builder 26 dep); local Node is 20. Running the app is unaffected.
- In-browser core workflow: ✅ user-confirmed working this session.

## Next 3 tasks (in order)
1. Paste the exec-form SessionStart hook into `.claude/settings.json` (closes TD-001), then commit it — the only uncommitted file
2. Merge `audit/codebase-2026-06-18` → master (release gate already PASS) and tag a release
3. Bump local Node to ≥22 before cutting a `dist:win` installer (electron-builder 26 requirement)

## Blockers
- None blocking. Browser manual-verify is the recommended next confidence step.

## Reference links
- Audit deferrals: @TECHNICAL_DEBT.md (TD-002 CSP, TD-003 mermaid SRI, TD-004 proxy-key)
- ADRs: @docs/adr/
- Session log: @docs/sessions/2026-06-18-codebase-audit.md
