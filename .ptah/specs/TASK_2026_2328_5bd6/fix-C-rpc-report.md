# Batch C repair report

## Findings

### F2 — confirmed yes

In the reviewed version, `libs/backend/rpc-handlers/src/lib/handlers/routing-evidence-rpc.handlers.ts:59-61` passed system detection results straight to the evidence service. `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:966-1003` marks disabled system rows and merges enabled, runnable Ptah CLI rows. `libs/backend/lane-routing/src/lib/evidence/routing-evidence.service.ts:74-77` schedules refreshes only for installed rows without the disabled flag.

**Change.** The handler reads the workspace's `agentOrchestration.disabledClis` setting, marks the corresponding detection rows, and appends the runnable Ptah CLI rows from the existing optional registry token. Registry failures log the error name and preserve system CLI evidence. See `libs/backend/rpc-handlers/src/lib/handlers/routing-evidence-rpc.handlers.ts:73-105`.

**Tests.** Added cases for disabled-row marking without mutation, runnable filtering and parent-container registry resolution, and system evidence when listing fails. See `libs/backend/rpc-handlers/src/lib/handlers/routing-evidence-rpc.handlers.spec.ts:81-138`.

### F11 — confirmed yes, deferred

`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:545-555` compares route facts with `request.ptahCliId || request.cli`. Both can be absent for a valid system spawn. `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:879` selects the effective default later, with the user's preferred order, disabled settings, and installation checks in `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts:481-530`. No source or test changes for this finding.

### F16 — confirmed yes, deferred

`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:648-656` sets `sent: null` and `fallback-allowlist` for requested effort on a Ptah CLI lane. `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:656-658` predicts the same disposition. `libs/shared/src/lib/types/lane-native-values.types.ts:16-17` describes `fallback-allowlist` as sending the request unchanged, while plan §2.12.4 explicitly specifies the existing namespace behavior. No source or test changes for this finding.

### F9 — RPC change needed: no

`libs/backend/rpc-handlers/src/lib/services/cli-model-list.service.ts:65-72` already returns `{ provenance: 'ptah-fallback', supported: [], default: null }` when the adapter's `laneEfforts()` returns an empty array and no native support is available. The adapter work belongs to the other lane. No source or test changes here.

## Checks

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/routing-evidence-rpc.handlers.spec.ts` — first attempt failed during test loading because the CLI runtime barrel pulled in a workspace-intelligence ES module. After mocking the CLI runtime token, all three added tests failed against the original handler and all nine existing tests passed.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/routing-evidence-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts libs/backend/rpc-handlers/src/lib/host-profile/resolve-handler-plan.spec.ts` — passed on retry (3 suites, 26 tests). The first run passed all 12 handler tests, and both manifest suites were initially blocked during compilation by in-progress Lane Routing changes in `model-refine.ts:21,23,431`.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` — passed (exit 0).
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json` — passed (exit 0).
- `npx eslint libs/backend/rpc-handlers/src/lib/handlers/routing-evidence-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/routing-evidence-rpc.handlers.spec.ts` — passed (exit 0).
- `ptah_get_diagnostics` scoped to both changed files — both requests returned unchecked after their 45-second compiler windows. Used the focused native TypeScript checks for verification.

## Decisions

- F2. Follow the existing enabled/runnable filter and keep the registry optional. The workspace provider is already a dependency of shared RPC registration at `register-shared-rpc-handlers.ts:71-76`. Resolving the registry per call preserves manifest availability for hosts without it. The alternative of a shared helper would expand the library boundary for two field-level operations. The local change is reversible.
- F11. Keep lane matching tied to the effective spawn lane. Options were to copy selection into the namespace, accept facts without a matching lane, or use the process manager's resolved lane. Only the last preserves existing selection and the mismatch guard without duplicating policy. Deferred to a process-manager change, with no source change in this batch.
- F16. Keep prediction and observed spawn attribution aligned. Options were a namespace-only change or a coordinated contract change. The plan and predictor both specify the existing disposition. Deferred the coordinated change, with no source change in this batch.

## Needed outside write set

- F11. Match server-resolved route facts in the process manager after default CLI resolution, and add coverage for matching and mismatching implicit selection.
- F16. Coordinate the plan clarification and update to lane-routing's effort predictor with a namespace change and paired regression coverage.
- F9. Cursor/OpenCode adapter and spawn-policy changes remain in the assigned runtime lane.

## Not done

F11 and F16 source changes and regression tests are deferred. Independent re-review and the repository verification gate belong to the coordinator.
