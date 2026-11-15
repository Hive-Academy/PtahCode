# Code logic review v5b

**Verdict: CHANGES REQUIRED**

## Findings

1. **Blocking — malformed stored effective policy can widen permission on resume.** `libs/backend/agent-sdk/src/lib/session-metadata-store.ts:919-928` silently removes an invalid `effectivePolicy`; the new test at `session-metadata-store.spec.ts:2660-2668` explicitly expects that result. `agent-process-manager.service.ts:1823` then restores no policy, and `system-cli-lane-resumer.ts:43-45` passes no `resumePolicy`. `cli-lane-policy-resolver.ts:71-85` consequently uses current saved defaults. For example, a stored Plan snapshot with an unexpected field fails the strict schema and can resume under a newly saved Yolo default. An invalid *present* snapshot needs a fail-closed resume decision, distinct from the accepted legacy case where the field was never stored. The schema also accepts `{}` because every policy field is optional (`cli-lane-defaults.types.ts:6-17`), so an empty stored snapshot receives no effective permission enforcement.

2. **Major — the durable restore-to-resumer path remains untested.** `agent-events.spec.ts:449-462` checks only the persistence projection with a mocked `addCliSession`; `session-metadata-store.spec.ts:2650-2668` checks the store in isolation; `agent-process-manager.service.spec.ts:1523-1537` injects references directly into `restoreAgents`; and `system-cli-lane-resumer.spec.ts:57-66` supplies a handcrafted `AgentProcessInfo` to a mocked `spawn`. No new test sends a Claude and Codex reference through `persistCliSessionReference` → metadata store → `restoreAgents` → `SystemCliLaneResumer.resume` and verifies the adapter policy after a saved-default change and a parent Plan cap. Prior finding 2 is therefore still open.

## Confirmed

- Prior finding 1 is fixed for **valid** snapshots: `agent-events.ts:748-749` persists both fields, `session-metadata-store.ts:919-928` retains valid values, `agent-process-manager.service.ts:1823-1824` restores them, and `system-cli-lane-resumer.ts:43-45` passes the effective policy to spawn.
- `cli-lane-policy-resolver.ts:71-76,81-97` still caps restored and default-resolved lanes to Plan when `parentLevel` is Plan; Codex network is forced to deny. No new parent-cap weakening found.

Review was read only. The batch 5 report records passing targeted Jest, TypeScript, and ESLint checks; no checks were rerun for this review. The `agent-lanes` skill was loaded. Ptah workspace analysis did not return, so local diff and file reads were used.
