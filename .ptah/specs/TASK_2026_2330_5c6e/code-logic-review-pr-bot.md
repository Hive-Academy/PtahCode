# Code Logic Review — `TASK_2026_2330_5c6e` (PR-bot fix)

## Summary

| Metric              | Value |
| ------------------- | ----- |
| Overall score       | 5/10 |
| Assessment          | REVISE |
| Blocking issues     | 0 |
| Serious issues      | 1 |
| Moderate issues     | 1 |
| Failure modes found | 2 |

Uncommitted diff on `fix/codex-slash-commands` (10 files under `libs/backend/cli-agent-runtime` and `libs/backend/rpc-handlers`). Read against `review-fix-pr-bot.md` and the callees those edits now depend on (`CodexAppServerProcess.request` / `fail`, `RuntimeContext.updateNextTurn`, `CodexChatAdapter.resumeSession`, `applyLiveTurnSettings`). Jest was not re-run; the adapter specs mock `listSkillCommands`, so they cannot see the live-process timer below.

Score is 5 rather than 7–8 because the skill-deadline path can still close the live Codex process after it has already returned models. It is not 3–4: raw retries are held, built-ins still dispatch, and an already-open skill turn does apply `params.model` and `params.effort`.

## Per-thread status

| Thread | Request | Status |
| --- | --- | --- |
| `PRRT_kwDOPngTds68ix2v` (Major) | Skill read deadline must keep models and efforts | PARTIAL |
| `PRRT_kwDOPngTds68ix21` (Major) | Raw retry held (recoverable) on a catalog outage; built-ins admitted; removed skills refused | COMPLETE |
| `PRRT_kwDOPngTds68ix24` (Minor) | Skill turns apply the selected model and effort | PARTIAL |

## Five logic questions

### 1. How does this fail silently?

A live `listTurnOptions` call treats a skill-list stall as success. `listCodexLaneSkills` (`codex-app-server-lane-catalog.ts:17-22`) wins the race at 3s, `listTurnOptions` returns models, efforts, built-in commands, and `commandsUnavailable: true` (`codex-app-server-lane.adapter.ts:1024-1041`). The `skills/list` RPC is still pending. Its 30s timer calls `CodexAppServerProcess.fail`, which closes the lane process (`codex-app-server-process.ts:322-326`, `codex-app-server-process.ts:631`). The composer has already been told the catalog succeeded.

`applyLiveTurnSettings` also logs a model or effort timeout and still invokes the skill (`live-turn-settings.ts:36-41`, `chat-slash-command-router.service.ts:413-418`). That matches ordinary live turns (`chat-session.service.ts:2286-2292`). It is not a new defect.

### 2. What user action produces unexpected behaviour?

The user changes model or effort, then sends a skill while the Codex chat session is not in the adapter map (`isSessionActive` is false). The router resumes with `{ ...config, prompt: '' }` and never passes `effort` (`chat-slash-command-router.service.ts:410-416`). `config` has `model` (`chat-slash-command-router.service.ts:342-343`) and does not set `effort`. A normal resume does (`chat-session.service.ts:3475-3483`). The reopened thread runs the skill at the session default effort.

An already-open session takes the new `else` branch and does apply both fields before `invokeSkillCommand`.

### 3. What input data produces a wrong answer?

A raw retry whose body matches `builtinLaneCommands` (`compact` only) never consults the catalog (`agent-message-coordinator.service.ts:608-609`). That is the built-in admission the thread asked for.

A raw retry of any other command, when `advertisedCommands` returns `undefined` or throws, or when the view has `error` or `commandsUnavailable` and the name is absent, stays `blocked-retryable` (`agent-message-dispatcher.ts:148-149`, `agent-message-coordinator.service.ts:617`). A later catalog that returns a real empty command list (no `commandsUnavailable`) still becomes the terminal “no longer advertised” refusal. `[]` is truthy, so `names && matchesLaneCommand(...)` is `false`, not `undefined` (`agent-message-dispatcher.ts:175`).

### 4. What happens when a dependency fails?

- Skill RPC rejects or the 3s race rejects: models and efforts are still returned; `commandsUnavailable` is set (`codex-app-server-lane.adapter.ts:1040-1041`, `codex-app-server-lane.adapter.ts:319-320`). Stopped reads use the same split inside `readCodexLaneCatalog` (`codex-app-server-lane-catalog.ts:56-61`).
- Skill RPC never completes on a **live** context: see failure mode 1. The stopped catalog calls `close()` in `finally`, which rejects pending RPCs and clears their timers (`codex-app-server-process.ts:659-663`). That path does not wait 30s, but the detached `listSkillCommands` promise rejects with nobody awaiting it (`codex-app-server-lane-catalog.ts:17-25`). The Electron guard only logs `unhandledRejection` (`main-process-error-guard.ts:73-74`).
- `listModels` / `readModelCatalog` rejects: the whole catalog throws, the coordinator serves cache or built-ins with `error`, and a non-built-in raw retry is held because `view.error` forces `undefined` (`agent-message-coordinator.service.ts:584-594`, `agent-message-coordinator.service.ts:617`).
- Store transition fails during the hold: `refuseHeld` returns `storage-unavailable` and leaves the previous state (`agent-message-dispatcher.ts:195-198`).

