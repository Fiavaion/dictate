# /start — Restore session context

Restore context at the start of a new session. No code yet — orient first.

## Steps (in order)

1. **Read CLAUDE.md** — source of truth; note the Success Metric and Change Boundaries
2. **Read the latest session log** in `docs/sessions/` (most recently modified file) —
   its "Next steps" section is the detailed plan; trust it over the status summary on conflict
3. **Read `notes/CURRENT_STATUS.md`** — verify current state; resolve any conflict with
   the session log (session log wins)
4. **Grep core paths for debt red flags:**
   ```
   grep -r "DEFERRED\|TODO Phase\|TEMPORARY\|refactor later" js/ electron/ server.py
   ```
   If any red flags are in a critical path → **halt new feature work**, surface them first
5. **Health check:**
   - Is the Python server running? (`curl -s http://localhost:31000/api/projects-root`)
   - If not: `python server.py &` to start it in background
   - `git status` and `git log --oneline -5`
6. **State the next task** (from session log "Next steps" or CURRENT_STATUS next-3-tasks)
   and confirm with the user before starting

## What to say at the end of /start

```
Context restored.
- Session log: [date/topic] — last task was [X]
- CURRENT_STATUS: [what works / what's broken in one line]
- Debt flags: [none / list]
- Server: [running on :31000 / not running, starting...]
- Next task: [task from notes]
```
