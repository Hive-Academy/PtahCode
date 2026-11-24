# Context — TASK_2026_2323_9838

Child session `prompt-context-dedup` of the parent chat session. Branch
`fix/prompt-context-dedup`.

## Request

Find and fix the duplicated and growing context in Ptah main-chat prompts (Claude SDK,
`sdk-ts`), measured by the nav benchmark rerun (PR #1493, TASK_2026_2320_15a6). Offline work
only: no paid model calls, no Electron build or launch.

## Decisions

- The third CLAUDE.md copy is a harness artifact (`git init` of the workspace between the
  native and Ptah arms). The fix is still useful for nested layouts, so it ships: flag-tier
  `claudeMdExcludes` for byte-identical ancestor copies.
- Guidance that the user added on purpose is not removed. Candidates are listed in
  `prompt-context-report.md`.
- The parent approved one merge of `origin/main` into the branch, to edit the merged
  benchmark report of TASK_2026_2320_15a6.

## Files

- `prompt-context-report.md` — measurements, causes and changes.
- `code-logic-review.md` — independent review.
- `status.md` — batch reports.
