# Code Logic Review - TASK_2026_SUBAGENT_STOP_PATH

## Verdict

REVISE. Score 6/10.

The stop ordering, the warning-before-stop sequence, the weighted count and the error isolation in `observe()` are sound. Two acceptance criteria are not met in the paths that matter in production: the SDK SendMessage guard misses a stopped agent addressed by name, and the transcript path is never populated. The refusal also ignores `compaction.enabled`. Two further defects (name guard, `enabled` gate) change behaviour for real users.

## Defects

### 1. major - SDK SendMessage guard does not refuse a budget-stopped agent addressed by teammate name (AC5)

- `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:518-520` resolves `input.to` with `subagentRegistry.getToolCallIdByName(to) ?? to`.
- The stop calls `registry.update(toolCallId, {status:'completed'})` (`subagent-budget-monitor.ts:1151`). The registry removes completed records (`subagent-registry.service.ts:312-331`), so `getToolCallIdByName` returns null after a stop (`:209-225` iterates only live records).
- The target then stays the raw name, for example `"reviewer"`. `getAgentBudgetState` (`subagent-budget-monitor.ts:641-653`) only matches `toolCallId`, `stoppedAgentId`, or the live registry `agentId`. A teammate name matches none of them.
- Result: the model calls `SendMessage({to:'reviewer'})` on a stopped named agent and the guard returns undefined, so the resume goes through. This is the incident path.
- The spec at `sdk-permission-handler.spec.ts:111-117` hides this by stubbing the registry to still return the tool call id.
- Fix: persist `registryRecord?.teammateName` as `stoppedTeammateName` in `stop()` (next to `:1076`). Match it in `getAgentBudgetState`, or make the handler try the monitor with the raw `to` after the registry lookup. Add a spec in which the registry returns null.

### 2. major - Resume refusal ignores `compaction.enabled`

- `getAgentBudgetState` (`subagent-budget-monitor.ts:641-653`) and `buildBudgetResumeRefusal` (`subagent-resume-advice.ts:11-15`) never read `config.enabled`.
- `observe()` gates the warning and the stop on `enabled` (`subagent-budget-monitor.ts` around `:515-535`), but `count()` always updates `contextTokens`.
- With compaction disabled, a resume of any agent at >= 85% of `subagentHandoffTokens` is still refused. This applies to both the RPC path (`subagent-rpc.handlers.ts:429-436`) and the canUseTool path. Nothing is ever stopped and no handoff record exists, so the refusal text tells the user to start from a handoff record that does not exist.
- Fix: return `undefined`, or `stopped:false` with `contextTokens:null`, from `getAgentBudgetState` when `!enabled` and the agent was not stopped. The same applies to the injector advice.

### 3. major - `transcriptPath` is dead code, so the JSONL path in AC3 is always "unknown"

