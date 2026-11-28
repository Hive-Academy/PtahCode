# Phase B style fix — `code-style-review-phase-b.md` findings 1, 4, 5, 6, 7, 8

Lane: frontend-developer (CLI lane). Write set: `libs/frontend/setup-wizard/src/**` only.
Findings 2 and 3 (store split) and 9–12 are out of scope for this lane, per the task brief.

## Status: COMPLETE

## Finding 1 [Blocking] — degradation-audit violations

- `generation-handoff.store.ts:250` — dropped the invalid `degradation-audit: preserved -` prefix;
  now the plain comment `// Manual recovery keeps non-running statuses such as needs-input intact.`
- `setup-run-attempt.ts:436` — dropped the orphaned prefix; now the plain comment
  `// An unavailable guidance status keeps the last known status.`
- `setup-run.store.ts:140` — added
  `// degradation-audit: optional-capability - unavailable browser storage keeps Setup runs in memory for this session.`
  inside the `browserStorage()` catch.
- `setup-run-persistence.ts:308` — added
  `// degradation-audit: optional-capability - a refused storage write keeps Setup runs for the current session.`
  inside the `writeSetupRunIndex` catch.
- Verify: `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts | grep setup-wizard`
  prints no setup-wizard site (`.ptah/tmp/style-fix-degradation.log`). The tool still reports
  2 sites in `libs/frontend/onboarding/analyze-skills.page.ts`; those belong to the onboarding lane
  and were not touched.

## Finding 4 [Major] — public API surface

