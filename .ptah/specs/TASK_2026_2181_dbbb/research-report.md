## Summary

- **CONFIRMED:** Task creation waits for a sequential scan of 58 sibling worktrees before allocating an ID. The log measures 32.8–40.0 s for this scan on the two duplicate creates.
- **CONFIRMED:** Spawn awaits several pre-launch checks and Codex adapter setup plus post-spawn limit formatting before sending an already allocated agentId. The log records 93–112 s spawn calls and two results after client failures. **UNKNOWN:** the exact slow await; Codex first-turn startup starts asynchronously.
- **CONFIRMED:** The 45 s constant caps agent *wait* calls, not spawn or task-create. A closed HTTP response does not cancel either mutation; retries have no idempotency key.
- **LIKELY:** External Claude Code MCP callers on a generic endpoint have no parent session identity. Completion is refused without a parent or stays pending for a non-live Ptah chat session; status/read do not deliver it. Response timeout does not delete a parent link.
- **CONFIRMED:** SQLite slow statements and task watcher rebuilds were present, but no single shared queue for both tools is established. The spawn mutex protects only slot reservation.

## Fault 1: call path and timing

All listed steps precede the response under current code unless conditional. Paths are repository-relative.

| Step | File:line | Needed before response? | Can be slow? | Evidence |
|---|---|---|---|---|
| HTTP parses call; derives caller only from URL; attaches response-close abort | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:548-571` | Yes | No | Body caller fields discarded. |
| Spawn parses and awaits named target usage/limit gate | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1133-1174` | Policy gate yes | Possible | Provider limit lookup bounded; no exact span. |
| Namespace reads requested skills, resolves parent, optional role | `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:364-430` | Skills/role and parent association yes | Possible | Skill file reads synchronous; role async. |
| Ptah CLI branch prepares and starts registry handle, then tracks it | `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:433-555` | Conditional on ptahCliId | Yes | Observed lanes used system Codex branch. |
| System CLI loads guidance and plugin paths; awaits manager spawn | `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:568-607` | Guidance yes; manager result yes | Yes | Two inputs use Promise.all. |
| Manager reserves slot, detects CLI, validates worktree, resolves account, runs harness preflight, gets MCP port; optional resume gate | `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:539-642` | Most admission checks yes; preflight potentially deferable | Yes | Preflight logged its 1.5 s timeout. Mutex scope at 3114-3155 is reservation only. |
| Manager builds policy/role/model records, allocates agentId, awaits runSdk | `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:983-1133` | ID yes; full startup not needed to acknowledge accepted work | **Yes** | Spawning log precedes result by 68–80 s for named lanes. |
| Codex runSdk awaits binary/profile/MCP-server discovery and resume identity, then starts first turn asynchronously; context open, identity persistence and first turn occur inside that async continuation | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts:275-288,354-383,478-566,616-626,747-773,810-840` | Initial setup currently yes; first turn/session ID **no** | **Yes** | Per-await timing absent; `runTurn` returns `done` handle without awaiting first turn. |
| Track handle/session, post-spawn limit lookup, format response | `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1227-1235`; `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1250-1290` | Track yes; limit suffix could follow | Possible | Results logged after client failure. |

Task-create path:

| Step | File:line | Needed before response? | Can be slow? | Evidence |
|---|---|---|---|---|
| HTTP dispatch and namespace Zod validation | `http-server.handler.ts:548-571`; `protocol-dispatcher.ts:2809-2815`; `namespace-builders/tasks-namespace.builder.ts:785-821` (under `libs/backend/vscode-lm-tools/src/lib/code-execution`) | Yes | Usually no | Dispatcher awaits full create. |
| Validate worktree via git worktree list; lazy-start index/watcher/rebuild | `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/tasks-namespace.builder.ts:711-757`; `libs/backend/task-specs/src/lib/task-index.service.ts:198-237,630-647` | Validation yes; full rebuild/watcher not inherently needed | Yes | Watcher rebuild storm in log, no direct create span. |
| Ensure specs directory and obtain cross-checkout names | `libs/backend/task-specs/src/lib/task-writer.service.ts:342-366` | Uniqueness check yes | **Yes** | Visibility totals 42.1 and 34.6 s. |
| Git worktree list, sequential sibling folder scan, git fetch origin/main, git ls-tree | `libs/backend/task-specs/src/lib/git-task-folder-visibility.service.ts:182-235,254-261,282-314,334-341` | Current allocator requires it | **Yes** | 58 siblings; scans 40,029 and 32,845 ms, fetch only 1.5 and 1.2 s. |
| Local rescan, ID allocation, exclusive mkdir claim with race retry | `libs/backend/task-specs/src/lib/task-writer.service.ts:368-407` | Yes | Potential | No collision evidence. |
| Write carrier, notify index, return task | `libs/backend/task-specs/src/lib/task-writer.service.ts:409-434,548-573,906-915`; `tasks-namespace.builder.ts:804-821` | Carrier yes; notification could follow | Possible | Two tasks created 12 s apart; watcher work continues. |

## Fault 1: timeout and retry behaviour

**CONFIRMED:** `HTTP_MAX_AGENT_WAIT_SEC = 45` is at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/wait-tools-args.schema.ts:30`. The wait tool description at `agent-wait.tool.ts:77` and spawn description at `tool-description.builder.ts:638` describe wait calls; neither caps spawn or create. The dispatcher directly awaits these mutations at lines 1192 and 2810. The HTTP close abort signal is built at `http-server.handler.ts:358-368,571`, but neither mutation passes or checks it. When a client gives up, the host finishes work without delivering a usable result to that call. The source of the exact client string “The operation timed out” is **UNKNOWN** from host code.

