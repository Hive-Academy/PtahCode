# Fix-round F3: vscode-lm-tools (logic M2, M3, M4/#1469; style S1, S2, S3)

Write set: `libs/backend/vscode-lm-tools` only. Nothing committed. `batches.md` and `task.md` were not edited.

## Files

- CREATED `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/gateway-tool-bridge.ts` (344 lines). This is the gateway bridge moved out of the dispatcher: the scope, the name cache (`WeakMap` state), list, call, `hostToolNames`, and the new phase re-check and result budget.
- MODIFIED `mcp-core/protocol-dispatcher.ts`. The bridge is gone. Two small context builders (`gatewayBridgeContext`, `gatewayCallContext`) pass capability, the warn observer and `budgetToolText` to the bridge. The file is 4984 lines: 5182 before F3, 4930 on main.
- MODIFIED `mcp-core/mcp-caller-policy.ts`. The local `isGatewayCallerPermitted` copy is deleted.
- MODIFIED `mcp-core/mcp-caller-policy.spec.ts`. The duplicate matrix test is removed, because the platform-core spec from F1 owns it.
- MODIFIED `mcp-core/protocol-dispatcher.spec.ts`. Added an M2 spec and two M3 specs to the existing gateway block.
- MODIFIED `mcp-http/ptah-mcp-slots.ts`. `planPtahMcpSlots` plans no workspace slot for a linked-worktree root.
- MODIFIED `mcp-http/ptah-mcp-slots.spec.ts`. Added 3 specs that use a real git worktree layout on disk.
- MODIFIED `mcp-http/http-mcp-server.service.ts`. Added the `'linked-worktree'` failure reason and set the active-root and retain outcomes for a linked worktree.
- MODIFIED `mcp-http/http-mcp-server.service.spec.ts`. Added 4 specs. `isLinkedWorktreeRoot` is mocked with no I/O.

## Findings → fix → test

### M4 / #1469: live slot writer in linked worktrees
- **Fix:** `planPtahMcpSlots` runs `isLinkedWorktreeRoot` (`@ptah-extension/harness-sync` barrel, async; the sync form is not exported from the barrel) on every root once, and skips **workspace-scoped** specs for linked roots. That covers `.mcp.json`, `.cursor/mcp.json` and `.codex/config.toml`.
  - Both `desiredSlots` (full reconcile, stop) and `registerRootSlots` (retainRoot) go through this planner. A linked root therefore never gets a slot and never gets an entry in `registrations`.
  - So nothing is written, updated or unregistered there, and `writeFacetEntry` / `writeMcpJsonEntry` never run, so no `.bak` is written either.
  - Home-scoped slots, such as the Codex home entry for an untrusted root, are still planned over all roots, as before. The main checkout keeps its slots.
- **Outcomes:**
  - `retainRoot(linkedRoot)` returns `{registered:false, reason:'linked-worktree'}`. The retention is dropped. The child session starts and reports subagent Ptah tools as `unavailable` (`session-spawner.service.ts:1050-1072`).
  - `ensureRegisteredForSubagents()` returns `{registered:true}` when the active root is a linked worktree. See Decisions.
- **Spawn-time confirmation (every lane already gets `ptah`):**
  - CLI lanes build `ptah` into their spawn config through `ptahMcpServerUrl`. This covers Codex (`codex-lane-config.builder.ts`, `codex-lane-profile.ts`), Copilot (`copilot-sdk.adapter.ts`), Cursor (`cursor-cli.adapter.ts`), opencode (`opencode-cli.adapter.ts`), Antigravity (`antigravity-cli.adapter.ts`), the generic attachments (`provider-session/lane-mcp-attachments.ts`) and ptah-cli (`ptah-cli-spawn-options.service.ts`).
  - Claude sessions get `ptah` per session in `sdk-query-options-builder.ts:2470`. chat-session notes at `chat-session.service.ts:1236-1238` that this config "does not read `.mcp.json`".
  - The one consumer that loses it in a worktree is Claude `Task` subagents, which read `<cwd>/.mcp.json`. This follows from decision 14 / the brief, and the new reason says so.
- **Tests:**
  - `ptah-mcp-slots.spec.ts › linked git worktrees (#1469)`: no workspace slot for the worktree even with cursor+codex installed and trusted; the main checkout keeps claude, cursor and codex slots; the untrusted worktree still gets the home Codex slot.
  - `http-mcp-server.service.spec.ts › linked git worktrees (#1469)`:
    - retain writes nothing and no `.bak`, and a later reconcile writes nothing there;
    - an existing worktree `.mcp.json` stays byte-identical through retain, release and stop;
    - an active linked workspace reports registered with no write;
    - the main checkout is still written beside an open worktree.

### M2: cached gateway names across callers
- **Fix:** `routeGatewayCall` now runs `isGatewayPhaseDenied(name, binding)` on every call, after the caller-policy and capability checks and **before** the name cache. A malformed phase list (fail-closed: every gateway name) or a listed `disallowedTools` name gets `MCP_CALLER_FORBIDDEN_CODE` / `MCP_TOOL_DENIED_MESSAGE`. The caller-policy check was already per call.
- **Profile:** the tool profile adds no gateway rule. Only `APPS_ONLY_TOOL_NAMES` differ by profile, these are host names, and host names never route to the gateway. The list path does not filter gateway tools by profile either, so list and call agree.
- **Test:** `re-checks the caller phase on every call, whatever another caller listed (M2)`:
  - lane A, with no phase, lists, which caches `zernio__create_post`;
  - lane B has the same scope key and a malformed phase; its call is forbidden and `callTool` is not called;
  - lane A can still call the tool.

