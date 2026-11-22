# Live test report, TASK_2026_2299_d6f5 (PR #1465)

Status: PART A only (delivery matrix). Part B (live runs) is NOT started. It waits for the user to approve the build and the non-haiku models.

Evidence class: every cell below is **read-from-code** on branch `feat/ptah-nav-tools` at head 3c06fc9f7. No cell is proved-by-run. The one exception is the server-instructions text that this session received (see C1). Paths are under `libs/backend/` unless stated. The appendices hold the line-level evidence.

## A.1 Delivery matrix

| Path | MCP server attached, how | Nav tools in list (eager/deferred) | Prompt text that names them, and does it arrive | Caller policy |
|---|---|---|---|---|
| Main chat (Claude Agent SDK) | http MCP, `/session/{id}/workspace/{cwd}`, bearer, `privileged` (`agent-sdk/.../sdk-query-options-builder.ts:2347-2420`) | all four in list. read_symbol, grep, ast_analyze eager (`ALWAYS_EAGER_TOOLS`, `vscode-lm-tools/.../protocol-dispatcher.ts:632-646`). code_search_symbols eager only with `hasSqliteLayer` (:657). Stamp `anthropic/alwaysLoad` (:739). | core prompt table rows (`ptah-core-prompt.ts:34-42`, rule :51), always `preset-append` (`sdk-query-options-builder.ts:345-390`). Arrives. Server instructions: see C1. | `privileged`. |
| Task subagents | inherit parent MCP when the agent file has no `tools:` (Claude SDK behaviour, not verified here). Files load via `settingSources` (`sdk-query-options-builder.ts:1597`). | not denied (`SUBAGENT_DISALLOWED_TOOLS` is `{}`, `subagent-tool-allowlist.ts:63`). Whether `alwaysLoad` is honoured: unverified. | none. No agent template names the nav tools (defect A1). Parent core prompt does not reach them. | parent token. |
| Child sessions (`ptah_session_start`) | same launch as main chat (`chat-session.service.ts:1550`), same URL and bearer | as main chat, unless a phase denies them | core prompt arrives (same path) | `privileged`. Guard `protocol-dispatcher.ts:1141-1190` needs the child worktree to be a known root (unverified). |
| CLI lane `claude` | http MCP over argv, `strictMcpConfig` (`claude-sdk-lane-options.ts:249,283`), `/agent/{id}/workspace/{cwd}`, bearer from `issueLaneMcpToken` | as main chat, minus phase `disallowedTools` (:245) | core prompt (preset-append) plus `PTAH_LANE_POLICY` (`cli-adapter.utils.ts:441`, 2,691 bytes). Arrives. | `privileged` by default. |
| CLI lane `codex` | `mcp_servers.ptah.url` config override (`codex-lane-config.builder.ts:140-152`), bearer through secret map | no deferral concept, all four callable | role and `PTAH_LANE_POLICY` as `developer_instructions` (`codex-app-server-lane.adapter.ts:336`). Core prompt does not arrive. Continuation path may omit the policy (:876-889). | `privileged`, also in a read-only plan lane (defect). |
| CLI lane `antigravity` | ACP `session/new.mcpServers` (`antigravity-acp-profile.ts:207`) or ephemeral key in `~/.gemini/config/mcp_config.json` | all four callable | `PTAH_LANE_POLICY` in the task prompt. On the argv path the budget is 4,000 bytes, role and guidance are cut first, the policy is never cut (`cli-adapter.utils.ts:~660-700`). Core prompt does not arrive. | `lane-report` (read class allowed, mutating tools blocked, `lane-mcp-token-rule.ts:4-16`). |
| CLI lane `grok` | ACP `session/new.mcpServers` (`grok-acp-profile.ts:125`) | all four callable | `PTAH_LANE_POLICY` through the shared lane handle (`provider-session-lane-handle.ts:478-490`, `buildTaskPrompt`). Core prompt does not arrive. | `privileged`. Grok has no plan mode (`grok-cli.adapter.ts:196`). |
| Ptah CLI agents | same Claude SDK lane options (`ptah-cli-spawn-options.service.ts:224-415`, `ptah-cli-registry.ts:915,970`) | as lane `claude` | core prompt plus role plus `PTAH_LANE_POLICY` (:259) as system prompt (:411). Arrives. | `privileged`. |
| copilot (disabled) | `--additional-mcp-config` JSON (`copilot-sdk.adapter.ts:356-373`) | callable | `PTAH_LANE_POLICY` in the argv prompt (:537), role and guidance truncated first | by code only |
| cursor (not installed) | SDK `agentOptions.mcpServers` (`cursor-cli.adapter.ts:428-434`) | callable | policy in the task prompt (:361-366) | by code only |
| opencode (not installed) | inline `OPENCODE_CONFIG_CONTENT` (`opencode-cli.adapter.ts:645-660`) | callable | argv prompt (:697) | by code only |
| pi (not installed) | none, capability `mcp: unsupported` (`pi-cli.adapter.ts:281`) | none | policy in the system prompt (:369) names tools it cannot call (defect D-D) | n/a |
| Ollama Code, kimi code (plan limit) | no own adapter, run as Ptah CLI agents on the Claude SDK lane (`ptah-cli-registry.ts:387,1529`) | as Ptah CLI agents | as Ptah CLI agents | as Ptah CLI agents |

