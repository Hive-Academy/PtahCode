# Subagent budget stop path: implementation plan

## Defect matrix

| # | Status | Evidence (file:line) | Root cause |
|---|---|---|---|
| 1 | RUNTIME-OWNED attribution; CONFIRMED Ptah reason gap | subagent-message-dispatcher.ts:269-291; subagent-budget-monitor.ts:963-975 | Ptah calls SDK Query.stopTask(taskId) without a reason argument. SDK emits killed/stopped by user; Ptah cannot change that notification. |
| 2 | CONFIRMED | subagent-budget-monitor.ts:474-500,504-538; subagent-notice-queue.ts:24-36 | Warning is only evaluated when no stop reason exists. A measurement jumping from below 85% to >=100% skips it. warnedAgentId is one-shot and not rearmed on resume. |
| 3 | CONFIRMED | subagent-budget-monitor.ts:776-808,1065-1113; subagent-handoff-message.ts:98-126 | Monitor retains original task and checks optional notes, but does not capture rolling progress. |
| 4 | CONFIRMED Ptah advice defect; RUNTIME-OWNED rejection wording | chat-subagent-context-injector.service.ts:196-228,378-406; subagent-budget-monitor.ts:565-581 | Missing snapshot defaults to stopped=false and warm agent gets resume advice. SDK rejects resume of a stopped agent. |
| 5 | CONFIRMED missing guard | subagent-resume-advice.ts:23-35; subagent-rpc.handlers.ts:425 | Advice permits 85-99% context; direct SendMessage has no budget gate. |
| 6 | RUNTIME-OWNED canned refusal; Ptah trigger UNPROVEN | sdk-permission-handler.ts:539-560,1082-1121,1321-1384; permission-tool-classifier.ts:13-30; subagent-stop-hook-handler.ts:60-64,142-152 | The canned wording is SDK behavior on interrupt=true. Read auto-allows in Ptah and SubagentStop hook always continues. Incident and live run prove symptom but do not identify which callback, hook or SDK state denied the reads. |

## Fix design

### 1. Attribution

In subagent-budget-monitor.ts stop(), persist a typed budget stop reason, agent/task IDs, record path and usage before stopTask. Keep subagent-stop-notices.ts and subagent-handoff-message.ts as parent-facing attribution: explicitly say Ptah stopped it and the user did not. Deliver through the next parent result or prompt when immediate delivery fails. No SDK stop reason parameter exists at subagent-message-dispatcher.ts:291; do not claim the SDK status can be changed. Pin ordering and failed-delivery fallback in subagent-budget-monitor.spec.ts.

### 2. Threshold and resume

In subagent-budget-monitor.ts observe(), evaluate context >= 0.85 * handoffTokens before stop selection, including samples already beyond 100%. Replace lifetime warnedAgentId with a per-running-invocation marker cleared on resume. The SubagentNoticeQueue only drains at the subagent's next tool result, so if the stop follows in the same sample, the stop/handoff must carry the progress instruction and observed progress; do not wait for another tool call. If agent ID or workspace is missing, keep warning unfulfilled and retry when possible. Pin below-to-86%, below-to-124%, repeated sample, resumed-above-85%, absent ID and stop withdrawal.

### 3. Progress fallback

Extend subagent-budget-monitor.ts per-agent state with bounded last assistant text, distinct file targets from Write/Edit/NotebookEdit tool calls, last N tool names/targets/outcomes, and a JSONL path when known. Validate tool input shapes and transcript path inside the workspace; never persist full inputs or outputs, which may contain secrets. subagent-stop-hook-handler.ts:138 provides last_assistant_message but may run after record creation, so use it only as a supplement. Add a structured progress argument to subagent-handoff-message.ts handoffMessage(), always rendering observed progress when notes are absent. Truncate explicitly. On parse failure write the remaining record; preserve existing record-write failure behavior. Pin redaction, bounds, missing notes, path validation and call order in specs.

### 4. Resume advice

In chat-subagent-context-injector.service.ts adviseResume(), join interrupted agents to durable Ptah budget-stop identity by agent/task ID; do not depend solely on getSnapshot(sessionId, toolCallId), which may be absent after a rekey/restart. For budget-stopped agents emit fresh advice and point to the record, never warm-resume instructions. If stop status is unknown, avoid asserting context within budget. Persist stop metadata through the existing handoff record/index. Pin completion, reload, rekey and warm cache in injector specs. The SDK owns the exact 'won't be resumed' rejection text.

