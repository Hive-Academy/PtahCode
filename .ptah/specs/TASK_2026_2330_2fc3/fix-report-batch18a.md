# Batch 18A round 1 fix report

## Review findings

1. **Windows workspace identity.** Setup retains native path spelling in active workspace state, records and bindings. Index reads and writes use folded keys. Agent results, retries and both transcripts, guidance section capture, handoff and Done compare both operands as Setup workspace identities. Preserving the native path also keeps the Electron workspace switch argument for current and pre-18A records. Changes at [setup-run-persistence.ts:136](../../../libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts#L136), [setup-run.store.ts:118](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts#L118), [setup-run.store.ts:278](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts#L278), [setup-run.store.ts:632](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts#L632), [agent-generation-run.page.ts:267](../../../libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.ts#L267), [agent-generation-run.page.ts:432](../../../libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.ts#L432), [project-guidance.page.ts:420](../../../libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts#L420), and [generation-step.store.ts:123](../../../libs/frontend/onboarding/src/lib/analyze/generation-step.store.ts#L123). Regressions at [setup-run.store.spec.ts:933](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L933), [agent-generation-run.page.spec.ts:181](../../../libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.spec.ts#L181), [agent-generation-run.page.spec.ts:222](../../../libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.spec.ts#L222), [project-guidance.page.spec.ts:371](../../../libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts#L371), and [generation-step.store.spec.ts:119](../../../libs/frontend/onboarding/src/lib/analyze/generation-step.store.spec.ts#L119).
2. **Recovery errors.** Saved-analysis recovery logs a fixed warning and transitions a confirmed inactive run to retryable interrupted status. The warning excludes backend exception text. Change at [setup-run-analysis.coordinator.ts:221](../../../libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-analysis.coordinator.ts#L221). Regression at [setup-run.store.spec.ts:360](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L360).
3. **Manifest-ID fallback.** The handler verifies the fallback response's run ID against the full requested ID. Tests cover the slug fast path, an exact match in a second authorized workspace, invalid ID shapes, unauthorized workspace, a mismatched ID, and a missing match. Change at [setup-rpc.handlers.ts:978](../../../libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts#L978). Specs at [setup-rpc.handlers.spec.ts:2038](../../../libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts#L2038), [setup-rpc.handlers.spec.ts:2069](../../../libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts#L2069), [setup-rpc.handlers.spec.ts:2097](../../../libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts#L2097), [setup-rpc.handlers.spec.ts:2117](../../../libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts#L2117), [setup-rpc.handlers.spec.ts:2130](../../../libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts#L2130), and [setup-rpc.handlers.spec.ts:2147](../../../libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts#L2147).
4. **Guidance actions during a workspace switch.** Both Stop controls route through the same binding guard. Retry lookup, refresh and bound Open latest validate the active workspace before their first side effect and recheck the captured binding across awaits. Changes at [project-guidance.page.ts:209](../../../libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts#L209), [project-guidance.page.ts:791](../../../libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts#L791), and [project-guidance.page.ts:951](../../../libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts#L951). Regression at [project-guidance.page.spec.ts:275](../../../libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts#L275).
5. **Failed analysis and saved results.** A selected saved analysis takes precedence over a linked failed record. Failure text always passes through safeFailureCopy. The DOM regression verifies that the failed panel shows fixed copy for a persisted path-bearing error, then selecting a saved analysis displays the completed panel. Changes at [analyze-workspace.page.ts:691](../../../libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts#L691) and [analyze-workspace.page.ts:1042](../../../libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts#L1042). Regression at [analyze-workspace.page.spec.ts:1605](../../../libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts#L1605).
6. **Resumed analysis and legacy Windows keys.** Recovery inspects completed manifests by slug when there is no recorded backend ID. It uses updatedAt with analyzedAt as a fallback, including when the saved-list timestamp predates the Setup record. Legacy drive and directory buckets merge into their folded keys while keeping native record paths. Changes at [setup-run-analysis.coordinator.ts:185](../../../libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-analysis.coordinator.ts#L185) and [setup-run-persistence.ts:323](../../../libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts#L323). Regressions at [setup-run.store.spec.ts:381](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L381) and [setup-run-persistence.spec.ts:382](../../../libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.spec.ts#L382).

## Decisions

- Preserve the host's path spelling and normalize at identity boundaries. Folding the persisted value would require reconstructing Electron's raw tab partition key later. The existing normalizer export and v1 storage format support the change without a migration.
- Inspect completed manifests for a record without a backend ID. The list exposes only the original analysis timestamp, and changing its contract would affect callers outside this batch. Recovery walks entries in the existing list order until it finds an eligible manifest. Recovery with a known backend ID makes a single exact lookup.
- An Electron profile that ran the uncommitted first revision may have already persisted a folded path. Cross-workspace notification focus for that intermediate profile still needs the focus router owner to match against open Electron folders and pass the folder's original path to switchWorkspace. The focus router is outside the assigned write paths. The parent session has this scope note.
- The proposal coordinator and Start page continue to use the compatible normalizer export. The shared audit findings in those files were sent to the parent session.

## Verification

### setup-wizard-jest

```sh
npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.spec.ts libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.spec.ts libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.spec.ts libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.spec.ts
```

Passed. 260 tests in 5 suites. [Log](../../tmp/batch18a-revise-setup-wizard-jest.log)

### onboarding-jest

```sh
npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.spec.ts libs/frontend/onboarding/src/lib/analyze/generation-step.store.spec.ts libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.render.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-done.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analysis-step.store.spec.ts libs/frontend/onboarding/src/lib/home/setup-runs-list.component.spec.ts libs/frontend/onboarding/src/lib/focus/onboarding-focus-router.service.spec.ts
```

Passed. 230 tests in 10 suites. [Log](../../tmp/batch18a-revise-onboarding-jest.log)

### rpc-handlers-jest

```sh
npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts
```

Passed. 96 tests in 1 suite. [Log](../../tmp/batch18a-revise-rpc-handlers-jest.log)

### setup-wizard-tsc

```sh
npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json
```

Passed, exit 0. [Log](../../tmp/batch18a-revise-setup-wizard-tsc.log)

### onboarding-tsc

```sh
npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json
```

Passed, exit 0. [Log](../../tmp/batch18a-revise-onboarding-tsc.log)

### rpc-handlers-tsc

```sh
npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json
```

Passed, exit 0. [Log](../../tmp/batch18a-revise-rpc-handlers-tsc.log)

### eslint

```sh
npx eslint libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-analysis.coordinator.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.ts libs/frontend/onboarding/src/lib/analyze/generation-step.store.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts libs/frontend/setup-wizard/src/index.ts libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-binding.ts libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts libs/frontend/setup-wizard/src/lib/services/bound-generation-tab.ts libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.spec.ts libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.spec.ts libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/frontend/onboarding/src/lib/analyze/generation-step.store.spec.ts
```

Passed with 0 errors and 26 warnings. [Log](../../tmp/batch18a-revise-eslint.log)

### audit

```sh
npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts
```

Exit 1. TOTAL 2. Both sites are in the concurrent Batch 18B proposal changes: `team-builder-run.coordinator.ts:794` (`orphaned-suppression`) and `team-builder-start.page.ts:539` (`catch-return-sentinel`). The audit reported zero sites in the Batch 18A edits. The parent session has the locations and log. A final repeat returned TOTAL 2 at the same sites, shifted to lines 809 and 543 by concurrent edits. [First log](../../tmp/batch18a-revise-audit.log) · [Final log](../../tmp/batch18a-revise-audit-final.log)

The pre-fix focused runs failed on regressions for all six findings. [Setup Wizard](../../tmp/batch18a-revise-red-setup.log) · [Onboarding](../../tmp/batch18a-revise-red-onboarding.log) · [RPC handlers](../../tmp/batch18a-revise-red-backend.log)

The onboarding assertions exercised the rendered failed and completed panels, agent and guidance transcripts, and Stop controls in Angular's DOM tests. Electron screenshot verification was unavailable because no renderer session was connected and the requested verification scope excludes build and serve commands.

The host exposed Ptah source-reading tools and no dedicated skill loader. I read the repository's Angular frontend patterns skill through Ptah. Ptah file search returned zero results for the task-folder glob, so a scoped native path search supplemented the explicit Ptah reads.

Ptah scoped diagnostics exceeded its 1024 MB TypeScript memory limit. The three requested project-scoped tsc commands completed successfully.