## A.2 Defects and risks found (listed, none fixed)

1. **C1 (needs confirmation):** the server instructions text this session received names neither `ptah_grep` nor `ptah_read_symbol`. It lists three rows and "Also, if listed: ptah_lsp_references". The spec `server-instructions.spec.ts:123` expects both names. Either the host build that serves this session is older than the branch, or the 512-character budget logic drops them. Confirm with a scratch run of `buildServerInstructions()`.
2. **A1:** no generated agent template, prompt or hook names the nav tools. Task subagents default to Read, Grep and Bash. No `SubagentStart` hook injects guidance (A2).
3. **D-E:** the descriptions of `ptah_read_symbol` and `ptah_grep` (`tool-description.builder.ts:505,563`) never name the shell commands they replace. An agent that sees only tool descriptions has no substitution cue. The `ptah_code_search_symbols` description (:2266-2271) is dense shorthand.
4. **D-C:** `ptah_ast_analyze` and `ptah_code_search_symbols` leave the list when the `code` namespace is disabled (`effective-tool-list.ts:246`). The core prompt (:41-42) and `PTAH_LANE_POLICY` still name them.
5. **D-B:** `ptah_code_search_symbols` is eager only with `hasSqliteLayer` (`protocol-dispatcher.ts:657`). Low impact for Electron.
6. **D-A:** on argv paths only about 1,307 bytes remain for role and guidance (`cli-adapter.utils.ts:~664-667`). The policy itself is never cut.
7. **D-D:** the pi lane gets `PTAH_LANE_POLICY` but has no MCP.
8. **D-F:** the `standalone` prompt branch in `claude-sdk-lane-options.ts:230` is unreachable.
9. **B1:** two port sources: constant `PTAH_MCP_PORT` for chat and child sessions, `mcpServerStatus.getPort()` for lanes. A non-default port could break the constant-based paths. Not verified.
10. **codex plan lane** holds a `privileged` token, so mutating ptah tools stay callable in a read-only sandbox. Codex continuation may omit the policy (:876-889, unverified).
11. Refuted candidate: grok does get `PTAH_LANE_POLICY`.

## A.3 Plan for the isolation of the second instance (for the user to read before approving the build)

Facts are in appendix 3. This is a plan only. Nothing was started.

