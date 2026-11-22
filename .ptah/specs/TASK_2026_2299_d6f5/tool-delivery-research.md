# Tool delivery research (HTTP MCP vs in-process SDK MCP vs Codex dynamicTools)

Installed: @anthropic-ai/claude-agent-sdk 0.3.329 (node_modules/.../sdk.d.ts), codex-cli 0.171.0.
Schemas generated free into .ptah/tmp/codex-schema (--experimental) and .ptah/tmp/codex-schema-stable.

## Claude Agent SDK (sdk.d.ts)
- createSdkMcpServer: line 669; options (name, tools, alwaysLoad, timeout, instructions) 676-700; tool(): 10667; type 'sdk' config: 1310-1311.
- Naming: mcp__<server>__<tool>, server name = config key (1344, 5137).
- alwaysLoad: server option (685) or per-tool; default is deferred behind tool search when enabled (1304). It is the same flag Ptah already sets on HTTP tools.
- Subagents: AgentDefinition.mcpServers (line 62) says an sdk server passed there is ignored; top-level mcpServers is the supported place. Inheritance by Task subagents is NOT proved by the d.ts.
- Other processes cannot reach an sdk server: it lives in the host process (1332 "WithInstance"; process-transport form has no instance). A `claude` CLI child lane would need stdio/http.
- Policy: McpSdkServerConfig.tools policy (1323) is per-tool always_ask/always_deny; allow via allowedTools/canUseTool.
- Ptah today: sdk-query-options-builder.ts:2409-2415 builds type 'http' url http://localhost:PORT/session/<id>/workspace/<cwd> with Bearer token (per-caller identity).
- Ptah ALREADY stamps anthropic/alwaysLoad (protocol-dispatcher.ts:717-741, ALWAYS_EAGER_TOOLS at 633-645) and maxResultSizeChars (~745). So the deferred-discovery cost is already avoided for the eager set on the Claude lane; the in-process route would save only transport hop and HTTP failure surface (port, token, 5s connect), not tokens.

## Codex 0.171.0
- `codex app-server generate-json-schema|generate-ts` exist, both [experimental].
- ThreadStartParams.dynamicTools: array of DynamicToolSpec (function {name, description, inputSchema, deferLoading?} or namespace) -- present ONLY with --experimental (stable schema: 0 hits in ClientRequest.json).
- Server request `item/tool/call` (DynamicToolCallParams: callId, threadId, turnId, tool, namespace, arguments) exists in ServerRequest.json (also stable file); client answers with DynamicToolCallOutputContentItem (inputText/inputImage/inputAudio).
- Ptah adapter does not use it: grep for dynamicTools / item/tool/call / experimentalApi in libs/backend/cli-agent-runtime = no hits. It uses `-c mcp_servers.ptah.*` (codex-lane-config.builder.ts:151 tool_timeout_sec etc.).
- Discovery step: dynamicTools has `deferLoading` so a client tool with deferLoading=false is a plausible way to be listed directly; NOT proved that codex's code-mode wrapper then exposes it without an ALL_TOOLS search (needs a live run).

## Comparison
| | HTTP MCP (today) | In-process SDK MCP | Codex dynamicTools |
|---|---|---|---|
| Definition tokens | same as listed; eager subset only, rest deferred | same schemas, same alwaysLoad control; no saving | unknown; deferLoading flag exists |
| Call path | model -> CLI -> HTTP loopback -> dispatcher | CLI <-> host over control channel, no socket | app-server -> JSON-RPC server request to Ptah |
| Caller identity/policy | per-session URL + Bearer, mcp-caller-policy.ts | implicit (session closure); must rebuild policy per session | implicit via threadId; rebuild policy |
| Other processes | yes (any lane) | no (host only) | no (that codex thread only) |
| Migration | none | new adapter of dispatcher to tool() + zod schemas | implement item/tool/call + experimental opt-in |
| Risk | port/token/timeouts | subagent inheritance unproved; dual path | experimental API can change; stable schema lacks dynamicTools |

## Recommendation
Keep HTTP MCP as the single path. Tokens on the Claude lane are already controlled by alwaysLoad; an in-process server is not reachable by CLI lanes and would duplicate policy. For Codex, prototype dynamicTools (deferLoading=false) only for the 3-5 nav tools behind a flag, after a live check that it removes the ALL_TOOLS search.

## Not proved
Subagent inheritance of sdk servers; measured latency difference; Codex code-mode treatment of dynamic tools; stability of dynamicTools across codex versions.
