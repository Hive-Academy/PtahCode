# Code Logic Review — `TASK_2026_2331_f700`

## Summary

| Metric              | Value            |
| ------------------- | ---------------- |
| Overall score       | 4/10             |
| Assessment          | NEEDS_REVISION   |
| Blocking issues     | 1                |
| Serious issues      | 1                |
| Moderate issues     | 0                |
| Failure modes found | 2                |

Score is 4 because the new ACP permission path is unsafe for the usual `ask` parent, so this needs another pass. It is above 1–2 because caller identity still comes only from the authenticated session, ambiguous and unknown callers fail closed, and a failed successor start rolls the acknowledgement back. It is below 5–6 because the gap is the common permission, not a rare edge.

## Decisions

- Treat `ask` → no parent cap as a defect on this change. `parentLanePermission` already returns `undefined` for `ask` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.ts:31`), and the plan says to keep that normalization. The review bar for this bug is that an ACP lane must not outrank its parent. Options were: accept the old normalization, or require a ceiling. Evidence: an identified ACP parent used to miss both registries and fall through to the spawn default of `plan`; a resolved `ask` parent now skips that cap. Reversible: map `ask` to `plan`, and make `auto-edit` a ceiling in `resolveCliLanePolicy`.

## Five logic questions

### 1. How does this fail silently?

`ptah_agent_spawn` from a resolved parent whose level is `ask` gets no parent cap. `getParentLevel` returns `undefined` (`libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:803`). `resolveCliLanePolicy` only forces `plan` when `parentLevel === 'plan'` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:90`). The spawn then keeps `request.permission` or the saved lane default, including `yolo`. The tool result is a normal spawn. The same hole exists for `auto-edit`: the builder returns that level (`ptah-api-builder.service.ts:805`), and the policy resolver ignores every value except `plan`.

### 2. What user action produces unexpected behaviour?

An ACP main-chat caller at the saved chat permission `ask` (`libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-open-request.ts:262`, copied onto the live session at `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.ts:227`) calls `ptah_agent_spawn` with `permission: "yolo"`. The lane starts at `yolo`. Before this change that caller was unidentified and capped to `plan`.

A Claude tab that is already in the lifecycle map but has no `realSessionId` yet can no longer publish an artifact or hand off. The Electron source drops that record (`apps/ptah-electron/src/di/phase-2-libraries.ts:266`). Artifact dispatch does not fall back to `getSessionWorkspace` once the resolver is registered (`protocol-dispatcher.ts:2890`). Handoff treats the resolver miss as an unattributed caller (`session-handoff.service.ts:1099`).

### 3. What input data produces a wrong answer?

Authenticated caller id that resolves to one live session whose `permissionLevel` is `ask` or `auto-edit`. The body cannot substitute another workspace: artifact scope uses the resolver result, and the spec path ignores `_callerWorkspaceRoot` (`protocol-dispatcher.ts:2885`). An empty or whitespace id is `unresolved` (`live-chat-session-resolver.ts:13`). Two owners of the same id are `ambiguous` and artifact publish is refused; spawn is capped to `plan` (`ptah-api-builder.service.ts:802`).

### 4. What happens when a dependency fails?

Successor start throws, including an `expectedRuntime` mismatch (`chat-session.service.ts:1816`), before the adapter is started. Handoff returns `session-start-failed`, deletes the pending bind, and discards the `starting` acknowledgement (`session-handoff.service.ts:812`). Retirement failure is logged and the arm is put back (`session-handoff.service.ts:1258`); acknowledgement then returns a retry rather than `closed`. A missing predecessor at retire time (`unresolved` and no SDK record) returns without calling `endSession` (`session-handoff.service.ts:1238`), which is correct only when the process is already gone. Adapter tokens may be null; the resolver uses `?.` (`phase-2-libraries.ts:277`). Hosts that do not register `LIVE_CHAT_SESSION_RESOLVER` keep the old lookups (`isOptional: true` on the handoff, MCP, and API builder constructors).