1. Host: Electron, started with `NODE_ENV=development` through `npm run electron:launch`. It is the only host with the real spawn path and the real MCP HTTP server. `apps/ptah-cli` does not exist in this tree.
2. Separate user-data: development mode uses userData "Ptah Dev", `~/.ptah-dev` (`PTAH_SETTINGS_DIR`) and `ptah-dev.sqlite` (`apps/ptah-electron/src/main.ts:75-80`). I will set `PTAH_SETTINGS_DIR` and `PTAH_DB_PATH` to a fresh directory under `.ptah/tmp/live-test-home/`, so the instance does not share state with the user's app.
3. Single-instance lock follows userData (`main.ts:82`), so a separate userData does not collide with the running app.
4. Port: set `mcpPort` in the test settings to an unused port (for example 51990) and check that it is free. The default 51820 is probably taken by the user's app. The handler falls back to another port when the port is busy (`http-server.handler.ts:79-88`), so I read the real port from the published status.
5. Hazard: persistent MCP slots write to HOME (`mcp-http/ptah-mcp-slots.ts:20-24`: `~/.codex/config.toml`, `~/.gemini/config/mcp_config.json`). A second instance would overwrite the entries of the user's app. I will launch with a separate `HOME` and `USERPROFILE`. It is not verified that Electron follows `HOME` for its own paths. I will prove this before the start by a read-only check and by comparing file hashes of the user's files before and after.
6. Proof before the start: the port is free, no shared lock file, every data path resolves under the test directory, and the hashes of `~/.codex/config.toml` and `~/.gemini/config/mcp_config.json` stay equal after the start.
7. If any of these cannot be proved, I stop and report. The build command would run as `node scripts/verify.mjs --exec --task nav-live-build -- npm run electron:build`.
8. Open limit: the agents CLIs (claude, codex, grok, antigravity) need their own login state. A separate `HOME` can hide it. I will test the login state of each CLI inside the test `HOME` first.

## A.4 What is not proved

- Everything above is code reading. No run captured a delivered tool list or a delivered prompt.
- Subagent inheritance of MCP and of the `alwaysLoad` stamp.
- Child worktree pass through the nav-tool known-root guard.
- C1 (server instructions text).
- Whether Electron honours a separate `HOME`.

---

# Part B: stage 2 benchmark (8 navigation tasks, isolated test instance)

Raw rows: `.ptah/tmp/live-test/stage2-results.jsonl` (round 5 rows also in `stage2-r5.jsonl`).
Weighted tokens = new input + 1.25 x cache write + 0.1 x cache read + output (codex: no cache
write; `input_tokens` includes cached input). Native arms are from round 4 (native tools did not
change). Isolation proved before launch, after launch and after the run (`hashes-r5-*.txt`).

## B.1 Round 4 (head 569011f8e): goal not met

| arm | correct | calls | tool-result chars |
|---|---|---|---|
| ptah-haiku | 8/8 | 38 | 138k |
| native-haiku | 8/8 | 31 | 172k |
| ptah-codex | 4/8 | 28 (8 discovery) | 195k |
| native-codex | 5/8 (2 runs invalid: sandbox) | 26 | 177k |

Causes: `regex` default false (`a|b` found nothing), flat outline without class members,
`ptah_workspace_analyze` "use FIRST", cold symbol index.

## B.2 Round 5 (head 5dbf8ce3f): goal met for both models

Changes: regex inference, inline enclosing bodies in ptah_grep, class members in the outline,
batched embeddings.

| arm | correct | calls | chars | weighted tokens | time |
|---|---|---|---|---|---|
| ptah-haiku | 8/8 | 12 | 25k | 367k | 392 s |
| native-haiku | 8/8 | 31 | 172k | 436k | 441 s |
| ptah-codex | 7/8 | 26 (9 discovery) | 219k | 125k | 577 s |
| native-codex | 5/8 | 26 | 177k | 137k | 204 s |
| ptah-codex, 6 tasks where native was valid | 5/6 | 18 | 135k | 90k | 454 s |
| native-codex, same 6 tasks | 5/6 | 26 | 177k | 128k | 187 s |

Notes:
- One ptah-haiku run (concept-clamp-read-tail) timed out with 0 calls (the model did not
  start); the retry passed with 1 call. The table uses the retry.
- The codex WRONG in both arms is usages-symbol-pending-permission-count: both miss
  `permission.types.ts` (strict scoring).
