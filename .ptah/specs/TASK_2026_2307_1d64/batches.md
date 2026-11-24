# Batches — TASK_2026_2307_1d64

Roster from `ptah_route_decide` gate-0.1 (2026-11-22): impl-a1 → lane `claude` (opus, xhigh,
source ranking); impl-a2 → lane `antigravity` (sonnet, medium, source ranking); design-review and
code-review → lane `codex` (source model); impl-b → lane `claude`; visual → subagent.

Lane rules for every batch: no `npm run verify`, no `nx`, no build/serve/e2e. Focused checks only
(`npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
`npx tsc --noEmit --project <tsconfig>`, `npx eslint <changed files>`). No git commit/push/restore.
Electron first. Required Skills: angular-frontend-patterns.

## Batch A1 — items 1, 3, 8 (project `chat`, maybe `ui` picker) — IN PROGRESS

Write set:
- `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.html` (item 1)
- `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts` + spec (item 8)
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts` + spec (items 3, 8)
- `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts` + spec (item 8, only if needed)
Read set: `root-causes.md` items 1, 3, 8.
Acceptance: see lane brief. Report: `batch-a1-report.md`.

## Batch A2 — items 2, 9 (projects `ui`, `chat`) — IN PROGRESS

Write set:
- `libs/frontend/ui/src/lib/patterns/table/table-cells.ts` + `table-cells.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-row-identity.component.ts` + spec
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.visual.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-capability-detail.component.ts` (+ spec if present)
Read set: `root-causes.md` items 2, 9.
Report: `batch-a2-report.md`.

## Batch B — items 4, 5, 6, 7, 10 — BLOCKED on Gate 1.7 (design)

Split after the design spec is approved (wizard file is shared by items 4, 5, 6).
