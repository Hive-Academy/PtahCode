# Batch 8 lane C: badge adoption

| File | Result | Reason |
| --- | --- | --- |
| `libs/frontend/tasks-ui/src/lib/components/filter/task-view-menu.component.ts` | Left raw | The Modified badge deliberately combines a warning border with `text-base-content`. The owner outline tone couples border and ink, so adopting it would lose that contrast treatment. |
| `libs/frontend/tasks-ui/src/lib/components/filter/task-view-menu.component.spec.ts` | Left as is | It finds the Modified badge by test ID and does not query old badge classes. |
| `libs/frontend/tasks-ui/src/lib/components/filter/task-filter-bar.component.spec.ts` | Left as is | Its `.badge-primary` assertion checks that the old filled primary badge is absent; it does not query a badge being migrated here. |
| `libs/frontend/tasks-ui/src/lib/components/tasks-view.component.spec.ts` | Left as is | It finds the Modified badge by test ID and does not query old badge classes. |
| `libs/frontend/tasks-ui/src/lib/components/task-maintenance-dialog.component.ts` | Left raw | Both ghost badges retain a surface border and base-content ink. The owner neutral badge has a different border and fill treatment, so adoption would alter those recipes. |
| `libs/frontend/thoth-shell/src/lib/components/thoth-shell.component.ts` | Adopted | Paused uses `warn`/`sm`; gateway states use `ok`, `info`, `err`, and `neutral`/`xs`. The platform label uses `ptah-badge-text` for overflow. All hosts are spans. |
| `libs/frontend/thoth-shell/src/lib/components/thoth-shell.component.spec.ts` | Updated | The Paused assertion reads `data-size="sm"` instead of `.badge-sm`. |

## Verification

- `npm run verify -- -t lint -p @ptah-extension/thoth-shell`: passed (1 task).
- `git diff --check`: passed.
- No Electron render or screenshot was possible under the instruction to avoid build/serve/dev targets; visual contrast was not measured. The adopted state colors were mapped to the corresponding owner tones. No commit or push was made.
- CLI skill invocation was unavailable; the repository's Angular frontend and UI design `SKILL.md` files were read directly.
