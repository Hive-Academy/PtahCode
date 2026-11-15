## Summary

**CONFIRMED:** The MCP dispatcher awaits the gate, spawn, and optional limit formatting before replying (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1133-1290`). This plan first ships bounded limit work, dedupe, and timing, then an early `starting` reply. [user-requested]

## Where the time goes

| Step | Evidence | Needed for reply? |
|---|---|---|
| Named limit gate | **CONFIRMED:** dispatcher `:1163-1188`; current 4,000 ms limit at `agent-spawn-limit-gate.ts:35-36,123-147`. | Policy yes; shorten budget. |
| Admission | **CONFIRMED:** role/skills in `agent-namespace.builder.ts:364-430,568-607`; slot, CLI, worktree, account, preflight, MCP port, resume in `agent-process-manager.service.ts:539-663`. | Must either finish or surface later failure. |
| SDK handle | **CONFIRMED:** manager allocates ID `:1004`, then awaits `runSdk` `:1133-1197`, tracks handle `:1227-1246`. | ID and tracked reservation yes; handle no. |
| Codex before handle | **CONFIRMED:** binary `codex-app-server-lane.adapter.ts:276-278`, profile `:279-282`, user MCP names `:283-288`, resume identity `:367-383`. WRITE_DAC probe starts but is not awaited there (`:354-367`). | None needed to acknowledge `starting`. |
| Codex after handle | **CONFIRMED:** `runTurn(prompt)` starts asynchronous continuation at adapter `:730-812,823-840`. Context open waits for runtime startup, WRITE_DAC, identity persistence and account binding (`:478-575`); `startTurn` awaits at `:743-775`. **ASSUMED:** `runtime.open` internally starts app-server/handshake/thread; its substeps need timing. | First turn and CLI Session ID can arrive later via status. |
| Post-spawn limits | **CONFIRMED:** dispatcher `:1269-1290`; auto-detected path can start fresh 4 s wait (`bounded-limit-lookup.ts:63-79`). | Cosmetic. |

**CONFIRMED:** The 68-80 s observed bracket is manager log to tool result, not proof of one await (`research-report.md`, Fault 1 table; manager `:1069-1077,1133-1246`). [user-requested]

## Design

**Choose A.** **ASSUMED design:** after admission and ID allocation, install tracked `starting` record and reserve capacity, return `SpawnAgentResult` with ID/status/startedAt, then continue SDK startup in a handled promise. Successful handle tracking changes status to `running`; late failure changes it once to `failed`, saves bounded safe error text and `completedAt`, releases slot/token/instruction files, and fires existing terminal completion signal. Wait treats `starting` as pending. **CONFIRMED:** reservation currently increments before `doSpawn` and decrements on its return (`agent-process-manager.service.ts:539-545,3114-3126`); running counts only `running` (`:4042-4052`), so a pending record must consume exactly one slot. [user-requested]

**Reject B:** a hard budget around current `spawn()` cannot return its ID, because `spawn()` awaits `doSpawn()` (`agent-process-manager.service.ts:539-545`). **Reject C:** changing Codex alone misses other adapters and admission (`:594-642`). [lane-proposed]

**CONFIRMED status audit:** shared `AgentStatus` lacks `starting` (`libs/shared/src/lib/types/agent-process.types.ts:53-54`); `AgentProcessInfo` and `SpawnAgentResult` use it (`:201-215,494-505`). Manager running checks cover restore/wait/adoption `agent-process-manager.service.ts:1940,2210,2272,2525`, messaging/stop/dispose/guards/exit/cap `:2667,2817,2955-3092,3195,3244,3320,3462,4042-4052`. Notifier rejects only running (`lane-completion-notifier.service.ts:420-440`); reject starting too. MCP spawn/status/read/wait/list: `mcp-response-formatter.ts:1853-1964`, `agent-wait.tool.ts:163-205`, dispatcher `:1293-1305` and adjacent read/list branches. Frontend active filters: `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts:1166,1354-1368,1935,2075,2110,2297,2488,2502,3072`. Persisted references copy status (`lane-restore.ts:55-61`); stale starting after host restart becomes failed. [lane-proposed]

## Idempotency

**Choose host-derived default plus optional explicit `idempotencyKey`.** **CONFIRMED:** schema has `force`, no key (`agent-spawn-args.schema.ts:77-117`); dispatcher forwards no key (`protocol-dispatcher.ts:1190-1216`). **ASSUMED design:** process-local map keyed by authenticated caller identity when available, otherwise credential/workspace, plus normalized working directory, CLI or Ptah CLI ID, resume ID, task and other execution-affecting inputs. Hash canonical data with SHA-256; store digest and in-flight promise/result, not task text. Insert before first await. Concurrent second call awaits first result and never starts work; accepted result retained 120 s, pre-acceptance failure evicted. Bound map size and evict expired on access. Explicit key scopes to caller/workspace and supersedes derived digest. [user-requested]

**ASSUMED:** two intentionally identical Race panel launches collide within 120 s. `force:true` bypasses derived dedupe (and existing limit policy), or callers supply distinct explicit keys. Map is memory only: host restart loses protection. Do not trust body caller identity; HTTP derives caller from URL (`research-report.md`, Fault 1 HTTP row). [lane-proposed]

## Limit lookups

**CONFIRMED:** named-target AT LIMIT policy is at dispatcher `:1163-1188`. Gate wait is 4,000 ms and lookup continues after timeout (`agent-spawn-limit-gate.ts:35-36,123-147`; `bounded-limit-lookup.ts:27-60`). `lookupAgentLimits` calls list and limits (`protocol-dispatcher.ts:297-315`). Provider usage has per-owner 30 s memory cache/single flight (`libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:88,212-226`); Codex account usage caches 30 s (`codex-account-usage.service.ts:37,266`). **ASSUMED design:** cut gate wait to 1,000 ms, reuse existing cache, refuse known blocked rows, preserve unknown/pending response. Replace post-spawn `gate.resolveLimits` await (`protocol-dispatcher.ts:1269-1290`) with nonblocking settled gate snapshot. Auto-detected lanes omit cosmetic limit block; later list/status can report it. Avoid second lookup on formatted error path `:1217-1247`. [user-requested]

## Timing logs

**CONFIRMED:** generic `[MCP] slow tool` logs total only at `protocol-dispatcher.ts:795-813`, default threshold 2 s `:719-754`. **ASSUMED design:** one structured spawn timing record with ms for parse/dedupe, gate, namespace skill/role, manager CLI detection, worktree validation, account admission, harness preflight, MCP port, resume, Codex binary/profile/user-MCP/resume identity, `runSdk`, handle tracking, reply formatting and total-to-ack. Null for unvisited spans; correlate later startup record by agentId. Instrument dispatcher `:1133-1290`, namespace `agent-namespace.builder.ts:364-430,568-607`, manager `:555-663,1069-1246`, Codex adapter `:275-383,823-840`. No task/key/token/secrets in log. [user-requested]

## Implementation batches

Each batch below has at most six write files and two Nx projects. Checks are planned; none run here. [user-requested]

### B2.1 — bounded limits, dedupe, timing; ships alone

**Write set (6; vscode-lm-tools):** `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/{protocol-dispatcher.ts,agent-spawn-limit-gate.ts,agent-spawn-args.schema.ts,protocol-dispatcher.spec.ts,agent-spawn-limit-gate.spec.ts}`; `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts`. **Read set:** dispatcher `:297-315,795-813,1133-1290`; gate `:35-36,111-147`; schema `:77-133`; namespace `:364-430,568-607`; manager `:539-663,985-1246`; `bounded-limit-lookup.spec.ts:319-370`. **Contract:** optional bounded `idempotencyKey` in Zod schema; no `SpawnAgentResult` change; expose gate settled-value peek without await. Acceptance: simultaneous duplicate invokes spawn once, replay returns ID, distinct key/force permit intentional second spawn, known AT LIMIT refused, reply has no post-spawn limit wait, dispatcher/namespace timing on success/failure. Extend both write-set specs. Checks: `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-limit-gate.spec.ts`; `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`; `npx eslint <six write files>`. [lane-proposed]

### B2.2 — status contract and manager lifecycle

**Write set (5; shared, cli-agent-runtime):** `libs/shared/src/lib/types/agent-process.types.ts`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/{agent-process-manager.service.ts,agent-process-manager.service.spec.ts,lane-completion-notifier.service.ts,lane-completion-notifier.service.spec.ts}`. **Read set:** shared `:53-54,201-250,494-515`; manager `:539-663,985-1246,1418-1728,1928-2061,2180-2283,2955-3092,3113-3157,3431-3631,3835-3906,4042-4052`; notifier `:420-440`. **Contract:** `AgentStatus` adds `'starting'`; `AgentProcessInfo` adds optional bounded `startupError`; `SpawnAgentResult` may return starting without `cliSessionId`. Acceptance: reply precedes delayed `runSdk`, starting consumes slot, late failure visible/signalled once, stop during startup cancels continuation, provider CLI and Ptah CLI routes work. Extend manager and notifier specs. Checks: `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.spec.ts`; `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`; `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`; `npx eslint <five write files>`. [lane-proposed]

### B2.3 — MCP surfaces and persisted state

**Write set (6; cli-agent-runtime, vscode-lm-tools):** `libs/backend/cli-agent-runtime/src/lib/cli-agents/{lane-restore.ts,lane-restore.spec.ts}`; `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/{mcp-response-formatter.ts,mcp-response-formatter.spec.ts,agent-wait.tool.ts,agent-wait.tool.spec.ts}`. **Read set:** manager `:1928-2061,2122-2158,2180-2283,2400-2456`; restore `:48-61,103-130`; formatter `:1853-1964`; wait `:163-205`; dispatcher `:1293-1305` and adjacent read/list branches. **Contract:** manager B2.2 preserves `AgentWaitEntry.state='running'` for starting while `info.status='starting'`; status/read show startup error after failure; stale persisted starting becomes failed on restore. Acceptance: status/read/wait/list never mistake starting for exit, restart does not resurrect it. Extend formatter, restore and wait specs. Checks: `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-response-formatter.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-wait.tool.spec.ts`; `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-restore.spec.ts`; `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`; `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`; `npx eslint <five write files>`. [lane-proposed]

### B2.4 — renderer active rail

**Write set (2; chat-streaming):** `libs/frontend/chat-streaming/src/lib/{agent-monitor.store.ts,agent-monitor.store.spec.ts}`. **Read set:** store `:496,1042-1093,1166,1354-1368,1935,2075,2110,2297,2488,2502,3072`; matching spec blocks. **Contract:** starting counts as active/nonterminal wherever running currently does. Acceptance: starting card stays visible and failure is shown. Checks: `npx jest --config libs/frontend/chat-streaming/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-streaming/src/lib/agent-monitor.store.spec.ts`; `npx tsc --noEmit --project libs/frontend/chat-streaming/tsconfig.lib.json`; `npx eslint <two write files>`. [lane-proposed]

### B2.5 — agent-facing text

**Write set (3; vscode-lm-tools, agent-sdk, docs):** `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts`; `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts`; `.claude/skills/agent-lanes/SKILL.md`. **Read set:** builder `:615-700,820-840`; prompt `:75-86,108-116`; skill `:120-190`; schema `agent-spawn-args.schema.ts:77-117`. **Contract text:** spawn may reply starting, save ID, retry same key/request, obtain later CLI Session ID via status. Acceptance: all three agree with implementation. Checks: `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`; `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`; `npx eslint <two TypeScript write files>`. [lane-proposed]

## Guards and prompt text to update

**CONFIRMED:** project guidance names `container.smoke.spec.ts`, `expected-resolvable.ts`, `rpc-surface.spec.ts`, `surface-composition.spec.ts`. **ASSUMED:** no DI binding or RPC method added, so B2.1-B2.5 inspect but do not write these guards. If implementation changes registration/method list, add affected guard to a ≤6-file batch. B2.5 touches builder, skill and core prompt; B2.1 touches schema and dispatcher specs. [project-rule]

## Risks

**ASSUMED:** host restart loses in-memory dedupe; identical intentional launches need distinct keys or force. Generic MCP caller identity may be unavailable, so scope fallback carefully. Late failure needs bounded scrubbed text and exactly one signal; slot/token cleanup must survive stop/shutdown. **CONFIRMED:** external MCP completion-signal delivery is Fault 2 (`research-report.md`, Fault 2), owned by batch 3 and out of scope. [lane-proposed]

## Lane-introduced constraints

- Process-local dedupe TTL 120 s and bounded map; insert promise before await. [lane-proposed]
- Pre-gate budget 1,000 ms; unknown state remains fail-open, known AT LIMIT blocks. [lane-proposed]
- Starting counts toward capacity and all active/nonterminal predicates. [lane-proposed]
- Bound and scrub startup error text before status/read/log. [lane-proposed]

## Decisions

- Choose early acceptance A over budget race B: manager currently awaits `doSpawn` (`agent-process-manager.service.ts:539-545`); Codex first turn already asynchronous (`codex-app-server-lane.adapter.ts:823-840`). Reversible. [user-requested]
- Omit CLI Session ID from initial reply until status has it; formatter already treats it as optional (`mcp-response-formatter.ts:1875-1877,1951-1953`). Reversible. [lane-proposed]
- Derived dedupe plus optional explicit key; current schema has neither (`agent-spawn-args.schema.ts:77-117`). Reversible. [user-requested]
- Keep policy gate, remove cosmetic post-spawn wait (`protocol-dispatcher.ts:1163-1188,1269-1290`). Reversible. [user-requested]

## Open questions

- **ASSUMED:** Which `runtime.open` substep is slow remains unknown pending B2.1 timing (`codex-app-server-lane.adapter.ts:478-575`).
- **ASSUMED:** Confirm generic MCP caller credential accessor before implementing dedupe scope; HTTP handler derives caller from URL (`research-report.md`, Fault 1 HTTP row).