### 5. What is missing that the requirements never mentioned?

Nothing further. The `ask` ceiling and the pre-id Claude lookup are inside the stated inheritance and “Claude path unchanged” rules. Resume still uses `parentLanePermission` with `unknownParent: 'uncapped'` and does not consult the new resolver.

## Failure modes

### ACP ask or auto-edit parent spawns a stronger lane

- Trigger: Electron resolver is registered, the parent resolves, and `permissionLevel` is `ask` or `auto-edit`. The spawn request or saved default asks for a higher lane mode.
- Symptom: The lane starts above the parent. `ask` looks like “no parent”.
- Evidence: `ptah-api-builder.service.ts:803`, `cli-lane-policy-resolver.ts:90`, `provider-session-chat-adapter.ts:227`
- Current handling: `plan` and `ambiguous` cap to `plan`. `ask` becomes `undefined`. Any other resolved level is returned and then ignored unless it is exactly `plan`.
- Recommendation: Rank modes and cap the lane at the parent. Map `ask` to `plan`. Add a spawn test where the parent is `ask` or `auto-edit` and the request says `yolo`.

### Claude tab with no SDK id is invisible

- Trigger: The lifecycle record exists, `realSessionId` is still empty, and the tool caller is that tab id.
- Symptom: `ptah_artifact_publish` reports that a trusted workspace is required. `ptah_session_handoff` reports an unattributed caller. Both used to see this tab.
- Evidence: `phase-2-libraries.ts:266`, `protocol-dispatcher.ts:2890`, `session-handoff.service.ts:1099`, `session-registry.service.ts:665`
- Current handling: The record is omitted. With the resolver present there is no fallback.
- Recommendation: Resolve a single lifecycle row that has a workspace even when `realSessionId` is absent, and keep using that row for Claude workspace and handoff. Still require a canonical id for recorders that persist one.

## Blocking issues

### Resolved ask parent does not cap `ptah_agent_spawn`

- File: `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:803`
- Scenario: ACP (and any other resolved chat) whose permission is `ask` calls `ptah_agent_spawn`. Saved ACP permission is the open-request policy (`provider-session-open-request.ts:262`). `ask` is the level the provider-session controls already use.
- Impact: The lane can run at `yolo` or `auto-edit` while the parent is in `ask`. The previous unidentified-parent cap was `plan`. `auto-edit` parents have the same hole because only `parentLevel === 'plan'` is enforced (`cli-lane-policy-resolver.ts:90`).
- Fix: Make parent level a ceiling for every mode. `ask` must not become “uncapped”. Cover it in the API builder spec, which currently expects `auto-edit` to be returned and never checks the lane policy (`ptah-api-builder.service.spec.ts:446`).

## Serious issues

### Claude sessions without `realSessionId` lose artifact publish and handoff

- File: `apps/ptah-electron/src/di/phase-2-libraries.ts:266`
- Scenario: A Claude tab is registered and has `projectPath`, but the SDK has not bound `realSessionId`. The MCP URL already carries the tab id.
- Impact: Artifact publish and handoff fail closed for that tab on Electron. `getSessionWorkspace` still returns `projectPath` (`session-registry.service.ts:665`). The dispatcher uses that fallback only when the resolver is absent (`protocol-dispatcher.ts:2892`). Handoff no longer calls `lifecycle.find` when the resolver returns `unresolved` (`session-handoff.service.ts:1098`).
- Fix: Keep one not-yet-bound Claude row as a resolved session for workspace and handoff, or fall back to the old lifecycle lookup when the resolver is `unresolved` and exactly one lifecycle row matches.

## Moderate and minor issues

None. The `auto-edit` return value is part of the blocking ceiling gap, not a separate edge.

## Data flow

