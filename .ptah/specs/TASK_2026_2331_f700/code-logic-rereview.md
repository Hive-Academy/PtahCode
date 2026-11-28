# Code Logic Re-review — `TASK_2026_2331_f700`

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 8/10     |
| Assessment          | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues     | 1        |
| Failure modes found | 1        |

Score is 8 because both round-1 defects are closed on the paths that matter: `ptah_agent_spawn` ranks `yolo > auto-edit > ask > plan` and an unknown parent mode lands on `plan`, and a Claude tab with no SDK id is returned by the Electron resolver. It is below 9 because cron, harness, worktree capture, and session organization still persist that tab id as the canonical session id. It is above 5–6 because that split does not let a lane outrank its parent and does not hide the tab from artifact publish or handoff.

No source edits. Jest was not re-run. The uncommitted diff does not touch `platform-cli` or `cli-engine`. No `code-style-review.md` was present to dedupe. No extra skill was assigned for this re-review.

## Decisions

- Treat the pre-bind recorder id as moderate. Options were to send the change back until cron and harness refuse a Claude row with no SDK id, or to accept it because the serious bar was that the resolver finds the tab. Evidence: handoff still stores a null SDK id when `sessionId === tabId` (`session-handoff.service.ts:1105`), while `resolveCallerLiveSessionId` returns that same tab id (`ptah-api-builder.service.ts:1281`). The task check is that the tab is found. Reversible: recorders can refuse when the lifecycle row's `realSessionId` is still null.

## Earlier findings

| Earlier finding | Status | Evidence |
| --------------- | ------ | -------- |
| Blocking: a resolved `ask` or `auto-edit` parent did not cap `ptah_agent_spawn`, and an unknown mode could be treated as uncapped | Fixed | `parentLanePermission` returns `ask`, `auto-edit`, `yolo`, and `plan`, and any other bound level is `plan` unless resume asks for `uncapped` (`parent-lane-permission.ts:30`). `resolveCliLanePolicy` ranks `CLI_LANE_BUILT_IN_PERMISSION_ORDER` (`['yolo', 'auto-edit', 'ask', 'plan']`, `cli-lane-defaults.types.ts:45`). A missing index uses the last entry, `plan` (`cli-lane-policy-resolver.ts:104`). Electron `getParentLevel` passes the live session level or `plan` for a miss, an ambiguous match, or a missing level (`ptah-api-builder.service.ts:799`). Specs cover each parent mode, an unknown mode, a stronger explicit request, and a weaker one (`cli-lane-policy-resolver.spec.ts:67`). |
| Serious: a Claude tab with no `realSessionId` was dropped, so artifact publish and handoff missed it | Fixed | `register` inserts the tab into `byTabId` with `realSessionId` null (`session-registry.service.ts:330`). Phase 2 maps every `findMatches` row through `toClaudeLiveChatSession` with no SDK-id filter (`phase-2-libraries.ts:264`). That helper uses `realSessionId ?? tabId` and `projectPath` as `cwd` (`live-chat-session-resolver.ts:15`). Artifact scope for `claude-sdk` is `cwd` (`protocol-dispatcher.ts:2891`). Handoff re-reads the lifecycle row and keeps `realSessionId` null until bind (`session-handoff.service.ts:1105`). The resolver spec expects this pending tab (`live-chat-session-resolver.spec.ts:22`). |

## Five logic questions

### 1. How does this fail silently?

Spawn no longer accepts a stronger mode than the parent and then returns a normal start. The remaining silent case is attribution: a Claude tab that has not bound an SDK id resolves, and `resolveCallerLiveSessionId` returns `session.sessionId`, which is the tab id (`ptah-api-builder.service.ts:1281`, `live-chat-session-resolver.ts:15`). Cron then stores that tab id as the job's session creator (`cron-namespace.builder.ts:302`) with no signal that the SDK id is still absent.

### 2. What user action produces unexpected behaviour?

A Claude chat calls `ptah` cron create, harness save, worktree capture, or session-organization link after the tab is registered and before `bindRealSessionId`. The write is keyed by the tab id. After bind, the same helper returns `realSessionId` (`live-chat-session-resolver.ts:15`). Later calls and any lookup that uses only the SDK id do not see the earlier row. Handoff does not have this split: it keeps the SDK id null (`session-handoff.service.ts:1105`).