### 5. Near-limit resume

Change subagent-resume-advice.ts adviseSubagentResume() to choose fresh at >=85% and explain the budget. In subagent-rpc.handlers.ts SendMessage, check the target's latest monitor snapshot before forwarding; at >=85%, refuse with current tokens, limit, handoff path and fresh-agent guidance. Unknown usage remains allowed without fabricated estimate. Pin 84.9%, 85%, 100%, missing usage, direct RPC allow/refuse.

### 6. Parent permissions

Instrument sdk-permission-handler.ts createCallback/requestUserPermission/handleResponse with parent session, tab, toolUseID, tool, route, decision source and interrupt flag; add stop/parent-turn correlation in session-query-executor.service.ts. Log no payload or secret. Reproduce stop concurrent with parent Read and Bash, then determine whether stopTask aborts the parent's signal, a pending approval resolves as hard deny, AskUserQuestion remains pending, permission level changes, or SDK PreToolUse denies. Read is in SAFE_TOOLS at permission-tool-classifier.ts:13-30; a Read rejection without Ptah callback implicates SDK runtime. Keep systemAbort=true and interrupt=false for Ptah system teardown as sdk-permission-handler.ts:1082-1106 already requires. Fix only the correlated branch and add a regression spec. If SDK denies without calling Ptah's gate, file a minimal SDK reproduction and retain a recoverable parent handoff notice.

## Batches

File ownership is disjoint; agree shared contract before parallel work.

| Batch | Owned files | Specs |
|---|---|---|
| A monitor | libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts; subagent-budget-monitor.spec.ts | Warning crossing/rearm, bounded progress, stop ordering, failed record |
| B record | libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-handoff-message.ts and spec; subagent-handoff-record.ts and spec; subagent-handoff-index.ts and spec | Progress rendering, reason, record pointer, reload, path/size limits |
| C resume | libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-resume-advice.ts; libs/backend/rpc-handlers/src/lib/chat/session/chat-subagent-context-injector.service.ts and spec; libs/backend/rpc-handlers/src/lib/handlers/subagent-rpc.handlers.ts and spec | Stopped warm agent, near-limit SendMessage, unknown usage |
| D permission | libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts and spec; libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts and spec | Correlated stop plus parent Read/Bash, actual denial regression |

Existing register.ts wiring, SubagentNoticeQueue and SubagentStopHookHandler need no speculative edits; allocate any proven contract change to one batch before implementation.

## Test plan

- Run focused unit specs for each batch with fake SDK query/stream and filesystem. Verify parent never receives a fabricated user decision from Ptah.
- Repeat the Ptah Dev Electron Haiku scenario at 25,000 context tokens. Drive a single request from below 21,250 to above 25,000. Inspect warning/stop logs, task notification, task file, handoff record, optional notes, and immediate parent Read/Bash. The record must hold last assistant text, touched files, bounded calls, and JSONL path when known. Parent should start a fresh agent from the record. Repeat resumed agent at 85-99% and direct SendMessage near the limit. Capture callback/hook correlation if reads are declined.
- No tests, builds, dev runs or checks were run in this analysis.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Use Ptah-owned stop metadata/notice | Sidecar explanation or SDK status mutation | stopTask has no reason parameter (subagent-message-dispatcher.ts:269-291) | Yes |
| Treat >=85% as fresh for resume | Warn and permit or refuse with guidance | First resumed request may cross hard limit; existing helper rejects only >=100% (subagent-resume-advice.ts:23-35) | Yes |
| Capture bounded observed progress | Require notes or provide fallback | Notes optional (subagent-handoff-files.ts:101-115); live run had none | Yes |
| Preserve permission policy pending trace | Broaden allowlist or correlate exact denial | Read auto-allows (sdk-permission-handler.ts:539-560); SDK canned string described at :1082-1086 | Yes |

## Clarifications Needed

None for planning. Precise parent denial requires a correlated runtime trace, not a user policy choice.

## Risks

- Claude SDK may continue reporting killed/stopped by user despite Ptah's separate reason; a true status change requires SDK support.
- SDK messages may omit usage, transcript path or file targets; handoff must state unknown fields honestly.
- Tool inputs may contain secrets or large payloads; store only bounded names/paths/outcomes.
- Parent permission failure may be an SDK race. Current evidence does not justify a blind permission change.
