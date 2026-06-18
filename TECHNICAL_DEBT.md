# Technical Debt Tracker

> Zero-tolerance project: this file should normally be near-empty. It exists to make any
> accepted deferral **visible and costed**, not to make debt routine. Core/foundation work
> is never deferred — it compounds 4–7× to fix later. `/start` halts new feature work if
> any critical item is open.

## Active debt

| ID | Item | Deferred | Est. cost to fix | Impact | Critical path? |
|----|------|----------|------------------|--------|----------------|
| TD-001 | Server auto-start hook (.claude/settings.json SessionStart) | 2026-06-18 | 30 min | Low — dev convenience only | No |
| TD-002 | No Content-Security-Policy on the served HTML | 2026-06-18 | 3–4 h | Low — localhost/desktop only, defense-in-depth | No |
| TD-003 | Mermaid loaded from CDN without Subresource Integrity | 2026-06-18 | 30 min | Low — optional diagram feature, mermaid@10 self-sanitises | No |
| TD-004 | Decrypted API key travels in the AI-proxy request body | 2026-06-18 | 2 h | Low — loopback only, user's own key in own browser | No |

### TD-002 detail
- **Item:** The HTML document (served by `SimpleHTTPRequestHandler` in server.py and statically on GitHub Pages) carries no CSP header.
- **Is it core/user-facing/foundation?** No — the app is localhost/Electron only; no remote attacker surface.
- **Why deferred:** A meaningful CSP requires `script-src` without `'unsafe-inline'`, but the UI uses inline `onclick="..."` handlers pervasively (index.html + JS-injected markup). A real fix = migrate every inline handler to `addEventListener` first, then add the CSP — a sizeable refactor out of this audit's scope. An inert CSP on JSON-only responses would be placebo, so it was not added.
- **Mitigation:** XSS sinks were hardened in this audit (all `innerHTML` user/AI/model-name interpolation now escaped); the remaining risk is defense-in-depth only.

### TD-003 detail
- **Item:** `js/ui/diagram-renderer.js` injects `mermaid@10` from jsdelivr with no `integrity`/`crossorigin`.
- **Why deferred:** Correct SRI needs an exact pinned version (e.g. `mermaid@10.9.x`) plus its verified base64 hash, which must be obtained from the real artifact — fabricating a hash would break loading. Pinning + hashing is a discrete follow-up.
- **Mitigation:** mermaid@10 sanitises its own SVG output by default (DOMPurify, securityLevel strict), so the script-injection vector is already largely closed.

### TD-004 detail
- **Item:** `ai-client.js _buildProxyPayload` sends the decrypted key in the POST body to the local proxy.
- **Why deferred:** Inherent to the same-origin localhost proxy model; the key only traverses loopback to the user's own machine and is visible only in the user's own DevTools. A server-side session/header path is a design change, not a bug fix.
- **Mitigation:** Documented trade-off; no third-party exposure, no remote in-transit leak.

### TD-001 detail
- **Item:** `.claude/settings.json` SessionStart hook to auto-start `server.py`
- **Is it core/user-facing/foundation?** No — dev convenience; users run server manually
- **Justification:** Write was blocked by auto-mode classifier in prior session; needs
  explicit user approval to proceed
- **Mitigation:** User can manually run `python server.py` or approve the hook write
- **Features built on top:** 0

## Deferral decision template

- **Item:** <what>
- **Is it core / user-facing / a foundation others build on?** If yes → **do not defer.**
- **Features that will be built on top:** <0–1 low risk · 2–5 document · 5+ high risk>
- **Cost now vs later:** <Nh now> vs <~Nh × (1 + 0.5 × phases_on_top) later>
- **Justification & mitigation:** <why, and how the risk is contained>

## Resolved debt

| ID | Resolved | Evidence |
|----|----------|----------|
| — | — | — |

<!-- A debt item is RESOLVED only with: the fix, a verified-working check (seen running
or user-confirmed), and no TODO/FIXME left in the area. Green tests are not sufficient. -->
