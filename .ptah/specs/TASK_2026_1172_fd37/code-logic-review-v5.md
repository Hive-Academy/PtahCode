# Code logic review v5

**Verdict: CHANGES REQUIRED**

## Findings

1. **Blocking — Electron restart loses the effective permission and can resume with a different permission.** `agent-process-manager.service.ts:989-992` now stores the flat policy correctly for a live lane, but the durable `CliSessionReference` type at `libs/shared/src/lib/types/agent-process.types.ts:621-695` has no `effectivePolicy` or `requestedPolicy`. The persistence projection at `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts:736-782` omits both, and `agent-process-manager.service.ts:1807-1837` restores an `AgentProcessInfo` without either. `system-cli-lane-resumer.ts:43-45` then passes undefined permission and resume policy; `cli-lane-policy-resolver.ts:71-98` resolves current saved defaults instead of the lane's original permission. A previously restricted Claude or Codex lane can therefore resume under a more permissive saved default. **Fix:** persist the flat effective policy and original requested policy in `CliSessionReference`, restore them into `AgentProcessInfo`, validate persisted policy before reuse, and ensure a legacy reference without a policy cannot silently widen permission. Add a persisted-reference round trip test for both CLIs, including a changed saved default and the parent Plan cap.

2. **Major — the added resume tests do not exercise the resumer or durable snapshot path.** `agent-process-manager.service.spec.ts:1439-1493` takes `snapshot` from the same live manager and manually injects `permission`, `network`, and `resumePolicy` into a second `manager.spawn`. This proves the manager accepts a supplied flat policy, but does not prove `SystemCliLaneResumer` can recover one after `restoreAgents` or that Claude and Codex adapter options enforce it. **Fix:** test the production `persistCliSessionReference` -> metadata store -> `restoreAgents` -> `SystemCliLaneResumer.resume` path with both CLIs, and assert the effective policy and options reaching the adapter. Retain the SDK-handle override test at lines 1495-1516; it covers that precedence correctly.

## Other review checks

- `agent-process-manager.service.ts:991` uses `options.effectivePolicy?.requested`, the flat `EffectiveLanePolicy` returned inside the translation wrapper. The adapter receives that same resolved permission and network at lines 599-600 and 1106-1108. `requestedPolicy` at line 992 remains the original raw request from line 612, which is appropriate for the formatter's requested-to-effective display.
- No other production `AgentProcessInfo.effectivePolicy` writer stores the translation wrapper. `spawnFromSdkHandle` takes a flat policy at line 1255, and the SDK handle replaces the stored value at line 1136. Ptah CLI registry returns `lanePolicy.requested` at `ptah-cli-registry.ts:1025`. The formatter, both resumers, and namespace builder consume the flat shape.
- `cli-lane-policy-resolver.ts:71-98` retains the parent Plan cap, including Codex network denial. The diff introduces no `any` or `as unknown as`; the project lib and spec tsconfigs enable strict mode. Existing casts elsewhere in the spec are outside this diff.

## Verification

- `git diff 9e3cb6e49..HEAD`: reviewed; two files changed (one production assignment, 172 spec lines).
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts`: PASS, 1 suite and 245 tests.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts`: exit 0, three warnings in the service (unused `AgentBudgetCoordinator` at 112, file length at 938, empty arrow at 2947); zero errors.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: PASS, exit 0 with no diagnostics.

Skill discovery: no local `SKILL.md` was found through the CLI's workspace file search; no matching skill was available to load.
