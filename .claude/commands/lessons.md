# /lessons — Extract LESSON-* tags to notes/lessons.md

Scan all source files for `LESSON-*` inline tags and fold new ones into the lessons ledger.

## Steps

1. Grep for `LESSON-` tags in: `js/`, `electron/`, `server.py`, `css/`

2. For each new tag not already in `notes/lessons.md`, add an entry:
   ```markdown
   #### LESSON-{CAT}-NNN: <title from inline comment>
   **Problem:** <observable symptom>
   **Root cause:** <the real reason>
   **Fix:** <what resolved it>
   **Prevention:** <how to avoid next time>
   **Location:** file:line   **Impact:** high/med/low
   ```

3. Categories:
   - `ARCH` — architectural decisions
   - `BUG` — bug root causes
   - `PERF` — performance insights
   - `API` — external API quirks
   - `UI` — UI/UX learnings
   - `TEST` — test strategy insights
   - `BUILD` — build/deploy learnings

4. Report: N new lessons extracted, N already in ledger

## Why this matters

A recorded root cause is a bug that can't silently regress. Capture lessons as they
happen (at the point of insight), never retrospectively. The ledger is also the seed for
`~/.claude/CLAUDE.md` global lessons worth carrying across projects.
