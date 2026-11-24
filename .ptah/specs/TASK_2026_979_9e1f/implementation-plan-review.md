# Implementation Plan Review - TASK_2026_979_9e1f (Gate 2)

Reviewer: Claude subagent, same family as the author (no CLI lanes available). Evidence is weaker than a cross-family review: shared blind spots are possible. Static reads only; nothing built or run. Paths are relative to `libs/backend/` unless noted.

Verdict: REVISE. 0 Blocking, 6 Serious, 6 Moderate, 3 Minor.

## Load-bearing claims checked

| Claim | Result |
| --- | --- |
| #1469 root cause: non-retired removals call `facet.remove` with no proof | CONFIRMED. `harness-sync/.../mcp-facet-planner.ts:147-163` plans removals for owned-but-undesired keys. Only keys in `retired` get `retiredItemId`. `:212-220` calls `facet.remove` directly. |
| POST-only HTTP transport | CONFIRMED. `vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:438-447` answers 405 for non-POST (GET only for `/health` and `/`). The plan's short path `mcp-http/...` omits `code-execution/`. |
| Unattended auto-allow of `mcp__ptah__*` | CONFIRMED. `agent-sdk/src/lib/sdk-permission-handler.ts:1080-1090`, `toolName.startsWith(PTAH_MCP_TOOL_PREFIX)`. |
| Capper exemption | CONFIRMED, wrong line. The constant is at `helpers/compaction/tool-output-capper.ts:59`. The exemption is applied at `:117`. The plan must change `:117`. |
| `strictMcpConfig` semantics | CONFIRMED. `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2506-2513`. Servers from explicitly passed `agents` definitions still load. The plan does not mention this. |
| Lane credential classes | CONFIRMED. `cli-agent-runtime/src/lib/cli-agents/lane-mcp-token-rule.ts`: codex, cursor, copilot, opencode and grok are `privileged`; antigravity is `lane-report`. `mcp-caller-policy.ts:153-188` permits `lane-report` the 3 report tools only. |

## Findings

### Serious

**S1. Decision 5 is stretched to all internal queries.**
- Plan "Decisions" row 5 says "All internal-query runs see gateway tools - user decision 5".
- `decisions.md` row 5 grants tokens to *cron/background one-shot runs*, "same as chat".
- `sdk-query-runner.service.ts:855-858` mints a `privileged` `internal-query` credential for every one-shot with `toolAccess != 'none'`. That includes memory-curator and skill-synthesis, which read untrusted text.
- The research (B, "Minimal fix") recommended an opt-in `includeConnectors` for exactly this reason, and flagged it security-relevant and user-reserved. The plan drops the opt-in and cites the user's decision as cover.
- Fix: gate on a `JobRunner`-set flag, or put it to the user as a new D-U. Do not file it under a decision the user did not make.