An `ask` parent that spawns with `permission: "yolo"` is capped. For Claude the cap is `ask`. For Codex, `ask` is not a supported lane mode, so the walk continues to read-only `plan` (`cli-lane-policy-resolver.ts:107`, spec at `cli-lane-policy-resolver.spec.ts:82`). That is stricter than the parent and does not exceed it.

### 3. What input data produces a wrong answer?

A bound parent level of `ask`, `auto-edit`, `plan`, `yolo`, or any other string does not produce a lane mode above that parent. Unknown strings take rank `order.length - 1`, which is `plan` (`cli-lane-policy-resolver.ts:104`). A resolved session with `permissionLevel` omitted becomes `plan` before the resolver (`ptah-api-builder.service.ts:803`). An explicit mode weaker than the parent is left as requested (`cli-lane-policy-resolver.ts:106`: the cap runs only when the requested index is stronger, or when no permission was selected and the parent is not `yolo`).

The wrong id is the pending Claude `sessionId`. It is the tab id, and cron, harness (`ptah-api-builder.service.ts:1061`), git worktree capture (`ptah-api-builder.service.ts:924`), and session organization (`ptah-api-builder.service.ts:1018`) treat it as the canonical session.

### 4. What happens when a dependency fails?

`validateResolvedPolicy` still throws `LaneSpawnPolicyError` when the capped pair is unsupported (`cli-lane-policy-resolver.ts:47`), including the fallback that returns the parent mode after every weaker mode was skipped (`cli-lane-policy-resolver.ts:118`). An ambiguous or unknown caller is `plan`, so the lane is capped rather than started at the saved default (`ptah-api-builder.service.ts:804`). A throw from `resolve` is not caught in `getParentLevel`, so the spawn fails instead of dropping the ceiling. Handoff start still rolls back when the successor does not start; `expectedRuntime` mismatch throws before the session is launched (`chat-session.service.ts:1816`). Codex and provider adapters are optional values resolved when a tool runs (`phase-2-libraries.ts:267`); a missing registration would throw and fail the tool call.

### 5. What is missing that the requirements never mentioned?

Resume still rewrites a snapshot only when `parentLevel === 'plan'` (`cli-lane-policy-resolver.ts:82`). A live `ask` parent now passes `ask` into resume (`parent-lane-permission.ts:30` with `unknownParent: 'uncapped'` at `register-agent-messaging.ts:183`), and the snapshot is kept. That matches the previous resume behaviour, where `ask` was omitted and the snapshot was also kept. It is not a `ptah_agent_spawn` path.

`platform-cli` and `cli-engine` do not call `resolveCliLanePolicy` or `parentLanePermission`. Lane defaults, the Codex legacy sandbox key, and the plan-parent network deny for Codex are still applied inside the same resolver.

## Failure modes

### Pre-bind Claude tab id is stored as the canonical session id

- Trigger: Electron resolver is registered, the lifecycle row exists, `realSessionId` is null, and the tool uses `resolveCallerLiveSessionId`.
- Symptom: A cron job, harness proposal, worktree row, or session-organization link is stored under the tab id. After the SDK id binds, new calls use the SDK id, so the earlier row is not under the id later lookups use.
- Evidence: `live-chat-session-resolver.ts:15`, `ptah-api-builder.service.ts:1281`, `cron-namespace.builder.ts:302`
- Current handling: The resolver finds the tab, which artifact publish and handoff need. Handoff separately forces a null SDK id. The recorder helpers do not.
- Recommendation: For `claude-sdk` rows whose `sessionId` equals `tabId`, keep returning the row for workspace and handoff, and return no canonical id from `resolveCallerLiveSessionId` until `realSessionId` is bound.

## Blocking issues

None.

## Serious issues

None.

## Moderate and minor issues

- Moderate. Recorders persist a not-yet-bound Claude tab id as the canonical session id. `apps/ptah-electron/src/di/live-chat-session-resolver.ts:15` and `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:1281`. Cron create then requires that id (`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/cron-namespace.builder.ts:302`). The builder comment says a job records the canonical session (`ptah-api-builder.service.ts:1009`).

## Data flow

