# /todos — Sync TODOs to notes/TODOs.md

Scan the codebase for inline TODO/FIXME/NOTE comments, de-duplicate against the existing
list, and update `notes/TODOs.md` with file:line references.

## Steps

1. Scan for inline markers:
   - `TODO[cl]:` — Claude Code action item
   - `TODO:` / `FIXME:` — any inline task
   - `NOTE:` — important context notes
   - `LESSON-*:` — lessons (run `/lessons` instead for these)
   
   Search paths: `js/`, `electron/`, `server.py`, `css/`
   Exclude: `node_modules/`, `dist/`, `.claude/`

2. De-duplicate: compare against existing entries in `notes/TODOs.md`

3. Update `notes/TODOs.md`:
   - Add new items to **Backlog** with file:line reference
   - Mark items as **Done (recent)** if the comment has been removed
   - Keep **In Progress** and **Ready for Review** accurate

4. Report: N new items found, N resolved, N still open

## Format for new entries

```
- [ ] [file:line] Description of the TODO
```

## Note on debt

An unresolved `TODO` in shipped code is technical debt. Keep the list short and burn it
down — add items to TODOs.md only if they will actually be addressed. If it's
permanently deferred, move it to `TECHNICAL_DEBT.md` instead.
