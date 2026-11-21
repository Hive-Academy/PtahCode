# Phase 3, chain lane 3 brief (B3.9, B3.10, B3.12, B3.11a, B3.11b)

TASK_2026_2285_304a: Settings page redesign, Ptah Electron app. Working directory (all paths relative):
`/home/amun/ptah-extension/.claude-worktrees/settings-lanes-modals` (branch `feat/settings-lanes-modals`).
Batches B3.1-B3.7b are already in the working tree, uncommitted. Do not revert them.

## Objective
Implement, in this order, batches B3.9 -> B3.10 -> B3.12 -> B3.11a -> B3.11b of Phase 3. After EACH batch the focused
checks below are green before you start the next one.

## Inputs (read only what each batch needs)
- `.ptah/specs/TASK_2026_2285_304a/implementation-plan.md`:
  - path prefixes at line 6 (`UI/`, `CH/`, `PA/`, `PR/`).
  - sections 3.9 (line ~874), 3.10 (~913), 3.11 (~925), 3.12 (~934, with its id list and behaviour table),
    and the last bullet of 3.6 (~710-750, the grep for B3.11b).
  - Tests table (~979-1035): the rows for the specs you change, with the batch named in each row.
  - Batches table (~1100-1120): the rows B3.9, B3.10, B3.12, B3.11a, B3.11b give the write set, the read set and
    the acceptance of each batch. Batch notes (~1037-1095): focused checks (B3.10 and B3.11a also run
    `agent-orchestration-config.component.spec.ts`; B3.12 has its own tsc projects), batch order, API-removal
    table, duplicate-id window.
- `.ptah/specs/TASK_2026_2285_304a/decisions.md` (rulings; rows 13-23, 29, 31, 32, 44, 47 matter).
- `.ptah/specs/TASK_2026_2285_304a/parity-inventory.md`: every capability stays. Approved removals are R-1..R-3 only.
- `.ptah/specs/TASK_2026_2285_304a/design-spec.md`, `prototype/index.html` (approved design).
- `.ptah/specs/TASK_2026_2285_304a/phase-3-report-1.md` and `phase-3-report-2.md`: what chain lanes 1 and 2
  built (B3.2-B3.7b) and the new APIs.
- Repository rules: `CLAUDE.md` in the working directory.

## Scope
Edit only the write set of each batch row. Extra rule from decision 44 / 32: in B3.10 give the
`agent-orchestration-config` panels and popovers ONE scroll owner (no nested scroll).
B3.12 edits e2e files only (ids, selectors, steps). Do not run any e2e test. Check B3.12 with
`npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json`,
`npx tsc --noEmit --project apps/ptah-electron-e2e/tsconfig.json` and eslint, and grep that each id and
selector exists in the templates.
A test of the 5 named specs that fails after a batch is fixed in that batch. If its file is not in the write set,
stop and report it. Do not modify anything else. Report each read outside the read set.

## Rules for Settings templates (CI blocks a violation)
- No raw Tailwind spacing utilities (`p-*`, `m-*`, `gap-*`, `space-*` ...) in `libs/frontend/chat/src/lib/settings/**`
  templates: use `--ptah-*` tokens in component CSS, or pattern components from `libs/frontend/ui`.
- No raw or dynamic DaisyUI classes outside `libs/frontend/ui`.
- After the last batch run `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`. It must exit 0.
  Never pass `--update-baseline`.

## Focused checks (the ONLY checks you run)
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`, where
  `<specs>` = the specs of the write set plus these 5 in `libs/frontend/chat/src/lib/settings/ptah-ai/`:
  `lanes-table.component.spec.ts`, `lanes-table.visual.component.spec.ts`, `lanes-table-detail.component.spec.ts`,
  `cli-orchestration-matrix.component.spec.ts`, `cli-orchestration-matrix.writes.spec.ts`.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` (it has about 384 old errors in files this
  task did not change; report only NEW errors in files you changed).
- `npx eslint <changed files>`
- Never run `npm run verify`, `nx`, or any build, serve, dev, e2e or package target. Write long output to
  `.ptah/tmp/<name>.log` and filter it with `tail`/`grep`.

## Git
Never commit, push, or run history-changing git. Never run `git restore`, `checkout -- <path>`, `stash`, `reset`
or `clean`. A change that you did not make belongs to another writer: report it, never revert it.

## Deliverable
**Deliverable**: `/home/amun/ptah-extension/.claude-worktrees/settings-lanes-modals/.ptah/specs/TASK_2026_2285_304a/phase-3-report-3.md`
Write it first as a skeleton and fill it after each batch. Per batch: files changed, acceptance items met,
check results (exact pass/fail counts), deviations from the plan. Then `## Decisions`
(decision, options, evidence, reversible) and, if needed, `## Clarifications Needed`. End with the class audit result.

## Reply
`WROTE: <absolute path>` plus a one-line headline. Call `ptah_agent_report` once before the final message with the
files written and anything not done.