**S2. The agy legacy-lane removal is claimed as "user-approved, explicitly named", and `decisions.md` does not say so.**
- Parity row 265 removes the spawn-time `ptah` write in `antigravity-cli.adapter.ts:1180-1215`.
- Row 10 covers "harness MCP facets". This is the lane's own injection path, not a facet reconcile of installed servers.
- The adapter header (`:5-19`) shows the stream-json path is a live fallback for older `agy` versions, a probe failure, or `PTAH_AGY_TRANSPORT`. Without the write, the lane has no `ptah` server and so no `ptah_agent_report`. Lane reporting breaks.
- This is a non-MCP-facet harness feature lost silently, which breaks the parity requirement.
- Fix: keep the spawn-time `ptah` write (it is already the "ephemeral ptah key" and not the user's servers), or take it to the user as an explicit D-U with the fallback consequence stated.

**S3. C7 does not satisfy binding decision 7 or the #1469 symptom.**
- Decision 7: "never rewrites/removes entries in git-tracked config files in a worktree". C7 covers removals (`:212-220`) and `.bak` only.
- The planner's `update`/add writes at `mcp-facet-planner.ts:140-143` and the `facet.write` loop (`:221-232`) still rewrite tracked files in a worktree.
- The issue's second symptom is the repointed `ptah` URL in `.agents/mcp_config.json`. The research says the writer was not determined. C7 neither identifies it nor guards it.
- P2 deletes this code in the same PR, so P1 correctness only matters if P2 slips. But the plan says decision 7 is "superseded in P2" and never asks the user. Row 10 removes writing, but does not obviously retire decision 7's P1 guarantee.
- Fix:
  - Apply the tracked-and-worktree guard to writes as well as removals.
  - Name the `.agents/mcp_config.json` writer in a verification step.
  - Record the supersession as a D-U with the user's ack.

**S4. The privileged-lane exposure of connectors is a new capability, and no user option covers it.**
- Before: connector tokens and tools were Claude-session-only. After: every `privileged` lane (codex, cursor, copilot, opencode, grok) can call every connector (zernio post and so on). Those lanes often run with auto-approve flags, and the plan's C5 approval parity is Claude-hook-only.
- This is the confused-deputy risk the research named (G "Risks"). Tokens stay in process, which is good. But authority leaks to any lane processing untrusted repo text.
- D-U2 and D-U3 frame only antigravity and the slot tokens. Nothing asks "do lanes get connectors at all?"
- Fix: add a D-U on lane exposure. Recommended default: lanes get none unless a per-lane opt-in is set. Or at minimum filter by `deniedMcpServers` plus an explicit lane allowlist.

**S5. C5 permission parity is under-specified and partly unverified.**
- `cron-approval-gate.ts:37` matcher is `mcp__ptah__ptah_cron_.*`. The gate's hook calls `gate(...)`, built around the cron-write branch. Its comment: "The cron branch of the permission callback always decides" (`:~100`).
- The plan claims a new matcher "runs the standard `canUseTool` path". It never verifies how the hook behaves for a non-cron tool. A hook that gives no decision "would let an allow rule run the call" (gate header). The mechanism is the load-bearing part of the confused-deputy defence, and it is asserted, not checked.
- The one-shot path is `bypassPermissions` with no `canUseTool` (`sdk-query-runner.service.ts:250`). Cron and internal runs therefore call gateway tools with no gate at all. Acceptable per decision 5, but the plan says "Gateway tools keep third-party approval behaviour" (`:315`), which is false for one-shot runs. State it.
- Fix: add a spec requirement, "a stored `mcp__ptah__*` allow rule does not auto-approve a gateway tool, in an interactive session". Name the hook return that forces the ask path.

**S6. Cold-start can leave #1466 unfixed intermittently.**
- The plan serves "last good list on timeout", but on the first list after app start there is none. Connect budget is 10 s and `tools/list` budget is 5 s (Hub 3).
- A cron one-shot opens the CLI, issues one `tools/list`, and has no GET stream tools-refresh guarantee (A4 is unverified). If the connector handshake is slow, the run starts without connector tools, with no failure beyond a status warning.
- Fix: on the first list for a root, wait for upstream connect (bounded, e.g. 10 s) for connector and intent servers. Or prewarm when `JobRunner` dispatches, and add a spec for "first list, slow upstream".

### Moderate

- **M1. Shared type change without renderer check.** C6 adds `source` to `SessionMcpServerEntry` in `libs/shared`. CLAUDE.md requires scoped checks for affected renderer projects when a shared lib changes. The P1 gate lists no `ptah-extension-webview`.
- **M2. Flag-tier suppression is unproven for non-`.mcp.json` sources.** The plan relies on `disabledMcpjsonServers`/`deniedMcpServers` (evidence row 39). The research listed "does the SDK `mcpServers` option or the deny path beat file entries" as the key unknown. Servers from `~/.claude.json` and `.vscode/mcp.json` may not respond to a `.mcp.json`-named disable. Duplicates could persist in P1 (the issue's own complaint). Add an A-assumption with a one-session check.
- **M3. C11 strict mode removes capability before it is verified.**
  - Plugin servers have a plan (D-U4).
  - The plan itself says claude.ai account connectors "may be hidden... unverified". It would still set strict whenever the gateway is bound.
  - Make "verified on one session" a precondition of C11. Otherwise it needs a user decision.
  - `agents`-definition MCP stays loaded under strict (`sdk.d.ts:2506-2513`) and would duplicate hub servers.
- **M4. Upstream HTTP hardening is missing.**
  - The custom `fetch` sets the bearer per request. It must refuse cross-origin redirects and not forward `Authorization` across origins.
  - Project-declared URLs need the approval check before any connect.
  - C10 passes the full Ptah process env to stdio servers. Tokens in the Ptah env (provider keys) would reach third-party child processes. Pass a filtered env.
- **M5. Gateway-tool detection by "contains `__`".** Plan Decision row 2 and Hub 4: the marker is spec-enforced over today's tool names only. A future Ptah tool, or a third-party-registered one, breaks it silently. Use an explicit prefix or set membership check at the dispatcher (`isGatewayTool`), not a name pattern, for permission, capper and gate decisions.
- **M6. Decision 7 and D-U1 supersession.** The plan states "Decision 7 ... superseded in P2" without user confirmation. D-U1 names the rename but not the effect on persisted session history: resumed sessions replay `mcp__oauth-...` tool_use blocks that no longer exist. State this in the D-U1 consequences.

### Minor

- Cite the capper at `:117`, not `:59` (C5).
- The cron matcher regex in C5 (`[^_]+(?:_[^_]+)*__.*`) is hard to read and untested against the collision-suffixed aliases `zernio_ab12`. Add the spec cases.
- C1 `index.ts` additions across platform-core and shared are fine. Add `expected-resolvable.ts` to the P1-B1 notes, not only B6.

## Judgements

1. **Correctness.**
   - #1466 (cron): addressed by the hub plus C4, except S1/S6.
   - #1468 (resume and slash): addressed structurally, because `ptah` is already injected on resume (research A). The regression-1 spec for "resume lists gateway tools for the binding" is the right test.
   - #1469: root cause correct (C7), writes unaddressed (S3). P2 deletes the code in the same PR.
2. **Security.**
   - Tokens never leave the process: sound for the Claude and lane paths (the hub holds them). Better than per-path injection (lane argv/env).
   - Open: S1, S4, S5, M4.
3. **Failure behaviour.**
   - Good coverage: per-server isolation, 401 refresh then retry, back-off, fast-fail, `isError` results.
   - Gaps: S6; the gateway restart case relies on A4 for list refresh.
4. **Batch quality.**
   - File-disjoint by project; dependencies are right (C8 after C2 and D-U1; P2 sequential on vscode-lm-tools).
   - Verify pair `--related` and `-t lint,typecheck` is correct and scoped, and `Required Skills: none` is present.
   - Missing renderer in the gate (M1). The `-p` names are left for the implementer to resolve.
   - `backend-developer` is sensible. 14 components in about 10 batches is HIGH risk for one PR. Consider a PR split at the P1/P2 boundary.
5. **Parity.**
   - Only row 10 is removed, plus the unapproved agy spawn write (S2).
   - Skills, commands, agents and the gitignore block are kept.
   - `ptah_harness_install_mcp_server` is kept.
6. **Electron-first.** Binding in phase 2 and `expected-resolvable.ts` is right. `cli-engine` gets the hub only when auth secrets are registered, otherwise unchanged (optional DI), so the benchmark path is preserved. `platform-cli` is not mentioned; add a check that nothing there hard-injects the token.
7. **User-decision framing.**
   - D-U1 to D-U5 are framed fairly, each with a recommended and an alternative option.
   - Missing user-reserved items:
     - S1, internal-query exposure (a security choice filed as an existing decision).
     - S4, lane exposure of connectors.
     - S2, the agy legacy removal.
     - M6, the supersession of decision 7.
   - Also decided silently: the P2 strict flip before claude.ai connectors are verified (M3).

## Required changes before approval

1. Fix S1 (opt-in or a new D-U), S2 (keep the agy spawn write or ask), and S3 (guard writes, name the writer, ack the supersession).
2. Add a D-U for lane exposure of connectors (S4).
3. Specify and test the permission mechanism (S5).
4. Handle the cold-start first list (S6).
5. Fix M1 to M3 in the plan text.

## Round 2

Reviewer: Claude subagent, same family as the author (no CLI lanes), so the evidence is weaker than a cross-family review. Scoped to the round 1 findings, `decisions.md` rows 11-15 (not reopened) and the `## Revision log` of `implementation-plan.md`. Static reads only. Citations below were read directly; the SDK d.ts is the root `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (the worktree has no `node_modules`).

Verdict: APPROVED. 0 Blocking, 0 Serious. 3 new Moderate/Minor notes below, none gating.

### Round 1 finding status

| Finding | Status | Evidence |
| --- | --- | --- |
| S1 | Resolved | Row 11. Hub 6 withholds all gateway tools without `includeConnectors`. Hub 10 hooks and the server-side policy enforce it. Only the cron runner sets it (C9). |
| S2 | Resolved | Row 13 is user-approved. The parity row records the consequence, with a zero-write test (C12). `antigravity-cli.adapter.ts:1169-1215` is the spawn-time `ptah` write the user approved removing. |
| S3 | Resolved | Row 14. C7 empties the plan, blocks apply, `.bak` and other facet callers in a linked worktree (`.git` is a file). C3 guards the writer of `.agents/mcp_config.json`: `retired-ptah-mcp-slots.ts:121-152` (`removeRetiredPtahEntry` deletes the `ptah` key and writes the file) is the retired sweep. The regression covers tracked files and the `git status` check. |
| S4 | Resolved | Row 12 is user-approved. D-U2/D-U3 stay open for antigravity and slots, as framed. |
| S5 | Partially resolved | The mechanism is now specified and the cron-gate reading is accurate (see check 1). Residual: N1 below. |
| S6 | Resolved | A bounded 12 s first-list wait, `pending` status with detail, `list_changed` on arrival, and a spec. A8 flags the CLI MCP timeout as unverified, which is the honest framing. |
| M1 | Resolved | Renderer typecheck in P1-B1 and in the P1 gate. |
| M2 | Resolved | A9 with a one-session check. The fallback is explicit: unsuppressed sources persist until P2 strict. |
| M3 | Resolved | C11 precondition: (a) claude.ai connectors, (b) plugins, (c) A7; if (a) fails, a new user decision. |
| M4 | Resolved | Same-origin redirects only, project approval before connect, and the stdio env from `getDefaultEnvironment()`. `client/stdio.d.ts:47` confirms it returns "only environment variables deemed safe to inherit". |
| M5 | Resolved | Registry membership via `registerHostToolNames`, fail closed. `isGatewayTool` is used at the permission sites. |
| M6 | Resolved | The Decision 7 wording is fixed. D-U1 states the resumed-history effect. |
| m1 | Resolved | Capper changed at `:117`. |
| m2 | Resolved | The matcher is `mcp__ptah__.*` plus the registry check. Specs include `zernio_ab12`. |
| m3 | Resolved | `expected-resolvable.ts` is in P1-B2. The `platform-cli` grep is a verification point. |

### Spot-checks of new citations

1. `cron-approval-gate.ts:68-158`: ACCURATE. The factory, the `decided` map by tool-use id, the deadline race, deny on a missing result or error, `{}` only on allow, and the `canUseTool` consume-once all match the plan's description. Two gaps: `canUseTool` (`:73-80`) and the hook (`:88-91`) are hard-wired to `isCronMutatingTool`. The new gate needs its own predicate in both places, or a gateway call would ask twice. Plan Hub 10 says "exactly as the cron gate does" and C5 should state the predicate swap (N2).
2. `sdk-query-options-builder.ts:1512-1517`: ACCURATE. `hooks.PreToolUse = [budget, paused, cronApprovalGate.hookMatcher, ...existing]`, so adding a matcher next to `:1515` is correct. `:2437`: ACCURATE. `cronWriteApproval: true` sits on the `privileged` credential, and `gatewayApproval` can go beside it.
3. `sdk-query-runner.service.ts:871`: ACCURATE for the location. `buildOneShotHooks(cwd)` merges only subagent hooks, so adding a `PreToolUse` matcher is mechanically fine. The signature takes only `cwd`, so `includeConnectors` must be threaded in (N2). Under `bypassPermissions` (`:250`): the installed d.ts does NOT state that `PreToolUse` fires or that a deny wins under it. The plan's support is `cron-approval-gate.ts:1-11`, which only says the hook runs before allow rules. The d.ts contract is "allow proceeds, deny cancels" and line 1323 shows the host policy wins "under bypassPermissions" for an `always_ask` server policy, so the evidence is indirect. This is not gating: the server-side policy (Hub 6) enforces the same opt-in, so the hook is defence in depth. See N1.
4. `sdk-permission-handler.ts:1080-1090`: the `startsWith(PTAH_MCP_TOOL_PREFIX)` unattended allow is at `:1084`, as cited.
5. `retired-ptah-mcp-slots.ts:121-152`: ACCURATE. It is the only writer found for that file, and the plan's guard is a skip in the sweep.
6. `antigravity-cli.adapter.ts` is under `cli-agents/cli-adapters/`, one directory deeper than a bare `cli-agents/` path would imply. The plan cites it by basename only, so there is no break.

### New issues introduced by the revision

- **N1 (Moderate). The one-shot PreToolUse deny is unverified under `bypassPermissions`.** The server-side check backs it, so the failure is bounded. Add an assumption, "PreToolUse deny is honoured under `bypassPermissions` in the installed SDK", with a one-session check, and a spec that proves the server-side refusal alone blocks a no-opt-in one-shot call.
- **N2 (Minor). C5 spec details missing.** (a) The new gate must replace `isCronMutatingTool` with `isGatewayTool` in both `canUseTool` and the hook, or reuse a generalised factory. (b) Thread `includeConnectors` into `buildOneShotHooks`. (c) A gateway hook and the cron hook both match `mcp__ptah__.*` for cron tools: the gateway hook must return `{}` for non-gateway names, as Hub 10 says, and a spec should cover a cron tool passing through both.
- **N3 (Minor). Dependency direction.** C3 has `vscode-lm-tools` call `isLinkedWorktreeRoot` from `harness-sync`. Confirm the import is allowed by the module boundaries, or host the helper in `platform-core`. Lint would catch it, but it affects batch placement.

No new Blocking or Serious issue. Decisions 11-14 are applied as recorded.
