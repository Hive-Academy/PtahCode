# CodeRabbit findings on PR #998

All source changes are uncommitted. This report covers the five CodeRabbit findings and the added live-test regression.

## 1. Kept lane handoff loses permission

**Confirmed.** In `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts:1965-1970`, a request belongs to a lane only if its parent and generation match. The previous `reparentAgents` queue filter at line 2424 ran after replacing the lane parent, so it removed a valid pending request. The backend pending snapshot also held the original parent: `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:1454-1471`. The response RPC at lines 1399-1422 accepts a request ID, so the renderer's current-owner check matters.

**Change.** `agent-monitor.store.ts:2419-2425` now validates queued requests against the lane before the move and restamps them to the successor; lines 2446-2450 request replay for an event crossing the handoff. `agent-rpc.handlers.ts:1466-1471` returns pending SDK/Copilot requests with the live lane's parent only when the lane is running and its generation matches. Regression tests in `agent-monitor.store.spec.ts` cover retention, successor action, stale old-owner rejection, and replay; `agent-rpc.handlers.spec.ts` covers the current owner and generation mismatch. The old session has no card after reparent and a different lane generation cannot claim the request. Both focused specs passed; the first RPC run exposed an optional-field type error in the test fixture, which was fixed before the passing rerun.

**PR reply:** Confirmed and fixed the kept-lane handoff. A queued permission is validated against its previous owner before it moves to the successor, and the pending-permissions replay uses the backend lane's current owner and generation. This keeps the successor's card actionable while rejecting stale old-owner events. Tests cover the handoff, replay, and stale-owner cases.

## 2. Copilot marks an undelivered prompt delivered

**Confirmed.** `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts:578-586` previously used `broadcastMessage`, whose settled promise did not mean a renderer received the prompt, before calling `markDelivered`. That selected the bridge's 10-minute answer window instead of its 60-second non-delivery window.

**Change.** `agent-events.ts:91,578-605` now uses the existing `sendMessage('ptah.main', ...)` boolean delivery contract. It marks delivered only on `true`; false or rejection denies and clears the pending request. `agent-events.spec.ts:51` adds a false-delivery regression and updates the success and rejection mocks. The focused spec passed.

**PR reply:** Confirmed and fixed. Copilot permission forwarding now uses the targeted send's delivery result. It marks the prompt delivered only when the renderer accepts it; a false result or failed send denies and clears the pending permission. A regression test covers the false result.

## 3. Seeded lane ID outruns lane registration

**Confirmed.** In `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:845`, a seeded ID bypasses the attachment poll. `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:391` previously looked up the owner once and denied if `spawnFromSdkHandle` had not yet recorded the lane.

**Change.** `sdk-permission-handler.ts:391-400` retries a missing owner for at most 500 ms at 25 ms intervals, stopping when the pending request has settled. An already registered owner routes immediately. `sdk-permission-handler.spec.ts:206` covers a record appearing on the second lookup; the existing missing-owner test covers bounded denial. The focused spec passed.

**PR reply:** Confirmed and fixed the seeded-ID race. The SDK permission route now waits briefly for its lane record, up to 500 ms, before denying an unavailable owner. A test covers late registration, and the existing absent-owner test continues to cover denial after the bound.

## 4. Codex timeout reason says no human saw a routable prompt

**Confirmed.** `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-approval-presentation.ts:143` distinguishes a routable tab, but its timer at line 157 previously used `buildSystemAbortPermissionMessage` for every timeout. That message says no human saw the prompt. The new routable-timeout assertion in `codex-chat-approval-presentation.spec.ts` failed against the original code (1 failed, 5 passed).

**Change.** The timer in `codex-chat-approval-presentation.ts:157` now uses the system-abort text only when `current.unroutable`; a routable prompt says the UI did not answer before the timeout. The focused command `npm run verify -- -t test -p @ptah-extension/rpc-handlers -- --testPathPatterns=codex-chat-approval-presentation.spec.ts` passed after the change.

**PR reply:** Confirmed and fixed. Routable Codex prompts now decline with a reason that says the UI did not answer before the deadline. The no-human-saw-this-prompt reason remains limited to unroutable prompts. I added a regression assertion for the routable deadline.

## 5. Attention bell offers disallowed always-allow action

**Confirmed.** `libs/frontend/chat/src/lib/services/chat-attention-source.service.ts:196-203` built `always_allow` for every permission item, independent of `canAlwaysAllow`. This disagreed with the card's capability check.

**Change.** Line 199 now requires a session ID and `request.canAlwaysAllow !== false`. `chat-attention-source.service.spec.ts:106-119` covers false, true, and a missing session. The focused spec passed.