1. HTTP MCP stores the session id from the authenticated URL in request context (`mcp-request-context.ts:88`). Tool arguments are not read as the caller. OK.
2. `createLiveChatSessionResolver` rejects a blank id, unions Claude `findMatches`, Codex chat rows, and ACP chat rows, and returns `ambiguous` when more than one row matches (`live-chat-session-resolver.ts:13`). OK.
3. Claude rows without `realSessionId` are dropped (`phase-2-libraries.ts:266`). Gap for artifact and handoff.
4. Artifact scope uses Claude `cwd` (same path as the old `projectPath` lookup) and Codex/ACP `workspaceRoot`. The store `realpath`s that directory and refuses paths outside it. Ambiguous and unknown callers get no workspace. OK against spoofing and untrusted roots.
5. Cron, harness, task link, and worktree organization store `session.sessionId` or nothing. Ambiguous is unattributed. OK.
6. Spawn reads `permissionLevel` and then drops every ceiling except `plan`. Gap.
7. Handoff builds the predecessor from the resolved row, starts through `startHandoffSession`, and passes `expectedRuntime` only for Codex and ACP (`session-handoff.service.ts:1103`). A runtime mismatch throws before `startChatSession`. Start failure rolls back the `starting` record. OK.
8. Successor canonical id still lands through the existing session-id registry (`onSessionIdResolved`). Acknowledgement still requires the recorded successor tab or canonical id (`session-handoff.service.ts:384`). OK.
9. After flush, Codex/ACP `closeSession` runs on the canonical id; Claude still uses `lifecycle.endSession`. The host tab closer runs only after that stop returns success (`session-handoff.service.ts:527`). OK.

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| One resolver for Claude, Codex, and ACP, with unresolved and ambiguous results | COMPLETE | Blank id, unknown id, and collisions behave as specified |
| Caller identity only from the authenticated MCP scope | COMPLETE | Body workspace is not consulted |
| Artifact workspace stays the session workspace | COMPLETE | Claude `cwd` matches old `projectPath`; other runtimes use their session workspace path; unknown id does not use the open folder |
| Handoff successor uses the existing launch path and runtime check | COMPLETE | Claude does not send `expectedRuntime` |
| Predecessor retires through its runtime, then the host tab closer | COMPLETE | Failure re-arms and the ack retries |
| Ack binding and child/lane authorization unchanged | COMPLETE | Successor check is still the stored tab or canonical id |
| ACP spawn permission does not exceed the parent | MISSING | `ask` and `auto-edit` do not cap the lane |
| Claude behaviour unchanged | PARTIAL | Tabs without `realSessionId` no longer resolve |
| Optional injection for other hosts | COMPLETE | Token is optional; only Electron registers it |

Implicit requirements not addressed: none beyond the two gaps above.

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Empty or whitespace caller | YES | Resolver returns `unresolved` before sources | None |
| Same id in two registries | YES | `ambiguous`; artifact refused; spawn capped to `plan`; retire throws and retries | None |
| Unknown id with resolver installed | YES | No workspace fallback and no SDK fallback | Claude pre-id tab is also unknown |
| Successor start fails | YES | Ack `starting` row discarded, adoption reverted | None |
| Retire fails | YES | Error logged, arm restored, ack asks for retry | None |
| Parent permission `ask` | NO | Returned as `undefined` | Lane can be `yolo` |
| Parent permission `auto-edit` | NO | Returned but not applied as a ceiling | Request `yolo` is kept |
| Parent permission `plan` | YES | Policy forces `plan` | None |
| Resolver not registered | YES | Old lifecycle and Codex lookups | None |

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: A default `ask` ACP chat can spawn a `yolo` lane.
- What a robust implementation would add: A permission ceiling for `ask`, `plan`, `auto-edit`, and `yolo`, plus a lifecycle fallback for a Claude tab that does not yet have `realSessionId`.

Checked the uncommitted diff and the new resolver, port, handoff, dispatcher, and API-builder paths. `ptah_grep` for `LIVE_CHAT_SESSION_RESOLVER` shows Electron registration and three optional injections. No source edits. Jest was not re-run; the existing spec does not assert the lane ceiling.
