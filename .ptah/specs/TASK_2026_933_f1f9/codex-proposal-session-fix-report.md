# Codex harness proposal: caller session fix

Status: implemented and verified (scoped). No commit was made (lane rule).

## Answers

### 1. What `getCallerSessionId()` returns for a native Codex MCP call

It returns the **chat tab id** (or the Codex session id when no tab id exists).

- `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts:327-332` sets
  `routingId = input.tabId` when the tab id is not blank, else `sessionId`.
- `codex-chat-host-ports.ts:377-379` builds the Ptah MCP URL with
  `ptahMcpSessionUrl(PTAH_MCP_PORT, routingId, cwd)`.
- `libs/backend/codex-runtime/src/lib/codex-ptah-mcp.ts:40-53` puts `routingId` in the
  `/session/{routingId}` segment.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:527` reads
  that segment (`extractCallerSessionId(identityUrl)`) into the request context, which
  `getCallerSessionId()` returns.

The Codex session id is the Codex thread id: `codex-chat-adapter.ts` sets
`id = SessionId.from(context.identity.threadId)` in `open()`.

### 2. `resolvedSessionId()` for a Codex chat tab, and the proposal key

- `libs/frontend/chat/src/lib/components/templates/chat-view.component.ts:950-959` returns
  `tab.claudeSessionId` (or `chatStore.currentSessionId()`).
- For a Codex tab this is the native session id (thread id). The adapter reports it through
  `this.resolved?.(config.tabId, id)` (`codex-chat-adapter.ts`, `open()`), which is the same
  session-id-resolved callback that Claude uses.
- `harness-namespace.builder.ts:1172` saves the proposal under `getCallerSdkSessionId()` and
  pushes `HARNESS_CONFIG_PROPOSED` with `proposal.sessionId` (`:1196-1207`). After the fix that id
  is the Codex session id, so it equals the tab's `resolvedSessionId()`.
- The RPC side does not reject a Codex id. `HarnessSessionIdSchema` is
  `z.string().trim().min(1).max(256)` (`libs/shared/src/lib/types/rpc/rpc-harness.schemas.ts:462`).
  `harness-proposal-store.service.ts:96,112,169` only parses with that schema. No harness RPC
  handler checks the SDK lifecycle manager. The "invalid SDK session id" ZodError branch in
  `protocol-dispatcher.ts` fires only for a schema failure, which a UUID does not cause.
- The frontend needs no change.

### 3. How other MCP paths resolve a Codex caller

- `mcp-http/http-mcp-server.service.ts:468` passes
  `getSessionTabId: (id) => this.sessionWorkspaces?.find(id)?.tabId` (SDK lifecycle only).
  `protocol-dispatcher.ts:2590,3093` use `deps.getSessionTabId?.(callerSessionId) ?? callerSessionId`.
  For a Codex caller the lookup misses and the raw caller id (the tab id) is used. That is
  why question cards reach the Codex tab: they need a tab id, not a session id.
- `mcp-caller-workspace-resolver.ts` also reads only the SDK lifecycle manager.
- The existing Codex mechanism in `PtahAPIBuilder` is the optional injection of
  `CODEX_CHAT_ADAPTER` (`ptah-api-builder.service.ts:587-588`), used by `parentLanePermission`
  (`parent-lane-permission.ts:7-18`). The fix reuses that injection. No new registry and no new
  DI token.
- The Electron `tabs` map in `apps/ptah-electron/src/di/codex-session-binding.ts:50-54` is
  composition-local state that `vscode-lm-tools` cannot reach without new wiring. The adapter
  already owns the live-session map, so it is the single source.

## Root cause

`PtahAPIBuilder.resolveCallerSdkSessionId()` returned only
`sdkSessionLifecycleManager.find(callerId)?.realSessionId`. Native Codex sessions are owned by
`CodexChatAdapter`, not by the SDK `SessionLifecycleManager`, so the lookup always missed for a
Codex tab id. `proposeConfig` then threw `HarnessProposalNoSessionError`, and no
`harness:config-proposed` push was sent.

## Changed files

- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-session-controls.ts` — add optional
  `tabId` to `TrackedSession`, so the tab link dies with the session.
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts` — store the opening tab
  id in `publishSession`, and add `resolveLiveSessionId(callerId)`. It returns the session id only
  for a session the adapter holds now (match by session id, or by a unique tab id). It returns
  `undefined` for blank, unknown, closed or ambiguous callers.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts` — widen the
  optional `CODEX_CHAT_ADAPTER` port to `CodexChatSessionReader` (field renamed
  `codexChatPermissionReader` → `codexChatSessions`, type allows `null` because the factory
  returns `null` when Codex chat is absent). `resolveCallerSdkSessionId()` (`:1206`) now tries the
  SDK `realSessionId` first, then `codexChatSessions?.resolveLiveSessionId?.(callerId)`.
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts` — new test: tab id
  and session id resolve while the session is live; unknown, blank and post-reset ids yield
  `undefined`.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts` — new
  tests: Codex caller resolves to its live session id; unknown caller yields `undefined`; an SDK
  caller keeps its `realSessionId` and the Codex lookup is not called; a Codex reader without
  the lookup yields `undefined`. The existing SDK test is unchanged and passes.