**CONFIRMED:** There is no stored request ID or dedupe key for either mutation. JSON-RPC ID matches one response; it is not a mutation key. The task allocator's exclusive mkdir prevents simultaneous ID collision, but retry creates a new ID. Spawn retry creates another lane. A universal shared slow dependency is **UNKNOWN**. The task scan is directly measured; Codex startup is a plausible but unisolated spawn contributor. The spawn mutex covers only reservation (`agent-process-manager.service.ts:3114-3155`), not startup.

## Fault 2: signal path

| Stage | File:line | Behaviour for an external MCP caller |
|---|---|---|
| Completion contract text is injected into lane prompt | `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-reporting-contract.ts` (`renderLaneCompletionContract`) | Contract does not establish caller identity. |
| Spawn parent comes from URL `/session/{id}`, never caller body | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:282-285,548-565`; `namespace-builders/agent-namespace.builder.ts:393-415` | Generic MCP URL has no parent; recorded parent is undefined. |
| Terminal transition invokes notifier fire-and-forget | `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:3826-3894` | Exit independent of response delivery. |
| Notifier builds envelope; dedupes by agentId:completedAt and forwards parent | `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts:420-470,478-522` | Dedupe is for signal, not spawn retry. |
| Missing parent refused before enqueue; known parent stored and drained | `lane-completion-notifier.service.ts:550-565,602-705`; `parent-delivery/parent-delivery-drainer.service.ts:99-114` (under cli-agent-runtime) | No parent means refused/dropped, not pending. Known inactive parent is pending. |
| Drainer checks active Ptah session, then pushes via adapter | `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-delivery/parent-delivery-drainer.service.ts:200-248` | External CLI has no live Ptah chat session for `sendMessageToSession`. |
| Drain triggers: enqueue, startup restore, session activity, tab-ID resolution, retry tick | `parent-delivery-drainer.service.ts:53-56,99-114,181-191,306-312`; `agent-process-manager.service.ts:2492-2498` | No generic “next MCP call” drain. |
| Status/read | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1293-1337` | Status just formats state. Read can acknowledge terminal output only if callerSessionId exists; neither returns pending envelope. |

**LIKELY:** External caller identity and delivery mismatch explains lost signals. **CONFIRMED in code:** a timed-out spawn response does not clear a parent link; Fault 2 is independent of Fault 1. **UNKNOWN:** whether these exact requests used a `/session` URL; the log does not include a safe identity class or explicit notifier refusal for their IDs.

## Log evidence

Targeted grep of `C:\Users\<user>\AppData\Roaming\Ptah\logs\Ptah Electron-2026-11-15.log`; shortened, no task text or secrets (13 lines):

