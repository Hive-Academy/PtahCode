Verdict: REQUEST CHANGES

# Review round 6: PR #1288, origin/main...HEAD

## High finding

1. **A resumed lane can still spawn with an empty policy.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:71-76` returns a supplied `resumePolicy` before the D24 guard at line 98. For `resumePolicy: {}` and no parent plan, `validateResolvedPolicy` accepts the object because `validateLaneSpawnPolicy` checks only fields that are present (`lane-spawn-policy.ts:64-99`). Both `SystemCliLaneResumer` (`system-cli-lane-resumer.ts:45`) and `PtahCliLaneResumer` (`ptah-cli-lane-resumer.ts:104`) forward stored snapshots through this branch. The persisted snapshot schema also accepts `{}` (`libs/shared/src/lib/types/cli-lane-defaults.types.ts:5-15`), and metadata restoration preserves it (`libs/backend/agent-sdk/src/lib/session-metadata-store.ts:943-949`). Thus an empty stored snapshot, including one left by the pre-fix behavior, reaches native spawn without permission or network enforcement. Reject empty/incomplete snapshots or replace them with a supported fail-closed policy before translation, and cover the resume case.

## D24 and other notes

- Commit bb6fc7c18 fixes the round-5 plain-spawn failure: `cli-lane-policy-resolver.ts:98-106` now throws `UNSUPPORTED_LANE_POLICY` when the adapter cannot supply `plan` and no permission was selected.
- Explicit permission still works without `plan`: it sets `selectedPermission`, bypasses that guard, and is validated against the manifest. An unsupported explicit mode or combination is refused by `validateLaneSpawnPolicy`. This branch is verified by source inspection; the current specs do not exercise an explicit permission on a no-plan manifest.
- The two normal spawn entries call `AgentSpawnEnvironment.resolveLanePolicy` (`agent-process-manager.service.ts:560`, `ptah-cli-registry.ts:827`). The resume snapshot branch is the bypass above. `builtInLanePolicy` has no production caller.
- Finding 2 adds a context-level terminal child spec. Its assertions reproduce the guard expression in test code, so they do not directly drive a late approval through `RuntimeContext`; this is a coverage note, not a separate High finding.
- Focused verification: `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.spec.ts --coverage=false --maxWorkers=2`: 2 suites, 89 tests passed.
- Ptah workspace and skill discovery calls did not complete in this lane; I used local git and source reads as the fallback. No review skill was loaded.
