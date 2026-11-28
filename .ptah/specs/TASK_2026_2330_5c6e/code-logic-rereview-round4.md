# Code Logic Review — `TASK_2026_2330_5c6e` round 4

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 8/10 |
| Assessment | APPROVED |
| Blocking issues | 0 |
| Serious issues | 0 |
| Moderate issues | 0 |
| Minor issues | 0 |
| Failure modes found | 0 |

Re-review of the uncommitted fix for the round-3 Serious issue "Inactive refusal still changes model and effort". Source was not edited. Scope is the diff in the slash router, Codex chat adapter, Codex runtime, Codex context, and their three specs.

The refused or throwing skill lookup on a closed Codex chat now resumes the thread and leaves the next `turn/start` without model or effort. An accepted inactive skill still applies the resolved seed model and `params.effort` after lookup. The new effort omission is gated by `preserveTurnSettings`, which only the lookup resume sets. Electron still receives the original profile object, so the tab map keeps its identity key.

Score 8 matches the earlier approved band for this PR. The four checks hold, the focused Jest suites passed, and the change does not retune ordinary Codex sessions, lanes, `platform-cli`, or `cli-engine`.

## Decisions

- The bundled `review` skill is a GitHub-review orchestrator. It does not match this scoped logic re-review, so the report follows the task contract and the round-3 shape.
- Ptah `ptah_grep` and `ptah_read_symbol` were used for the source. `git diff` used the shell because Ptah file tools are read-only.

## Checks

### 1. Refused or throwing lookup on an inactive session

`routeFollowUpSlashCommand` resumes a closed Codex session with `resumeSessionForSkillLookup` before lookup (`chat-slash-command-router.service.ts:410-416`). `beforeSend` runs only after a skill resolves (`codex-chat-adapter.ts:1052-1058`). A false lookup returns before that callback. A throw from `safe('skillLookup')` also returns before it. The router catch returns the failure and does not apply settings (`chat-slash-command-router.service.ts:496-538`).

`resumeSessionForSkillLookup` opens with `model` and `effort` forced undefined and `preserveTurnSettings` true (`codex-chat-adapter.ts:362-366`). Profile preparation can still fill a catalog default. The adapter then copies the profile and clears `model` and `effort` on the copy passed to the runtime (`codex-chat-adapter.ts:403-410`, `612-618`). Context settings are taken from that copy (`codex-context.ts:184-186`).

`thread/resume` includes `model` only when `profile.model` is defined (`codex-context.ts:350-368`). Chat thread config is MCP overrides only (`codex-mcp-config.ts:176-183`), so effort is not nested in the resume frame. The lookup resume returns an async generator and does not iterate it, so this call does not start a turn. The next `startTurn` omits `model` when unset and omits `effort` while the lookup flag is set and effort is still unset (`codex-context.ts:1075-1079`).

The runtime spec reads the App Server frames for a missing skill and a throwing `skills/list`, and both `thread/resume` and the following `turn/start` lack `model` and `effort` (`codex-runtime.spec.ts:2865-2901`).

### 2. Accepted inactive skill still applies explicit model and effort

The same callback runs only after lookup succeeds. For an inactive session it applies `execution.seed.model` and `params.effort` (`chat-slash-command-router.service.ts:425-428`). `seed.model` is `resolveCodexModel(requestedModel)` (`workspace-provider-profile-resolver.ts:337-348`, `427-449`), which is the model the old resume path resolved. `setSessionModel` and `setSessionEffort` call `updateNextTurn` before `sendMessageToSession` (`codex-chat-session-controls.ts:243-251`, `codex-chat-adapter.ts:1055-1058`). An already-open session still applies `params.model` and `params.effort` through the same callback. The router spec asserts both orders (`chat-slash-command-router.native.spec.ts:293-310`, `350-363`).

### 3. Unset-effort omission stays on the lookup resume

`RuntimeContext.open` sets `preserveTurnSettings` only when the open is a resume and the caller passed true (`codex-context.ts:333-338`). `CodexRuntime.open` forwards that option (`codex-runtime.ts:285`, `349`). The only `true` caller is the chat adapter's lookup resume (`codex-chat-adapter.ts:612-618`).