**PR reply:** Confirmed and fixed. The attention bell now offers “Always allow in session” only when the request has a session and `canAlwaysAllow` permits it, matching the permission card. Tests cover disallowed, allowed, and sessionless requests.

## 6. Always in session prompts again after the SDK session ID changes

**Confirmed.** The live report's scenario E shows one Bash approval followed by another Bash prompt in the same chat. The log records the same tab ID (`68aaf1fc-...`) and different SDK session IDs (`3a727add-...`, then `95766145-...`). In this branch, `permission-rule-store.ts:24-34` indexes a tool rule by session ID and tool name. `sdk-permission-handler.ts:522-527` prefers the live SDK ID; its prior lookup at line 729 and storage around line 1273 used that ID. The query builder at `sdk-query-options-builder.ts:1264-1288` supplies the stable tab ID and a live SDK ID resolver; `session-registry.service.ts:75-79` documents that the tab ID remains fixed while the SDK ID becomes available or changes. The main checkout's rule store indexes only tool name, and its handler looks up/stores by tool name (`sdk-permission-handler.ts:689,1217`): Bash approval there was tool-wide, independent of command text, but lacked per-chat scope. The new regression test failed before the fix at the second-call prompt assertion (expected one prompt, received two; 62 other tests passed).

**Change.** `sdk-permission-handler.ts:486-488` selects the stable tab ID as the rule scope when a session exists, falling back to the SDK session ID for callers without a tab. Lookup at lines 733-737, storage at lines 1266-1294, and sibling resolution at line 1310 use that same scope. A sessionless request still grants once without storing a rule. `sdk-permission-handler.spec.ts:310-357` tests two different Bash commands across initial SDK ID resolution and another rotation, then verifies a second chat still prompts. The focused test passed after the fix. No PR reply was requested for this item.

## Verification

Focused commands, all using `npm run verify`:

- `-t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=agent-events.spec.ts`: passed.
- `-t test -p @ptah-extension/agent-sdk -- --testPathPatterns=sdk-permission-handler.spec.ts`: passed.
- `-t test -p @ptah-extension/chat-streaming -- --testPathPatterns=agent-monitor.store.spec.ts`: passed.
- `-t test -p @ptah-extension/chat -- --testPathPatterns=chat-attention-source.service.spec.ts`: passed.
- `-t test -p @ptah-extension/rpc-handlers -- --testPathPatterns=agent-rpc.handlers.spec.ts`: first run failed TypeScript at test lines 380 and 393; the fixture was fixed and the rerun passed.
- `-t test -p @ptah-extension/rpc-handlers -- --testPathPatterns=codex-chat-approval-presentation.spec.ts`: failed on the new assertion before the fix (1 failed, 5 passed), then passed after it.

The added item 6 focused `agent-sdk` spec failed before the fix (1 failed, 62 passed) and passed after the fix. An earlier combined run passed all 10 lint/typecheck tasks; its full test stage was interrupted when item 6 expanded the scope. The final combined command `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/chat-streaming,@ptah-extension/chat,@ptah-extension/agent-sdk` was started after the item 6 fix; its result is recorded below. `ptah_get_diagnostics` was attempted after edits but timed out during TypeScript checking; the combined verifier is the typecheck gate. Skill discovery showed no skill-loading tool in this lane. The Codex and item 6 regressions were run against pre-fix source; the other regressions were derived from the code paths and passed after fixes.

**Final combined result:** lint/typecheck passed all 10 tasks. The full test phase passed four project targets; `@ptah-extension/agent-sdk:test` failed only in two known Windows-only PluginLoader tests that call `fs.symlinkSync` and receive `EPERM` (`plugin-loader.service.session-notice.spec.ts:220`, `plugin-loader.service.capabilities.spec.ts:324`). The agent-sdk target otherwise reported 223 passing suites and 5,541 passing tests; its focused permission-handler spec passed separately. The verifier exited 1 because of those two symlink failures. Full failure log: `C:\Users\abdal\.nx\d60e02896ae18ad9\cache\terminalOutputs\5843375073968051939`.

## Decisions

- Handoff: validate pending requests against the old lane, then restamp to the successor; replay uses the backend's current owner and matching generation. This follows the existing renderer owner validation and avoids accepting a stale owner. Reversible.
- Copilot delivery: use the existing targeted send's boolean result to drive `markDelivered`. Reversible.
- Seeded owner: wait up to 500 ms for registration, then deny. The SDK callback already waits for lane ID attachment and this interval covers the remaining tracking race. Reversible.
- Session rule scope: use the tab ID where available because it is the stable chat identity across SDK session rotations; use the SDK ID for callers without a tab. This preserves tool-wide Bash matching within one chat and keeps other chats separate. Reversible.