- `subagent-budget-monitor.ts:871` reads `msg['transcript_path']` from the SDK assistant stream message.
- `transcript_path` exists only on `BaseHookInput` (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:173`). `SDKAssistantMessage` (`sdk.d.ts:3405-3420`) has no such field. The hook handler already receives `agent_transcript_path` (`subagent-hook-handler.ts:424,509`).
- The "Subagent transcript:" line therefore always renders "unknown", and the validation branch can only be tested with a synthetic message.
- Fix: feed the validated `agent_transcript_path` from the SubagentStart/Stop hook into the monitor, or from the registry record (`transcriptPath` at `subagent-hook-handler.ts:424`). Keep the existing path validation. Alternatively drop the claim.

### 4. major - Secret redaction is too narrow for text that goes into the record and the parent

- `safeProgressText` (`subagent-budget-monitor.ts:218-223`) redacts only `(api[_-]?key|token|password|secret)\s*[:=]\s*value`, `sk-...` and `gh?_...`.
- It misses `Authorization: Bearer <jwt>`, `AWS_SECRET_ACCESS_KEY=...` (the keyword is followed by `_ACCESS_KEY`), JSON `"password": "x"` (a quote sits before the colon), `AKIA...` keys, PEM blocks and `xox*` tokens.
- `lastAssistantText` (2000 chars) is persisted to disk in the handoff record and pushed into the parent context.
- Fix: broaden the patterns (Bearer, quoted JSON keys, the `*_KEY`/`*_SECRET` env-name suffix, AKIA, xox, PEM header). Add spec cases beyond `token=`.

### 5. minor - Near-budget warning marker is not re-armed when the task id was unknown at warn time (AC2)

- `subagent-budget-monitor.ts:578` sets `warnedTaskId` to `startedTasks?.taskId ?? registry.taskId`, which can be undefined.
- `recordTaskStarted` only re-arms when `state?.warnedTaskId` is truthy (`:609`). If the id was undefined, `warnedAgentId` stays set and the resumed invocation never gets its notice.
- Fix: re-arm when `warnedAgentId` is set and `warnedTaskId` is not equal to the new `taskId`, treating undefined as different.

### 6. minor - `recordBudgetStop` fires on every later message of a stopped subagent

- `session-query-executor.service.ts:356-363` calls `onBudgetStop` after every observed message that carries `parent_tool_use_id` while `state.stopped` is true. The callback is at `:1637-1655`.
- Each call refreshes `recentBudgetStops` (`sdk-permission-handler.ts` `recordBudgetStop`) and emits an info log. The "recent stop within 60s" window therefore stays true for as long as the stopped agent keeps streaming, and logs are noisy.
- Fix: fire once per tool call id (a `Set` in the tap, or a `stopSignalled` flag). Also add `recordBudgetStop` and `getPendingPermissionCount` to `ISdkPermissionHandler` instead of duck-typing with `in`.

### 7. minor - Guard cannot tell a steering message to a running agent from a resume

- `buildBudgetResumeRefusal` refuses any message at >= 85% (`subagent-resume-advice.ts:12-13`). The RPC `subagent:send-message` is documented as pushing a message into a running subagent.
- The user (or the main thread's SendMessage) cannot tell a running agent at 90% to wrap up and write notes. The refusal text says "refuses this resume" even for a live agent.
- This follows the plan literally, but at least the live-agent case should be allowed or reworded.

### 8. minor - `stopped` flips only after `stopSubagent` resolves

- `subagent-budget-monitor.ts` sets `stopped=true` after the await at `~:1128-1140`, while `stoppedAgentId`, `stopReason` and `stoppedRecordPath` are set earlier (`:1074-1077`).
- During the in-flight window a safety stop (low context) is not refused. Handoff stops are covered by the 85% rule.
- Fix: expose `stopInFlight || stopped` as stopped.

### 9. minor - Missing tests

- No spec for the name-addressed stopped agent (see #1).
- No spec for `compaction.enabled=false` with the refusal (see #2).
- No spec for the executor `onBudgetStop` wiring (`session-query-executor.service.ts:1637`).
- No spec for tool_result outcome updates (`captureToolResults`) or the 10-call cap.
- No spec for non-trivial redaction cases (see #4).
- `captureToolResults` (`subagent-budget-monitor.ts:466-469`) runs outside the try/catch that protects `captureProgress`. It cannot reach `count()`, so the risk is low.

## Verified OK

- **Stop ordering (AC1).** `stoppedReason`, `agentId`, `taskId`, usage and `recordPath` are set (`subagent-budget-monitor.ts:1074-1085`), then `stopNotices.record(...)` is called, then `dispatcher.stopSubagent`. Persistence precedes `stopTask`. The record is written in `prepareHandoff` before this point. Delivery falls back to the existing parent-result/prompt path through `deliverHandoff`. The texts say "Ptah's budget monitor stopped...The user did not stop it".
- **Warning before stop (AC2).** `warnNearBudget` is called before the reason selection, so a jump past 100% is warned and then stopped in the same sample. Progress is captured before `count` and the stop, so the record carries it. The warning is withdrawn on a successful stop.
- **Count unchanged (AC7).** `captureProgress` is wrapped in try/catch, with a single error log, before `count()`. The cost weights and `count()` are untouched. The spec "counts and stops when progress capture throws" covers this.
- **Memory bounds.** Per-agent progress state is bounded: `toolCalls` <= 10, `filePaths` <= 50, text <= 2000, path <= 500. It lives in `SubagentState` inside the session, so it is released with the session. `recentBudgetStops` is pruned on write and is bounded by the session count.
- **Guard cannot over-deny.** `sdk-permission-handler.ts:518` matches the exact tool name `'SendMessage'` and requires a string `to`. It returns `{behavior:'deny', interrupt:false}` only, and falls through for everything else. Unknown usage (`contextTokens === null`) is allowed. Main-thread messages to non-agent targets resolve to no state.
- **SDK tool name.** `'SendMessage'` appears in `claude-builtin-catalog.ts:140`. The `to` field is supported only by the doc comment `SendMessage({to: name})` at `sdk-tools.d.ts:772`. The SDK d.ts has no input schema for SendMessage, so the field cannot be fully verified from types. The `to`-as-name and `to`-as-agent-id cases are handled, apart from #1.
- **canUseTool is reached.** YOLO uses permissionMode `'default'` (`sdk-query-options-builder.ts:841`), so the guard runs. Child lanes in `bypassPermissions` skip `canUseTool` and so skip the guard (out of scope, noted).
- **DI.** `SDK_SUBAGENT_BUDGET_MONITOR` is registered in `di/register.ts:654`. The dispatcher and the lifecycle manager are resolved lazily in the factory, and the new `@inject` in the permission handler and in `SubagentRpcHandlers` are optional. I found no circular edge.
- **Defect 6 instrumentation.** The new logs carry ids, a tool name, route, a decision source and the interrupt flag. No tool inputs or outputs are logged, and the permission policy is unchanged. The spec asserts that the private payload is absent.
- **Resume advice (AC4).** A stopped agent gets the `fresh` advice with the record path and Ptah-attributed wording (`chat-subagent-context-injector.service.ts` `adviseResume`). Unknown usage yields "context usage unknown", never "within budget".
- **Single refusal text.** One shared `buildBudgetResumeRefusal` is exported from agent-sdk and used by both the RPC handler and the permission handler.

## Review family

Claude Sonnet subagent; implementer Codex. Static review of the diff and its direct callers. No tests were run.

## Re-review (round 1)

### Verdict

REVISE. Score 7/10 (was 6/10). Static review of the round-1 diff against `fix-round-1.md`. No tests were run.

Defects 1 to 9 of the first review are resolved, except for two regressions the fixes introduced (R1, R2). Both are on the paths the fixes were meant to close.

### Status of the original defects

| # | Status | Evidence |
| - | ------ | -------- |
| 1 name-addressed stop | Fixed for the single-agent case; see R2 for name collisions | `subagent-budget-monitor.ts:369,1132,1190-1203` keep id, tool call id and name in `stoppedByIdentity` (256 cap, FIFO). `getAgentBudgetState` matches `stoppedTeammateName` and the registry/task name (`:684`). |
| 2 disabled budget | Fixed | `:679` returns `undefined` when `!enabled`. The injector gates on `enabled` (`chat-subagent-context-injector.service.ts` `adviseResume`). The refusal text no longer promises a record when `recordPath` is absent (`subagent-resume-advice.ts:11-19`). |
| 3 transcript path | Fixed | `resolveSubagentTranscriptPath` (`:238-253`). Both ids are restricted to `[A-Za-z0-9_-]`. The basename must equal `agent-<id>.jsonl`. `realpathSync` is applied to both the directory and the file, and `dirname(realFile)` must equal the real directory, so a symlink or `..` cannot escape. The hook feeds `agent_transcript_path` (`subagent-hook-handler.ts:437-440`). The raw path is dropped from the logs. |
| 4 redaction | Partly fixed; see R1 | |
| 5 re-arm | Fixed | `recordTaskStarted` (`:646`) re-arms when `warnedAgentId` is set and `warnedTaskId !== taskId`. |
| 6 stop signalling | Fixed | `signalledStops` is a per-tap `Set`, cleared on release (`session-query-executor.service.ts:229,362-363,443`). The two methods in `permission.types.ts:111-112` are optional and the executor calls them with `?.`. |
| 7 steering | Fixed per coordinator decision | `buildBudgetResumeRefusal` allows a `running` agent (`subagent-resume-advice.ts:12-13`). `running` requires registry status `running` and no stop in flight (`:689`). An idle agent at >= 85% and a stopped agent are refused. |
| 8 stop window | Fixed | `stopInFlight` is set at `:1087` before prepare and before `stopSubagent`. `stopped` is reported as `state.stopped \|\| state.stopInFlight` (`:690`). The `finally` clears `stopInFlight` when the stop rejects (`:1157`), and `onStopFailed` then retries. |
| 9 tests | Addressed | Spec additions are listed in `fix-round-1.md`. Not re-run. |

### New defects

#### R1. major - Redaction regressed for lowercase snake_case assignments

- File: `subagent-budget-monitor.ts:228`, together with `:227`.
- The original pattern `(api[_-]?key|token|password|secret)\s*[:=]` had no word boundary, so `access_token=...`, `client_secret=...`, `db_password=...` and `refresh_token: ...` were redacted.
- The new `\b` before the keyword prevents that. `_` is a word character, so there is no boundary between `_` and `t`/`s`/`p`.
- The uppercase env-name rule at `:227` has no `i` flag, so lowercase names are not caught either. Only the quoted-JSON rule (`:226`) covers these names.
- Result: `client_secret=abc123` in an assistant text block is now written verbatim into the handoff record and the parent message. That is worse than before the change.
- Other bypasses in the obvious forms: `"Authorization": "Bearer x"` (the header rule at `:225` needs an unquoted `Authorization:`); a bare `Bearer <jwt>`; `password = "two words"` (only the first word is redacted); a URL like `postgres://user:pass@host`.
- Fix: drop the leading `\b` and use `(?:^|[^A-Za-z0-9])` or a lookbehind; add the `i` flag to the env-name rule or match `[A-Za-z0-9_]*(?:_key|_secret|_token|_password)`; add a bare `Bearer\s+\S+` rule; match a quoted value as a whole (`"[^"]*"|'[^']*'|[^\s,;]+`); add `://user:pass@` credentials. Add spec cases for each.
- Corruption of normal text is low: `token: validation` becomes `token=[redacted]` (it eats one word and rewrites `:` as `=`), and an uppercase constant such as `MAX_TOKEN = 5` is redacted. This is acceptable but should be noted.

#### R2. major - A name or id match picks the oldest idle state, across sessions and across name reuse

- File: `subagent-budget-monitor.ts:680-698` (`getAgentBudgetState`) and the index at `:1190-1203`.
- The loop scans every session's states in insertion order, and `idleMatch ??= match` keeps the first idle match. Teammate names are not unique: an agent team reuses `reviewer`, and two chat tabs can each have one.
- Case A: an old `reviewer` was budget-stopped, and a newer `reviewer` finished normally at 30% context. A legitimate `SendMessage({to:'reviewer'})` resume of the newer one matches the older stopped state first and is refused as "stopped this agent".
- Case B: a freshly spawned `reviewer` that has produced no usage yet has no monitor state. The lookup falls through to `stoppedByIdentity.get('reviewer')`, which is global and survives session release, so steering the new agent is refused with a stale stop.
- Case C: session A's stopped `reviewer` also refuses a message from session B.
- Fix: prefer the most recent match (keep the last match in the loop, or order by spawn time). Scope the lookup to the caller's session (the permission handler knows it through `resolveSessionId()`; pass it as a parameter). Key `stoppedByIdentity` entries for names by `sessionId + name`. Do not fall back to a name-only stopped entry when the registry shows a live record with that name and no monitor state.

#### R3. minor - `stopInFlight` is reported as `stopped` through the record-write phase

- `subagent-budget-monitor.ts:690,1087`. `stopInFlight` is true while the handoff record is prepared (`prepareHandoff`), not only during `stopSubagent`.
- If a handoff stop does not run (record write failed, `!prepared`), the agent is reported as stopped for that window and a steering message is refused, although nothing was stopped.
- The executor also latches `signalledStops` on this in-flight value (`session-query-executor.service.ts:362-363`), so a stop that later fails is never re-signalled.
- Fix: report `stopped` only after the stop attempt starts, or from a separate `stopCommitted` flag set just before `stopSubagent`.

#### R4. minor - Transcript path derivation depends on the Claude slug rule and on file existence at stop time

- `subagent-budget-monitor.ts:243-244` replaces every non-alphanumeric character with `-`. Long paths use a hash suffix in Claude Code, so the derived directory then does not exist and the path stays "unknown".
- A supplied hook path is rejected when the slug is wrong, even if it is legitimate, because it is checked against the derived directory rather than against its own parent.
- Also, SubagentStop usually arrives after the record is written (`prepareHandoff` runs before `stopSubagent`), so the hook path only helps the later stop retry.
- Both degrade safely to "unknown". Consider validating the supplied path against `~/.claude/projects/*/<sessionId>/subagents`.

#### R5. minor - `hookTranscriptByAgent` is FIFO, not LRU

- `subagent-budget-monitor.ts:706` re-sets an existing key without refreshing its order. Bounded at 256, harmless. `stoppedByIdentity` already does `delete` then `set` (`:1196-1197`), so it is correct.

### Checks requested by the coordinator

- Index bounded and cleaned: bounded at 256 for both maps (`:707,1199`). `stoppedByIdentity` is not cleared on session release by design, which is the cause of R2.
- JSONL path cannot escape: confirmed (ids are charset-restricted, basename and real-directory equality are checked, symlinks resolve out and are rejected).
- Redaction bypass: R1.
- No refusal when the budget is inactive: disabled returns `undefined` (`:679`); unknown usage (`contextTokens === null`) and running agents are allowed (`subagent-resume-advice.ts:12-13`).
- Stop marked before the stop call and recovered on rejection: confirmed (`:1087`, `:1157`), with R3 as the one side effect.
- Guard scope unchanged: `sdk-permission-handler.ts` still denies only the exact tool `SendMessage` with `interrupt:false`.
- The two optional methods on `ISdkPermissionHandler` (`permission.types.ts:111-112`) change no behaviour on other hosts.

### Review family

Claude Sonnet subagent; implementer Codex.

## Re-review (round 2)

Static review of the R1-R4 changes. No tests run (the coordinator is running the scoped suite).

### Verdicts

| Item | Verdict | Evidence |
| ---- | ------- | -------- |
| R1 redaction | RESOLVED | `subagent-budget-monitor.ts:227-236`: quoted and unquoted Authorization, bare Bearer/Basic, URL userinfo, quoted JSON keys, a case-insensitive generic `name[:=]value` rule (snake_case, quoted values with spaces), PEM and token prefixes. Spec `subagent-budget-monitor.spec.ts:310-335` pins each reported bypass. |
| R2 session-keyed identity | RESOLVED (one residual, N2) | `stoppedIdentityKey(sessionId, identity)` (`:210`); lookup keeps the newest match (`:695-709`); same-name spawn clears the session's stopped name (`:994-997`); rekey moves entries (`:776-786`); callers pass the session (`sdk-permission-handler.ts:522-530`, `subagent-rpc.handlers.ts:429`, injector `:387`). Cross-session and spawn-clear are pinned (spec `:375-396`). |
| R3 none/pending/stopped | RESOLVED | `pending` is set just before `stopSubagent` (`:1180`) and reverted to `none` on rejection (`:1189`), so `onStopFailed` can retry. `stopped` means `stopState !== 'none'`, so resume is refused while pending (`:702`). The executor signals only on `stopped` (`session-query-executor.service.ts:362`), and the latch is not set for pending or none. Pinned by the budget spec pending/rejected test and the executor spec "does not latch a pending stop". |
| R4 transcript path | RESOLVED | `:244-265`: ids restricted to `[A-Za-z0-9_-]`, basename must equal `agent-<id>.jsonl`, `realpathSync` of the directory must lie under the real `~/.claude/projects/` (`startsWith(root + sep)`), and `dirname(realFile) === realDirectory` blocks a symlinked file. A directory symlink to outside fails the root check. The test accepts a different slug and rejects a file outside projects. No traversal or symlink escape found. |

### New findings

- N1 minor: over-redaction of prose. `\b(Bearer|Basic)\s+\S+` turns "Basic usage" into "Basic [redacted]" (`:230`). The generic rule (`:233`) redacts "primary key: id" and "monkey: x", and the URL rule (`:232`) can hit `http://localhost:3000/a@b`. This only affects handoff and notice prose and is safe-failing, but the "preserves normal sentence" test (spec `:~337`) covers only three sentences that cannot hit these rules. Consider requiring a token-like value (length >= 8 or a mixed charset) after Bearer/Basic.
- N2 minor: the `getAgentBudgetState` loop still matches an old stopped state by `registry.get(oldToolCallId).teammateName` (`:695`). The permission handler falls back to a name query (`sdk-permission-handler.ts:524`). If the registry keeps the old record and the new same-name agent has no monitor state yet, the old stop can still refuse a steer. The test masks this with `registry.get.mockReturnValue(null)`. It needs a message sent before the new agent's first usage, so it is rare, and it fails closed.
- N3 minor: between `stopInFlight = true` (`:1117`) and `pending` (`:1180`) the agent still reports `running`, so a steer can be accepted during handoff preparation. That follows from the R3 design and the coordinator's steering decision.
- N4 minor: R4 accepts a supplied file under any project directory in `~/.claude/projects`, not only this session's. It is read-only, id-named and contained, so the risk is low.

No blocking or major defects found. R5 is accepted as-is.

### Score and verdict

Score 8.5/10. Verdict: APPROVED. N1 and N2 are optional follow-ups.

## Review (fix round 3)

Scope: uncommitted diff, 4 files. Score 6/10. Verdict: REVISE (one major, minors; no blocking).

### Findings

- MAJOR - subagent-budget-monitor.ts:1101-1111 (+ registry `subagent-registry.service.ts:851`). The join calls `getToolCallIdByAgentId(started.taskId)`, which is global (not scoped to `session.sessionId`/parentSessionId) and falls back to the first record of ANY status (running preferred, else first match incl. completed/interrupted) when no running one exists. Scenarios: (1) a resumed agent keeps its agentId, so an old interrupted/completed record under a different key can be matched and then marked `completed`, or its workspace/taskId read; (2) the same short-hex id in another session (low probability but unguarded). Fix: after the lookup, require `record.parentSessionId === session.sessionId` (when the field exists) and `status === 'running'`; otherwise treat as no match and keep the defer path.
- MINOR - :1101-1111. Direct tool-ID lookup does take precedence (`this.registry.get(toolCallId) ? toolCallId : hook...`), so no regression for the normal case. The agent-ID join is reached only when `started.taskId` exists, so a name-based reuse cannot match. Good. But a direct-key record that exists with a different agentId is never cross-checked.
- MINOR - :1262-1267. Completing under the matched key is correct and avoids double completion for the observed case (streamed key has no record, so `registryRecord` is the hook one and exactly one update fires). Residual: the SubagentStop hook later calls update on the same hook key; `update` is idempotent for status, so no stale entry. If the matched record is an `interrupted` one during teardown, update is ignored (registry 315-327), which is acceptable.
- MINOR - session-query-executor.service.ts:289-303. Log is diagnostic only: no control-flow change, logs id + a 3-value enum, never output text. Not bounded in count (one line per error result for the rest of the run after any stop; `signalledStops` clears only at :459) and `toolUseId` is an unbounded SDK string. `content` in array-of-blocks form yields '' so cause is always `other`, which weakens the exact diagnosis wanted (denied vs interrupted). Handle text blocks, or log a one-time cap.
- TESTS: monitor spec (:511) would fail without the fix (registry.get returns null for the streamed id; agentId would be absent and the update would be keyed on the streamed id). It does not pin precedence, session scoping, stale/completed records, or the no-match defer path. Executor spec pins the `denied` classification only; interrupted/other and the no-stop-no-log guard are unpinned.

### Defect A: fixed or not?
Only the missing agent-id / identity half. The live evidence (handoff turn pushed 12.818Z, SDK interrupt sentinel 12.819Z, parent replied "stopped by user, no Ptah message present") is an ordering race between the stop-driven interrupt and the parent turn. Nothing in this diff changes ordering, delivery or consumption of the parent turn. fix-round-3.md concedes this. Do not claim Defect A fixed.

### Live re-test must prove
1. Stop signal carries the real agentId (no "missing agent id" warning) and the record is completed under the hook key, not left running.
2. The parent's FIRST reply after the stop attributes it to Ptah's budget stop and names the handoff record path, with the interrupt sentinel not preceding the parent turn (log timestamps order: turn consumed before/independent of the interrupt).
3. The new `Tool result error after subagent budget stop` line appears for the Read denial with cause (denied/interrupted/other); if cause is `other` due to block-array content, extend the classifier.
4. Two concurrent subagents in one session: only the over-budget one is stopped and completed.

## Re-review (fix round 3)

Score 8/10. Verdict: APPROVED (one minor live-test caveat). Read-only; tests not run by me (coordinator's scoped run reported green).

1. Join restriction - OK. subagent-budget-monitor.ts:1103-1113: join is attempted only when the direct lookup is empty (precedence kept), and the matched record must have `parentSessionId === session.sessionId`, `status === 'running'` and `agentId === started.taskId`; otherwise `registryRecord` is null and the existing deferred/no-signal path runs. `registry.update` uses the matched record's own `toolCallId` (:1267), so no stale or double completion.
2. Tests - OK. Spec now covers join success, direct precedence, other session, completed, interrupted (parameterised), no match, and two concurrent agents with only the over-budget one stopped and completed. These would fail against the round-3 first version (no session/status guard). Not pinned: a direct record whose agentId differs from the task id (accepted; pre-existing behaviour).
3. Log - OK. session-query-executor.service.ts:289-307: string and text-block-array content are classified, non-text parts ignored, `tool_use_id` capped at 128, only id and a 3-value cause are logged, and control flow is unchanged. Residual: still one line per error result while any stop is signalled (low volume).

New finding (MINOR): the guard compares the hook record's `parentSessionId` with the monitor's `session.sessionId` (possibly a re-bound/real id). The hook handler resolves its parent id from the SDK `input.session_id` or a captured tab id (subagent-hook-handler.ts:93-104), so the two id spaces can differ before a rebind. If they do, the join fails closed and the missing agent-id warning returns, which is safe but would hide the fix. The live re-test must show the agent id is published (no "missing agent id" warning) in the real tab-to-SDK-session case, not only in unit tests.

Defect A (parent-turn ordering vs interrupt sentinel) is still unaddressed by code; the live re-test items from the previous review stand.