1. HTTP MCP still takes the caller id from the authenticated request, not the tool body. OK.
2. Electron registers one resolver over Claude `findMatches`, Codex live chats, and provider-session live chats (`phase-2-libraries.ts:261`). Blank ids are `unresolved`. Two matches are `ambiguous`. OK.
3. A Claude row with `realSessionId` null stays in `byTabId` and is mapped to a live session whose `cwd` is `projectPath`. OK for artifact publish (`protocol-dispatcher.ts:2891`) and handoff (`session-handoff.service.ts:1105`).
4. `resolveCallerLiveSessionId` returns that tab id as the canonical id. Gap for cron, harness, worktree capture, and session organization.
5. `getParentLevel` reads `permissionLevel` from the resolved row, or `plan` when the row is missing, ambiguous, or has no level (`ptah-api-builder.service.ts:799`). The namespace drops a caller-supplied `parentLevel` and forwards this value (`agent-namespace.builder.ts:758`). OK.
6. `AgentProcessManager.doSpawn` and `PtahCliRegistry.spawnAgent` both call `resolveLanePolicy`, which calls `resolveCliLanePolicy` (`agent-process-manager.service.ts:919`, `ptah-cli-registry.ts:858`). The ranked ceiling runs before the adapter starts. OK.
7. Codex `ask` is skipped as unsupported and the next mode is `plan` with network `deny`. A weaker explicit request is not raised. OK.
8. An unknown `parentLevel` string is rank `plan`, then `validateResolvedPolicy` either accepts `plan` or throws. It does not select `yolo`. OK.
9. Handoff of a resolved Codex or ACP row still passes `expectedRuntime`. A mismatch throws before launch (`chat-session.service.ts:1816`). OK.

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Spawn permission never exceeds the parent for ACP, Codex, and Claude callers | COMPLETE | Live `ask` is passed through for all three runtimes (`ptah-api-builder.service.spec.ts:455`). The shared resolver caps explicit and saved modes. Codex `ask` becomes `plan` because the Codex lane has no `ask` mode. |
| Unknown parent mode never falls back to `yolo` | COMPLETE | Missing index and a missing live level both become `plan` |
| Claude tab with no SDK session id is found by the resolver | COMPLETE | `findMatches` plus `toClaudeLiveChatSession`; artifact uses `cwd`; handoff keeps SDK id null |
| No regression in lane config, permissions, Electron wiring, or platform-cli/cli-engine | COMPLETE | Defaults and the Codex plan network deny still live in `resolveCliLanePolicy`. Electron registers the resolver once, and the three consumers inject it as optional. `platform-cli` and `cli-engine` are outside the diff and do not call these functions. |

Implicit requirements not addressed: recorders still do not wait for a canonical SDK id. Resume snapshots are still rewritten only for a `plan` parent.

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Parent `plan` | YES | Rank forces `plan`; Codex network is `deny` | None |
| Parent `ask` | YES | Stronger requests walk from `ask` toward `plan` | Codex lands on `plan` |
| Parent `auto-edit` | YES | `yolo` is capped to `auto-edit` or the next supported mode | Requested network is kept unless the mode is Codex `plan` |
| Parent `yolo` | YES | No cap; a weaker request stays weaker | None |
| Unknown or missing parent mode on a bound caller | YES | Resolver rank and `getParentLevel` both use `plan` | None |
| No parent session id | YES | `getParentLevel` is not called; ownerless spawn is unchanged | Outside the bound-caller bar |
| Claude tab, `realSessionId` null | YES | Resolver returns the tab; handoff SDK id stays null | Recorders store the tab id |
| Same id in two registries | YES | `ambiguous`, spawn `plan`, artifact has no workspace | None |
| Resume snapshot under `ask` | YES | Same as before: only `plan` rewrites the snapshot | Not a spawn path |
| Resolver not registered | YES | `parentLanePermission` now returns `ask` instead of omitting it, so a non-Electron host also caps | Unknown bound callers still become `plan` |

## Verdict

- Recommendation: APPROVED
- Confidence: HIGH
- Top risk: A cron job or harness proposal created before the Claude SDK id binds is stored under the tab id and does not follow the later SDK id.
- What a robust implementation would add: Return no canonical id from `resolveCallerLiveSessionId` until `realSessionId` is set, while still resolving that row for workspace and handoff.

Checked the uncommitted diff and the spawn policy, parent-level lookup, Electron resolver, artifact dispatch, and handoff caller mapping. `ptah_grep` found no `resolveCliLanePolicy` or `parentLanePermission` use under `platform-cli` or `cli-engine`.