### M3: gateway results skip the result budget
- **Mechanism reused:** the dispatcher's own `budgetToolText` (`applyToolResultBudget` with the fast path), under the gateway tool's name. That name has no override, so the default budget applies: 2000 tokens / 8000 chars. Over-budget text is spooled to `<spoolRoot>/.ptah/tmp/mcp-out/`, as for host tools. The dispatcher passes it in as `budgetText`.
- **Rule (bridge `budgetGatewayResult`):**
  - The text items, joined with `\n`, are budgeted. With no text item, the `structuredContent` JSON is budgeted instead.
  - Unchanged text means the result passes through unchanged. The existing passthrough test still holds.
  - Over the budget, the result gets one budgeted text item first, then the non-text items (such as images) in their order. `structuredContent` is dropped, because it would carry the same unbounded payload. `isError`, `_meta` and other fields are kept.
- **Tests:**
  - `cuts an over-budget gateway result to the default budget and spools it`: text ≤ 8000 chars, the image is kept, `structuredContent` is gone, `_meta` is kept, and the spool directory is not empty.
  - `budgets structuredContent when the result has no text item`.

### S3: bridge out of the dispatcher
- The code moved verbatim: `MAX_GATEWAY_SCOPES`, `gatewayNamesByScope` WeakMap, scope, key, phase filter, list, remember, list-for-list, route. Its only new behaviour is M2 and M3.
- `hostToolNames` (and its lazy set) moved into the bridge. The dispatcher's telemetry imports it.
- Log text and the `degradation-audit` markers are unchanged. The `callTool` catch also gets a `reported` marker.
- The gateway specs stay in `protocol-dispatcher.spec.ts`. They run end to end through `handleMCPRequest` and use that file's `buildDeps` / `makeRequest` helpers, so splitting them would have meant copying those fixtures.

### S1 / S2
- **S1:** the bridge imports `isGatewayCallerPermitted` and `gatewayScopeFromBinding` from `@ptah-extension/platform-core`. `gatewayScopeOf` now just applies the guard and calls `gatewayScopeFromBinding(binding)`; the field-copy literal is gone.
- **S2:** code this task added in vscode-lm-tools has no `mcp__ptah__` literal (grep over non-spec sources returns nothing), so nothing was changed.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| `ensureRegisteredForSubagents()` returns `registered:true` when the active root is a linked worktree | (a) `true`, keeping the session's own `ptah`; (b) `false` + `linked-worktree`, which makes `chat:start` set `mcpServerRunning=false` and start the whole session without MCP (`chat-session.service.ts:1244-1249`) | (b) would remove `ptah` from main sessions in a worktree workspace. The session config never reads `.mcp.json`. The `registered` doc is updated to say this. | Yes. Follow-up below. |
| Guard in `planPtahMcpSlots`, not in `registerInSlot` | Planner skip vs. a write-time check | One choke point for reconcile, retain, release and stop. With no slot there is no registration, so no unregister or delete can ever target the file. | Yes |
| Budget text items together; drop `structuredContent` only when the text was cut | Budget per item; budget structured as well | Matches how host tools return one budgeted text item. Within-budget results stay byte-identical. | Yes |

## Out-of-scope observations / follow-ups

- **rpc-handlers (not in write set):** a cleaner contract is for `chat-session.service.ts` to treat `reason === 'linked-worktree'` like `'timeout'` (keep session MCP). Then `ensureRegisteredForSubagents` could return `false` + `linked-worktree` instead of `true`.
- A gateway result whose text is small but whose `structuredContent` is huge still passes `structuredContent` through. Only text-less results budget it.
- `http-mcp-server.service.ts` and two of the specs were already not Prettier-clean at HEAD. Lint-staged formats them at commit, and I did not reformat them here.

## Checks run

- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.spec.json`: exit 0.
- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath` with:
  - `protocol-dispatcher.spec.ts`, `mcp-caller-policy.spec.ts`, `protocol-dispatcher.surface.spec.ts`, `retired-ptah-mcp-slots.spec.ts`: 492/493 passed. The one failure is the known D15 symlink EPERM (`.ptah/tmp/f3-jest5.log`).
  - `http-mcp-server.service.spec.ts`, `http-mcp-server.service.concurrency.spec.ts`, `ptah-mcp-slots.spec.ts`: 130/130 (`.ptah/tmp/f3-jest3.log`).
  - 17 related dispatcher, transport and DI specs (agent-spawn-*, contract sweep, effective-tool-list, export-disclosure, index.barrel, language coverage, server-instructions, tool-result-budget, phase-filter, http-server.handler, di/register, ...): 563/563 (`.ptah/tmp/f3-jest4.log`).
- `npx eslint` on the 9 changed files: 0 errors, 81 warnings. The quoted warnings are in code that is not new (for example `http-mcp-server.service.ts:1015-1045`).
- `npx prettier --write` on the files that were Prettier-clean at HEAD (dispatcher, its spec, `ptah-mcp-slots.ts`, the bridge).
- Not run: `npm run verify`, nx targets and the degradation-audit target. They are not in the focused-check list for this batch. Every new catch has a marker.
