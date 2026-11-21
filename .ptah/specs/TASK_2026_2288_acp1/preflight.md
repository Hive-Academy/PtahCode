# Pre-flight results (2026-11-20, this machine)

| Check | Result |
|---|---|
| PF-1 / PF-2 Grok | `grok` not installed (not on PATH, no `~/.grok`). Grok work verifies against the recorded fixtures in `CA/acp/__fixtures__/` (fixture 1.0.46). Live Grok testing is blocked until the user installs and signs in. |
| PF-3 agy | `agy 1.5.13` (>= 1.5.1 floor). `agy acp` exists. Flags: `--add-dir`, `--agent`, `--app-data-dir` (default `antigravity-cli`), `--cli_dir_name`, `--cli_log_file`, `--cloud_code_endpoint`, `--dangerously-skip-permissions`, `--disable-telemetry`. No `--gemini-dir` flag in `--help` (first page). |
| PF-4 agy handshake | `evidence/pf4-agy-acp-handshake.ndjsonl`. Request `protocolVersion:2` → reply `protocolVersion:1` (v1 shape). `loadSession:true`; `sessionCapabilities`: resume, close, load, list, additionalDirectories. **No `mcpCapabilities`** → HTTP MCP not advertised: Ptah MCP must go in as a **stdio** server (a stdio→HTTP bridge to Ptah's MCP endpoint). `authMethods`: oauth-personal, oauth-business, gemini-api-key, agent-platform. With the user's default profile, `session/new` succeeded without `authenticate`. `session/new` returns `models` (27, current `gemini-4-neon-high`), `modes` (default, accept-edits, auto, plan) and `configOptions` model / thought_level (low, medium, high, xhigh) / mode. |
| PF-5 isolation | Not run. Decision: use the user's shared Antigravity profile (default app-data-dir) in P2/P4; it is signed in and works. Isolation stays off (plan's option kept off). |
| PF-6 opencode | `opencode` not installed. P5 blocked until installed (npm `opencode-ai`). |
| PF-7 ACP v2 module | `@agentclientprotocol/sdk` 1.7.0: `.` (v1) loads; v2 is only at the subpath `./experimental/v2` (`./v2` is not exported). Both real agents (agy, Grok fixture) answer protocol 1. Decision: keep the v1 client; P2 tolerates a v2 reply number with a v1 shape, no v2 codec. |
| PF-8 dev baseline | Run at the start of P3 manual testing. |
| PF-4b agy HTTP MCP | `session/new` with `mcpServers:[{type:"http",name,url,headers:[]}]` is **accepted** (no error) despite no advertised `mcpCapabilities`. Whether agy actually connects and lists the tools must be proven in P2 with a live prompt against Ptah's MCP server. |
