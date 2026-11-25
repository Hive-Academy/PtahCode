# Batch B2 report — TASK_2026_2321_rvusg (Batch 2a, Batch 2b)

Executor: backend-developer (subagent). No git actions taken.

## Batch 2a: Runtime usage read and ledger override (cli-agent-runtime)

Tasks: 2a.1, 2a.2, 2a.3, 2a.4.

### Files changed

- MODIFIED `libs/backend/cli-agent-runtime/src/lib/cli-agents/tracked-agent.ts` — new optional `usageWorkspaceRoot?: string` on `TrackedAgent` (2a.1).
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts`
  - `trackSdkHandle` gains a trailing `usageWorkspaceRoot?: string` parameter and copies it onto the tracked literal only (not onto `AgentProcessInfo`); `doSpawnSdk` passes `request.usageWorkspaceRoot` (2a.1).
  - New public `findAgentUsage(agentId)` next to `findAgentInfo`: returns a copy of `tracked.outcomeUsage` with `models` deep-copied, `undefined` for unknown id or no usage; one map lookup, never throws (2a.2, F10).
  - The `recordLaneUsageOutcome` call site passes `tracked.usageWorkspaceRoot` (2a.3).
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts` — `recordLaneUsageOutcome(..., workspaceKeyOverride?: string)` writes `workspaceKey: workspaceKeyOverride ?? info.workingDirectory` (2a.3).
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/agent-lane-resume.service.ts` — `resumeRequest` destructures `usageWorkspaceRoot` out of `request` before the spread (2a.4, F4).
- MODIFIED specs:
  - `lane-completion-outcome.spec.ts`: override keys the contribution; absent override keeps `workingDirectory`.
  - `agent-process-manager.service.spec.ts`: new `findAgentUsage and the ledger workspace key` block (5 cases): turn total after completion; mutating returned `models` (push + element field) does not change a second read; turn total after `stop()`; `undefined` for unknown id and for a lane with no usage; spawn `usageWorkspaceRoot` reaches the ledger row's `workspaceKey` (and is not on `findAgentInfo`); no override keys by `workingDirectory`. The sink is injected per test by assigning the private `usageSink` (the shared harness passes none, and adding one globally would change other tests' sink-unavailable path).
  - `messaging/agent-lane-resume.service.spec.ts`: `resumeRequest({..., usageWorkspaceRoot})` calls `manager.spawn` without the key.

### Checks

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <manager spec> <lane-completion-outcome spec> <agent-lane-resume spec>` — first run: 319 passed, 1 failed (my `after stop()` case timed out because `stop()` awaits the handle teardown). Fixed by settling the mock handle while `stop()` is pending; rerun of the manager spec with `-t findAgentUsage`: 5 passed, 300 skipped. The two smaller suites passed in full in the first run.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — exit 0.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` — exit 0.
- `npx eslint <changed files>` — 0 errors; 4 warnings in `agent-process-manager.service.ts`, all pre-existing (unused `AgentBudgetCoordinator` import, `any` at :792, max-lines, empty arrow), none on edited lines.
- `npm run verify` inner loop / gate: not run (brief restricts this executor to focused checks; the coordinator owns verify).

## Batch 2b: `execute_code` spawn strip (vscode-lm-tools, F4)

Task: 2b.1.

### Files changed

- MODIFIED `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts` — `usageWorkspaceRoot: _rawUsageWorkspaceRoot` added to the existing strip destructuring, with one comment line.
- MODIFIED `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.spec.ts` — `namespace.spawn({..., usageWorkspaceRoot: 'D:/other-folder'})` reaches `manager.spawn` without the key.

### Checks

- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.spec.ts` — 127 passed.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json` — exit 0.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.spec.json` — exit 0.
- `npx eslint` (same run as above) — 0 errors; 1 pre-existing max-lines warning on the builder.
- Phase P1 gate (`npm run verify -- -p ...` plus Electron/webview typecheck): not run; left to the coordinator.

## Deviations

- `trackSdkHandle` takes the value as a new trailing positional parameter (the method already uses positional optionals); `doSpawnSdk` passes `undefined` for the unused `externalOwner` slot. `spawnFromSdkHandle` (Ptah CLI lanes, resumers, `execute_code` Ptah CLI path) does not forward the field: no review caller uses that path, and the plan names only the spawn request route.
- `findAgentUsage` copies `models` with a conditional spread instead of `models: usage.models?.map(...)`, so a usage without `models` does not gain an explicit `models: undefined` key (keeps `toEqual`/shape identical to the stored value).
- `beginSpawn` in the namespace builder is left unchanged: `AgentProcessManager.beginSpawn` reads no `usageWorkspaceRoot`; only the `executeSpawn`/`spawn` request (the stripped `enrichedRequest`) reaches `trackSdkHandle`.

## Decisions

- Inject the test usage sink per test via the private field rather than through `createManager` for all tests — options: global harness sink vs per-test assignment; evidence: harness passes `undefined` for `usageSink` and existing tests run the sink-unavailable branch; reversible.

## Out-of-scope observations

- None.
