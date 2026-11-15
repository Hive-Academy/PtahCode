# Batch 1 B result

## Files changed

- `libs/shared/src/lib/types/retired-roles.ts` and its spec: retire the three implementation roles in step 1.
- `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts` and its spec: route retired role slugs to the `implement` phase candidate before the listed-role check. Keep the explicit route for other listed agents.
- `libs/backend/lane-routing/src/lib/task-kind/decision-model-task-kind-classifier.ts` and its spec: use `implement` in the decision prompt for retired aliases.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts` and its spec: recommend `implement` for the implementation phase.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/system-namespace.builders.ts`: use `implement` in help text.
- `libs/shared/src/lib/types/task-spec.contract.ts`: replace the role example. The contract is unchanged.

## Checks

- Focused shared Jest: exit 0, 2 suites, 106 tests.
- Focused lane-routing Jest: exit 0, 3 suites, 27 tests. First run failed on a nullable role type; fixed before the passing run.
- Focused vscode-lm-tools Jest: exit 0, 1 suite, 14 tests.
- `tsc --noEmit` for shared, lane-routing, and vscode-lm-tools: exit 0 for each.
- `eslint` on changed TypeScript files: exit 0. It reported two existing warnings in `system-namespace.builders.ts` and skipped the module-boundary rule because no Nx project graph was cached.
- `git diff --check` on owned files: exit 0.

## DI roots and open issues

- `assemble-gate.ts` already copies `candidate.phaseKind` into `executor.phaseKind`; no edit was needed.
- The CLI container calls `registerLaneRoutingServices`; that function registers the task-kind classifier. No CLI registration edit was needed.
- The named VS Code app root is absent in this checkout. The Electron root also calls `registerLaneRoutingServices`; no Electron registration edit was needed.
- Routing input has only role slugs. It has no generated-agent marker, so a same-slug user agent cannot be distinguished there. The step 0 code did not add that guard.
- No matching routing skill was available through this CLI's skill discovery. Ptah workspace and file discovery calls did not return in time; native `rg` and file reads were used.
