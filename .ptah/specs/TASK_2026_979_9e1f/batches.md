# Batches - TASK_2026_979_9e1f

Total tasks: 38 | Batches: 23 (P1: 13, P2: 10; B23 is a fix reserve with no tasks) | Complete: 0/23

Paths are absolute under `W = D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity`.
`L = W\libs\backend`. `MC = L\vscode-lm-tools\src\lib\code-execution\mcp-core`,
`MH = L\vscode-lm-tools\src\lib\code-execution\mcp-http`,
`GW = L\cli-agent-runtime\src\lib\mcp-directory\gateway`. Executors expand these to full paths.
Line ranges come from `implementation-plan.md` and were spot-checked on 2026-11-23. Lines can drift by
a few. Resolve each by the named symbol. One known drift: the agy spawn-time write is now at
`antigravity-cli.adapter.ts:1168-1270` (`facet.write` at `:1231`, restore at `:1265-1267`), not
`:1169-1215`.

## Run defaults (recorded, not asked)

- Executors: CLI lanes are disabled for this task (`context.md`, Gate 0.1: `ptah_agent_list` not
  available). Each batch recommends a built-in subagent. Subagent reason: no live lane rows.
- Review family: implementer and reviewer are both Claude subagents. Exception reason: no CLI lane
  of another family is available. Every phase summary labels the review evidence as weaker
  (same-family), as Gate 2 did.
- Estimated weight: `unavailable`, because `ptah_count_tokens` is not listed in this session.
  Actual weight is `pending` until the batch report comes back.
- Batch ordering follows plan handoff `implementation-plan.md:263-289`. Contracts (B1) come first.
  The harness-sync helper (B2) lands before its vscode-lm-tools consumer (B8).
  Two batches never edit or check the same Nx project at the same time (CLAUDE.md "Do not start a
  check of a project while a lane edits files of that project").
- Parallel waves (at most 3 executors at a time). Within a wave, every batch writes disjoint files
  in disjoint projects:
  - W1: B1, B2
  - W2: B3 (cli-agent-runtime), B6 (vscode-lm-tools), B9 (agent-sdk)
  - W3: B4, B7, B10
  - W4: B5, B8, B11
  - W5: B12 (cron-scheduler), B13 (rpc-handlers)
  - P2 runs only after the P1 gate, the P1 phase review and the P1 live review pass.
- Every executor brief repeats the CLAUDE.md verification rules and the Electron-first rules.
  Executors do not commit. The coordinating agent owns git.
- Verify project names are the Nx `name` values. Libs use `@ptah-extension/<lib>`. The apps are
  `ptah-electron` and `ptah-extension-webview`.

## Plan validation

Status: PASSED WITH RISKS

Stress test, run against the files on disk:

1. Contracts across boundaries. The binding flags (`gatewayApproval`, `includeConnectors`) have one
   producer each: the builder at `sdk-query-options-builder.ts:2437`, and the runner's
   `buildOneShotMcpServers` at `:840-869`. The consumer is the dispatcher, which copies them into the
   gateway `scope`. B6 must copy both flags, or the server-side policy withholds every gateway tool
   from the session (silent #1468 regression). This is carried as R3.
2. Event order:
   - The first list before upstream connect is covered by the 12 s cold-start budget (Hub 3).
   - A `list_changed` before any GET stream is opened is harmless.
   - A `canUseTool` call before the PreToolUse decision is the cron gate's consume-once map; R1
     covers its composition.
3. Dependency failure:
   - Gateway unbound: optional DI, Ptah tools only.
   - `listTools` throws: warn, Ptah tools only.
   - `servedFileServerNames` throws: empty list plus a warning.
   - Upstream 401: refresh once, retry once.
4. States the plan does not name, now handled:
   - The agy adapter's home-file facet write in P1. See Decision D2.
   - P2 deleting facet modules that readers still use. See R5.
   - The capper's static `appliesTo`. See R2.
5. If the new path fails at runtime, the user keeps Ptah tools and loses connector tools. After B13
   there is no chat:start fallback (D-U1 Option 1, user-approved). Hence B13 runs only after the
   gateway is bound (B5).

Assumptions (A1-A9 are from the plan; each has a task that checks it):

- A1. Connector `serverKey`s have capability-policy rows. Unverified. Checked in B5 (exposure filter).
- A2. 53-char tool-name budget (Claude prefix plus the Codex 64-char limit). Unverified. Checked in B3
  against `codex-lane-config.builder.ts`.
- A3. esbuild bundles `@modelcontextprotocol/sdk` into Electron main, and `validate-deps` passes.
  Unverified. Checked in B4 (Jest subpath resolution) and at the first pre-push hook. If it fails, a
  devops-engineer batch is added.
- A4. Claude Code opens the GET stream and re-lists on `list_changed`. Unverified, live: Live review
  LR-7.
- A5. Lane providers can switch off their own MCP config at spawn. Unverified. Checked in B21 and B22
  (`--help` and SDK types, no paid runs).
- A6. A linked worktree should use its main checkout's intents and approvals. Unverified. Checked in
  B4 (`resolveHarnessWorkspaceRoot`, `CapabilityResolverService.contextFor`).
- A7. Whether Ptah passes `agents` definitions that declare `mcpServers`. Unverified. Checked in B20
  before strict is set.
- A8. The Claude CLI waits at least 12 s for `ptah` `tools/list`. Unverified, live: Live review LR-4
  cold-start step.
- A9. The flag tier suppresses `~/.claude.json` and `.vscode/mcp.json` copies, not only `.mcp.json`.
  Unverified, live: Live review LR-6.
- A10 (N1). A `PreToolUse` deny is honoured under `permissionMode: 'bypassPermissions'` in the
  installed Agent SDK. Unverified: the d.ts does not state it (review Round 2, check 3). Two checks:
  - Spec in B10 proves the server-side refusal alone blocks a no-opt-in one-shot call.
  - Live check LR-10.
- A11. Electron already calls `registerCliAgentRuntimeServices` in phase 2
  (`apps/ptah-electron/src/di/phase-2-libraries.ts:419`), so binding the token needs no
  `phase-2-libraries.ts` edit. Checked in B5. If an edit is needed, it goes into B5's write set.

| Risk | Severity | Mitigation |
| --- | --- | --- |
| R1 (N2a). The gateway gate and the cron gate both wrap `canUseTool`. Today `canUseToolCallback = cronApprovalGate.canUseTool` (`sdk-query-options-builder.ts:1411`). Both gates are hard-wired to their own predicate (`cron-approval-gate.ts:79`, `:90`). A naive second gate asks twice, or drops the cron decision. | HIGH | B9 builds the gate with its own `isGatewayTool` predicate in both `canUseTool` and the hook. B10 chains it: `gateway.canUseTool` wraps `cronApprovalGate.canUseTool`. Spec: a cron tool passes through both and is asked once; a gateway tool is asked once. |
| R2. `ToolOutputCapper.appliesTo` is `static` (`tool-output-capper.ts:108`, called at `:132`), so it cannot reach an injected port. | MEDIUM | Task 9.1 threads an optional `isGatewayTool` predicate (constructor or argument). Unbound means today's behaviour. Bound means fail closed. Spec in B9. |
| R3. Scope flags are not copied from binding to scope, so the session sees no connector tools. | HIGH | Task 6.1 acceptance, plus the dispatcher spec "privileged session with `gatewayApproval` lists gateway tools". |
| R4. `handleToolsList` becomes async; a sync caller left behind returns a Promise as the list. | MEDIUM | Task 6.1 updates every caller. `protocol-dispatcher.surface.spec.ts` must pass. |
| R5. P2 "remove harness MCP writing" could delete facet modules that readers still import: `claude-user-mcp.reader.ts`, `codex-user-mcp-servers.ts`, and `retired-ptah-mcp-slots.ts:57`, which imports from `@ptah-extension/harness-sync`. | HIGH | B16 to B19 remove write call sites only. A facet module is deleted only when `rg` shows zero importers. Read APIs stay. B15 inventories the readers. |
| R6. The P2 C7 guard removal also deletes `isLinkedWorktreeRoot`, which the kept retired sweep (B8) still uses. | MEDIUM | Decision D3: the helper stays. B17 deletes only the planner guard. |
| R7. Cold-start budget versus CLI MCP timeout (A8). | MEDIUM | Live LR-4. If the CLI timeout is shorter, B10 is reopened by a fix batch (set the env override or lower the budget). |
| R8. C11 strict drops claude.ai account connectors. | HIGH | B20 does not start until live precondition LR-P2-0 passes. If (a) fails, the orchestrator takes a new decision to the user and B20 is not merged. |
| R9. Two batches editing or checking cli-agent-runtime at once (B2 touches `mcp-install.service.ts`). | LOW | B2 runs in W1. B3 to B5 run after B2 is committed. |
| R10. C8 removal before the gateway is live loses connectors in chat. | HIGH | B13 depends on B5 (token bound, `expected-resolvable.ts`) and B7 (dispatcher lists gateway tools). |

Edge cases:

- Collision aliases `zernio` vs `zernio_ab12`, handled in Tasks 3.2, 9.1 and 10.1.
- An unknown `mcp__ptah__x__y` before any list is treated as a gateway tool (fail closed), handled in
  Tasks 5.1 and 9.1.
- Unapproved project-file entry: no connect, handled in Task 4.1.
- Cross-origin redirect with `Authorization`, handled in Task 4.2.
- First list: a slow upstream at 8 s is listed; one at 15 s is omitted as `pending`, then
  `onToolsChanged` fires. Handled in Task 5.1.
- A linked worktree (`.git` is a file), and a `.git` lstat error (reads as false), handled in Tasks
  2.1 and 8.1.
- An unauthenticated GET returns 401, handled in Task 7.2.
- The curator-style one-shot mints no `includeConnectors`, handled in Task 10.1.
- A cron run's `needs-auth` and cold-start `pending` servers are both named in the warning, handled in
  Task 12.1.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D1 (N3) | `isLinkedWorktreeRoot` lives in harness-sync (`libs/backend/harness-sync/src/lib/workspace/linked-worktree.ts`), as the plan says, not in platform-core. | harness-sync; platform-core | Both projects are tagged `["scope:extension","type:feature"]`. `eslint.config.mjs:285-286` lets `scope:extension` depend on `scope:extension`, and `:372-373` lets `type:feature` depend on `type:feature`. vscode-lm-tools already imports `@ptah-extension/harness-sync` in 7 files, including `retired-ptah-mcp-slots.ts:57`. harness-sync imports nothing from vscode-lm-tools, so there is no cycle. cli-agent-runtime already imports harness-sync (`capability-resolver.service.ts`). | yes |
| D2 | The agy adapter's spawn-time home-file `facet.write` (`antigravity-cli.adapter.ts:1231`, `:1265-1267`) gets no linked-worktree guard in P1. | guard it; leave it | It is a lane spawn write of `~/.gemini/config/mcp_config.json`, not a harness sync of a workspace file. Row 14 scopes "harness sync". Guarding it would break the agy stream-json lane in every child worktree. Row 13 removes it in P2 (B22). | yes |
| D3 | `linked-worktree.ts` survives P2. B17 deletes only the planner guards. | delete with the facets | The kept retired sweep (parity row "linked-worktree skip from C3 kept", `implementation-plan.md:209`) imports it. | yes |
| D4 | The C12 write set is split by project and dependency: B16 targets, B17 planner/reconciler, B18 install, B19 slots, B22 agy. The agy adapter changes (C12 write removal plus the C14 switch) share one batch so that the file has one owner. | one C12 batch | A single C12 batch is more than 8 files across 3 projects. | yes |
| D5 | Every batch is PENDING at write time. The orchestrator sets IN_PROGRESS when it spawns. | B1 IN_PROGRESS | Orchestrator instruction for this invocation. | yes |

---

# Phase P1 - connectors through the gateway, plus the #1469 guard

Phase review: code-logic, plus code-style (new public port `IMcpGateway`), on the combined P1 diff
after B13 commits. The reviewer is the same family; it records the exception reason.

P1 gate, run by the orchestrator after B13, before review:

- `npm run verify -- -p @ptah-extension/platform-core,@ptah-extension/shared,@ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools,@ptah-extension/agent-sdk,@ptah-extension/harness-sync,@ptah-extension/rpc-handlers,@ptah-extension/cron-scheduler,ptah-electron`
  The header must say "for 9 projects".
- `npm run verify -- -t lint,typecheck -p ptah-extension-webview`
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
- Then Live review, P1 pass (below).

## Batch 1: Contracts (C1) - COMPLETE

- Id: P1-B1 | Phase: P1 | Shape: contract
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B2) | Execution mode: sequential (1 task)
- Depends on: none
- Write set:
  - `L\platform-core\src\interfaces\mcp-gateway.interface.ts` (CREATE)
  - `L\platform-core\src\interfaces\mcp-caller-credentials.interface.ts`
  - `L\platform-core\src\di\tokens.ts`
  - `L\platform-core\src\index.ts`
  - `W\libs\shared\src\lib\types\messages\session-mcp-status.ts`
- Read set: `mcp-caller-credentials.interface.ts:1-70`, `tokens.ts:120-140`,
  `session-mcp-status.ts:30-60`, `implementation-plan.md:81-84`, `:108-123`, `:133-138`.
- Contract excerpts:
  - `IMcpGateway`:
    - `registerHostToolNames(names: readonly string[]): void`
    - `isGatewayTool(name: string): boolean` (sync; bare or `mcp__ptah__`-prefixed)
    - `listTools(scope, signal?)`
    - `callTool(scope, name, args, signal?)`
    - `status(scope)`, which returns `{key, display, status: 'connected'|'failed'|'needs-auth'|'pending', detail?}[]`
    - `servedFileServerNames(root): Promise<string[]>`
    - `onToolsChanged(listener): Disposable`
    - `dispose()`
  - Scope: `{kind, capability, workspaceRoot?, gatewayApproval?, includeConnectors?}`. Plain JSON
    only.
  - Token: `PLATFORM_TOKENS.MCP_GATEWAY = Symbol.for('PlatformMcpGateway')`.
  - `McpCallerBinding`: add `gatewayApproval?: boolean` and `includeConnectors?: boolean`. Document
    them like `cronWriteApproval` (`:52-59`).
  - `SessionMcpServerEntry`: add `source?: 'cli' | 'ptah-gateway'`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/platform-core,@ptah-extension/shared`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/platform-core,@ptah-extension/shared,ptah-extension-webview`
  - `npm run verify -- -t typecheck-templates -p ptah-extension-webview` (shared type the renderer
    imports)
- Acceptance:
  - All new types and the token are exported from the package index.
  - Every new field is optional, so no existing producer changes.
  - Renderer typecheck and templates pass (M1).
- Status: PENDING

### Task 1.1: Port, token, binding flags, status source - PENDING

- Files: the write set above.
- Pattern: `PLATFORM_TOKENS.MCP_SERVER_STATUS` and the `IMcpServerStatus` port (consumed optionally
  at `cron-scheduler/src/lib/job-runner.ts:118-119`).
- Validation notes: no runtime code. Each doc comment names the enforcing site (Hub 6, Hub 10).

## Batch 2: #1469 linked-worktree guard (C7) - COMPLETE

- Id: P1-B2 | Phase: P1 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B1) | Execution mode: sequential
- Depends on: none
- Write set:
  - `L\harness-sync\src\lib\workspace\linked-worktree.ts` (CREATE)
  - `L\harness-sync\src\lib\workspace\linked-worktree.spec.ts` (CREATE)
  - `L\harness-sync\src\index.ts`
  - `L\harness-sync\src\lib\targets\mcp\mcp-facet-planner.ts`
  - `L\harness-sync\src\lib\targets\mcp\mcp-facet-planner.linked-worktree.spec.ts` (CREATE)
  - `L\cli-agent-runtime\src\lib\mcp-directory\mcp-install.service.ts`
  - `L\cli-agent-runtime\src\lib\mcp-directory\mcp-install.service.spec.ts`
