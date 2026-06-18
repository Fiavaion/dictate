# Session: Full codebase audit + fixes — 2026-06-18

## Context
Project created with an older Claude version; user asked for a thorough full audit
using specialist persona agent teams, with carte blanche for changes. Started after a
port migration (3000→31000, to avoid an Open WebUI conflict) and ADR write-up.

## What was done
1. **Port migration** 3000→31000 across server.py, launchers, smoke test, docs (verified).
2. **5 ADRs** written for the existing hard-to-reverse decisions (docs/adr/).
3. **Audit workflow** — 6 persona finders (security, architecture/zero-debt, accessibility,
   API currency, deps/build, performance) on Sonnet, every finding adversarially verified on
   Opus, synthesized in the main session. 95 raw → 75 confirmed (20 rejected).
4. **Fixes** applied in 7 logical commits on `audit/codebase-2026-06-18` (see CURRENT_STATUS).

## Key decisions
- Fix mode: **hybrid** — auto-fixed safe items, paused for approval on the 3 architectural
  buckets (Electron upgrade, localStorage refactor, Gemini discovery). User approved all 3.
- Electron: upgraded to **42** (latest), not just the audit's suggested 41 — zero-debt mandate
  (EOL runtime with 18 CVEs is core-path debt, never deferred). `npm audit` → 0 vulnerabilities.
- localStorage: added generic typed helpers to persistence.js; migrated 8 modules. Encryption
  for API keys stays local in ai-client; only the storage call routes through persistence.
- 3 LOW items where the proper fix needs out-of-scope work were logged as costed deferrals:
  TD-002 (CSP — needs inline-handler refactor), TD-003 (mermaid SRI — needs pinned hash),
  TD-004 (proxy-key in body — inherent design trade-off).

## Verified working
- server.py: path-traversal blocked, normal scan intact, smoke test PASS.
- Gemini models route reaches Google and relays its response.
- Electron 42 app launches (Node 24 bundled), internal server + API respond.
- All changed JS passes `node --check`; localStorage confined to persistence.js.

## NOT yet verified
- In-browser core workflow (dictate → AI-correct → copy). No headless browser console
  available this session; recommend a manual spot-check before merging to master.

## Release gate — PASS
Ran `/release` (interactive) after the audit. Stages 0–5 with parallel Sonnet review
subagents over the audit diff, synthesis + verdict on Opus.
- Stage 0 smoke PASS; Stage 5 re-test PASS.
- The re-scan caught **2 HIGH** the audit had missed/left: api-settings.js API-key value
  was still unescaped (commit 1's message claimed to fix it but the edit missed that exact
  line), and gemini-wizard step-4 `<option>`s were unescaped (now fed by live discovery).
  Plus 1 MEDIUM: Electron model-list functions returned `[]` on a bad-key 4xx. All fixed
  in commit `c487aee`, re-tested.
- Verdict: PASS — tests green before/after, zero unresolved CRITICAL/HIGH.
- Browser core path: user-confirmed working.

Branch state: 11 commits + restore tag `audit-checkpoint-2026-06-18`. Bootstrap infra
(docs/, evals/, notes/, .claude config) committed; `.claude/worktrees/` + settings.local
added to .gitignore (user-approved). `.claude/settings.json` left untracked pending the
exec-form hook paste.

## Lessons captured
- LESSON: a commit message claimed an escaping fix that the actual edit missed; the
  `/release` diff re-scan caught it. Always grade each claimed fix against the real diff
  before declaring done (now encoded in CLAUDE.md "Grounded progress"). See notes/lessons.md.

## Next steps
1. Paste the exec-form SessionStart hook into `.claude/settings.json` (closes TD-001), then commit it.
2. Merge `audit/codebase-2026-06-18` → master (gate PASS) and tag a release.
3. Bump local Node to ≥22 before cutting a `dist:win` installer (electron-builder 26).
