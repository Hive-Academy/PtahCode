# Decisions - TASK_2026_979_9e1f

| # | Decision | Evidence | Source |
|---|---|---|---|
| 1 | Type BUGFIX, depth Partial | Issues describe defects with expected behaviour; ptah_route_decide not listed | orchestrator rules |
| 2 | One task / one PR for all three issues | #1468 and #1469 are explicitly follow-ups sharing root cause (connector overrides only on chat:start; duplicate configs) | issue text |
| 3 | Lanes disabled, approval user | No ptah_* tools in this session | Gate 0.1 |
| 4 | USER: scope = build the Ptah MCP gateway in this PR (connectors proxied through `ptah`) | AskUserQuestion 2026-11-23 | user |
| 5 | USER: cron/background one-shot runs may receive connector tokens in-process, same as chat | AskUserQuestion | user |
| 6 | USER: MCP server failures are warned in the run summary; status unchanged; no schema field | AskUserQuestion | user |
| 7 | USER: harness sync never rewrites/removes entries in git-tracked config files in a worktree, no .bak for them | AskUserQuestion | user |
| 8 | Flow escalated to FEATURE-shaped: architecture -> Gate 2 (user approval) -> batch -> implement -> review -> tests -> completion | gateway is a new capability crossing several libs | orchestrator |
| 9 | USER: gateway becomes a hub for ALL MCP servers (connectors, marketplace installs, workspace .mcp.json), phased: P1 connectors + HTTP servers; P2 Ptah-run stdio servers per workspace/worktree, harness sync stops writing MCP config | AskUserQuestion 2026-11-23 | user |
| 10 | USER-APPROVED REMOVAL: Ptah stops writing native provider MCP config files (harness MCP facets); CLIs run outside Ptah no longer get Ptah-managed servers. No opt-in export. | AskUserQuestion 2026-11-23 | user |
| 11 | USER (review S1): connectors reach cron runs; other internal one-shot runs only via explicit opt-in `includeConnectors` (none set by default) | AskUserQuestion 2026-11-23 | user |
| 12 | USER (review S4): all privileged lanes see every enabled server through the gateway (no per-lane scoping beyond credential class) | AskUserQuestion 2026-11-23 | user |
| 13 | USER-APPROVED REMOVAL (review S2): drop agy legacy stream-json lane's spawn-time `ptah` file write; that lane loses ptah/ptah_agent_report unless on ACP path | AskUserQuestion 2026-11-23 | user |
| 14 | USER (review S3): in a linked worktree, harness sync writes no MCP config file at all during P1 (not only no deletions) | AskUserQuestion 2026-11-23 | user |
| 15 | Gate 2 review round 1: REVISE (0B/6S/6M/3m), same-family subagent reviewer (no CLI lanes), weaker evidence | implementation-plan-review.md | orchestrator |
| 16 | Gate 2 round 2: APPROVED (0B/0S); N1-N3 non-gating, folded into batch briefs (N1 assumption check, N2 C5 predicate swap + spec, N3 host isLinkedWorktreeRoot where boundaries allow) | implementation-plan-review.md Round 2 | orchestrator |
| 17 | USER: Gate 2 APPROVED; D-U1..D-U5 all Option 1 (rename now; no gateway tools for lane-report or disk slot tokens; hub sources plugin MCP before strict; leave pre-P2 entries) | user message 2026-11-23 | user |
| 18 | USER: completion requires a live review in the Ptah Electron app across main-chat providers and CLI lanes (connectors, ptah tools, resume, cron, worktree child session). This authorizes running the Electron app for that review. | user message 2026-11-23 | user |
| 19 | Accept B6 despite 3 local failures: all are Windows symlink EPERM (D15 dispatcher test, grep.spec, read-symbol.spec; the latter two untouched). Linux CI covers them. Worktree node_modules junction to main added (git-ignored) so the jest `marked` mapping resolves. | .ptah/tmp/b6-test.log | orchestrator |
| 20 | Orchestrator edit (two comment lines): added `degradation-audit: reported` markers to the two B6 catch sites in protocol-dispatcher.ts so the CI ratchet passes; covered by the P1 phase review | nx run degradation-audit:lint exit 0 | orchestrator |
| 21 | Carry-overs from B9/B10: (a) agent-sdk `di/register.ts:642-656` capper factory must pass the gateway predicate as 4th arg -> add to B11 (agent-sdk); (b) `MCP_GATEWAY` must be registered before SdkPermissionHandler / SdkQueryOptionsBuilder / SdkQueryRunner resolve, and listed in `apps/ptah-electron/src/di/expected-resolvable.ts` -> B5; di-lint fails until B5 lands, so no push before B5 | batch-10-report.md | orchestrator |
| 22 | Accept B10 choices: `gatewayApproval` set only when a gateway is bound; cron mutating tools excluded from the gateway gate predicate (asked once by cron gate) | batch-10-report.md | orchestrator |
