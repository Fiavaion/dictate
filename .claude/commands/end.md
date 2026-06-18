# /end — Close out a session

Run at the end of every session to preserve context for the next one.

## Steps

1. **Smoke test** — verify the Success Metric path works:
   Open app → start dictation → speak → stop → AI correct → text appears

2. **Check for new debt:**
   Grep `TODO|FIXME|DEFERRED|TEMPORARY` in js/, electron/, server.py
   Any new debt → log to `TECHNICAL_DEBT.md` before closing

3. **Capture lessons** — run `/lessons` to fold new `LESSON-*` tags into `notes/lessons.md`

4. **Rewrite `notes/CURRENT_STATUS.md`** with today's state (what works, what's broken,
   next 3 tasks in order, blockers)

5. **Write dated session log** to `docs/sessions/YYYY-MM-DD-<topic>.md`:
   - What was done (file:line refs)
   - What was verified working
   - **Next steps** (numbered — this is what `/start` trusts on conflict)
   - Lessons captured

6. **Commit** if uncommitted changes: stage specific files, clear commit message

## Completion checklist
- notes/CURRENT_STATUS.md rewritten ✅
- docs/sessions/YYYY-MM-DD-topic.md written ✅
- Smoke test passing ✅ (or debt filed)
- Lessons captured ✅
- Committed ✅
