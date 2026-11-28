# Live-test results — TASK_2026_2331_e5e2

Electron dev build, workspace `/home/amun/ptah-yolo-test`, CDP helpers in
`/home/amun/ptah-yolo-test/.ptah-cdp-helpers/`.

## Defect 2 — Codex Manual: MCP tool approval not shown inline, times out

**First pass (code as handed off from the prior session, before this session's fix):**
Codex Manual, fresh top-level session, prompt "Call ptah_session_start now with label
defect2-codex-manual-test". Result: reproduced the original bug exactly — "The session start
request timed out awaiting permission. I won't retry it." after 1:07 (~67s), and the approval
("Allow the ptah MCP server to run tool \"ptah_session_start\"?") was visible only in the
notifications panel ("1 needs your response"), never inline in the chat.

Reading the code turned up a defect the earlier root-cause research had missed: in
`codex-chat-approval-presentation.ts`, the 60-second `UNROUTABLE_PERMISSION_TIMEOUT_MS` auto-decline
timer was applied **unconditionally**, regardless of the `routable` flag the batch 2 fix computes.
Claude's equivalent (`sdk-permission-handler.ts` `classifyPermissionRoute`) only sets a deny window
for an unroutable or CLI-agent-routed request; an owned chat session gets `denyWindowMs: undefined`
(`timeoutAt: 0`, the UI's established "No timeout" sentinel). The existing regression test for this
file had been written to assert the old (buggy) 60s-always behavior, not the target behavior. The
kimi-code review lane (spawned independently, in parallel) found the identical defect at the same
lines before this was reported back, corroborating it.

**Fix:** a routable card now waits indefinitely unless Codex's own `expiresAt` supplies a native
deadline (clamped to Node's ~24.8-day 32-bit `setTimeout` limit, `MAX_TIMER_DELAY_MS`, matching the
pattern already used in `subagent-budget-monitor.ts` / `task-end-run-worker.ts`). Unroutable requests
keep their existing 60s safety net. Updated the affected tests to match, and changed the
`codex-chat-host-ports.spec.ts` `request()` helper's default `expiresAt` to `'absent'` (most calls
don't care about it) so that a test which never resolves its prompt no longer leaves a real,
multi-day `setTimeout` dangling — this was causing `npx jest` to hang for several minutes after
reporting results, since nothing forces an exit.

**Second pass (after the fix, same build rebuilt via `nx build-main`):** same prompt, fresh Codex
Manual session. Result: `ptah_session_start` completed successfully — "Worked for 2m 36s", "Started
`defect2-codex-manual-test`", child worktree created, no timeout message, notifications panel back
to "0 need your response". The main-process log shows the child session config
(`permissionLevel: "ask"`, matching the parent's Manual mode via PR #1527's existing mechanism) and
no `timed out` log line for the approval. This confirms the timeout defect is fixed; the session no
longer dies at ~60s.

Not independently re-confirmed in this pass: whether the approval card itself rendered inline in the
chat transcript at the moment of the request (the screenshot cadence used did not catch that exact
instant, since this time the whole turn completed before the next capture). The absence of a stuck
notification and the successful completion together are strong evidence the routable path was taken,
but a closer live observation of the inline card's exact appearance would be a good follow-up check.

## Defect 1 — Antigravity drops oversized Ptah MCP tool declarations

Not live-tested against a real `agy` (Antigravity CLI) session in this pass — that requires a
separate CLI session setup this session did not have time to complete after the Defect 2
investigation above. The fix is covered by:
- `antigravity-tool-compaction.budget.spec.ts`: every tool returned to an Antigravity-tagged caller
  is at or under the 2,048-byte budget, or (for the one tool whose `inputSchema` alone already
  exceeds it, `ptah_route_decide`) has its description reduced to empty — and a non-Antigravity
  caller's tool list is provably unaffected.
- The full `vscode-lm-tools` and `acp-runtime` project test suites, lint and typecheck.

Two real defects were found by the kimi-code review lane after this was first marked done, and
fixed in this session:
1. **Byte vs. character counting** — the original implementation used JS string `.length` (UTF-16
   code units) against byte-measured evidence from the live Antigravity test. Fixed with
   `Buffer.byteLength(value, 'utf8')` throughout, including a byte-safe truncation helper that never
   splits a multi-byte character.
2. **Shared-object mutation** — `compactToolsForAntigravity` mutated `tool.description` in place.
   Some tool definitions (the lifecycle tools, `lifecycleTools.map((tool) => tool.definition)` in
   `effective-tool-list.ts`) are module-level singletons shared by every caller and every future
   request; mutating one in place would have permanently shortened that tool's description for every
   other provider too, the first time an Antigravity caller triggered compaction. Fixed by making
   `compactToolsForAntigravity` return a new array (unaffected tools pass through by reference,
   over-budget tools get a shallow copy), and reassigning `tools` at the `handleToolsList` call site
   instead of relying on in-place mutation.

Recommended follow-up: a live `agy` session confirming the actual tool list it now downloads to
`~/.gemini/antigravity-cli/mcp/ptah_lane/*.json` includes the previously-dropped tools.

A second, focused kimi-code review round (requested after the timeout and compaction fixes
above landed) found one more real issue: the byte-safe truncation helper could still split a
UTF-16 surrogate pair at the exact byte boundary where a lone high surrogate's UTF-8 replacement
encoding (3 bytes) happens to fit the remaining budget but the real multi-byte character does
not. Fixed by dropping a dangling high surrogate at the truncation boundary; added a unit test
that fails without the fix (confirmed by temporarily reverting it and re-running).

## Antigravity child-session permission inheritance

Not addressed in this task — see `batches.md` Batch 1: it depends on PR #1527 (`f963b775a`,
`RoutingAgentAdapter.getPermissionLevel` / `SessionSpawnerService.callerPermissionLevel`), which is
not merged to `main` yet and has no Antigravity-side equivalent today. Flagged, not blocking.

## Full Full Auto × Manual × Antigravity × Codex test matrix

Not fully completed. Confirmed: Codex Manual (parent approval no longer times out; child starts at
the parent's `ask` level per the existing #1527 mechanism). Not confirmed in this pass: Codex Full
Auto child-is-yolo-with-no-cards (a quick look at an already-running child's composer showed "Full
Auto (YOLO)" as its mode label while the main-process log for that same child recorded
`permissionLevel: "ask"` — this discrepancy was not investigated further and may be worth a
dedicated follow-up, though it looks like a UI default-selector label rather than an enforcement gap
given the log's authoritative value); and the Antigravity side of the matrix (both modes) was not
live-tested at all in this pass, for the reasons above.