### 5. What is missing that the requirements never mentioned?

The first delivery of a skill during `commandsUnavailable` is still sent as a headed text turn. The hold runs only when `envelope.rawDelivery?.raw` is already set (`agent-message-dispatcher.ts:148-149`). That matches the thread wording (raw **retries**). A cache hit with `refresh === false` also ignores `commandsUnavailable` and returns the cached names (`agent-message-coordinator.service.ts:610-611`). After a partial read, `remember` stores only `compact` (`agent-message-coordinator.service.ts:557-560`), so a new skill send uses that short list until a refresh.

No cancellation token exists on `CodexAppServerProcess.request`. The new deadline cannot meet its bound without one.

## Failure modes

### Live skill deadline leaves a process-killing RPC

- Trigger: `skills/list` on the open lane context does not settle within 3s, and still has not settled at `REQUEST_TIMEOUT_MS` (30s).
- Symptom: Turn options show models, efforts, and `compact`, with skills unavailable. About 30s later the Codex process is closed and the lane dies.
- Evidence: `codex-app-server-lane-catalog.ts:17-22`, `codex-app-server-lane.adapter.ts:1024-1026`, `codex-app-server-process.ts:32`, `codex-app-server-process.ts:322-326`, `codex-app-server-process.ts:631`.
- Current handling: `Promise.race` rejects locally and `clearTimeout` clears only the 3s timer. The RPC timer stays armed. `fail` closes the whole process, not that request.
- Recommendation: Cancel or disarm that one pending request when the local deadline wins, and attach a rejection handler to the orphan. Do not let `REQUEST_TIMEOUT_MS` call `fail` for a call the catalog has already given up on.

### Inactive skill resume drops the selected effort

- Trigger: Follow-up skill while `isSessionActive(sessionId)` is false, with `params.effort` set.
- Symptom: The thread opens with `config.model` and the default effort, then the skill runs.
- Evidence: `chat-slash-command-router.service.ts:342-343`, `chat-slash-command-router.service.ts:410-416`. Contrast `chat-session.service.ts:3478-3483`.
- Current handling: The active branch calls `applyLiveTurnSettings`. The inactive branch only resumes `{ ...config, prompt: '' }`.
- Recommendation: Pass `effort: params.effort` into the resume config, or call `applyLiveTurnSettings` once the session is open, on both branches.

## Blocking issues

None.

## Serious issues

