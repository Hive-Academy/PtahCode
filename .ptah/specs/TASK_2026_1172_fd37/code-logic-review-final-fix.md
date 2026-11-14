# Code Logic Review — final fix (commit ae8f67255)

Review family: antigravity (implementers: codex, claude)

Verdict: APPROVED

Scope: commit ae8f67255 only, read-only. I read the diff and the surrounding code and ran no tests, so the checks below come from code reading.

## Checks requested

- **Resolved (capped) permission is used.** `ptah-cli-registry.ts:~963` passes `lanePolicy.requested.permission`. `lanePolicy` comes from `AgentSpawnEnvironment.resolveLanePolicy` (L825), which already applies the parent-plan cap and the resume snapshot. This is the same value that feeds `lanePermissionLevel` (L975), so the instruction and the enforced level cannot diverge. The SDK path uses `options.effectivePolicy?.requested?.permission`, which is the same resolved object.
- **No double instruction.** `withLanePlanModeInstruction` (`lane-reporting-contract.ts:~25`) returns the task unchanged when it already contains `LANE_PLAN_MODE_INSTRUCTION`. The namespace builder's `renderLaneCompletionContract` appends the same constant, so the second append is skipped. `lane-reporting-contract.spec.ts` covers this case.
- **Resume of a Ptah CLI lane.** A resume goes through `spawnAgent` with `resumePolicy`, which re-resolves (and re-caps) the policy. The follow-up message therefore gets the instruction again when the resolved level is plan. This is correct: the resumed prompt is new input to a still-read-only lane, and the repeat is harmless. A resume that is no longer plan (parent released) gets nothing, which is also right.
- **Tests.**
  - `ptah-cli-registry-permission-routing.spec.ts` uses `jest.spyOn(mailboxModule, 'createPromptMailbox')`. This works because the registry calls the import through the CommonJS module object at call time, and the export is a plain function export. The spy calls through, so the lane is built normally.
  - `Reflect.set(registry, 'laneWorkspace', ...)` injects a saved `ptah-cli: plan` row, which exercises the saved-default path this fix targets. The non-plan test asserts the task is passed unchanged.

## Findings

1. **minor — spy restore is not in a `finally`.** `ptah-cli-registry-permission-routing.spec.ts` (the two new tests, `mailboxSpy.mockRestore()` at the end). If an assertion throws, the spy leaks into later tests in the file. Fix: use `afterEach(() => jest.restoreAllMocks())`.
2. **minor — substring dedupe.** `lane-reporting-contract.ts:~25` uses `task.includes(...)`. A user task that quotes the instruction text would skip the append. This is practically negligible and the effect is only guidance text.

## Finding 1 (AskUserQuestion), declined

I do not disagree strongly. The behaviour is a bounded wait (10-minute timeout), not a safety hole, and it is recorded in D15 and D20. I would still add one line in the Plan instruction telling the lane to put questions in the final message, which also lowers the odds of the hang.
