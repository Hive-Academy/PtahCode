# G7 after-measurement — TASK_2026_2312_c3ef

Harness: `.ptah/tmp/index-measure/harness/after-measure.local.spec.ts` (local only, not committed).
Raw output: `.ptah/tmp/index-measure/after.json` (census) and `after-S.json` (store part).

## Part S — real SQLite + sqlite-vec store, 71-file copy of `memory-curator/src`

| Run | Parsed | Skipped | Texts embedded | Time |
|---|---|---|---|---|
| A1 cold | 71 | 0 | 971 | 19.8 s |
| A2 restart | 0 | 71 | 0 | 0.12 s |
| A3 one file edited | 1 | 70 | 0 | 0.5 s |
| B1 second root, same content | 71 | 0 | 0 (vector reuse) | 16 s |
| A4 forced | 71 | 0 | 0 (vector reuse) | 13.7 s |

## Part C — census of this worktree (real discovery + tree-sitter, record sink)

Discovery: 8,999 files in 3.5 s. 0 excluded by the code-index excludes (this repository's ignore
files already drop `.claude/**`). 8,880 eligible and 119 unsupported.

| Run | Parsed | Skipped | Symbol texts | Errors | Time |
|---|---|---|---|---|---|
| run1 cold | 4,771 | 0 | 50,314 | 23 | 1,295 s |
| run2 restart, no change | 30 | 4,741 | 1,295 | 23 | 14.9 s |
| run3 one file bumped | 30 | 4,741 | 1,295 | 23 | 10.7 s |

Before the change, a restart parsed all files again (4,769 parsed, 50,287 texts, 1,547 s).
After the change, a restart takes 14.9 s, about 1 % of the cold time.

The 30 files that are parsed again on each run are the files that fail (23 parse errors,
7 unsupported syntax). They get no file record (review finding M1, accepted follow-up). Run 3
bumps the first eligible file; the counts equal run 2, so that file is probably one of the
30 failed files. Part S A3 proves the one-edit case (1 parsed, 0 embedded).