### Abandoned `skills/list` still closes the live lane

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane-catalog.ts:17`
- Scenario: Live `listTurnOptions` (`codex-app-server-lane.adapter.ts:1026`) calls `listCodexLaneSkills(context)` on the session context. The 3s race returns. `skills/list` stays in `CodexAppServerProcess.pending` until `REQUEST_TIMEOUT_MS` (`codex-app-server-process.ts:285`, `codex-app-server-process.ts:322-326`).
- Impact: `fail` (`codex-app-server-process.ts:631`) closes that process. The user keeps models from this read, then loses the Codex session because skill discovery stalled — the case this deadline was added for. Stopped catalogs close the throwaway process in `finally` (`codex-app-server-lane-catalog.ts:62-64`); there the same detach becomes a logged unhandled rejection when `close` rejects the pending RPC (`codex-app-server-process.ts:659-662`).
- Fix: On the local timeout, remove that pending entry (clear its timer and reject it) without `fail`, and `catch` the orphan. Keep returning models and `commandsUnavailable`.

The previous `Promise.allSettled` also left a hung RPC running after the coordinator’s 5s bound. This change is different: `listTurnOptions` now resolves successfully while that fatal timer is still armed.

## Moderate and minor issues

### Inactive skill path does not apply effort

- File: `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts:410`
- Scenario: `!isSessionActive` resumes with `config`, which sets `model: requestedModel` and omits `effort`. `CodexChatAdapter.resumeSession` only skips option updates when the session is already open (`codex-chat-adapter.ts:323-338`); a closed id goes to `open(config)` (`codex-chat-adapter.ts:352-353`).
- Impact: A skill that reopens a Codex chat uses the selected model and not the selected effort.
- Fix: Set `effort: params.effort` on that resume config (same shape as `chat-session.service.ts:3483`), or apply live settings after resume and before `invokeSkillCommand`.

## Data flow

1. Stopped or live catalog starts `listModels` and `listCodexLaneSkills` together. OK for the returned object: a skill rejection omits `skills` and sets `commandsUnavailable` (`codex-app-server-lane.adapter.ts:1040-1041`). Gap: the live RPC is not cancelled (failure mode 1).
2. `turnOptions` spreads the catalog, including `commandsUnavailable`, and `remember`s it (`agent-message-coordinator.service.ts:557-560`). A thrown read returns cached models or built-in commands plus `error` (`agent-message-coordinator.service.ts:589-594`). OK.
3. `advertisedCommands` returns built-in names immediately when the body matches (`agent-message-coordinator.service.ts:608-609`). Otherwise a refresh during `commandsUnavailable` returns `undefined` unless the name is in the list (`agent-message-coordinator.service.ts:617`). OK for retries.
4. `deliversRaw` maps `undefined` to “catalog unknown” and `false` to “not advertised” (`agent-message-dispatcher.ts:175`, `agent-message-dispatcher.ts:148-151`). A raw retry with `undefined` is stored as `blocked-retryable` / `delivery-failed` with `nextRetryAt` cleared (`agent-message-dispatcher.ts:98-100`, `agent-message-dispatcher.ts:191-193`). Manual retry still sees that state (`RETRYABLE` / `DELIVERABLE` include it). No automatic re-arm, because `rearmHeld` requires `nextRetryAt` (`agent-message-coordinator.service.ts:392-393`). That matches a recoverable hold.
5. Open-session skill: `applyLiveTurnSettings` then `invokeSkillCommand` (`chat-slash-command-router.service.ts:413-418`). `updateNextTurn` is serialized and stamped `nextTurn` (`codex-context.ts:1429-1493`), so the following skill send sees it. Gap: closed session skips effort (failure mode 2).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Skill deadline keeps models and efforts | PARTIAL | Return value keeps them (`codex-app-server-lane.adapter.ts:1028-1041`). The live `skills/list` timer can still close the process. |
| Raw retry held on catalog outage | COMPLETE | `blocked-retryable` at `agent-message-dispatcher.ts:98-100`. Body is not sent (`agent-message-dispatcher.spec.ts` expectation). |
| Partial catalog is not “skill removed” | COMPLETE | `commandsUnavailable` yields `undefined`; a definite empty list yields `false` (`agent-message-coordinator.service.ts:617`, `agent-message-dispatcher.ts:150-151`). |
| Built-ins admitted while skills are down | COMPLETE | `builtinLaneCommands` short-circuit (`agent-message-coordinator.service.ts:608-609`); Codex list is `compact` (`codex-app-server-lane.adapter.ts:171-185`). |
| Skill turn applies selected model and effort | PARTIAL | Active session only (`chat-slash-command-router.service.ts:412-416`). |

Implicit requirements not addressed: cancelling a Codex RPC whose timeout is process-fatal; applying effort when a skill reopens a closed session.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Skill RPC rejects | YES | `allSettled` / race rejection sets `commandsUnavailable` | None for the catalog object |
| Skill RPC exceeds 3s and later succeeds | YES | Late result ignored; this read stays unavailable | Next refresh can succeed. No process kill if it settles before 30s |
| Skill RPC exceeds 30s on a live lane | NO | `fail` closes the process | Failure mode 1 |
| Skill method missing | YES | `listSkillCommands?.() ?? []` is an empty fulfilled list | Looks like removal, same as before this diff |
| `remaining <= 0` before the RPC | YES | Throws without calling `listSkillCommands` (`codex-app-server-lane-catalog.ts:13-14`) | Stopped reads start this clock before `open()`, so a slow spawn skips skills and still returns models |
| Raw retry, catalog throw | YES | `undefined` → `blocked-retryable` | `nextRetryAt` unset, so only a manual retry runs |
| Raw retry, command absent from a real list | YES | Terminal `turn-input-unsupported` | None |
| `/compact` during outage | YES | Built-in short-circuit, sent raw | Does not refresh the catalog |
| Active skill with model and effort | YES | `applyLiveTurnSettings` before invoke | A timed-out apply is logged and the skill still runs |
| Inactive skill with effort | NO | Resume config omits effort | Failure mode 2 |
| Images on a held raw retry | YES | `attachments.take` only reads (`agent-message-attachment.store.ts:84-86`) | Not consumed by the new hold |

## Decisions

- The live-process close is in scope for this diff. Option A: file it, because the new race returns success while `REQUEST_TIMEOUT_MS` is still armed. Option B: treat it as pre-existing, because a coordinator timeout already stopped awaiting `listTurnOptions` without cancelling the RPC. Evidence: `bounded(..., LANE_TURN_OPTIONS_TIMEOUT_MS)` is 5s (`agent-message-coordinator.service.ts:109`, `agent-message-coordinator.service.ts:556`) and does not abort the handle call, so a 30s hang could already `fail`. The new path is the one that **resolves the catalog** and still leaves that timer. Chose A. Reversible if the parent decides only regressions versus the old hang count.

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: A stalled live `skills/list` preserves models for this read and then closes the Codex process at 30s.
- What a robust implementation would add: per-request cancel (or disarm) inside `listCodexLaneSkills`, and `effort` on the inactive skill resume.
