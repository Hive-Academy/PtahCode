# Batches — TASK_2026_2331_e5e2

No architecture phase (BUGFIX, Partial depth, two independently scoped defects with confirmed
root causes from research forks). Orchestrator wrote these batches directly. File-disjoint,
so Batch 1 and Batch 2 run in parallel.

## Batch 1 — Antigravity drops oversized Ptah MCP tool declarations

Status: DONE. Verified: `npm run verify -- --related -p vscode-lm-tools,acp-runtime`,
`-t lint,typecheck -p vscode-lm-tools,acp-runtime`, and the full gate
`-p vscode-lm-tools,acp-runtime` all pass (`.ptah/tmp/batch1-verify.log`). One edge case found
during verification: `ptah_route_decide`'s generated `inputSchema` alone (2,381 B) already
exceeds the 2,048 B budget before any description is counted, so compaction cannot bring it
fully under budget without touching the schema (explicitly out of scope). The guard spec and
the file comment were adjusted to document and assert this known floor instead of asserting
every tool fits. The Antigravity child-session permission-level inheritance sub-requirement
is NOT done — it depends on PR #1527 (`f963b775a`, not yet on `main`), which adds the only
`IAgentAdapter` implementations with `getPermissionLevel` (Codex's `RoutingAgentAdapter`,
Claude's `SdkAgentAdapter`); Antigravity's ACP runtime has no equivalent adapter today. Flagged
per `context.md`'s base-branch note — not blocking this PR.

Two independent kimi-code CLI lane reviews of this batch's diff found three real defects, all
fixed and reverified: (1) size counting used JS string `.length` (UTF-16 code units) against
byte-measured live-test evidence — switched to `Buffer.byteLength(value, 'utf8')` throughout;
(2) `compactToolsForAntigravity` mutated `tool.description` in place, which would have
permanently corrupted shared singleton tool definitions (e.g. `lifecycleTools` in
`lifecycle-tools.ts`, a module-level `const`) the first time an Antigravity caller triggered
compaction — fixed by returning a new array and reassigning `tools` at the `handleToolsList`
call site instead of mutating; (3) the byte-safe truncation helper could still split a UTF-16
surrogate pair, producing a lone high surrogate that encodes to the UTF-8 replacement character
— fixed by dropping a dangling high surrogate at the truncation boundary, with a regression
test (`antigravity-tool-compaction.budget.spec.ts`, "never splits a surrogate pair...") that
fails without the fix (verified by temporarily reverting it).

**Root cause (confirmed by research fork):** `handleToolsList`
(`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:586-614`)
returns every tool's full `name`/`description`/`inputSchema` to every MCP client identically.
There is no provider identity on `MCPRequest` and no size trimming anywhere in this path.
Antigravity's HTTP MCP attachment is already provider-special-cased at
`libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts:292` (`buildMcpServers`,
renames the attachment to `ptah_lane`) — this is the existing insertion point that already
knows "this connection is Antigravity" before the HTTP request reaches the MCP server.
There is a precedent size-guard pattern to mirror: `EAGER_TOOL_CHAR_BUDGET` in
`eager-tool-definitions.budget.spec.ts` (measured size + 5%, with a comment requiring a
measured reason for any increase).

**Write set (expected, confirm exact files while implementing):**
- `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts` (tag the `ptah_lane`
  HTTP attachment URL so the MCP server can identify the connection as Antigravity)
- Wherever the HTTP gate/caller resolution turns the request URL into `_caller*` fields on
  `MCPRequest` today (search `resolveMcpCaller`, `mcp-caller.ts`, and how `_callerSessionId`
  is derived from the identity URL in `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/` and `mcp-http/`) — add a new `_callerCli?: string` (or similarly named) field,
  populated only when the URL carries the Antigravity marker.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-core/types/mcp-protocol.types.ts`
  (add the new optional caller field next to the existing `_callerSessionId`,
  `_callerAgentId`, `_callerToolProfile`, `_callerCapability`, `_callerBinding`)
- `protocol-dispatcher.ts` `handleToolsList` (line 586): after `composeEffectiveToolList`,
  before `markEagerTools`/return, when `request._callerCli === 'antigravity'`, run each tool
  through a new compaction step that shortens only `description` (never `name`, never
  `inputSchema` — params are required to call the tool correctly) for any tool whose
  `name.length + description.length + JSON.stringify(inputSchema).length` exceeds a new budget
  constant. Every other caller's tool list stays byte-identical to today.
- New guard spec, sibling to `eager-tool-definitions.budget.spec.ts`, that calls
  `handleToolsList` with the Antigravity caller tag and asserts every returned tool's
  declaration size is at/under the budget constant.

**Constraints:**
- Do not change `tool-description.builder.ts` (2,491 lines) — compaction is a post-processing
  pass in `handleToolsList`, not a change to how each tool's full description is authored.
- Confirm the exact size threshold if possible (no documented constant was found in this repo
  or on this machine; the ~2.1 KB figure is only the live-test evidence). If it cannot be
  confirmed from Antigravity's own source/config, use a budget safely under 2,124 B (the
  largest confirmed-surviving tool) with a comment citing the live-test evidence and the
  uncertainty.
- Must not affect Claude, Codex, or any other provider's tool declarations.
- `Required Skills: none`.

**Verify:** `npm run verify -- --related -p vscode-lm-tools,acp-runtime` after edits, then
`npm run verify -- -t lint,typecheck -p vscode-lm-tools,acp-runtime`, then the full gate
`npm run verify -- -p vscode-lm-tools,acp-runtime` before the batch is accepted. Output to
`.ptah/tmp/batch1-verify.log`, tail/filter — never re-run only to re-read it.

## Batch 2 — Codex Manual: MCP tool approval not shown inline, times out

Status: DONE. Verified: focused jest run of `codex-chat-host-ports.spec.ts` (84/84 passed),
`npm run verify -- --related -p rpc-handlers`, `-t lint,typecheck -p rpc-handlers`, and the
full gate `-p rpc-handlers` (`.ptah/tmp/batch2-verify.log`). The full gate has one unrelated,
pre-existing failure: `plugin-rpc.handlers.session-notice.spec.ts` (an ancestor-folder-walk
assertion that depends on this machine's `/tmp` layout) — untouched by this branch's diff
against `main`, not caused by this change.

**Root cause (confirmed by research fork):**
`libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-approval-presentation.ts:138-139`:
```
const tabId = ports.tabId(sessionId);
const routable = TabId.safeParse(tabId) !== null;
```
`ports.tabId` (`apps/ptah-electron/src/di/codex-session-binding.ts:53-54`) is
`tabs.get(id) ?? lifecycle().find(id)?.tabId ?? id`. When the session is tracked by the native
`lifecycle()` path (not the `tabs` Map) and that entry's `tabId` is empty/non-UUID, `??` does
not fall through to `id` (empty string is not nullish), so `tabId` ends up non-UUID even though
`sessionId` itself is a real, valid, webview-backed chat session. `routable` then goes false,
the request is pushed to `publishLifecycle(... routable: false ...)` (the notifications-only
surface, not the inline chat card), and `UNROUTABLE_PERMISSION_TIMEOUT_MS` (60_000 ms,
`libs/backend/agent-sdk/src/lib/system-abort-permission-message.ts`) applies — matching the
observed ~1-minute timeout.

Claude's equivalent `classifyPermissionRoute`
(`libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:1352-1367`) treats a request as
routable when **either** `sessionId` or `tabId` is a valid UUID — the asymmetry (Codex only
checks the derived `tabId`) is the bug.

**Fix:**
- In `codex-chat-approval-presentation.ts`, change the import of `SessionId` from
  `@ptah-extension/shared` from `type SessionId` (type-only) to a plain value import
  (`SessionId` is both the branded type and a smart-constructor object exporting
  `SessionId.safeParse`, same module, same pattern already used for `TabId.safeParse`).
- Change line 139 to:
  `const routable = TabId.safeParse(tabId) !== null || SessionId.safeParse(sessionId) !== null;`
- Keep every other line (the `unroutable` entry fields, the payload shape, the timer) as-is —
  they already key off `routable`.

**Test:** Add a case to
`libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-approval-presentation.spec.ts`
using the existing `harness(tab, expiresAt)` helper: call `harness('')` (or another non-UUID
`tab` value distinct from `sessionId`, simulating the empty/non-UUID `lifecycle().tabId` case)
and assert the broadcast `PERMISSION_REQUEST` payload includes `sessionId` and has no
`timeoutAt` bound by `UNROUTABLE_PERMISSION_TIMEOUT_MS` within the test's `expiresAt`-less
default window (i.e. it takes the routable branch, matching the existing
'denies a routable card ...' test's assertions style, not the unroutable
'denies an unanswered card at 60 seconds' assertions). Do not remove or weaken the existing
unroutable-path test — it still must pass for a request with neither a parseable `tabId` nor
(construct a request scenario, if one is reachable in this file, where `sessionId` could not
safeParse — if none is reachable given `SessionId.from` is required to build the harness
`sessionId`, state in the PR that the truly-unroutable branch is now effectively unreachable
from a real chat session, which is correct per the root cause, and keep the existing 60s test
only to prove the fallback branch's mechanics still work when forced).

**Constraints:** `Required Skills: none`. Single file + spec change, no other provider path
touched (Claude's `sdk-permission-handler.ts` is read-only reference, not edited).

**Verify:** `npm run verify -- --related -p rpc-handlers` after edits, then
`npm run verify -- -t lint,typecheck -p rpc-handlers`, then the full gate
`npm run verify -- -p rpc-handlers` before the batch is accepted. Output to
`.ptah/tmp/batch2-verify.log`, tail/filter.

## After both batches: review + tests + completion
- One independent code-logic review on the combined diff (kimi code CLI lane, ptahCliId
  pc-7594dcab-a859-41a0-8e8b-e8df5dba7d25; fallback Ollama Code pc-f3384f72-a556-4ab4-b2b1-7e1e028f22cb
  if rate-limited).
- Live-test matrix (Electron dev build) per the task brief, recorded in a new
  `live-test-results.md` in this task folder.
- Final PR review per Lean orchestration rule 5 before first push.
