# Decisions — TASK_2026_2312_c3ef

| # | Decision | Evidence | Who | Reversible |
| - | -------- | -------- | --- | ---------- |
| 1 | Task type BUGFIX, Full workflow, HARD STOP after Part A | Parent brief | Parent / user | — |
| 2 | Approval mode `user` for the plan gate, although a lane review exists | Parent brief requires explicit approval before implementation | Coordinator | Yes |
| 3 | Measure with a temporary, uncommitted Jest harness (real discovery + real tree-sitter, in-memory sink), not with the user's app | Brief: do not disturb `/opt/Ptah` or real HOME data; `ptah_code_*` tools would write rows for this worktree into the user's database | Coordinator | Yes |
| 4 | A3: separate rows per root + vector reuse by text hash (proposed; user-reserved) | `index-audit.md` A3 table | Coordinator (proposal) | Yes |
| 5 | A4: new `CODE_INDEX_EXCLUDES` for the symbol index only; `DEFAULT_WORKSPACE_EXCLUDES` unchanged (proposed; user-reserved) | `index-audit.md` A4 table; `@` picker must still show skills and analysis docs | Coordinator (proposal) | Yes |
| 6 | Fingerprint in a per-file table `code_symbol_files` (analyzed files only, see #11), not a per-row column as in the follow-up note | Zero-symbol, failed and unchecked files have no row to hold a per-row fingerprint, so they would re-parse on every run | Coordinator; codex review agreed (r1 Decisions) | Yes |
| 7 | `indexing_state` fingerprint collision across worktrees: follow-up, not Part B | Fix changes memory fingerprint scope (`workspace-fingerprint.ts:38-63`) — user-reserved | Coordinator | — |
| 8 | Ignore matcher git-semantics fix: follow-up, not Part B | Changes the `@` picker too; broad blast radius | Coordinator | — |
| 9 | Cross-side plan review by a codex lane (`code-logic-reviewer` role) | Orchestration document gate; codex has confirmed room; kimi at limit | Coordinator | — |
| 10 | Skip decided inside the per-file lock with a live point lookup and a fresh in-lock stat, not from a map loaded before the run | Review r1 finding 1 (stale coverage vs watcher writes, `code-symbol-indexer.service.ts:973-999`) | Coordinator after codex review | Yes |
| 11 | Only `analyzed` outcomes (incl. zero-symbol) are cacheable | Review r1 finding 3 | Coordinator after codex review | Yes |
| 12 | Donor vector read in one read transaction with one `CROSS JOIN` statement per hash | Review r2 new defects 1 and 3 | Coordinator after codex review | Yes |
| 13 | Model id inside the fingerprint and the text hash; no database-wide generation switch (revision 3b) | Review r3 new defect 1: a shared switch needs a fence across connections; per-key model ids need none | Coordinator, post-cap, NOT re-reviewed | Yes |
| 14 | Measurement harness v1 stopped after 30 min (background limit); v2 saves after each phase, 2 h limit | Tree-sitter parse under Jest is slow; v1 wrote results only at the end | Coordinator | — |
