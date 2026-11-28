# Code Logic Review — `TASK_2026_2330_5c6e` round 3

## Summary

| Metric              | Value |
| ------------------- | ----- |
| Overall score       | 6/10 |
| Assessment          | REVISE |
| Blocking issues     | 0 |
| Serious issues      | 1 |
| Moderate issues     | 0 |
| Failure modes found | 1 |

Re-review of the uncommitted diff on `fix/codex-slash-commands` (PR #1516) against `threads-round3-fix-report.md`. Source was not edited. `platform-cli` and `cli-engine` are absent from the diff, so they were not recompiled.

Score 6 sits below the sound band because one of the four required behaviors is still wrong on a likely path: a refused skill on a closed Codex chat resumes the thread as the catalog default model and leaves effort unset. It sits above a foundation failure because the active-session refusal path, the first-send catalog hold, nested-path lane startup, and stopped-lane catalog refresh behave as required and the focused Jest suites passed.

## Decisions

- A single-segment token such as `/home` stays a command candidate. Options were: treat every absolute path as non-command text, or treat only tokens that contain another `/` or `\` as paths. Evidence: `leadingLaneCommand` at `lane-command-filter.ts:23`, the lane spec at `codex-app-server-lane.adapter.spec.ts:697` (nested POSIX and drive-qualified only), and the parent warning that a real slash command must not be misread as a path. Chat command tokens in `codex-chat-adapter.ts:410` are `[a-z][\w:@.-]*` and do not contain a slash. Reversible.

## Five logic questions

### 1. How does this fail silently?

A refused skill on an inactive Codex session still changes the thread model and the session's stored effort, then returns `success: false`. The router resumes before it knows the skill exists (`chat-slash-command-router.service.ts:410-417`) with `model: undefined` and no `effort`. `classifyCodexChatOptions` drops an undefined model (`codex-chat-profile-options.spec.ts:117-127`). Profile preparation then requests `'default'` (`chat-runtime-profile.service.ts:146`), and `resolveCodexModel('default')` is `gpt-6.1-sol` (`codex-provider-entry.ts:16-26`). The host profile copies that seed model and `config.effort` (`codex-chat-host-ports.ts:449-450`). `thread/resume` sends the model whenever it is defined (`codex-context.ts:345-363`). The published session keeps that model and an undefined effort (`codex-chat-adapter.ts:622-625`, `codex-context.ts:183-186`). The router discards the resume iterable, so this call does not itself start `turn/start`, but the next turn that does not successfully reapply settings sends `model: gpt-6.1-sol` and `effort: null` (`codex-context.ts:1067-1071`). The caller sees only the refusal.

An already-open session does not take this path. Refusal returns before `beforeSend` (`codex-chat-adapter.ts:1015-1018`).

### 2. What user action produces unexpected behaviour?

Close a Codex chat whose thread is not on `gpt-6.1-sol` or has a reasoning effort, then send a skill Ptah will refuse (`/example:skill` when lookup returns no skill, or any non-builtin the native adapter does not invoke). The UI shows the unsupported-command error (`chat-slash-command-router.service.ts:435-440`). The thread is already resumed as `gpt-6.1-sol` with no effort. Slash continue does not go through `autoResumeIfInactive` (`chat-session.service.ts:2082-2095`), so this resume is the only open. The next ordinary message reapplies model and effort only when `!justResumed && !followUp` and the params are non-empty (`chat-session.service.ts:2286-2292`, `live-turn-settings.ts:76-88`). A follow-up, an empty model or effort param, or a swallowed `setSessionModel` / `setSessionEffort` failure leaves the default model and null effort on the turn.

### 3. What input data produces a wrong answer?

`model: undefined` on the resume config is not "keep the thread model". It becomes the requested model `'default'`, then `gpt-6.1-sol`. A missing `effort` key is not "keep the thread effort". Context settings stay `undefined`, and `turn/start` encodes that as `effort: null` (`codex-context.ts:1071`, schema `effort: string.min(1).nullish()` in `codex-protocol-methods.ts:199`).

The same resume config is used when the skill is later accepted. `beforeSend` can correct the skill turn (`chat-slash-command-router.service.ts:426-429`), but the `thread/resume` frame has already been sent with the default model.

### 4. What happens when a dependency fails?

Catalog lookup throw or `undefined` on a user message whose first token is a single-segment `/command` holds the envelope as `blocked-retryable` with `delivery-failed` and does not call the lane (`agent-message-dispatcher.ts:98-100`, `:149`, `:169-175`). `nextRetryAt` is cleared (`agent-message-dispatcher.ts:192`). `coordinator.retry` sends the same body raw after discovery recovers (`agent-message-coordinator.lane-messaging.spec.ts:481-495`). The caller is not told the send succeeded.

`attachments.take` does not remove images (`agent-message-attachment.store.ts:79-86`), so the hold does not burn them.

A stopped catalog read deletes the lineage cache first (`agent-message-coordinator.service.ts:564-567`). On throw, the composer gets built-in commands plus `error` and does not get the deleted skill list (`agent-message-coordinator.service.ts:591-596`). `advertisedCommands` treats `view.error` as unknown (`agent-message-coordinator.service.ts:621`), so a non-builtin skill is held rather than sent as ordinary text. Built-ins still short-circuit (`agent-message-coordinator.service.ts:610-611`).

Fresh lane startup still closes and rethrows if skill discovery throws (`codex-app-server-lane.adapter.ts:963-965`). Nested paths and drive-qualified paths never call it (`lane-command-filter.ts:23`, `codex-app-server-lane.adapter.ts:958`).

`applyLiveTurnSettings` logs a settings failure and still lets a later turn run (`live-turn-settings.ts:64-66`). After the bad resume, that means the turn runs on `gpt-6.1-sol` and `effort: null`.

### 5. What is missing that the requirements never mentioned?

Nothing else required by the four threads. Residual: a one-segment absolute path (`/tmp inspect`, `/home inspect`) is still a command candidate and can still abort a fresh lane if discovery throws. A slash inside the token is required before startup skips discovery. That matches the command-versus-path tradeoff above. No in-repo skill token uses an embedded `/`.

## Failure modes

### Refused inactive skill resumes as the default model and clears effort

- Trigger: Codex chat session is not active, and the user sends a non-builtin slash command that `invokeSkillCommand` does not accept.
- Symptom: The RPC returns `CODEX_UNSUPPORTED_OPTION`. The thread has been resumed with model `gpt-6.1-sol`. Session settings have that model and no effort. A later turn that does not successfully apply the composer model and effort starts with `effort: null`.
- Evidence: `chat-slash-command-router.service.ts:410-417`; `chat-runtime-profile.service.ts:146`; `codex-provider-entry.ts:20-26`; `codex-chat-host-ports.ts:449-450`; `codex-context.ts:345-363` and `:1067-1071`; `codex-chat-adapter.ts:513-521` and `:622-625`.
- Current handling: `beforeSend` is skipped on refusal, which is what the router spec asserts. The spec mocks `resumeSession` (`chat-slash-command-router.native.spec.ts:323-335`) and never builds a profile, so it cannot see `'default'` substitution or `effort: null`.
- Recommendation: Resume a closed thread for a skill only after the skill resolves, or resume with the thread's current model and effort omitted on the wire (`profile.model === undefined`, and do not send `effort: null`). Do not map a missing model to `'default'` on this path. Assert the `thread/resume` params in an adapter-level test.

## Blocking issues

None.

## Serious issues

### Inactive refusal still changes model and effort

- File: `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts:412-416`
- Scenario: Inactive Codex session, skill lookup returns false or throws before `beforeSend`.
- Impact: The refused command opens the thread as `gpt-6.1-sol` and leaves effort unset. The next turn uses those settings unless a later call applies both fields successfully. That is the behavior thread (c) forbids.
- Fix: Keep the active-session order (resolve the skill, then apply settings). For an inactive session, either resolve the skill without resuming, or pass a resume config whose model and effort are absent on `thread/resume` and on the context settings that `turn/start` reads. Cover it with the real profile port, not a mock that only checks `model: undefined`.

## Moderate and minor issues

None beyond the residual single-segment path recorded in question 5.

## Data flow

Refused skill, inactive session:

1. `routeFollowUpSlashCommand` sees `codex-app-server` and a non-builtin name. OK for routing.
2. `isSessionActive` is false, so `resumeSession` runs with `model: undefined`, `prompt: ''`, and no effort. Gap: this is before skill resolution.
3. Profile classification drops undefined model. Gap: preparation substitutes `'default'` → `gpt-6.1-sol`.
4. `thread/resume` includes that model. Gap: the thread model changes.
5. Session settings copy profile model and undefined effort. Gap.
6. `open` returns a turn iterable. The router does not iterate it, so `turn/start` does not run yet. OK for "no empty turn on this call".
7. `invokeSkillCommand` returns false without `beforeSend`. OK for the active-session half of the fix, too late for the resume.
8. Caller receives `success: false`. Gap: the session is live with the substituted settings.

First skill send, catalog down:

1. `leadingLaneCommand` matches a single-segment token. OK.
2. `advertisedCommands` throws or returns undefined. OK.
3. `deliversRaw` returns undefined (`agent-message-dispatcher.ts:175`). OK.
4. `deliveryForm` returns `catalogUnavailable` for every such result, including a first send (`agent-message-dispatcher.ts:149`). OK.
5. `refuseHeld` writes `blocked-retryable` / `delivery-failed` and returns `mode: 'unsupported'`. OK. No adapter send.

Fresh lane, absolute path:

1. `/home/project …` and `C:/project …` make `leadingLaneCommand` undefined. OK.
2. Startup skips `resolveSkillCommand` and runs the normal prompt (`codex-app-server-lane.adapter.ts:958-970`). OK.
3. A real `/compact` or `/session-handoff` token still enters discovery. OK.

Stopped lane skills:

1. `advertisedCommands` does not return a stopped cache hit (`agent-message-coordinator.service.ts:613-618`). OK.
2. `turnOptions` deletes the lineage cache and reads `stoppedLaneCatalog` (`agent-message-coordinator.service.ts:564-571`), which opens a new catalog (`codex-app-server-lane.adapter.ts:304-320`). OK.
3. Failure does not put the old skill list back into `commands`. OK.

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Unavailable catalog must not send a first skill as ordinary model input | COMPLETE | Hold is `blocked-retryable`, manual retry, caller gets `unsupported` |
| Skill discovery failure must not abort fresh startup when the task starts with an absolute path | COMPLETE | Nested POSIX and drive-qualified paths skip discovery. One-segment `/home` stays a command on purpose |
| A refused slash command must not change model or effort for the next turn | PARTIAL | Active session is fixed. Inactive resume still applies `gpt-6.1-sol` and leaves effort unset |
| Stopped lanes must not advertise a stale skill catalog | COMPLETE | Cache dropped before each stopped read; errors do not reuse the old skill list |
| Electron, platform-cli, and cli-engine still work | COMPLETE | No diff in `platform-cli` or `cli-engine`. Changed Electron/renderer libraries were not typechecked in this pass; Jest for the changed specs passed |

Implicit requirements not addressed: none beyond the inactive resume gap.

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| First `/skill` while catalog throws or returns undefined | YES | `blocked-retryable`, no send | Recovery is a manual retry (`nextRetryAt` cleared) |
| Definite catalog that does not list the token | YES | Headed text on first send; terminal refusal only if `rawDelivery.raw` | |
| `/usr/bin/foo` or `C:/project` as lane task text | YES | Not a command token; no skill lookup | |
| `/compact` and `example:skill` | YES | No extra slash; still commands | |
| Images on a held first send | YES | `take` is a read | |
| Stopped catalog timeout | YES | Built-ins plus `error`; skills not advertised | |
| Live `commandsUnavailable` cache | YES | Cache skipped; refetch; hold if still unknown | |
| Inactive refused skill | NO | Resume substitutes default model | Serious issue above |
| Active refused skill | YES | No resume, no `beforeSend` | |
| Accepted inactive skill | YES for the skill turn | `beforeSend` applies seed model and `params.effort` after lookup | `thread/resume` has already sent the default model |

## Verification

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` dispatcher, lane-messaging, lane-command-filter, and Codex lane adapter specs: 4 suites, 168 tests, passed.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath` `chat-slash-command-router.native.spec.ts`: 35 tests, passed. The inactive refusal test does not exercise profile resolution.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath` `codex-chat-adapter.spec.ts`: 129 tests, passed. Covers `beforeSend` order on an already open session, not the inactive profile path.
- ESLint and `tsc` were not re-run. The fix report's typecheck claims were not repeated here.

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: A refused skill on a closed Codex chat resumes the thread as `gpt-6.1-sol` and the next unrestored turn sends `effort: null`.
- What a robust implementation would add: resume only after the skill resolves, or omit model and effort on the wire for that resume, and a test that reads `thread/resume` params when lookup returns false.