- Codex is slower: each codex run starts its lane through one extra haiku turn, and codex still
  calls `ptah_workspace_analyze` first in 2 tasks. The new description (PR #1475) is not in this
  build. Discovery output is most of the codex chars.
- The new index run went at 0.37-0.75 files/s; the store kept 49,646 symbols from the earlier
  run, so search was warm. Skip-unchanged indexing is a follow-up
  (`followup-index-skip-unchanged.md`).

# Appendix 1: subagents, child sessions, server instructions

Root: libs/backend. Line numbers read this session.


## B.3 Round 6 (head fa33f7235, after the review fixes): goal still met

Rerun of the two ptah arms on a new Electron build that has the round 6 fixes (caller-root
validation, git and Node engine hardening). Native arms unchanged (round 4). Isolation proved
(`hashes-r6-before`, `-after-launch`, `-after-run`: user files equal; the user's app kept its pid).
Rows: `.ptah/tmp/live-test/stage2-r6.jsonl`.

| arm | correct | calls | weighted tokens | time |
|---|---|---|---|---|
| ptah-haiku | 8/8 | 11 | 341k | 166 s |
| native-haiku (round 4) | 8/8 | 31 | 436k | 441 s |
| ptah-codex | 7/8 | 33 (9 discovery) | 142k | 713 s |
| native-codex (round 4) | 5/8 | 26 | 137k | 204 s |
| ptah-codex, 6 tasks where native was valid | 5/6 | 22 | 98k | 433 s |
| native-codex, same 6 tasks | 5/6 | 26 | 128k | 187 s |

Notes:
- Haiku: better than round 5 on every measure (no timeout this round).
- Codex over all 8 tasks used more calls and 4% more tokens than native, but it answered 2 more
  tasks correctly (native had 2 sandbox failures). On the 6 tasks valid in both, ptah-codex used
  fewer calls (22 vs 26) and 23% fewer weighted tokens. Round 5 gave 18 calls and 90k there, so
  codex varies from run to run (read-range task: 7 calls in round 6).
- Codex is still slower; it still starts with `ptah_workspace_analyze` (fix in PR #1475).
## (a) Task / SDK subagents
- No host code passes `agents:` / AgentDefinition (grep over libs/backend: no hit in agent-sdk or cli-agent-runtime). Subagents are Claude Code filesystem agents (`.claude/agents/*.md`) or built-ins.
- Main chat loads them via `settingSources`: `['user','project','local']`, or `['project','local']` on a localhost proxy (agent-sdk/.../sdk-query-options-builder.ts:1597-1601); named accounts use certified sources. Lanes/Ptah CLI: `['user','project','local']` (cli-agent-runtime/.../claude-sdk-lane-options.ts:268-270; ptah-cli-spawn-options.service.ts:426).
- Tool access: a subagent that has no `tools:` frontmatter inherits the parent's MCP servers, so `mcp__ptah__ptah_read_symbol` / `ptah_grep` are visible (Claude SDK behaviour, not verified in this repo). Parent `disallowedTools` = builtin policy + phase denials (sdk-query-options-builder.ts:1528-1530) also apply to children.
- Generated agent files get `disallowedTools:` only from `SUBAGENT_DISALLOWED_TOOLS`, which is `{}` (agent-generation/.../subagent-tool-allowlist.ts:63-65), so no generated agent loses the nav tools. Browser/web denials exist as constants (:33-50) but are unused for any type.
- Deferral: nav tools carry `anthropic/alwaysLoad` (handoff; protocol-dispatcher.ts:632-646). Whether a subagent honours it: UNVERIFIED.
- DEFECT A1: no generated agent template or prompt names nav tools. grep of ptah_read_symbol/ptah_grep over agent-generation/src: 0 hits. Subagents get no nav guidance except what the parent core prompt gives the parent (subagent system prompts do not inherit it). Subagents therefore default to Read/Grep/Bash.
- DEFECT A2 (candidate): PostToolUse handler treats 'Agent'/'Task' (post-tool-use-hook-handler.ts:151) but no SubagentStart hook injects nav guidance (grep of SubagentStart in sdk-query-options-builder.ts: 0 hits).
- Codex lane thread config sets `agents: { enabled: false }` (codex-runtime/.../codex-lane-thread-config.ts:152), so codex lanes have no subagents.

## (b) Child sessions via ptah_session_start
- Tool defined in mcp-core/session-tools.ts; handler session-tool-handlers.ts:678 `session.start`. Dispatcher applies `childPhasePolicyRefusal` to ptah_agent_spawn and ptah_session_start (protocol-dispatcher.ts:1010-1016).
- Host: `ChatSessionService.startAgentChildSession` (rpc-handlers/.../chat/session/chat-session.service.ts:1550-1610). It runs the SAME `launchSdkSession` as chat:start, so the child gets the main-chat path: core prompt via assembleSystemPrompt (always preset-append), and `buildMcpServers` (sdk-query-options-builder.ts:2409-2414): URL `http://localhost:${PTAH_MCP_PORT}/session/{routingId}/workspace/{cwd}`, `Authorization: Bearer <token>`, capability 'privileged'. `mcpServerRunning = codeExecutionMcp.getPort() !== null` (:1595), so MCP is attached even when `.mcp.json` fails.
- Tools: builtin policy + `params.phase` toolProfile disallowedTools (`toolProfileApplied`). Nav tools survive unless a phase denies them.
- cwd = worktreePath, metadata root = parent workspaceRoot (:1561-1566). The nav-tool `workspaceRoot` guard (protocol-dispatcher.ts:1141-1190) needs the worktree path to be a known root: UNVERIFIED for child worktrees, risk of fail-closed error.
- Codex native chat sessions: `ptahMcpSessionUrl(PTAH_MCP_PORT, routingId, cwd)` (rpc-handlers/.../codex-host/codex-chat-host-ports.ts:340), `headerReferences: {}` at :345-ish (bearer delivery for codex native: UNVERIFIED). Provider-session pool: same URL builder with bearer header from `context.mcpToken` (provider-session-open-request.ts:90-101); no attachment when no token or MCP not running (:86).
- Port: PTAH_MCP_PORT constant here vs `mcpServerStatus.getPort()` for lanes (handoff). DEFECT B1 (candidate): two port sources; a non-default port would break constant-based paths. Not verified whether PTAH_MCP_PORT is mutable.

## (c) MCP server instructions
- `buildServerInstructions` (vscode-lm-tools/.../mcp-core/server-instructions.ts:120-123), cap 512 chars/bytes (:34), sent as `instructions` in initialize (protocol-dispatcher.ts:523).
- Derived from PTAH_MCP_SUBSTITUTION_SECTION table rows in table order until budget fills (:88-95); non-fitting tools named after "Also, if listed:" (:97-112). Fixed overhead ~ header 52 + fallback 62 + closing ~100 chars (:36-41), leaving ~290 for rows.
- Table rows 4 and 5 are ptah_grep { pattern, path?, glob? } and ptah_read_symbol { file, name } (ptah-core-prompt.ts:34-35); TOOL_CELL (:48) strips the `{...}` args, so both parse as tools (parseSubstitutionRows :126-140). server-instructions.spec.ts:123 asserts both names appear (`arrayContaining`), so in THIS worktree they are named, as a kept row or in "Also, if listed".
- OBSERVED (this agent's own system prompt, produced by the host build that serves this session, possibly older than the worktree): 3 rows (workspace_analyze, search_files, get_diagnostics), fallback line, "Also, if listed: ptah_lsp_references", closing. It names neither ptah_grep nor ptah_read_symbol.
- DEFECT C1 (needs confirmation): either the running host build predates the nav rows, or the budget logic drops rows 4-5. Confirm by calling buildServerInstructions() in a scratch node/jest run (not allowed in this read-only pass). Even if named, they sit after 3 low-value rows; the nav tools are not first.
- Note: HEADER says "Prefer these ptah_* tools when listed in tools/list" (:36), so a client that defers tools (ToolSearch) sees it only as conditional text.

---

# Appendix 2: codex, antigravity, grok

Root: libs/backend/cli-agent-runtime/src/lib/cli-agents (CA), acp-runtime/src/lib (ACP).

## Caller policy (all three)
- Token capability by CLI: CA/lane-mcp-token-rule.ts:4-16. codex, grok = 'privileged'; antigravity = 'lane-report'.
  Issued in agent-process-manager.service.ts:1255-1266 (needs mcpPort).
- isToolPermitted (vscode-lm-tools mcp-core/mcp-caller-policy.ts:181-188): privileged = all; lane-report = class `read`
  + ptah_agent_report/message_status/message_ack. The 4 nav tools are class `read` (READ_TOOLS :35-62), so ALL THREE
  lanes can call grep/read_symbol/code_search_symbols/ast_analyze. Phase disallowedTools can still filter (request.phase passed :1264).
- No lane is "read-only" by capability. A plan lane is limited by CLI mode only (see per-CLI).

## codex (codex/codex-app-server-lane.adapter.ts)
- MCP: config override `mcp_servers.ptah.url=` + `tool_timeout_sec` in codex/codex-lane-config.builder.ts:140-152
  (url via ptahMcpServerUrl, /agent/{id}/workspace/{cwd}). Bearer NOT in config: secret map keyed
  `mcp.ptah.authorization` (adapter :345-347, codex-lane-profile.ts:11,172). No port or port 0 -> no ptah server, warning only (:141,:155).
  User MCP servers are disabled via `mcp_servers={..enabled=false}` (builder :130-137).
- Tools: no allowlist/enabled_tools key is emitted; all ptah tools listed by tools/list. No eager/deferred concept
  (alwaysLoad stamp is Claude-only). approval_policy=never (builder :124).
- Prompt: roleChannel 'developer-instructions' (:158). developerInstructions = role block + PTAH_LANE_POLICY (:336-342)
  -> `developer_instructions=` config on first turn (builder :160-164; resend on resume gated by CODEX_RESUME_RESENDS_ROLE :40).
  Adapter passes lanePolicyDelivery 'developer-instructions' (:818,827,880) so buildTaskPrompt omits the policy from the task (utils ~:600).
  Fallback: role falls back to task-prompt on rejection (:385,888); policy then is NOT re-added to the task prompt
  (omitToolPolicy true for any non-'task-prompt' delivery) -> DEFECT candidate: after a developer_instructions rejection the
  lane may run without PTAH_LANE_POLICY (verify :880-890). Core prompt: not delivered (lane text is PTAH_LANE_POLICY only).
- Plan: manifest plan = nativeMode 'read-only' sandbox, network deny (:194). Plan lane keeps MCP, token still 'privileged'
  -> a codex plan lane can call mutating ptah tools (ptah_agent_spawn, task/git). DEFECT candidate (capability not tied to permission).

## antigravity (antigravity-cli.adapter.ts)
- Default path ACP `agy acp` (runAcp :784-820): MCP in `session/new.mcpServers` http entry, name constant
  ANTIGRAVITY_ACP_PTAH_MCP_NAME (acp profile antigravity-acp-profile.ts:207-218), built from
  buildLaneMcpAttachments (CA/provider-session/lane-mcp-attachments.ts:13-30; empty if no mcpPort or mcpToken),
  wired provider-session-lane-handle.ts:231; first prompt waits for attachment (:247-285).
  stream-json fallback / non-ACP: ephemeral `ptah` key in ~/.gemini/config/mcp_config.json (adapter :968-1025, cleanup :1060).
- Tools: no allowlist, all listed; no eager/deferred.
- Prompt: roleChannel 'task-prompt' (:427). ACP and stream-json (stdin) use buildTaskPrompt (handle :479; adapter :1120):
  projectGuidance + role + PTAH_LANE_POLICY + task, all in the prompt. No argv size limit on ACP.
  stream-json WITHOUT stdin support uses buildArgvTaskPrompt (:1129): 4000-byte argv budget; policy 2691B immutable,
  ~1.3KB left for role+guidance (truncated). Core prompt not delivered.
- Plan: stream-json `--mode plan` supported (:576). ACP refuses plan/auto-edit unless unattended (:777-781
  comment, antigravitySkipsPermissions). Token 'lane-report': mutating ptah tools denied server-side (better than codex/grok).

## grok (grok-cli.adapter.ts)
- MCP: ACP `session/new.mcpServers` (grok-acp-profile.ts:125-136 buildMcpServers -> http entry + Authorization Bearer header);
  adapter comment :146, runSdk :258-278 -> createProviderSessionLaneHandle. Same attachment builder (lane-mcp-attachments.ts) and
  attachment wait as antigravity. Also sent on resume (acp-session-runtime.ts:785-795).
- Tools: no allowlist, no eager/deferred.
- PTAH_LANE_POLICY: CANDIDATE DEFECT REFUTED. Grok sets no lanePolicyDelivery (roleChannel 'task-prompt' :139); the shared handle
  calls buildTaskPrompt({...options, resumeRestoresContext}, profile.vendor) at provider-session-lane-handle.ts:478-490, which
  emits `${PTAH_LANE_POLICY}\n\n${task}` (utils :~620) with guidance + role first. So grok gets policy+role+guidance in the
  first ACP prompt. Resume: policy re-sent (comment :482-486). Core prompt not delivered; no argv budget.
- Plan: manifest says plan/ask/auto-edit unsupported (:196-198); only yolo (--always-approve). validateLaneSpawnPolicy (:272)
  rejects a plan lane. Token 'privileged' (no read-only way to run grok).

## Defects/notes
1. codex plan lane keeps privileged MCP token (mutating ptah tools callable); capability is by CLI, not by permission mode.
2. codex continuation (:876-889) re-prepends only the role as task text when developer_instructions is rejected; policy stays omitted (lanePolicyDelivery fixed at :880). Low severity, not run-verified.
3. grok policy delivery refuted as defect.

---

# Appendix 3: isolation facts and other CLIs


## A. Isolation facts
- Dev profile already isolates: apps/ptah-electron/src/main.ts:75-80. `NODE_ENV=development` =>
  app name "Ptah Dev", `app.setPath('userData', <appData>/Ptah Dev)`, `PTAH_SETTINGS_DIR=~/.ptah-dev`.
- Single-instance lock: main.ts:82 `app.requestSingleInstanceLock()` (keyed on userData), so the dev
  profile (own userData) can run next to a release Ptah. Two instances with the SAME userData: 2nd quits.
- Settings dir: libs/backend/platform-core/src/file-settings-manager.ts:70-78 `PTAH_SETTINGS_DIR`
  (absolute path required) else `~/.ptah`. Dev seeds from ~/.ptah: main.ts:87 prepareDevelopmentSettings.
  Do NOT rely on the seed: it copies the real settings (incl. mcpPort) into ~/.ptah-dev.
- SQLite: libs/backend/persistence-sqlite/src/lib/db-path.ts:12-14 `ptah.sqlite` / `ptah-dev.sqlite` /
  `ptah-test.sqlite` under homedir (:37 join); profile from NODE_ENV (:31-35). `PTAH_DB_PATH` overrides
  everything (:46-50). Session store is a separate file (session-store/session-store-db-path.ts:6).
- MCP port: `ptah.mcpPort` read by getConfiguredPort, vscode-lm-tools/.../mcp-http/http-server.handler.ts:79-88,
  default 51820. On EADDRINUSE/EACCES it falls back to another port (handler.ts ~:150-250, one warning) and
  records `ptah.mcp.port` in workspaceState (:133). So a 2nd instance does not fail, it gets a different port.
  Override per instance: set `mcpPort` in that instance's settings dir (PTAH_SETTINGS_DIR/settings.json) or
  rely on the fallback. Lanes take the port from `mcpServerStatus.getPort()`, not a constant (handoff).
- apps/ptah-cli: does NOT exist in this tree (`ls apps` = ptah-docs, ptah-electron, ptah-electron-e2e,
  ptah-extension-webview, ptah-landing-page, ptah-landing-page-e2e); no apps/ptah-cli HTTP MCP server.
- Electron commands (package.json:16,56-61; apps/ptah-electron/project.json targets build :402, build-dev
  :441, serve :487, serve:watch :501): `npm run electron:serve` (nx serve), `electron:watch`,
  `electron:launch` (node apps/ptah-electron/scripts/launch.js; runs dist/apps/ptah-electron/main.mjs with
  NODE_ENV=development, `--production` flag => NODE_ENV=production, scripts/launch.js:15-34),
  `electron:build`, `electron:build:dev`. Extra args after script are forwarded to the app (workspace path).
- HAZARD, persistent MCP slots (libs/backend/vscode-lm-tools/.../mcp-http/ptah-mcp-slots.ts:20-24):
  `{ws}/.mcp.json`, `{ws}/.cursor/mcp.json`, `{ws}/.codex/config.toml`, `~/.codex/config.toml` (untrusted ws),
  `~/.gemini/config/mcp_config.json`, `{ws}/.agents/mcp_config.json`. A 2nd instance writes its own
  port/token into the HOME ones (and into workspace ones if the same ws is open).
  Antigravity temp key goes to `$HOME || $USERPROFILE || homedir()` (antigravity-cli.adapter.ts:408,865,988).
  Avoid: launch the test instance with a separate `HOME` (and `USERPROFILE`), e.g. `HOME=/tmp/ptah-iso-home`,
  plus its own PTAH_SETTINGS_DIR / PTAH_DB_PATH / `--` workspace path in a scratch copy, so no ~/.gemini or
  ~/.codex file of the real user is touched. Side effect: rival CLIs then need their auth under that HOME
  (copy or env keys). Note os.homedir() honours HOME on Linux, so `.ptah-dev`/sqlite move too.
  UNVERIFIED: whether Electron itself (appData = $XDG_CONFIG_HOME or $HOME/.config) follows; it does on Linux.

## B. Rival CLI blocks (cli-agent-runtime/src/lib/cli-agents/cli-adapters/)
- copilot (copilot-sdk.adapter.ts): MCP attach by `--additional-mcp-config` JSON, `ptah` type http,
  url with token, only when mcpPort && mcpToken (:353-373). Tools: all ptah tools the server lists
  (no per-tool filter seen in the adapter). Prompt: `buildArgvTaskPrompt` (:537), PTAH_LANE_POLICY
  inside, 4,000-byte argv budget, so role/guidance truncated, policy kept (handoff).
- cursor (cursor-cli.adapter.ts): in-process `@cursor/sdk`; `agentOptions.mcpServers.ptah` http,
  only when mcpPort && mcpToken (:428-434). Prompt: `buildTaskPrompt` with
  lanePolicyDelivery 'task-prompt' (:360-366, :591-599): policy reaches it as task text.
- opencode (opencode-cli.adapter.ts): `OPENCODE_CONFIG_CONTENT` env inline JSON, `mcp.ptah` type remote
  with token url, enabled (:653-664); merges inherited mcp, refuses spawn on invalid inherited JSON
  (:645-678). Capability mcp supported (:390). Prompt: `buildArgvTaskPrompt` (:697), policy reaches it.
- pi (pi-cli.adapter.ts): NO MCP (:54, :281 unsupported, :361 mcpPort ignored). So grep/read_symbol are
  never delivered. Yet PTAH_LANE_POLICY goes in `--append-system-prompt` file (:369-373, :446) with
  lanePolicyDelivery 'system-prompt' (:384): prompt names tools the lane cannot call.
- Ollama Code and Kimi Code: no dedicated adapter in cli-adapters/. They are Ptah CLI agents
  (ptah-cli/ptah-cli-registry.ts; ollama-cloud provider :387,:1587-1592 direct base URL; Kimi via
  KimiCodeTranslationProxy :1529, KIMI_CODE_PROVIDER_ID :1811) running the Claude SDK lane, so they get
  the Claude-lane path from the handoff: MCP via `buildClaudeSdkLaneOptions` mcpServers (claude-sdk-lane-options.ts:249),
  core prompt + role + PTAH_LANE_POLICY as system prompt (ptah-cli-spawn-options.service.ts:259,411).
  Whether the underlying model calls tools well is outside code reading (needs a run).