When the flag is false, `turn/start` still sends `effort: this.settings.effort ?? null`. That is the previous expression. `preserveTurnSettings` does not appear under `platform-cli`, `cli-engine`, or `cli-agent-runtime`. Lane startup calls `CodexRuntime.open` with profile, resume, and secrets only (`apps/ptah-electron/src/di/codex-lane-composition.ts:322`, `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts:359`). The lane adapter's own `runtime.open` takes approvals and the binary path, not this flag (`codex-app-server-lane.adapter.ts:561-568`).

Ordinary frames stay as they were. The runtime suite still expects `effort: null` on a normal chat turn (`codex-runtime.spec.ts:1468-1490`), `effort: null` after an ordinary session clears effort (`codex-runtime.spec.ts:2317-2338`), and unchanged chat, gateway, and lane start/resume frames.

The flag stays on that context. Later turns of a lookup-resumed session keep omitting effort until a turn sets one. Sessions opened any other way still send `effort: null` when effort is unset.

### 4. Electron tab association

`preparedTabs` keys the tab by the object `profile()` returns (`codex-runtime-composition.ts:921-925`). `opened` looks that object up by identity (`codex-session-binding.ts:129-133`). The adapter passes `resolved`, the object from `prepareProfile`, and passes the stripped copy only to the runtime (`codex-chat-adapter.ts:469-470`). The adapter spec asserts `lifecycle.opened` received that same object (`codex-chat-adapter.spec.ts:451-467`).

The settings record stores `resolved.profile.model` (`codex-session-settings-record.ts:60-70`). Native controls read that record when the user changes a setting (`codex-session-binding.ts:71`, `native-session-controls.ts:185-190`). They do not push it into `thread/resume` or `turn/start`. The context settings used on the wire come from the stripped profile.

## Five logic questions

### 1. How does this fail silently?

No new silent failure on the scoped path. A refused or throwing lookup resumes without model or effort, skips `beforeSend`, and leaves the next `turn/start` without those fields.

### 2. What user action produces unexpected behaviour?

None found in this diff. Closing a Codex chat and sending a skill Ptah refuses reopens the thread without substituting the catalog model or clearing effort.

### 3. What input data produces a wrong answer?

`model: undefined` on the lookup profile stays absent on `thread/resume`. Unset effort on that context stays absent on `turn/start` instead of becoming `null`. An accepted skill then writes the resolved seed model and the requested effort before its turn.

### 4. What happens when a dependency fails?

`skills/list` throwing during lookup rejects `resolveSkillCommand` and does not apply model or effort. The runtime spec starts the next turn on that same context and the frame still omits both fields. `applyLiveTurnSettings` still logs a failed model or effort write and lets an accepted skill turn run. That swallow is unchanged, and it now runs only after the skill resolves.

### 5. What is missing that the requirements never mentioned?

Nothing in the four checks. The lookup flag is sticky for that context, which is what keeps a later unrestored turn from sending `effort: null`.

## Failure modes

None.

## Blocking issues

None.

## Serious issues

None. Round 3's "Inactive refusal still changes model and effort" (`chat-slash-command-router.service.ts:412-416` at that time) is fixed by the lookup resume above.

## Moderate and minor issues

None.

## Requirements fulfilment

| Requirement | Status | Evidence |
| --- | --- | --- |
| Refused or throwing inactive lookup sends `thread/resume` and the next `turn/start` without model or effort | COMPLETE | Adapter strips the runtime profile and sets the flag. Runtime spec reads both frames for missing and throwing lookups |
| Accepted inactive skill still applies explicit model and effort | COMPLETE | `beforeSend` applies `execution.seed.model` and `params.effort` only after lookup |
| Unset-effort omission does not change ordinary Codex sessions, lanes, `platform-cli`, or `cli-engine` | COMPLETE | Flag defaults false. Those hosts do not pass it. Ordinary `effort: null` and lane frame tests passed |
| Electron tab association keeps the profile object | COMPLETE | `opened(id, resolved)` and `toBe(prepared)` |

## Verification

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.native.spec.ts`: 36 passed.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts`: 130 passed.
- `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-runtime.spec.ts`: 150 passed, including the lookup frame cases, ordinary `effort: null`, and unchanged chat, gateway, and lane frames.
- ESLint and `tsc` were not re-run. Jest printed the existing config-module loading warning and completed all three suites.

## Verdict

- Recommendation: APPROVED
- Confidence: HIGH
- Top risk: None in this fix. The lookup resume is the only path that omits unset effort, and the Electron lifecycle still receives the original profile object.