No change in `apps/ptah-electron/**`, `rpc-handlers/**` or the frontend. No DI registration
changed, so the DI guard specs need no update.

## Verification

Run from the worktree root, one at a time:

1. `npm run verify -- -t test -p agent-sdk,vscode-lm-tools -- --testPathPatterns="codex-chat-adapter.spec|ptah-api-builder.service.spec"`
   — 2 tasks, 2 succeeded, exit code 0.
2. `npm run verify -- -t lint,typecheck -p agent-sdk,vscode-lm-tools` — 4 tasks, 4 succeeded,
   exit code 0.

Not run: the full test suites of `agent-sdk` and `vscode-lm-tools` (only the two changed specs
ran), and the Electron projects.

## Projects the coordinator must re-verify

- `agent-sdk`, `vscode-lm-tools` (full `test`).
- `ptah-electron` (consumer of both libs through DI; no source change there).
- `platform-cli` / `cli-engine` if they compose `PtahAPIBuilder`: the port is optional and
  `null`-safe, so absence keeps SDK-only behavior.

## Decisions

- **Decision:** Put the caller lookup on `CodexChatAdapter` and read it through the existing
  optional `CODEX_CHAT_ADAPTER` injection.
  - Options: (a) adapter method (chosen); (b) new DI port backed by the Electron `tabs` map in
    `codex-session-binding.ts`; (c) a second registry in `vscode-lm-tools`.
  - Evidence: `PtahAPIBuilder` already injects `CODEX_CHAT_ADAPTER` (`:587`); the adapter owns
    the live-session map; (b) needs new token and Electron wiring, and covers only Electron.
  - Reversible: yes.
- **Decision:** Apply the Codex fallback to all three users of `resolveCallerSdkSessionId`
  (harness proposal, git worktree capture, session organization).
  - Options: harness only, or all three.
  - Evidence: the recorder stores any valid id generically
    (`session-organization.service.ts:280-296`); a Codex session id is a real, proved Ptah
    session id; one rule keeps one consistent id per caller. Claude SDK callers are unchanged
    because the SDK lookup runs first.
  - Reversible: yes (pass a separate resolver to the harness builder only).
- **Decision:** A tab id that matches more than one live Codex session yields `undefined`.
  - Evidence: the rule "return an id only when a real session is proved".
  - Reversible: yes.

## Residual risks

- `parentLanePermission` (`parent-lane-permission.ts:13`) still passes the raw tab id to
  `getPermissionLevel`, so a Codex caller's live permission level is not found and falls back to
  `plan`. This is a separate existing defect, out of scope; `resolveLiveSessionId` can fix it.
- `protocol-dispatcher` attention routing still uses the raw caller id for Codex. It works today
  because that id is the tab id.
- The proposal turn attribution (`captureProposingTurnStartedAt`) has no Codex turn source, so
  `turnStartedAt` can be `undefined` for Codex. The save accepts that.
- Not verified in a live Electron run.
- Unrelated changes from another writer are in the worktree:
  `apps/ptah-electron-e2e/src/specs/harness/new-project.spec.ts`,
  `.ptah/specs/TASK_2026_933_f1f9/HANDOFF.md`, `.ptah/specs/TASK_2026_933_f1f9/e2e-fix-report.md`.
  This lane did not touch them.