- Read set:
  - `mcp-facet-planner.ts:60-335`: `emptyMcpFacetPlan` `:71`, `planMcpFacet` `:91`, adds/updates
    `:140-143`, removals `:147-163`, `applyMcpFacet` `:191`, `facet.remove` `:213`, `facet.write`
    `:226`, `applyRetiredMcpRemoval` `:256`, proof `:253-330`.
  - `json-mcp-facet.ts:330-365` (`.bak`)
  - `harness-sync/src/lib/targets/retirement-proof.ts:100-230`
  - `harness-reconciler.service.ts:300-345` (`releasedTracked` `:326-331`)
  - `mcp-install.service.ts:590-620`, `:700-730`
  - `harness-sync/src/lib/workspace/workspace-root.ts` (sibling pattern)
  - `implementation-plan.md:165-172`
- Contract excerpts:
  - `isLinkedWorktreeRoot(root: string): Promise<boolean>`: true iff `lstat({root}/.git)` is a file.
    An error reads as false.
  - In a linked worktree, harness sync writes, updates and deletes no MCP config file (workspace or
    home) and writes no `.bak` (decision 7, row 14).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/harness-sync,@ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/harness-sync,@ptah-extension/cli-agent-runtime`
- Acceptance:
  - In a linked worktree, `planMcpFacet` returns `emptyMcpFacetPlan()`, so the manifest's MCP rows
    are unchanged. `applyMcpFacet` and `applyRetiredMcpRemoval` return without touching a facet.
    `mcp-install.service.ts` facet calls (`:611` and `:718+`) skip and record the skip.
  - Outside a linked worktree, every non-retired removal goes through the proof. An unproven entry is
    kept and released via `releasedTracked`.
  - Regression 3, harness half, in `mcp-facet-planner.linked-worktree.spec.ts`. The spec builds:
    - a temp repo plus `git worktree add`;
    - a tracked `.vscode/mcp.json` with `zernio`;
    - a tracked `.agents/mcp_config.json` with a `ptah` `/workspace/` entry;
    - a manifest that owns `zernio`, empty intents, and one new intent.

    After sync: no file changed, no `.bak` exists, and `git status --porcelain` is empty. A
    main-checkout case keeps an unproven removal.
  - `rg -n "facet\.(write|remove)\(" libs/backend/harness-sync/src libs/backend/cli-agent-runtime/src`
    output is listed in the report. Each hit is guarded, or excluded with a reason (agy adapter:
    Decision D2).
- Status: PENDING

### Task 2.1: `isLinkedWorktreeRoot` helper and export - PENDING

- Spec cases: `.git` file, `.git` directory, missing, lstat error.

### Task 2.2: Planner and apply guard, proof for non-retired removals - PENDING

- Depends on: Task 2.1

### Task 2.3: Install-service facet callers guarded - PENDING

- Depends on: Task 2.1

## Batch 3: Gateway pure modules (C2, part 1) - COMPLETE

- Id: P1-B3 | Phase: P1 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B6, B9) | Execution mode: sequential
- Depends on: B1, B2 (cli-agent-runtime not edited at the same time)
- Write set (all CREATE, under `GW`):
  - `mcp-url-normalize.ts`, `mcp-url-normalize.spec.ts`
  - `gateway-tool-naming.ts`, `gateway-tool-naming.spec.ts`
  - `gateway-caller-policy.ts`, `gateway-caller-policy.spec.ts`
- Read set:
  - `implementation-plan.md:85-92` (Hub 2 key rules), `:101-106` (Hub 4), `:108-121` (Hub 6)
  - `cli-agent-runtime/.../oauth/mcp-oauth.service.ts:163-172` (serverKey)
  - `cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-config.builder.ts` (A2)
  - `cli-agent-runtime/src/lib/cli-agents/lane-mcp-token-rule.ts`
- Contract excerpts:
  - `normalizeMcpUrl`: lowercase the scheme and host; drop the default port, userinfo, fragment and
    trailing `/`; keep the path and query. An invalid URL returns null.
  - Name format `<alias>__<tool>`: at most 53 chars, `[A-Za-z0-9_-]`.
  - Alias rules:
    - Strip `oauth-`/`smithery-`.
    - Take the host and drop a leading `mcp.`/`api.`/`www.` and the public suffix
      (`oauth-mcp.zernio.com-mcp` → `zernio`).
    - Sanitize to `[a-z0-9-]`, at most 20 chars. `ptah` is reserved.
  - Collisions: the lexicographically smaller key keeps the bare alias; others get `_` plus 4 hex of
    `sha256(key)`.
  - A tool part over budget is truncated and gets `_` plus 6 hex of a hash.
  - A generated name equal to a host tool name is rejected.
  - Caller policy (pure): Hub 6 matrix. `session` needs `privileged` and `gatewayApproval`.
    `internal-query` needs `privileged` and `includeConnectors`. `agent` needs `privileged`.
    `lane-report`, slot and read-only callers get none. Withheld means zero gateway tools.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- Acceptance:
  - Specs cover name stability, `zernio` vs `zernio_ab12`, the 53-char cap, the reserved `ptah`
    alias, and every Hub 6 matrix row, including "`includeConnectors` absent → zero tools".
  - A2 result recorded in the report.
- Status: PENDING

### Task 3.1: URL normalization - PENDING

### Task 3.2: Naming and collisions - PENDING

### Task 3.3: Caller policy matrix - PENDING

## Batch 4: Gateway sources and upstream client (C2, part 2) - COMPLETE

- Id: P1-B4 | Phase: P1 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B7, B10) | Execution mode: sequential
- Depends on: B3
- Write set (CREATE, under `GW`):
  - `server-sources.ts`, `server-sources.spec.ts`
  - `upstream-client.ts`, `upstream-client.spec.ts`
- Read set:
  - `oauth/mcp-oauth-override-resolver.ts:49-88`, `oauth/mcp-oauth.service.ts:157-172`, `:432-455`
  - `mcp-directory/smithery-override-resolver.ts`
  - `mcp-directory/claude-user-mcp.reader.ts:40-170`
  - `harness-sync/src/lib/sources/mcp-intent-store.ts:230-300`
  - `cli-agent-runtime/.../capability-policy-model.ts:362-398`
  - `capabilities/capability-resolver.service.ts:150-190`
  - `rpc-handlers/src/lib/chat/session/chat-session.service.ts:877-950` (the source to move)
  - root `node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.d.ts:77,81`,
    `client/index.d.ts:83`, `shared/protocol.d.ts:71,77`
  - `implementation-plan.md:85-100`
- Contract excerpts:
  - Source order: connectors (OAuth, then Smithery); intents (`McpIntentStore.listFor(root)`);
    `~/.claude.json`; `{root}/.mcp.json`; `{root}/.vscode/mcp.json`. P1 serves `http`/`sse` only.
  - Dedup on the normalized URL. The authenticated entry wins, then source order.
  - Project-file entries are exposed only if in `approvedProjectMcpServers`, unless their key matches
    a connector or intent. No connect happens for an unapproved project entry.
  - `${VAR}` and `${VAR:-default}` expand from the process env.
  - Endpoint cache 30 s, invalidated by a 401, an intent or manifest change, or a token-store change.
  - `upstream-client.ts` is the only MCP SDK importer, behind `UpstreamClientFactory`.
  - The custom `fetch` sets headers per request and uses `redirect: 'manual'`. It follows at most 3
    same-origin redirects and never forwards `Authorization` across origins ("redirected to another
    origin").
  - Timeouts: connect 10 s; list 5 s; call 120 s, abortable.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- Acceptance:
  - Specs cover:
    - dedup precedence;
    - an unapproved project entry with no factory connect call;
    - env expansion;
    - a cross-origin redirect refused with no `Authorization` sent;
    - a same-origin redirect followed with headers re-applied.
  - Jest resolves the SDK subpath exports (A3, Jest half).
  - A6 result recorded. If the resolver already maps a worktree to its main checkout, the C2
    fallback is dropped and the report says so.
- Status: PENDING

### Task 4.1: Server sources and dedup - PENDING

### Task 4.2: Upstream client with redirect-safe fetch - PENDING

## Batch 5: Gateway service and DI binding (C2, part 3) - COMPLETE

- Id: P1-B5 | Phase: P1 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B8, B11) | Execution mode: sequential
- Depends on: B4
- Write set:
  - `GW\mcp-gateway.service.ts` (CREATE), `GW\mcp-gateway.service.spec.ts` (CREATE)
  - `L\cli-agent-runtime\src\lib\di\register.ts`
  - `L\cli-agent-runtime\src\lib\mcp-directory\index.ts`
  - `W\apps\ptah-electron\src\di\expected-resolvable.ts`
- Read set:
  - `register.ts:495-550` (auth-secrets guard `:534`, inventory `:532-547`)
  - `expected-resolvable.ts:150-170`
  - `apps/ptah-electron/src/di/phase-2-libraries.ts:410-425`
  - `apps/ptah-electron/src/di/container.smoke.spec.ts`
  - `cli-engine` `container.ts:895-910`
  - `implementation-plan.md:93-108`, `:122-124`
  - B3 and B4 files
- Contract excerpts:
  - Bound only when `TOKENS.AUTH_SECRETS_SERVICE` is registered.
  - `isGatewayTool(name)` is true iff the name is not a registered host tool name (fail closed).
  - The reverse map serves dispatcher routing.
  - Cold start: the first `listTools` per scope awaits pending servers within one 12 s budget. A
    server still pending at the deadline is omitted with status `pending` and detail
    `tools/list timed out after 12s`, and `onToolsChanged` fires when it lands. Later lists serve the
    last good list and refresh in the background.
  - 401 → one forced `McpOAuthService.refresh(key)` and one retry → `needs-auth`.
  - Back-off 1 s doubling to 60 s.
  - `status(scope)` follows the Hub 8 shape.
  - `servedFileServerNames(root)` returns file-declared names served plus same-key losers.
  - Logs carry key, tool, duration and status only (no tokens).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime,ptah-electron`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,ptah-electron`
- Acceptance:
  - The C2 seam spec (`implementation-plan.md:143`) passes in full, including the 8 s/15 s cold-start
    case, 401 retry, back-off, and the absence of tokens in logged objects.
  - `expected-resolvable.ts` lists the token, and `container.smoke.spec.ts` passes.
  - A1 and A11 results recorded.
  - `rg -n "MCP_GATEWAY|PlatformMcpGateway" libs/backend/platform-cli` is empty, so the benchmark is
    unchanged.
- Status: PENDING

### Task 5.1: `McpGateway` service - PENDING

### Task 5.2: DI binding, index export, Electron expected-resolvable - PENDING

- Depends on: Task 5.1

## Batch 6: Dispatcher routing and caller class (C3, part 1) - COMPLETE

- Id: P1-B6 | Phase: P1 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B3, B9) | Execution mode: sequential
- Depends on: B1
- Write set:
  - `MC\protocol-dispatcher.ts`
  - `MC\mcp-caller-policy.ts`
  - `MC\protocol-dispatcher.spec.ts`
  - `MC\protocol-dispatcher.surface.spec.ts`
  - `MC\mcp-caller-policy.spec.ts`
- Read set:
  - `protocol-dispatcher.ts:374-424`, `:450-525`, `:574-597`, `:843-886`, `:988-1078`
  - `mcp-caller-policy.ts:130-190`
  - `MC\effective-tool-list.ts:95-139`
  - `implementation-plan.md:144-149`
- Contract excerpts:
  - `ProtocolHandlerDependencies.gateway?: IMcpGateway`.
  - `handleToolsList` becomes async. It appends sorted gateway tools after
    `composeEffectiveToolList`, never eagerly.
  - Scope is copied from the binding, including `gatewayApproval` and `includeConnectors` (R3).
  - `dispatchToolsCall` routes reverse-map names to the gateway first, passing the abort signal. On a
    miss it re-lists once, then returns `-32602`.
  - Failure handling:
    - `listTools` throws: warn, Ptah tools only.
    - `callTool` throws: `isError` result, never `-32603`.
  - New class `gateway` in `mcp-caller-policy.ts`, permitted for `privileged` only.
  - Phase `disallowedTools` applies by name.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/vscode-lm-tools`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/vscode-lm-tools`
- Acceptance:
  - Specs cover:
    - a privileged session with `gatewayApproval` sees gateway tools;
    - lane-report, slot, and `internal-query` without `includeConnectors` see none;
    - forwarding with abort;
    - a phase-denied name;
    - gateway throws on list and on call.
  - Every former sync caller awaits (R4), and the surface spec passes.
- Status: PENDING

### Task 6.1: Async list and gateway routing - PENDING

### Task 6.2: `gateway` caller class - PENDING

## Batch 7: SSE list_changed and server wiring (C3, part 2) - COMPLETE

- Id: P1-B7 | Phase: P1 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B4, B10) | Execution mode: sequential
- Depends on: B6
- Write set:
  - `MH\mcp-notification-hub.ts` (CREATE), `MH\mcp-notification-hub.spec.ts` (CREATE)
  - `MH\http-server.handler.ts`, `MH\http-server.handler.spec.ts`
  - `MH\http-mcp-server.service.ts`, `MH\http-mcp-server.service.spec.ts`
- Read set:
  - `http-server.handler.ts:430-447`, `:515-580` (abort `:575`)
  - `MH\http-response-writer.ts:24-31`
  - `http-mcp-server.service.ts:330-394`, `:495-525`
  - `implementation-plan.md:122`
- Contract excerpts:
  - `initialize` advertises `tools: { listChanged: true }`.
  - GET on the identity URL with `Accept: text/event-stream` and the same bearer is authenticated
    exactly as POST. An unauthenticated GET gets 401.
  - Each stream registers in `McpNotificationHub`, keyed by binding.
  - `onToolsChanged`, debounced 500 ms, writes `notifications/tools/list_changed`.
  - One shared 25 s keep-alive runs only while streams are open. `close` removes each stream.
  - `Mcp-Session-Id` behaviour is unchanged.
  - `HttpMcpServer` injects the optional `PLATFORM_TOKENS.MCP_GATEWAY`. At start it calls
    `registerHostToolNames(buildToolDefinitions(...).map(t => t.name))` and passes the port into
    the dispatcher dependencies.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/vscode-lm-tools`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/vscode-lm-tools`
- Acceptance:
  - Specs cover:
    - the GET stream receives `list_changed` and is released on close;
    - the keep-alive stops when the last stream closes;
    - an unauthenticated GET gets 401;
    - host-name registration equals the `buildToolDefinitions` names;
    - an unbound gateway leaves today's behaviour.
- Status: PENDING

### Task 7.1: Notification hub - PENDING

### Task 7.2: GET SSE in the handler - PENDING

### Task 7.3: Server wiring and host-name registration - PENDING

## Batch 8: Retired sweep skips linked worktrees (C3, part 3) - COMPLETE

- Id: P1-B8 | Phase: P1 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B5, B11) | Execution mode: sequential
- Depends on: B2 (helper export), B7 (same project, not concurrent)
- Write set:
  - `MH\retired-ptah-mcp-slots.ts`
  - `MH\retired-ptah-mcp-slots.spec.ts`
- Read set:
  - `retired-ptah-mcp-slots.ts:50-170` (`removeRetiredPtahEntry` `:121-152`)
  - `http-mcp-server.service.ts:700-710`, `:845-855`
  - `harness-sync/src/lib/workspace/linked-worktree.ts`
- Contract excerpts: `sweepRetiredPtahMcpEntries` skips the workspace `.agents/mcp_config.json` of
  any root where `isLinkedWorktreeRoot` is true. The home file is unchanged. Import from
  `@ptah-extension/harness-sync` (Decision D1).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/vscode-lm-tools`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/vscode-lm-tools`
- Acceptance:
  - Regression 3, sweep half: a linked worktree's `.agents/mcp_config.json` is byte-identical after a
    server-start sweep, and `git status --porcelain` is empty.
  - The main-checkout sweep behaviour is unchanged.
- Status: PENDING

### Task 8.1: Linked-worktree skip in the sweep - PENDING

## Batch 9: Gateway approval gate, unattended exclusion, capper (C5, part 1) - COMPLETE

- Id: P1-B9 | Phase: P1 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B3, B6) | Execution mode: sequential
- Depends on: B1
- Write set:
  - `L\agent-sdk\src\lib\permission\gateway-approval-gate.ts` (CREATE)
  - `L\agent-sdk\src\lib\permission\gateway-approval-gate.spec.ts` (CREATE)
  - `L\agent-sdk\src\lib\permission\index.ts`
  - `L\agent-sdk\src\lib\sdk-permission-handler.ts`
  - `L\agent-sdk\src\lib\sdk-permission-handler.unattended.spec.ts`
  - `L\agent-sdk\src\lib\helpers\compaction\tool-output-capper.ts`
  - `L\agent-sdk\src\lib\helpers\compaction\tool-output-capper.spec.ts`
- Read set:
  - `permission/cron-approval-gate.ts` (all; factory `:68-158`, predicate uses `:79`, `:90`)
  - `permission/cron-tool-policy.ts`
  - `sdk-permission-handler.ts:60-100`, `:1050-1100` (allow at `:1084`)
  - `tool-output-capper.ts:50-140` (`appliesTo` `:108`, call `:132`)
  - `implementation-plan.md:125-129`, `:154-163`
- Contract excerpts:
  - `createGatewayApprovalGate(heldPermissionCallback, { isGatewayTool, ... })`.
    - Matcher: `mcp__ptah__.*`.
    - The hook returns `{}` unless `isGatewayTool(tool_name)`. That covers `ptah_cron_*` and every
      other host tool.
    - For a gateway tool, the hook runs the held callback. It returns
      `permissionDecision: 'deny'` on deny, timeout, a missing decision or an error. It returns `{}`
      only on an explicit allow, with the decision remembered by tool-use id.
    - Its `canUseTool` uses `isGatewayTool` in place of `isCronMutatingTool`, in both places (N2a).
      It delegates non-gateway names to a wrapped `next` `canUseTool`, so it can wrap the cron gate
      (R1).
  - Unattended session: `:1084` excludes `isGatewayTool` names from the `mcp__ptah__` auto-allow.
    `mcp__ptah__ptah_cron_list` stays allowed.
  - Capper (R2): gateway names are capped. Detection uses an optional `isGatewayTool` predicate.
    Unbound keeps today's behaviour; bound is fail-closed.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/agent-sdk`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/agent-sdk`
- Acceptance: the C5 required specs (`implementation-plan.md:156-163`), as they apply to these files:
  - A stored `mcp__ptah__*` allow rule does not auto-approve a gateway tool; the hook calls the
    callback and denies when the callback denies.
  - Timeout, error, or no decision → deny.
  - `{}` for `ptah_cron_create` and for host tools.
  - Matcher cases: `mcp__ptah__zernio__create_post`, `mcp__ptah__zernio_ab12__create_post`, and an
    unknown `mcp__ptah__x__y` (gateway).
  - The unattended out-of-policy branch is taken.
  - The capper caps a gateway result and still exempts host tools.
  - A gateway gate wrapping a cron gate asks once for a cron tool and once for a gateway tool (N2c).
- Status: PENDING

### Task 9.1: Gateway approval gate - PENDING

### Task 9.2: Unattended exclusion - PENDING

### Task 9.3: Capper detection - PENDING

## Batch 10: Opt-in plumbing, suppression, gate wiring (C4 + C5 wiring) - COMPLETE

- Id: P1-B10 | Phase: P1 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B4, B7) | Execution mode: sequential
- Depends on: B9
- Write set:
  - `L\agent-sdk\src\lib\internal-query\internal-query.types.ts`
  - `L\agent-sdk\src\lib\internal-query\internal-query.service.ts`
  - `L\agent-sdk\src\lib\internal-query\internal-query.service.spec.ts`
  - `L\agent-sdk\src\lib\helpers\sdk-query-runner.service.ts`
  - `L\agent-sdk\src\lib\helpers\sdk-query-runner.mcp-delivery.spec.ts`
  - `L\agent-sdk\src\lib\helpers\sdk-query-options-builder.ts`
  - `L\agent-sdk\src\lib\helpers\sdk-query-options-builder.capabilities.spec.ts`
- Read set:
  - Builder: `:495-640`, `:1380-1520` (held callback `:1388`, cron gate `:1401`,
    `canUseToolCallback` `:1411`, PreToolUse list `:1512-1517`), `:1600-1710`
    (`capabilityFlagsFor` `:1668`), `:2410-2485` (`cronWriteApproval` `:2437`)
  - Runner: `:170-260` (`bypassPermissions` `:250`), `:680-912` (hooks `:707`,
    `buildOneShotMcpServers` `:840-869`, `buildOneShotHooks` `:871-910`)
  - `internal-query.service.ts:100-140`, `internal-query.types.ts`
  - B9 gate
- Contract excerpts:
  - `InternalQueryConfig.includeConnectors?: boolean` and `OneShotRunInput.includeConnectors?:
    boolean`, passed through at `internal-query.service.ts:120-134`.
  - The `internal-query` binding carries `includeConnectors: true` only when the input is true. No
    existing caller sets it.
  - The session credential gets `gatewayApproval: true` next to `cronWriteApproval`.
  - Gate wiring: `gatewayGate = createGatewayApprovalGate(heldPermissionCallback, { next:
    cronApprovalGate.canUseTool, isGatewayTool })`. `canUseToolCallback = gatewayGate.canUseTool`.
    `gatewayGate.hookMatcher` is placed next to `cronApprovalGate.hookMatcher`.
  - N2b: change `buildOneShotHooks(cwd)` to `buildOneShotHooks(cwd, includeConnectors)`. It adds a
    `PreToolUse` matcher `mcp__ptah__.*` that denies any `isGatewayTool` name unless
    `includeConnectors` is true, with the reason "connectors are not enabled for this run".
  - When `ptah` survives policy (and, for a one-shot, `includeConnectors`), the builder and runner add
    `await gateway.servedFileServerNames(cwd)` to `capabilityFlagsFor`'s extra list. On error: empty
    list plus a warning.
  - The gateway port is injected optionally (pattern: `job-runner.ts:118-119`).
  - The capper predicate is wired here if the capper is constructed in these files.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/agent-sdk`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/agent-sdk`
- Acceptance:
  - Regression 1: the builder keeps `ptah` with no overrides; the session binding carries
    `gatewayApproval`.
  - The binding carries `includeConnectors` only when set; curator-style input mints none.
  - The one-shot hook denies a gateway tool with no opt-in and allows it with the opt-in.
  - N1 spec: with the hook absent (or bypassed), a no-opt-in one-shot binding still lists and calls no
    gateway tool. Assert at the binding and server-policy seam via B3's `gateway-caller-policy`.
  - The suppression list includes the served file names; a thrown error gives an empty list.
  - The builder spec runs a cron tool through both gates and asserts one ask (N2c).
- Status: PENDING

### Task 10.1: `includeConnectors` threading and binding flags - PENDING

### Task 10.2: Gate composition and one-shot hook - PENDING

- Depends on: Task 10.1

### Task 10.3: Flag-tier suppression of served file servers - PENDING

## Batch 11: Session status from the gateway (C6) - COMPLETE

- Id: P1-B11 | Phase: P1 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B5, B8) | Execution mode: sequential
- Depends on: B10 (same project, not concurrent)
- Write set:
  - `L\agent-sdk\src\lib\helpers\stream-transformer.ts`
  - `L\agent-sdk\src\lib\helpers\stream-transformer.spec.ts`
  - `L\agent-sdk\src\lib\helpers\mcp-server-backoff.service.ts`
  - `L\agent-sdk\src\lib\helpers\mcp-server-backoff.service.spec.ts`
- Read set:
  - `stream-transformer.ts:770-810`
  - `mcp-server-backoff.service.ts:1-120`
  - `W\libs\shared\src\lib\types\messages\session-mcp-status.ts:30-60`
- Contract excerpts:
  - On init `mcp_servers`, append `gateway.status(scope)` entries with `name = serverKey` and
    `source: 'ptah-gateway'`.
  - Back-off ignores `source: 'ptah-gateway'` (`:110`).
  - No UI change.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/agent-sdk`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/agent-sdk`
- Acceptance:
  - Specs cover the append and the back-off skip.
  - An unbound gateway leaves the output unchanged.
- Status: PENDING

### Task 11.1: Status append and back-off skip - PENDING

## Batch 12: Cron opt-in and run-summary warning (C9) - COMPLETE

- Id: P1-B12 | Phase: P1 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B13) | Execution mode: sequential
- Depends on: B1, B10 (the `includeConnectors` field on the execute input)
- Write set:
  - `L\cron-scheduler\src\lib\job-runner.ts`
  - `L\cron-scheduler\src\lib\job-runner.spec.ts`
- Read set: `job-runner.ts:90-330` (optional injection `:118-119`, execute `:285-295`, loop
  `:302-321`), `implementation-plan.md:174-178`.
- Contract excerpts:
  - The runner passes `includeConnectors: true` to `execute`. It is the only caller that does.
  - Capture init `mcp_servers` entries that are not `connected` or `disabled`.
  - After the loop, add the optional gateway's `status({kind:'internal-query',
    capability:'privileged', includeConnectors:true, workspaceRoot})` entries that are not
    `connected`.
  - Summary = `base` (cap 500) + `\n[warning] MCP unavailable: name(status: detail), …` (cap 300).
  - Run status is unchanged, and there is no schema field (decision 6).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cron-scheduler`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cron-scheduler`
- Acceptance:
  - Regression 2, cron half: the flag is passed.
  - A `needs-auth` entry and a cold-start `pending` entry with timeout detail are each named in the
    warning.
  - The caps hold, and the status is unchanged.
- Status: PENDING

### Task 12.1: Opt-in and warning - PENDING

## Batch 13: Remove chat:start connector overrides (C8, D-U1 Option 1) - COMPLETE

- Id: P1-B13 | Phase: P1 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B12) | Execution mode: sequential
- Depends on: B5, B7 (the gateway is bound and listed before the overrides go; R10)
- Write set:
  - `L\rpc-handlers\src\lib\chat\session\chat-session.service.ts`
  - `L\rpc-handlers\src\lib\chat\session\chat-session.native.spec.ts`
  - `L\rpc-handlers\src\lib\chat\session\chat-session.host-routing.spec.ts`
  - `L\rpc-handlers\src\lib\chat\session\chat-session-agent-child.spec.ts`
- Read set:
  - `chat-session.service.ts:870-1035`, `:1860-1910`
  - `chat-session.native.spec.ts:394-456`, `chat-session.host-routing.spec.ts:221`,
    `chat-session-agent-child.spec.ts:254`
- Contract excerpts:
  - Delete the Smithery and OAuth resolver getters (`:877-950`).
  - `buildMcpServersOverride` (`:1002-1031`) reduces to the `callerOverride` passthrough.
  - `mergeMcpOverride` is unchanged.
  - Delete the now-unused imports and constructor deps (replace, do not accumulate).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/rpc-handlers`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/rpc-handlers`
- Acceptance:
  - No connector override is built in rpc-handlers.
  - The three specs are updated.
  - `rpc-surface.spec.ts` passes.
  - The PR-notes text for the rename and its resumed-history effect (D-U1) is returned in the report.
- Status: PENDING

### Task 13.1: Delete per-connector overrides - PENDING

---

# Phase P2 - Ptah-hosted stdio, strict MCP, no harness MCP writing

Starts after the P1 gate, the P1 phase review (accepted) and the Live review P1 pass. Phase review:
code-logic on the combined P2 diff after B22. Style review: none, because P2 adds no new public API
(the port is unchanged). Parity check: `parity-inventory.md` (B15) row by row in Mode 3.

P2 gate:

- `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/agent-sdk,@ptah-extension/harness-sync,@ptah-extension/vscode-lm-tools,ptah-electron`
  The header must say "for 5 projects".
- Then Live review, P2 pass.

## Batch 14: Stdio host and plugin MCP source (C10, D-U4 Option 1) - COMPLETE

- Id: P2-B1 | Phase: P2 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: unavailable (`ptah_count_tokens` not listed)
- Parallel-safe: no (first P2 batch) | Execution mode: sequential
- Depends on: P1 complete
- Write set:
  - `GW\stdio-server-host.ts` (CREATE), `GW\stdio-server-host.spec.ts` (CREATE)
  - `GW\server-sources.ts`, `GW\server-sources.spec.ts`
  - `GW\mcp-gateway.service.ts`, `GW\mcp-gateway.service.spec.ts`
- Read set:
  - root `node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.d.ts:19-47`
  - the capability-policy plugin rows in `capability-policy-model.ts`
  - `MH\http-mcp-server.service.ts` (`stop` hook)
  - `implementation-plan.md:179-183`, `:258`
- Contract excerpts:
  - One `StdioClientTransport` per (root key, command, args, env hash), with `cwd` = root.
  - Env = `getDefaultEnvironment()` plus the entry's own expanded `env`. The whole Ptah env is never
    passed.
  - Spawned as an argument array.
  - stderr goes to a 50-line ring.
  - Restart back-off 1/2/4 s, at most 3 in 10 min, then `failed`.
  - Idle shutdown at 10 min, with one sweep interval.
  - `dispose()` kills every process tree, called via `HttpMcpServer.stop`. If that hook needs an
    edit, report it; a fix batch adds it.
  - Stdio dedup key: resolved command, args, env-key hash.
  - The plugin source sources enabled plugins' MCP declarations.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- Acceptance:
  - The C10 specs pass with a fake transport and a fake clock.
  - A sentinel `ANTHROPIC_API_KEY` is absent from the child env.
  - Restart cap, idle shutdown and dispose are covered.
  - Plugin-declared servers are listed.
- Status: COMPLETE (batch-14-report.md)

### Task 14.1: Stdio host - COMPLETE

### Task 14.2: Stdio and plugin sources wired into the service - COMPLETE

## Batch 15: Parity inventory (C12 first step) - PENDING

- Id: P2-B2 | Phase: P2 | Shape: docs
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B14; it writes no source) | Execution mode: sequential
- Depends on: P1 complete
- Write set: `W\.ptah\specs\TASK_2026_979_9e1f\parity-inventory.md` (CREATE)
- Read set:
  - `implementation-plan.md:188-214` (parity table)
  - every row's `file:line` at the base commit `a4e0154ae`
  - `rg -n "mcp" libs/backend/harness-sync/src/lib/health`
  - the facet readers named in R5
- Contract excerpts:
  - Columns: Capability | File:line | Decision (keep / move / remove) | Replacement | Proving test.
  - Approval for each `remove` row cites `decisions.md` row 10 or 13.
  - A section lists the facet read APIs that stay (R5).
- Verify: none (docs). The team-leader checks it against the old surface at `a4e0154ae` in Mode 2.
- Acceptance:
  - Every capability the old surface has (MCP facet writes, slot writer, agy spawn write,
    install/uninstall reconcile, health rows) has a row.
  - No removal lacks an approval reference.
- Status: PENDING

### Task 15.1: Write parity-inventory.md - PENDING

## Batch 16: Harness targets stop writing MCP (C12a) - COMPLETE

- Id: P2-B3 | Phase: P2 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B18, B19) | Execution mode: sequential
- Depends on: B15
- Write set:
  - `L\harness-sync\src\lib\targets\claude-target.ts`
  - `L\harness-sync\src\lib\targets\claude-target.retirement.spec.ts`
  - `L\harness-sync\src\lib\targets\workspace-target.ts`
  - `L\harness-sync\src\lib\targets\workspace-target.retirement.spec.ts`
  - `L\harness-sync\src\lib\targets\rival-targets.ts`
  - `L\harness-sync\src\lib\targets\rival-targets.no-mcp.spec.ts` (CREATE)
  - `L\harness-sync\src\lib\targets\harness-target.port.ts`
- Read set: `claude-target.ts:340-460`, `workspace-target.ts:340-560`, `rival-targets.ts:120-230`,
  `harness-target.port.ts`, `parity-inventory.md`.
- Contract excerpts:
  - Remove the planner and apply calls (`claude-target.ts:362`, `:443`; `workspace-target.ts:363`,
    `:542`).
  - Remove `mcpFacet` from `rival-targets.ts:134-220`.
  - Skills, commands, agents and the gitignore block are unchanged.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/harness-sync`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/harness-sync`
- Acceptance:
  - No target performs an MCP facet write (spec with a fake fs).
  - The existing skills, commands and gitignore specs pass unchanged.
- Status: COMPLETE (see batch-16-report.md)

### Task 16.1: Remove MCP facet calls from targets - COMPLETE

## Batch 17: Planner and reconciler MCP removal (C12b) - COMPLETE

- Id: P2-B4 | Phase: P2 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: no (same project as B16) | Execution mode: sequential
- Depends on: B16
- Write set (at most 8; if `rg` shows more, finish these and report the rest so that the team-leader
  adds a batch):
  - `L\harness-sync\src\lib\targets\mcp\mcp-facet-planner.ts` (delete when zero importers)
  - `L\harness-sync\src\lib\targets\mcp\mcp-facet-planner.retirement.spec.ts` (delete with it)
  - `L\harness-sync\src\lib\targets\mcp\mcp-facet-planner.linked-worktree.spec.ts` (delete with it)
  - `L\harness-sync\src\lib\reconciler\harness-reconciler.service.ts`
  - `L\harness-sync\src\lib\reconciler\harness-reconciler.retirement.spec.ts`
  - `L\harness-sync\src\lib\repair\blocked-repair.service.ts`
  - `L\harness-sync\src\lib\health\harness-destination-scanner.ts`
  - `L\harness-sync\src\index.ts`
- Read set:
  - `mcp-facet-planner.ts:60-335`
  - `harness-reconciler.service.ts:280-360`
  - `harness-reconciler.antigravity-mcp.spec.ts`
  - `mcp-facet.registry.ts`
  - `parity-inventory.md`
- Contract excerpts:
  - Manifest MCP keys and the retirement proof go with the planner.
  - Facet modules that readers import stay: `json-mcp-facet.ts`, `codex-toml-mcp-facet.ts`,
    `mcp-facet.registry.ts` and their read API (R5).
  - `linked-worktree.ts` stays (D3).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/harness-sync`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/harness-sync`
- Acceptance:
  - Spec "no MCP plan rows".
  - `rg -n "planMcpFacet|applyMcpFacet" libs/backend` is empty.
  - Every reader in R5 still compiles.
- Status: COMPLETE (see batch-17-report.md)

### Task 17.1: Remove the planner and its reconciler, repair and health uses - COMPLETE

## Batch 18: Install records intent only (C12c) - COMPLETE

- Id: P2-B5 | Phase: P2 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B16, B19) | Execution mode: sequential
- Depends on: B14 (same project), B15
- Write set:
  - `L\cli-agent-runtime\src\lib\mcp-directory\mcp-install.service.ts`
  - `L\cli-agent-runtime\src\lib\mcp-directory\mcp-install.service.spec.ts`
- Read set: `mcp-install.service.ts:222-330`, `:415-464`, `:590-730`; `parity-inventory.md`.
- Contract excerpts:
  - Install, uninstall and makeGlobal record intents only. The facet reconcile at `:596-611` and
    `:718+` is removed, with B2's guard going along with it.
  - `listDeclarations` and `inspect` stay read-only.
  - `ptah_harness_install_mcp_server` still records an intent.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- Acceptance: the install spec shows an intent recorded and no facet write; the list spec is
  unchanged.
- Status: COMPLETE (see batch-18-report.md)

### Task 18.1: Intent-only install - COMPLETE

## Batch 19: Remove the Ptah slot writer (C12d; C13 = D-U5 Option 1) - COMPLETE

- Id: P2-B6 | Phase: P2 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: yes (with B16, B18) | Execution mode: sequential
- Depends on: B15
- Write set:
  - `MH\ptah-mcp-slots.ts` (delete when zero importers)
  - `MH\ptah-mcp-slots.spec.ts` (delete with it)
  - `MH\http-mcp-server.service.ts`
  - `MH\http-mcp-server.service.spec.ts`
  - `MH\http-mcp-server.service.concurrency.spec.ts`
- Read set: `http-mcp-server.service.ts:530-560`, `:700-860`; `ptah-mcp-slots.ts`;
  `retired-ptah-mcp-slots.ts`; `parity-inventory.md`.
- Contract excerpts:
  - Remove `planPtahMcpSlots` and the subagent-discovery registration (`:535-560`, `:718`, `:830`).
  - The retired sweep and its linked-worktree skip stay (D-U5 Option 1: leave pre-P2 entries; C13
    makes no change).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/vscode-lm-tools`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/vscode-lm-tools`
- Acceptance: the http server spec shows no slot writes; the retired-sweep spec, including the B8
  case, passes.
- Status: COMPLETE (batch-19-report.md)

### Task 19.1: Remove the slot writer - COMPLETE

## Batch 20: Strict MCP for Claude (C11) - PENDING

- Id: P2-B7 | Phase: P2 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: no | Execution mode: sequential
- Depends on: B14, and Live precondition LR-P2-0 PASS, recorded in the brief. If LR-P2-0(a) fails,
  this batch does not start; the orchestrator takes the loss to the user (R8).
- Write set:
  - `L\agent-sdk\src\lib\helpers\sdk-query-options-builder.ts`
  - `L\agent-sdk\src\lib\helpers\sdk-query-options-builder.capabilities.spec.ts`
  - `L\agent-sdk\src\lib\helpers\sdk-query-runner.service.ts`
  - `L\agent-sdk\src\lib\helpers\sdk-query-runner.mcp-delivery.spec.ts`
- Read set:
  - builder `:500-640`, `:1600-1710`; runner `:680-710`
  - root `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2506-2513`
  - `rg -n "agents\s*[:=]" libs/backend/agent-sdk/src` (A7)
- Contract excerpts:
  - Set `strictMcpConfig: true` when the gateway is bound.
  - Remove the P1 flag-tier served-name list (B10 Task 10.3). Replace, do not accumulate.
  - If A7 finds `agents` definitions with `mcpServers`, strip their hub-served keys.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/agent-sdk`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/agent-sdk`
- Acceptance:
  - Regression 6, strict half: strict is set iff bound.
  - The A7 result is recorded.
  - Unbound means today's behaviour.
- Status: PENDING

### Task 20.1: Strict flag, flag-tier removal, A7 - PENDING

## Batch 21: Lane config switches, copilot, cursor, opencode (C14a) - COMPLETE

- Id: P2-B8 | Phase: P2 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: no (same project as B18 and B22) | Execution mode: sequential
- Depends on: B18
- Write set (under `L\cli-agent-runtime\src\lib\cli-agents\cli-adapters\`):
  - `copilot-sdk.adapter.ts`, `copilot-sdk.adapter.spec.ts`
  - `cursor-cli.adapter.ts`, `cursor-cli.adapter.spec.ts`
  - `opencode-cli.adapter.ts`, `opencode-cli.adapter.spec.ts`
- Read set:
  - `copilot-sdk.adapter.ts:340-370`, `copilot-sdk.d.ts`
  - `cursor-cli.adapter.ts:400-440`
  - `opencode-cli.adapter.ts:290-330`
  - each CLI's `--help` (local, no paid runs)
- Contract excerpts:
  - A5 applies per provider. Set a spawn switch so the lane loads only `ptah`, and only where the
    switch is verified from help text or SDK types.
  - An unverified provider is recorded and not changed.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- Acceptance:
  - A5 findings are recorded per provider.
  - Each verified switch has a spec asserting the argv or env.
  - The `ptah` injection is unchanged.
- Status: COMPLETE (cursor switch verified and set; copilot and opencode unverified and
  unchanged; see `batch-21-report.md`)

### Task 21.1: Copilot, cursor and opencode switches - COMPLETE

## Batch 22: grok switch, and the agy stream-json write removal (C14b + C12e, row 13) - COMPLETE

- Id: P2-B9 | Phase: P2 | Shape: logic
- Recommended executor: backend-developer (subagent; reason: lanes disabled)
- Required Skills: none
- Estimated weight: unavailable | Actual weight: pending
- Parallel-safe: no | Execution mode: sequential
- Depends on: B21, B15
- Write set (under `L\cli-agent-runtime\src\lib\cli-agents\cli-adapters\`):
  - `grok-cli.adapter.ts`, `grok-cli.adapter.spec.ts`
  - `antigravity-cli.adapter.ts`, `antigravity-cli.adapter.mcp.spec.ts`
  - Row 36 (under `L\cli-agent-runtime\src\lib\cli-agents\`): `lane-mcp-token-rule.ts`,
    `lane-mcp-token-rule.spec.ts`
- Read set: `antigravity-cli.adapter.ts:1-30`, `:1160-1280`; `antigravity-acp-lane.ts`
  (`session/new.mcpServers`); `grok-cli.adapter.ts`; `parity-inventory.md`.
- Contract excerpts:
  - Remove the spawn-time `ptah` write and the restore of `~/.gemini/config/mcp_config.json`
    (`facet.write` `:1231`, `facet.remove`/`write` `:1265-1267`).
  - The ACP path keeps `ptah` via `session/new.mcpServers`.
  - Consequence (user-approved, row 13): the stream-json fallback has no `ptah` server.
  - The A5 switch applies to grok and agy only if verified.
  - Row 36: after the write removal, `laneMcpTokenCapability('antigravity')` returns
    `privileged` (`lane-mcp-token-rule.ts`, `lane-mcp-token-rule.spec.ts`); the token is still
    revoked at teardown (`agent-process-manager.service.ts` `onMcpConfigRestored`).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- Acceptance:
  - `antigravity-cli.adapter.mcp.spec.ts`: a stream-json spawn records zero writes to the home
    `mcp_config.json` (fake fs).
  - The ACP spec still passes.
  - An agy ACP lane token is `privileged`; live: agy lists `livecheck__echo` (P2 live review).
  - A5 findings for grok and agy are recorded.
- Status: COMPLETE (grok and agy A5 unverified, no switch; row 13 write removed; row 36
  privileged; the live `livecheck__echo` check stays with the P2 live review; see
  `batch-22-report.md`)

### Task 22.1: grok switch - COMPLETE

### Task 22.2: agy spawn-write removal - COMPLETE

## Batch 23: P2 fix reserve - COMPLETE

- Id: P2-B10 | Phase: P2 | Shape: logic
- Purpose: a placeholder for an overflow from B17 (more than 8 files), a `HttpMcpServer.stop`
  dispose hook edit from B14, or a `validate-deps` failure (A3, devops-engineer). If none of these
  occurs, the team-leader marks it COMPLETE with "not needed" and no commit.
- Recommended executor: backend-developer, or devops-engineer for A3 (subagent; reason: lanes
  disabled)
- Required Skills: none
- Write set: defined when the trigger occurs. Verify: the scoped pair for its project.
- Status: PENDING

---

## Live review (completion gate)

Required by `decisions.md` row 18, which authorizes running the Electron app. This review runs in
the Electron app (`apps/ptah-electron`) only, never the VS Code host. It runs twice:

- P1 pass: after the P1 gate and the P1 phase review.
- P2 pass: after the P2 gate. Every item runs again, plus LR-P2-0 before B20 is merged.

Setup:

- A Ptah-authenticated connector: Settings > Connectors, for example zernio. Record the alias the
  gateway uses.
- One `.mcp.json` entry, one `~/.claude.json` entry and one `.vscode/mcp.json` entry, each with the
  same URL as the connector under another name.
- `[MCP]` debug logging on (`DEBUG=mcp*` or the app's MCP debug setting).

Evidence:

- Store screenshots and log excerpts under `W\.ptah\specs\TASK_2026_979_9e1f\live-review\<pass>\`.
  Log lines contain no tokens.
- Record each item as PASS, FAIL or N/A (provider not installed, with the reason) in
  `test-report.md`.
- Any FAIL blocks Mode 3 completion.

| # | Check | Steps | Evidence | Pass criterion |
| --- | --- | --- | --- | --- |
| LR-1 | Main chat, each available provider: connector tools present and callable; `ptah` tools work | For each provider profile available in main chat (Claude SDK; each other provider listed in the provider picker), start a new chat. Ask it to list its tools, call one read-only connector tool (`mcp__ptah__<alias>__<tool>`) and one host tool (`ptah_workspace_analyze` or similar). | Screenshot of the tool-call cards per provider; main-process log `[MCP] tool result` lines for both calls | Each provider lists `mcp__ptah__<alias>__*`. Both calls return non-error results. No `mcp__oauth-...` names appear. |
| LR-2 | `chat:continue` that forces an SDK resume keeps connector tools (#1468) | Start a chat, call a connector tool, restart the app (or abort until the session is cold), then continue the same chat and call the connector tool again. | Log showing an SDK resume (resume session id) and the init `mcp_servers` containing `ptah` `connected`; screenshot of the second call | The second call succeeds without "no such tool". At most one stale-name retry is allowed (D-U1 note). |
| LR-3 | Slash-command resume keeps connector tools (#1468) | In a resumed chat, run a slash command that triggers a resume (for example a `/` command from the commands list), then call a connector tool. | Screenshot; log line for the call | The call succeeds. |
| LR-4 | Cron job calls a connector tool; cold start (#1466, A8) | (a) Create a scheduled job whose prompt calls `mcp__ptah__<alias>__<read tool>`; run it now. (b) Restart the app and run it immediately (cold upstream). Record the CLI's MCP request timeout. | Run history entry summary; log timing between `tools/list` request and response | (a) The run summary shows the tool result. (b) The tools are listed within 12 s, or the summary names the server as `pending` with timeout detail. The CLI did not time out `ptah` `tools/list` before the gateway answered (A8). |
| LR-5 | Forced server failure shows the run-summary warning (#1466) | Revoke or expire the connector token (or point an intent server at a closed port), then run the job. | Run history summary text | The summary ends with `[warning] MCP unavailable: <name>(needs-auth\|failed: ...)`. The run status is unchanged from what the prompt outcome gives. |
| LR-6 | Duplicate `.mcp.json` / `~/.claude.json` / `.vscode/mcp.json` entry with the connector URL is loaded once (A9) | Start a main chat with the three duplicate entries present. | Init `mcp_servers` from the debug log; tool list | Exactly one server's tools appear (`mcp__ptah__<alias>__*`), and no `mcp__<dupname>__*` appears. P1: any source the flag tier does not suppress is recorded as a PR note, not a FAIL (A9 fallback). P2: no duplicate from any source. |
| LR-7 | Enabling or disabling a connector mid-session triggers `list_changed` (A4) | In a live chat, disable the connector in Settings, ask the model to list tools; re-enable, list again. | Log line writing `notifications/tools/list_changed` on the GET stream, and the CLI re-list request | The tools disappear after disable and reappear after enable without a new session. If A4 fails (no GET stream or no re-list), record it. Then the pass criterion is "tools refresh at the next resume". |
| LR-8 | CLI lanes see `mcp__ptah__<server>__*` through `ptah`; the lane-report credential sees none | From a main chat, spawn a lane for each installed provider: codex, copilot, cursor, opencode, grok, agy ACP, and the claude lane. Prompt each to list tools whose names contain `<alias>__` and call one read-only connector tool. Then spawn agy on the stream-json path (`PTAH_AGY_TRANSPORT`) and the lane-report credential path. | Lane transcripts or `ptah_agent_read` output per provider; dispatcher log of the caller kind and class | Each privileged lane lists and calls the connector tool. The lane-report caller lists zero gateway tools, and a direct call is refused by policy. P2: the agy stream-json lane has no `ptah` (row 13), which is expected and not a FAIL. |
| LR-9 | `ptah_session_start` child worktree has a clean `git status` after harness sync (#1469) | In a repo with a tracked `.vscode/mcp.json` and `.agents/mcp_config.json`, start a child session with `ptah_session_start` on a new worktree; wait for harness sync and MCP server start. | `git -C <child worktree> status --porcelain` output; directory listing showing no `*.bak` | The output is empty and no `.bak` file exists. |
| LR-10 | N1 / A10: PreToolUse deny honoured under `bypassPermissions` | Run a one-time script with the installed `@anthropic-ai/claude-agent-sdk`: `query()` with `permissionMode: 'bypassPermissions'` and a `PreToolUse` hook that returns `permissionDecision: 'deny'` for `Bash`, prompting "run `echo hi`". Then, in Electron, run the cron job from LR-4 and confirm the one-shot gateway hook log line shows it ran (`allow`, opt-in set). | Script stdout showing the tool denied; Electron log line from the one-shot gateway hook | The SDK reports the Bash call denied, and the command did not run. The hook log line appears for the cron run. If the deny is not honoured, record it. The server-side policy (B10 N1 spec) remains the enforcement, and a fix batch documents the hook as advisory only. |
| LR-11 | Approval prompts for gateway tools in interactive sessions | In an interactive (non-YOLO) chat, add a stored allow rule `mcp__ptah__*` (or allow a host tool "always"), then ask for a connector tool call. Deny once, then allow once. | Screenshot of the permission prompt for `mcp__ptah__<alias>__<tool>`; tool card showing the denied call, then the allowed one | A prompt appears despite the `mcp__ptah__*` allow rule. Deny blocks the call; allow runs it once. A cron tool still shows the cron prompt exactly once (N2c). |
| LR-P2-0 | C11 precondition (P2 only, before B20 merges) | With the P2 build minus B20, toggle `strictMcpConfig` locally (uncommitted) on one session. Check (a) claude.ai account connectors, (b) enabled plugins' MCP, and (c) the A7 result from B20. | Init `mcp_servers` with strict on; tool list | (a) claude.ai connectors still load, or are served by the hub. (b) Plugin MCP tools are served by the hub (D-U4). (c) A7 is resolved. If (a) fails, B20 is not merged and the orchestrator raises a new user decision. |

### LR-12 (added by user decision row 32): agents in a child worktree without worktree MCP writes
- Steps: start a child session with `ptah_session_start` (new branch + worktree). In it: (a) main session lists `mcp__ptah__*` host tools and `mcp__ptah__<server>__*` gateway tools; (b) a Claude `Task` subagent calls one `ptah` tool and one gateway tool; (c) one CLI lane (codex) spawned from the child calls one gateway tool.
- Evidence: tool lists or log lines per agent; `git status --porcelain` in the worktree is empty; no `.mcp.json` / `.cursor/mcp.json` / `.codex/config.toml` / `.agents/mcp_config.json` written or changed.
- Pass: all three see the tools with no worktree config written. Fail on (b) -> back to the user with evidence before any worktree write is added.

## P2 amendments from the parity inventory (decision row 38)

- B16 write set adds `libs/backend/harness-sync/src/lib/di/register.ts` and `libs/backend/harness-sync/src/index.ts` (G3).
- B17: old `kind:'mcp'` manifest rows are dropped on load and never counted in preflight
  (`harness-reconciler.service.ts:815` compare); the manifest schema still accepts `mcp` (D1).
- B18 write set adds rpc-handlers `harness-mcp-install.service.ts`, `external-plugin-mcp.service.ts`,
  `harness-workflow-prompt.service.ts` (+ their specs). Install results stop claiming written paths;
  the workflow prompt stops telling agents servers land in `.mcp.json` / `.vscode/mcp.json` (G1).
  Force uninstall of a user-owned key is removed (D2).
- B19 keeps `ensureRegisteredForSubagents` and the `retainRoot`/`releaseRoot` port as non-writing
  readiness answers; callers stay unchanged (G2).
- B23 (from B14 report): `HttpMcpServer.disposeAsync()` calls `gateway?.dispose()` (not `stop()`,
  which may restart), and the Electron `will-quit` chain (`apps/ptah-electron/src/main.ts`)
  disposes `PLATFORM_TOKENS.MCP_GATEWAY`, so stdio children die on quit. Follow-up only: export
  and reuse the `upstream-client.ts` connect/list helpers duplicated in `stdio-server-host.ts`.
- B23 (from B19 report): fix stale docs that still say `.mcp.json` is written —
  `platform-core` `mcp-subagent-root-registrar.interface.ts`, consumer call-site comments (e.g.
  `chat-ptah-cli.service.ts:114`), and comments naming the deleted `ptah-mcp-slots.ts`
  (`cli-agent-runtime` `ptah-mcp-url.ts:15`, `codex-runtime` `codex-ptah-mcp.ts:9,31`). Remove
  `McpCallerTokenRegistry.preparePersistent` if it has no caller.
- B23 (from B18 report, MUST): `listInstalled` / the marketplace Installed tab reads the intent
  store (`McpIntentStore`) so recorded servers show; fix rpc-handlers `chat-session.service.ts:1235`
  and `:2057` TS2367 (compares against readiness values B19 removed); `harness-namespace.builder.ts`
  (vscode-lm-tools) stops pushing `configPath` into `installedPaths` and stops saying "written".
- B23 (live finding + B18): invalidate the gateway sources and fire `onToolsChanged` at once on
  install, uninstall and `capabilities:setEnabled`, instead of waiting for the 30 s poll.
- Follow-up only: dead frontend `'direct'` removal paths, shared `force` uninstall param and old
  reconcile/write result codes; drop the unused `_reconciler` ctor param from its five callers.
- B23 (from B17 report): finish inventory row 20 — drop the resolver's `mcpIntents` ctor arg and
  the `undefined` at its callers (`apps/ptah-electron/src/di/phase-2-libraries.ts:345-347`,
  `libs/backend/cli-engine/src/lib/container.ts:837-839`, rpc-handlers
  `wizard-generation.preview-fidelity.spec.ts`); stale MCP wording in shared
  `harness-blocked-wording.ts:76,:260`, marketplace `harness-blocked-paths.component.ts:94` and the
  reconciler's pinned warning (change together); stale comment `harness-sync.types.ts:483`.
