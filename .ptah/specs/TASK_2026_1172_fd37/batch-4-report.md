# Batch 4 — lane approval routing tests

## Scope and extracted cases

Added 13 cases in the two authorized spec files. The task's requested routing and policy cases are the acceptance cases. No production or frontend files were changed.

Existing tests that cover nearby behavior and were retained: `captures the live lane owner and generation in the dispatched prompt` (owner metadata); `denies an SDK lane prompt when its process record is unavailable` and `denies an SDK lane prompt when the host omits the owner port` (different missing-owner paths); `uses effective auto-edit under global %s` and `keeps global behavior when no lane policy is supplied` (direct resolver behavior). New tests add the explicit parent-session versus child-session channel distinction, owner record without parentSessionId, request-id mismatch, plan-level no-prompt assertion, routing-id precedence, and policy-to-SDK composition.

## Routing table

| Case | Expected channel | Scope id | Test name | Result |
| --- | --- | --- | --- | --- |
| Claude-tab lane | `AGENT_MONITOR_PERMISSION_REQUEST` | `parentSessionId` = `11111111-2222-4333-8444-555555555555` | `routes a Claude-tab lane prompt only to its parent session scope` | Not run to completion |
| Child chat session | inline `PERMISSION_REQUEST` | child's `sessionId` = `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee` | `routes a child chat prompt inline to its own session` | Not run to completion |
| Lane record without parentSessionId | no delivery; denied | none | `denies an ownerless lane without delivering its prompt to another session` | Not run to completion |
| Wrong response request id | lane request stays pending | original request id | `ignores an answer keyed to another request while the lane prompt is pending` | Not run to completion |
| Plan-level lane `Write` | no approval request; denied | none | `denies a plan-level lane write without emitting an approval prompt` | Code inspection predicts failure; runner incomplete |
| Routing precedence | callback routing hint | `resumeSessionId`, else `parentSessionId`, else lane `routingId` | `binds callback routing id to resume %s and parent %s` (3 rows) | Not run |
| Parent plan cap | SDK `plan` and callback `plan` | lane routing id | `applies the parent plan cap through translation to SDK mode and callback level` | Not run |
| Missing lane level | SDK `acceptEdits`, callback global fallback | lane routing id | `uses the global handler level when no lane level is provided` | Not run |
| Plan/ask/auto-edit under global yolo | SDK plan/default/acceptEdits, never bypass | lane routing id | `keeps translated %s lane below global yolo` (3 rows) | Not run |

## Verification

Exact requested commands and observed results:

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/sdk-permission-handler.spec.ts` — emitted an ES-module warning for `jest.config.ts`, then no result for several minutes; interrupted, exit 1. **No pass/fail count observed.**
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json` — no result for several minutes; interrupted, exit 1. **TypeScript status unknown.**
- `npx eslint libs/backend/agent-sdk/src/lib/sdk-permission-handler.spec.ts libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.spec.ts` — no result for several minutes; interrupted, exit 1. **Lint status unknown.**

`ptah_get_diagnostics` was also unavailable: its TypeScript worker timed out and was terminated. The cli-agent-runtime spec was not run; its possible `marked` mapping failure was not observed and is not claimed. No `nx` command or `npm run verify` was run.

## Decisions

- The ownerless lane case uses an existing, running process record without `parentSessionId`. This distinguishes missing owner identity from the already-tested missing process record and missing owner port. Reversible: yes; evidence is `sendCliAgentPermissionRequest`'s owner guard.
- A wrong request id is the supported stale-response boundary here. `handleResponse` indexes pending requests by request id; it has no response generation argument. Reversible: yes.
- The policy composition tests use the real `resolveCliLanePolicy` and `translateLaneSpawnPolicy` with the shared Ptah CLI capability manifest, then pass `translated.requested.permission` into `buildClaudeSdkLaneOptions`. Reversible: yes; this follows the lane options builder seam.

## Defects

**Code-backed, not runner-confirmed:** A plan-level lane's `Write` tool reaches `requestUserPermission` in `SdkPermissionHandler.createCallback`: after the plan level is read, no plan-specific denial occurs, and `Write` falls through to the dangerous-tool prompt branch. The new `denies a plan-level lane write without emitting an approval prompt` test expects no monitor request and should fail when Jest can complete. No production fix was attempted, per coordinator instruction.

The verification commands did not complete under current workspace load, so this batch cannot claim a passing suite or a confirmed test failure.