- `src/app.ts:8` — added `export { SetupRunStore } from './lib/services/setup-run.store';`
  (planned for Batch 14's `app.config.ts` wiring).
- `src/index.ts:2-5` — added `WizardRpcError` to the `wizard-rpc.service` export block.
- `src/index.ts:11` — removed `SETUP_RUN_POLL_INTERVAL_MS` from the barrel. Grep of `libs/` and
  `apps/` (excluding the lib itself) found zero importers. Inside the lib the constant is still
  exported from `setup-run.store.ts` and specs import it from that relative path, so nothing broke.
- `src/index.ts:14-17` — removed `TERMINAL_SETUP_RUN_STATUSES` from the barrel. Zero importers
  outside the lib. It remains exported from `setup-run.types.ts`; `isTerminalSetupRunStatus` stays
  in the barrel.
- No export had an outside importer, so none was kept back. The review's `@internal` marking of
  the seven sibling-coordination methods is part of finding 4's wider fix but was not in this
  lane's brief; not done.

## Finding 5 [Major] — entry route table reuse

- `setup-run-steps.ts:102-119` — new exported
  `entrySubPathFor(workflow: SetupRunWorkflow, chained = false): SubPath` holding the single
  switch. `entrySubPath(record)` (`:121-123`) now delegates:
  `entrySubPathFor(record.workflow, record.parentId !== null)`.
- `setup-run-entry.service.ts:9,45-48` — `openWorkflow` calls
  `this.router.navigateToSurface('onboarding', entrySubPathFor(requested))`. The inline
  `requested === 'agent-generation' ? ['analyze', 'skills'] : ['guidance']` copy is gone.
- `entrySubPathFor` is exported from `setup-run-steps.ts` only, not from the public barrel
  (`src/index.ts`): no consumer outside the lib needs it, and the review criticized leaking
  internal surface, so the barrel was not widened further.

## Finding 6 [Major] — watchdog teardown, terminal arrays, path normalization

- `generation-workflow.store.ts:98-100` — new constructor registers
  `inject(DestroyRef).onDestroy(() => this.clearWatchdog())`, matching
  `generation-handoff.store.ts:51-54`.
- `generation-workflow.store.ts` — the private `isTerminal` (with its own
  `['completed', 'cancelled', 'failed', 'timed-out']` array) is deleted; all 7 call sites
  (`:470, :493, :538, :543, :551, :555, :565`) now use `isTerminalLifecycle` from
  `setup-run-attempt.ts`. The `SetupGenerationRunLifecycle` union is fully assignable to
  `GenerationViewState`, so the lost type-predicate narrowing does not affect behavior.
- `guidance-generation.store.ts` — all three inline terminal arrays (`:121` adopt,
  `:172` applyRun, `:189` report) and the private `isTerminal` duplicate are deleted; all sites
  call `isTerminalLifecycle`.
- Path normalization: `matchesBinding` from `setup-run-attempt.ts` (the lib's existing normalizer)
  replaces raw `workspacePath ===` at `generation-workflow.store.ts:110` (bind), `:534` (applyRun),
  `:572-574` (sameBinding) and `guidance-generation.store.ts:79` (bind), `:157` (refresh),
  `:270-272` (sameBinding). Note: `matchesBinding` normalizes only the `actual` path, mirroring
  the rest of the lib; the comparison direction was chosen so the stored/stable binding is
  `expected` and the incoming one is normalized, exactly as `setup-run.store.ts:adopt` uses it.

## Finding 7 [Major] — type precision

- `setup-run.store.ts:1082-1089` — `resolveBlockedStart` now returns
  `Promise<{ owner: SetupRunRecord | null; run: SetupGenerationRunState | null }>`.
- `setup-run-attempt.ts:299-316` — `observation` now returns an explicit
  `{ update: { status; step?; backendRunId; error; analysisRunId }; correction; finalizationRunId } | null`.
- `setup-run-attempt.ts:403-412` — `requestBoundStart` now returns
  `Promise<WizardSubmitSelectionResponse | EnhancedPromptsRunWizardResponse | { refusalCode: string } | null>`
  (types imported from `@ptah-extension/shared`). The union shape is unchanged, so
  `setup-run.store.ts`'s `'refusalCode' in response` branch is untouched.
- `generation-workflow.store.ts:505` — `let cancelled = false;` is now `let cancelled: boolean;`
  (both `try` and `catch` assign it), clearing `no-useless-assignment`.
- `generation-workflow.store.ts:227-236` — `startGuidance`'s catch first checks
  `error instanceof WizardRpcError && !!error.code?.startsWith('SETUP_')`
  (`startBoundGuidance` throws `WizardRpcError` via `guidanceFailure`, `wizard-rpc.service.ts:223`).
  The two `error.message` fallback checks stay: `generation-workflow.store.spec.ts:549-558`
  rejects with a plain `Error` carrying a `code` property (not a `WizardRpcError` instance), so
  removing them would change behavior and break that spec.

## Finding 8 [Minor] — `public` modifiers

- `generation-workflow.store.ts` — `public` added to the 11 public fields/computeds
  (`runMismatch` … `model`) and the 9 public methods (`bind` … `refresh`).
- `guidance-generation.store.ts` — `public` added to the 8 public fields/computeds and the
  8 public methods (`bind`, `bindRecord`, `unbind`, `adopt`, `refresh`, `refreshCommitted`,
  `setEnabled`, `loadContent`, `download`).
- `wizard-rpc.service.ts`'s 5 pre-existing warnings are outside this lane's brief (the task names
  only the two store files); untouched.

## Checks

All logs under `.ptah/tmp/style-fix-*.log`.

- `npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json` — exit 0
  (`style-fix-tsc.log`).
- `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false
  --runTestsByPath` on the 7 specs of changed files (setup-run.store, setup-run-persistence,
  setup-run-steps, setup-run-entry.service, generation-workflow.store, guidance-generation.store,
  generation-handoff.store) — 7 suites, 274 tests, all passed (`style-fix-jest.log`).
- `npx eslint <10 changed files>` — 0 errors, 1 warning (`style-fix-eslint-after.log`).
- Degradation audit — no setup-wizard site (`style-fix-degradation.log`).
- Prettier: changed files re-formatted; `prettier --check` clean.

## ESLint warnings

- Before: 39 (0 errors) on the 10 changed files (37 accessibility, 1 `no-useless-assignment`,
  1 `max-lines`).
- After: 1 (0 errors) — only the `max-lines` warning on `setup-run.store.ts` (1040 lines), which
  belongs to finding 2 (the store split batch) and is out of this lane's scope.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| 1 | Keep the two `error.message` fallback checks in `startGuidance`'s catch next to the new `WizardRpcError` instance check | Instance check only / instance check + message fallback | `wizard-rpc.service.ts:223` throws real `WizardRpcError`s, but `generation-workflow.store.spec.ts:549-558` rejects with a plain `Error` carrying `code`; dropping the fallback changes behavior and fails the spec. Behavior must not change. | Yes |
| 2 | Do not export `entrySubPathFor` from the public barrel `src/index.ts` | Export from barrel / export from `setup-run-steps.ts` only | The review asks only for the `setup-run-steps.ts` export; the only consumer is `SetupRunEntryService` inside the lib, and the same review criticizes leaking internal surface. | Yes |
| 3 | Delete the private `isTerminal` helpers rather than delegating them to `isTerminalLifecycle` | Delegate / delete | The review calls them duplicates; every call site can call `isTerminalLifecycle` directly; `SetupGenerationRunLifecycle` is assignable to both view-status unions, so no narrowing is lost. | Yes |
| 4 | Use `matchesBinding` with the stored binding as `expected` and the incoming binding as `actual` | Swap argument order | Matches `setup-run.store.ts:334` (`adopt`) and `setup-run-attempt.ts:78-88`, where the stable/known side is `expected` and the freshly arrived side is normalized. | Yes |
| 5 | Leave the `@internal` marking of the seven coordination methods and the `wizard-rpc.service.ts` accessibility warnings untouched | Fix here / leave | The task brief names only the planned exports and the two store files for finding 8; `wizard-rpc.service.ts` is not in the write set of this fix list. | Yes |

## Clarifications Needed

None. All decisions were settled from repository evidence.
