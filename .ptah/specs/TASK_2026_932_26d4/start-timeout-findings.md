# TASK_2026_932 E: ptah_session_start "The operation timed out." findings (read-only)

## 1. Where the text comes from: the parent's MCP HTTP client, not the Ptah host
- Bundled CLI `node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe` (SDK 0.3.318), fetch wrapper for
  HTTP MCP POSTs: `setTimeout(A=>A.abort(new DOMException("The operation timed out.","TimeoutError")), GPn(n, body))`
  with `n = Cr(cfg) = max(_r(cfg), ..)` and `_r = max(cfg.timeout ?? MCP_TOOL_TIMEOUT, 60000)` (default 60 s floor,
  "Hard wall-clock limit per call; progress notifications do not extend it"). Exact text match.
- Ptah gives the `ptah` HTTP server no `timeout`: `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:2294-2300`
  (only type/url/headers). `MCP_TOOL_TIMEOUT` is only allow-listed for settings files (`claude-certified-launch.ts:81`).
- Host side cannot produce the bare text: a throw in `runTool` is wrapped as `"ptah_session_start failed: <msg>"`
  (`session-tool-handlers.ts:699-709`); dispatcher has no deadline for session tools (`protocol-dispatcher.ts:2606-2621`);
  no `AbortSignal.timeout` in mcp-core/mcp-http. Other host deadlines give other text: named admission →
  "Named account admission could not be completed." (`chat-session.service.ts:305-315,879-905`); worktree git
  300 s → `worktree-failed` refusal (`exec-git.ts:11`, `child-worktree.provisioner.ts:297-301`); router 3 s →
  internal "child setting decision timeout", swallowed (`child-setting-router.service.ts:85-91`, `routing-constants.ts:117`).

## 2. The start keeps running after the client gives up: yes
- `handleSessionToolCall` → `session.start` → `SessionSpawnerService.start` take no AbortSignal
  (`session-namespace.builder.ts:133-146`, `session-spawner.service.ts:288-297`); `getRequestAbortSignal` is used only
  by agent wait tools (`protocol-dispatcher.ts:1716,1768,1814`). The server awaits to the end; the reply is discarded.
- Slow steps in `provisionAndStart` (`session-spawner.service.ts:368+`), all before the child is visible:
  `listChildModels` + router (`:421-436`), `resolveChildModel` (`:395,439`), `provisioner.create` = `git worktree add`
  (`:461`, up to 300 s, slow under low memory), then the id is made (`SessionId.create()` `:480`), `registry.add` (`:519`),
  `retainMcpRoot` (`:525`), `startOnHost` → `ChatSessionService.startAgentChildSession` (`:538`, `chat-session.service.ts:1413`).
- So with RAM at 1.2 GB the start ran > 60 s, the parent got TimeoutError, and the host still finished: tab, registry
  record, first turn. `ptah_session_status` shows nothing until `:519`, so the parent saw no child and retried.

## 3. Recommended fix (smallest)
(a) Visible pending start + id in the timeout path
- `session-spawner.service.ts` `provisionAndStart`: move `SessionId.create()` to the top (after `guardStart`), and
  register a `starting` placeholder (caller, label, branch, startedAt) in `SessionChildRegistry` before the model
  route / worktree steps; on refusal remove it, on success `registry.add` replaces it.
- `session-child.registry.ts`: `addPending/removePending`; `childrenOf`/`get` return it as status `starting`
  (`statusOf` `:1514-1526`) so `ptah_session_status` lists it with its id.
- The parent cannot receive a late reply, so the tool description (`tool-description.builder.ts`, session_start entry)
  must say: on a timeout call `ptah_session_status` first; a `starting` child with your branch is your start.
(b) Idempotency (prevents the duplicate without parent discipline)
- Implicit key = caller (tab + SDK id) + `branch` (required, `session-tool-args.schema.ts:41`). In `guardStart`,
  before `reserveSlot`: if a pending or live non-terminal child of this caller has the same branch, return
  `ok: true` with that child (or refusal `start-in-progress` naming its id) instead of a second start.
- Optional explicit `idempotencyKey` in `SessionStartArgsSchema` + `SessionChildStartRequest`
  (`session-spawner.port.ts`), kept 10 min after settle.
(c) Also set a `timeout` on the `ptah` HTTP config (e.g. 10 min) in `sdk-query-options-builder.ts:2296` and
  `sdk-query-runner.service.ts:850` so starts within that window reply normally.
Tests: spawner spec: slow `provisioner.create` → `status()` shows `starting` with the id; second start same
caller+branch while pending → no second `provisioner.create`, returns same id; refusal removes the pending
record; registry spec for pending records; session-tool-handlers spec for the reply text; options-builder spec
asserts `timeout` on the ptah server.

## 4. ptah_agent_spawn "working directory must be within workspace": YES for Ptah CLI lanes (`ptahCliId`)
- Error raised in `AgentSpawnEnvironmentService.validateWorkingDirectory` (`agent-spawn-environment.service.ts:472-507`).
- System CLI path validates first: `AgentProcessManager.spawn` `:562` before harness preflight and spawn. No process.
- Ptah CLI path: `agent-namespace.builder.ts:453` `registry.spawnAgent(.., {workingDirectory})` runs first:
  `ptah-cli-registry.ts:901` cwd, `:911` `syncHarnessToPolicy(cwd)` (writes), `:1127` harness preflight, then
  `ClaudeSdkLaneRunner.run` calls `queryFn(...)` (`claude-sdk-lane-runner.ts:126-127`) with that cwd. Only after that
  `spawnFromSdkHandle` validates (`agent-process-manager.service.ts:1210-1213`). On the throw there is only a
  `finally { spawning-- }` (`:1284`) and no catch in the builder: the handle is never aborted, `setAgentId` never
  runs, the lane is untracked. Fix: call `validateWorkingDirectory` in the builder before `registry.spawnAgent`,
  and abort `result.handle` if `spawnFromSdkHandle` throws.

## Unproven
- Exact client deadline: `GPn(n, body)` and the second `max` term are minified; 60 s floor is proven, the final
  value is not. No host logs show which step was slow (worktree add vs admission vs router).
- Whether SDK `query()` spawns the child process at once or on first read (orphan process vs only orphan harness writes).
- Why the retry made a second worktree with no branch clash (parent may have used a new branch name).
