# Phase 3, chain lane 2 brief (B3.6, B3.7a, B3.8, B3.7b)

TASK_2026_2285_304a: Settings page redesign, Ptah Electron app. Working directory (all paths relative):
`/home/amun/ptah-extension/.claude-worktrees/settings-lanes-modals` (branch `feat/settings-lanes-modals`).
Batches B3.1-B3.5b are already in the working tree, uncommitted. Do not revert them.

## Objective
Implement, in this order, batches B3.6 -> B3.7a -> B3.8 -> B3.7b of Phase 3. After EACH batch the focused
checks below are green before you start the next one.

## Inputs (read only what each batch needs)
- `.ptah/specs/TASK_2026_2285_304a/implementation-plan.md`:
  - path prefixes at line 6 (`UI/`, `CH/`, `PA/`, `PR/`).
  - sections 3.6 (line ~710), 3.7 (~752), 3.8 (~848), and the B3.7b parts of 3.9 (~874).
  - Tests table (~979-1035): the rows for the specs you change, with the batch named in each row.
  - Batches table (~1100-1120): the rows B3.6, B3.7a, B3.8, B3.7b give the write set, the read set and the
    acceptance of each batch. Batch notes (~1037-1095): focused checks, batch order, API-removal table.
- `.ptah/specs/TASK_2026_2285_304a/decisions.md` (rulings; rows 13-23, 29, 31, 32, 44 matter).
- `.ptah/specs/TASK_2026_2285_304a/parity-inventory.md`: every capability stays. Approved removals are R-1..R-3 only.
- `.ptah/specs/TASK_2026_2285_304a/design-spec.md`, `prototype/index.html` (approved design; prototype 600-690
  for B3.7b).
- `.ptah/specs/TASK_2026_2285_304a/phase-3-report-1.md`: what chain lane 1 built (B3.2-B3.5b).
- Repository rules: `CLAUDE.md` in the working directory.

## Scope
Edit only the write set of each batch row. Extra rule from decision 44 / 32: in B3.6 give the
`lanes-table-detail` panels ONE scroll owner (no nested scroll inside a popover or panel).
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
**Deliverable**: `/home/amun/ptah-extension/.claude-worktrees/settings-lanes-modals/.ptah/specs/TASK_2026_2285_304a/phase-3-report-2.md`
Write it first as a skeleton and fill it after each batch. Per batch: files changed, acceptance items met,
check results (exact pass/fail counts), deviations from the plan. Then `## Decisions`
(decision, options, evidence, reversible) and, if needed, `## Clarifications Needed`. End with the class audit result.

## Reply
`WROTE: <absolute path>` plus a one-line headline. Call `ptah_agent_report` once before the final message with the
files written and anything not done.
