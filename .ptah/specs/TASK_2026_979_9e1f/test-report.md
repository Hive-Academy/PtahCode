# Test report - TASK_2026_979_9e1f

## P1 live review (Electron dev build, 2026-11-23) - IN PROGRESS

Setup: Ptah Dev build from this worktree (HEAD 6c6287cce + uncommitted spec notes), launched with
Playwright `_electron` on a scratch git repo (`testrepo`). No Ptah connectors are configured on this
machine (user decision row 34), so a local streamable-HTTP MCP server `livecheck`
(one tool `echo`, 127.0.0.1:51999) declared in the test repo's `.mcp.json` stands in for an upstream
server. Evidence: `live-review/p1/`.

| Item | Result | Evidence |
|---|---|---|
| LR-1 main chat sees `ptah` tools; no per-connector overrides | PASS - 85 `mcp__ptah__*` tools; `mcpOverrideKeys: []` | LR1-main-chat-ptah-tools.png, log |
| Unapproved project server is not served (logic S1) | PASS - gateway logs "skipped an unapproved project server"; upstream got no request; model sees no tool | LR-unapproved-not-served.png |
| Approving a project server (capability toggle) | PASS - `capabilities:setEnabled` succeeded; gateway connected and listed 1 tool within seconds (poll) | log, echo-mcp log |
| Fresh session lists and calls a gateway tool | PASS - `mcp__ptah__livecheck__echo` listed; call returned `echo: hello-gateway`; upstream log `call echo("hello-gateway")` | LR-gateway-echo-call.png |
| Gateway approval gate in an interactive session | PASS - permission card "Execute MCP tool livecheck__echo from server ptah", Allow ran it | LR-approval-prompt.png |
| No duplicate server (CLI's own copy suppressed) | PASS - MCP panel shows `ptah` + `livecheck` (gateway), no second `livecheck` | LR-approval-prompt.png |
| Mid-session enable reaches a running session (`list_changed`) | FAIL (first build) - after approving mid-session, the already-running session still had no `livecheck` tools; a new session had them. Root cause: notification-only POSTs got 204, so the CLI never opened the GET SSE stream. | LR-midsession-approval-no-tools.png |
| Re-test after the 202 fix (61e24356e) | PASS, with latency - the CLI now holds an SSE connection to :51820. Disabling `livecheck` removed the tool from a running session; re-enabling it brought `mcp__ptah__livecheck__echo` back to the SAME session, approval prompt shown, upstream log `call echo("hello-midsession")`. A message sent ~10 s after the toggle still saw no tool: the gateway notices a capability toggle only on its 30 s poll. Follow-up: make `capabilities:setEnabled` refresh the gateway at once. | live2/mid-a.png, live2/mid-c-result.png |
| LR #1468 resume keeps gateway tools | PASS (after machine idle + app restart) - `isResume: true` query still listed `mcp__ptah__livecheck__echo`, approval prompt shown, upstream log `call echo("hello-resume")`. First attempts were blocked by a pre-existing CLI health-check timeout under load (cached as "not installed"). | LR-1468-resume-has-gateway-tool.png, LR-1468-resume-result.png |
| Cron run gets gateway tools + warning (#1466) | PASS - session-created job via ptah cron tools (one approval per write, N2), run-now succeeded, upstream log `call echo("hello-cron")`, run summary ends with `[warning] MCP unavailable: claude.ai Claude Docs (pending)`; status stays succeeded | LR-cron-single-approval.png, LR-1466-cron-run.png |
| CLI lanes see gateway tools | codex PASS (`mcp__ptah__livecheck__echo`, `echo: hello-lane-codex`); opencode PASS (`ptah.livecheck__echo`, `echo: hello-lane-opencode`); claude PASS (`echo: hello-lane-claude`) but sees a duplicate `mcp__livecheck__echo` from its own `.mcp.json` read (P2 strict mode removes it); **agy FAIL** - `ptah_lane` lists 39 `mcp_ptah_lane_*` tools and no gateway tool. Cause: agy lanes get a `lane-report` token (`lane-mcp-token-rule.ts`), and the gateway serves only `privileged` callers. Fix scheduled in B22 with the stream-json token write removal (decision row 36).; grok NOT RUN - the lane refused plan and auto-edit, yolo needs user go-ahead | live2/lanes.png, live2/lanes2.png, echo-mcp log |
| LR-12 child worktree, no writes | PASS - main chat ran `ptah_git_worktree_add` and `ptah_session_start`; the child Claude session in `.claude-worktrees/test-lr12-child-*` listed `mcp__ptah__livecheck__echo` and got `echo: hello-worktree`. `git status --short --ignored` is empty in both worktrees: no MCP or provider config was written. Answers decision row 32: no worktree write or sync is needed. | live2/lr12-b.png |
| Harness sync in a linked worktree leaves tracked files alone (#1469) | FAIL (first build) - opening the app on this worktree edited tracked `.gitignore` (removed `.github/skills/` from Ptah's managed block). MCP config files untouched. Fixed in 481c4f3fc (writer no-ops in linked worktrees; tracked copies kept; real `git worktree add` regression spec). Live: both LR-12 worktrees stayed clean. | LR-finding-gitignore.diff |
| Boot warning "Chat MCP registration exceeded deadline" | Seen again on this build under load (12 s to first shell); still to compare with main. | app log |

### Findings to fix
1. **#1469 leftover:** the harness gitignore writer edits the tracked `.gitignore` in a linked worktree.
2. **Mid-session tool updates:** a running Claude session does not pick up a server enabled after it started. Check whether the Claude CLI opens the `ptah` GET SSE stream at all (no GET to 51820 observed yet), or whether `list_changed` is sent but ignored. Observation: no ESTABLISHED connection to :51820 while a session was running, so the CLI appears not to hold the GET stream open.
3. **Pre-existing, not this task:** a single timed-out CLI health check is cached as "not installed" until restart.
4. **To compare with main:** "Chat MCP registration exceeded deadline" warning at boot.

## P2 live review (Electron dev build, 2026-11-24) - IN PROGRESS

Setup: dev build of HEAD 53550a7c3 (B14-B23) plus B24 work in progress, same `testrepo` and
`livecheck` echo server. Evidence: scratchpad `live5/` (strict) and `live6/` (baseline).

| Item | Result | Evidence |
|---|---|---|
| LR-P2-0 (a) claude.ai account connectors with `strictMcpConfig` on (local, uncommitted toggle in `capabilityIsolationOptions`) | **FAIL** - with strict on, a new main-chat session has one server `ptah` (86 tools, `livecheck__echo` among them) and the MCP panel lists only `ptah` + `livecheck`. Baseline build without the toggle, same prompt: panel lists `ptah`, `claude.ai Claude Docs` (Connecting) and `livecheck`. Strict drops the account connector and the hub does not serve it (R8). Per the B20 brief, B20 is not merged; new user decision raised. | live5/08-reply.png, live5/09-mcp.png, live6/01-baseline.png |
| LR-P2-0 (b) plugin MCP served by the hub | NOT TESTABLE here - no enabled plugin declares an MCP server on this machine (both runs show none). | same |
| No duplicate `livecheck` in main chat without strict | PASS - baseline session has `mcp__ptah__livecheck__echo` only; the P1 flag-tier suppression holds. | live6/01-baseline.png |