> `12:20:00.745Z Spawning SDK agent ee1fad02…`
> `12:21:09.380Z ptah_agent_spawn result ee1fad02… running`
> `12:21:09.389Z slow tool ptah_agent_spawn durationMs=93234.2`
> `12:21:01.971Z Spawning SDK agent 7b0084bb…`
> `12:22:22.024Z ptah_agent_spawn result 7b0084bb… running`
> `12:25:44.414Z Agent exited ee1fad02… completed exitCode=0`
> `12:28:31.279Z Agent exited 7b0084bb… completed exitCode=0`
> `12:50:40.743Z visibility timing siblingScanMs=40029 totalMs=42122 siblings=58 folders=664`
> `12:50:52.661Z visibility timing siblingScanMs=32845 totalMs=34629 siblings=58 folders=664`
> `12:50:05.220Z PostToolUseFailure ptah_task_create`
> `12:51:16.195Z PostToolUseFailure ptah_task_create`
> `12:51:48.035Z index rebuild timing trigger=watcher waitedMs=1650 totalMs=3193`
> `12:21:26.041Z slow handler provider:getPlanLimits durationMs=16038.5`

Searches for `agent-lane-completed`, `completion signal`, `pending`, `no parent`, `not live`, and both agent IDs found their exits but no explicit delivery decision in these windows.

## Proposed fixes

1. **Early spawn acceptance plus idempotency (highest benefit).** In `agent-namespace.builder.ts`, `agent-process-manager.service.ts`, `protocol-dispatcher.ts`, and the spawn result contract, allocate and track agentId/parent before slow pre-launch checks, return a `starting` state and agentId, then update status asynchronously on startup success/failure; move post-spawn limit formatting off the response path. Add a client-supplied key scoped to authenticated caller/workspace and persist key→agentId before startup; retry returns the first result. Risk: callers expecting immediate `running` or cliSessionId need status polling. Specs: `agent-namespace.builder.spec.ts`, `agent-process-manager.service.spec.ts`, `codex-lane-parity.spec.ts`, `http-server.handler.spec.ts`. Nx projects: vscode-lm-tools, cli-agent-runtime, shared contract project.
2. **Bound task visibility and dedupe creates.** In `git-task-folder-visibility.service.ts`, `task-writer.service.ts`, and `tasks-namespace.builder.ts`, replace sequential 58-worktree reads with bounded parallel/cached or indexed visibility while preserving exclusive mkdir and retry; move index notification off response path. Persist a caller/workspace idempotency key that returns the claimed task on retry. Risk: stale visibility may propose an occupied/lower ID; exclusive claim and refresh-on-collision remain essential. Specs: `git-task-folder-visibility.service.spec.ts`, `task-writer.create-race.spec.ts`, `tasks-namespace.builder.spec.ts`, `task-index.service.spec.ts`. Nx projects: task-specs, vscode-lm-tools.
3. **Drain completion through authenticated MCP caller activity.** In `http-server.handler.ts`, `protocol-dispatcher.ts`, `lane-completion-notifier.service.ts`, and parent delivery store/drainer, bind a stable caller identity at handshake, retain its completion, and attach/ack it on the caller's next status/read/wait or tool response. Risk: cross-caller leakage; scope by authenticated transport token and never trust body identity. Specs: `http-server.handler.spec.ts`, `lane-completion-durability.integration.spec.ts`, `parent-delivery-drainer.service.spec.ts`. Nx projects: vscode-lm-tools, cli-agent-runtime.

## Decisions

- Investigation stayed read-only except this report; no tests or Nx commands run.
- Task scan is confirmed by direct timing. Exact spawn bottleneck and these lanes' notifier refusal state remain unproven without finer instrumentation.
- No matching investigation skill appeared in available CLI skill discovery; native targeted `rg` and line-range reads supplied exact source paths.

## Open questions

- Which await consumed the 68–80 s between “Spawning SDK agent” and result? Instrument Codex adapter setup, manager tracking, and post-spawn limit lookup separately. First-turn startup runs asynchronously and should be measured separately.
- Did the two external calls use generic MCP or `/session/{id}` URL? Log only a safe identity class and notifier outcome with agent ID.
- Which client timeout produced the exact error string, and at what configured duration? The 45 s host wait constant does not establish it.
