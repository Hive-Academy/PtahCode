# Prompt input investigation

## Part 1 — Cache break

### Evidence and comparison

| Record | Cache creation | Cache read | Interpretation |
|---|---:|---:|---|
| r1 | 51,644 | 0 | Initial write of stable prefix. |
| r2 | 25,849 | 26,807 | Prefix ceased matching after about 26.8k tokens. |
| r3 | 0 | 51,644 | Full prefix matched the prior cache. |

The request-record dumps are multiline serialized event streams, rather than one JSON object per physical line. I could not reliably construct a bytewise field diff from the exported representation during this read-only pass; therefore the exact first differing byte and the causal variable are **Unknown**, not asserted. The supplied usage figures establish that the break lies after roughly 26.8k tokens of the shared prefix, but do not identify the differing field.

| Compared field | Finding |
|---|---|
| Tool order/text | `tools.json` is present; the three `api-request-shape` records were not byte-parsed and compared. Exact stability is Unknown. |
| System/message blocks | Exact block-level diff is Unknown from the multiline export. |
| `cacheControl` | Exact placement/diff is Unknown. |
| Attachments (`agent_listing_delta`, `skill_listing`, `deferred_tools_delta`, `session_context`, date, reminder, environment) | These are the named variable candidates in the supplied task; none can be attributed as the actual r2 mismatch without the raw event comparison. |

### Likely source and stabilization approach

The SDK options builder composes system prompt, MCP and session options in `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1-10` (verified). The core Ptah prompt includes MCP substitutions and orchestration guidance in `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts:20-28, 136-145` (verified). These establish likely contributors, not the r2 cause.

Recommended investigation/fix: compare parsed event payloads and the serialized provider request in order, reporting the first differing JSON path and UTF-8 byte offset. Sort any semantically unordered tool/catalog/skill collections before serialization. Keep stable system text, tool definitions, and stable messages before the cache breakpoint; place date, environment/worktree, live agent/skill listings, session context, token reminders, and other per-session deltas after it where protocol semantics permit. Preserve cache-control boundaries and confirm the first stable prefix is identical across fresh sessions. This is an evidence-backed recommendation, not a verified diagnosis.

### Cache cost

With the supplied 1-hour multiplier, cached write is 2x and read is 0.1x base input. A prefix break therefore re-pays the write cost for the unmatched suffix; exact savings depend on locating the mismatch and cannot be derived from aggregate usage alone.

## Part 2 — Native tools

### SDK controls and session-specific options

The options builder is the Ptah composition point (`libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1-10`, verified). The requested SDK declaration could not be located in the workspace’s installed dependencies, so exact `sdk.d.ts` option support remains Unknown. Do not present an option as verified without checking the installed package declaration/version.

| Tool set / action | Candidate mechanism | Potential saving | Risk / status |
|---|---|---:|---|
| Individual Claude built-ins with no Ptah dependency | `disallowedTools` policy | The supplied catalog estimates Workflow ~2,000 tokens and ReportFindings ~850; PushNotification, DesignSync, EnterWorktree, ExitWorktree ~10 each. | Catalog marks these default-off and documents no Ptah UI/backend dependency; workflow/code-review skills depend on the matching tool. Verified catalog at `libs/backend/agent-sdk/src/lib/helpers/claude-builtin-catalog.ts:35-77`. |
| Terminal-only built-in skills | `settings` / skill denial if supported by SDK | Catalog estimates range ~25–460 tokens each. | Could remove CLI-only capabilities; exact SDK setting semantics not verified here. Catalog at `claude-builtin-catalog.ts:79-119`. |
| Native tools dynamically loaded/deferred | SDK deferred-tool mechanism (`defer_loading`/ToolSearch, if supported by installed SDK) | Could reduce eager definition text; estimate equals omitted descriptions/schema, not just names. | SDK declaration unavailable; verify semantics and lazy-load behavior before relying on it. |
| Protected Ptah-required tools | Keep enabled | No safe saving identified. | `PROTECTED_CLAUDE_TOOLS` explicitly includes Agent, Task, AskUserQuestion, Bash, Read, Edit, Write, Skill, ToolSearch, ScheduleWakeup and others (`claude-builtin-catalog.ts:121-146`, verified). |

Ptah’s policy computes denials from enabled opt-ins; the setting key is `agentOrchestration.enabledClaudeBuiltinTools` (`claude-builtin-catalog.ts:148-152`, verified). Do not disable tools wholesale: session-scoped `disallowedTools` can selectively deny catalogued optional built-ins while preserving required tools.

Both PowerShell and Bash appear in the Windows request because the Claude SDK/native tool catalog includes both shell tools; Ptah’s protected list specifically protects Bash (`claude-builtin-catalog.ts:125-146`, verified). Why PowerShell is present and its exact provider-side selection rule were not traced in this pass; Windows alone is not enough evidence to infer the SDK behavior. Treat removal of either as risky until platform-specific tool execution routing is proven.

### Tool-size context

The prompt reports 15 native tools and individual character counts (PowerShell 10,047; Agent 5,273; ScheduleWakeup 4,660; AskUserQuestion 4,527; Bash 4,217; Grep 3,253; ListAgents 1,992; Read 1,948; Skill 1,832; ToolSearch 1,454; Edit 993; Glob 760; Write 668; DeferredToolPlaceholder 204; advisor 91). These are supplied measurements, not recomputed from the unparsed `tools.json`.

## Part 3 — `ptah_agent_spawn` description

### Definition and size

The tool is built by `buildAgentSpawnTool` in `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts:799-832` (verified). It has a long prose description covering provider discovery, asynchronous completion, deliverable verification, waiting/recovery, model tier and resume; schema parameter descriptions begin at line 833. The requested 8,721-char total and “largest Ptah tool” are supplied measurements, not recomputed here.

The schema’s exact field constraints are maintained separately at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-args.schema.ts:86-138` (verified). Eager tools include name, description and schema on each main-chat request; the size guard defines this accounting at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/eager-tool-definitions.budget.spec.ts:9-22, 63-69` (verified), with 19 tools and 26,463-char budget (`:21-22`, verified).

### Description inventory and duplication

| Description unit | Source lines | Approx chars | Existing guidance / overlap |
|---|---:|---:|---|
| Main description: agent family, runtime discovery, async completion, deliverables, wait/recovery, model tier, resume, delegation examples | `tool-description.builder.ts:809-832` | Exact per paragraph Unknown; source concatenates literals and conditional transport text. | Lane workflow and mandatory spawn fields overlap `.claude/skills/agent-lanes/SKILL.md:8-18, 57-58, 140` (verified); prompt orchestration framework is in `ptah-core-prompt.ts:136-145` (verified). |
| `task`, `cli`, `ptahCliId` | `tool-description.builder.ts:836-861` | Unknown | Installed-vs-supported CLI distinction and live discovery duplicated by agent-lanes skill. |
| `workingDirectory`, `timeout`, `files`, `taskFolder` | `:862-882` | Unknown | Workspace/lane task setup can be summarized in skill. |
| `deliverables` | `:883-895` | Unknown | Strong overlap with skill’s lane deliverable contract; preserve explicit success-verification requirement. |
| `model`, `modelTier`, `resume_session_id` | `:896-925` | Unknown | CLI-specific model choices and session resumption details. |
| `accountSelection`, remaining routing/permission/network fields | `:926+` | Unknown | Must retain machine-readable semantics and safety restrictions; remainder not fully inventoried here. |

### Proposed compact description (~3,000 chars)

> Spawn an independent headless lane for a specific task. The shipped `cli` enum is not an installation list: call `ptah_agent_list` and use a currently available system CLI or returned `ptahCliId`. `ptahCliId` selects a user-configured Ptah CLI provider; it takes precedence over `cli`. Omit both only when the configured default is intended.
>
> Give each lane a narrow task, relevant files, working directory and required output. Declare every owed file in `deliverables`; the completion result checks that each declared path exists and is non-empty. Without it, completion reports process exit only, so exit code zero does not prove the requested work was done. Use `taskFolder` for shared task specs/deliverables. Keep independent work in separate lanes.
>
> Spawning is asynchronous and may return `starting`. Continue useful work, then call `ptah_agent_wait` (stdio: `agent_wait`) until lanes finish; HTTP wait is bounded, so repeat while work remains. If completion is missing, use status/read to recover. Completion may arrive as a queued completion block or a pushed turn, depending on the session owner.
>
> Choose `modelTier` for Ptah CLI agents (`sonnet` default; `opus` for complex analysis; `haiku` for fast/simple work); it also applies to Claude `cli`. `model` is a CLI-specific model id and should be taken from that CLI’s own valid options. Resume with `resume_session_id`; a Claude resumed lane retains its stored account. Use account selection only for a fresh Claude CLI lane where supported. Optional effort, route, permission and network controls apply only where the selected CLI supports them.
>
> Parameters: `task` is required; `cli` selects an installed system CLI; `ptahCliId` selects a listed Ptah CLI; `workingDirectory` scopes execution; `timeout` sets the inactivity window; `files` focuses the lane; `taskFolder` locates shared task files; `deliverables` declares required output files; `model`/`modelTier` choose model; `resume_session_id` resumes; `role` selects lane role; `phase`/`skills` provide resolved handoff context; `effort`, `taskKind`, `routingSource`, `route`, `force`, `idempotencyKey`, `accountSelection`, `permission`, and `network` are optional routing/execution controls. Follow the agent-lanes skill and PTAH lane policy for ownership, verification and reporting.

This draft preserves core operational guidance but exact parity for every schema parameter requires reviewing the remaining description lines (`tool-description.builder.ts:926+`) and measuring the rendered text. Do not remove the budget guard or raise it without measured justification.

## Decisions

- Treat the observed r2 cache break as unresolved until the raw event payloads are parsed and diffed; aggregate cache counters do not identify the field.
- Prefer deterministic ordering and moving per-session content after the stable cacheable prefix, conditional on provider cache-boundary semantics.
- Keep protected native tools. Consider only individual default-off built-ins or verified per-session deferral after SDK declaration review.
- Use the proposed concise spawn description as an editorial draft, then count rendered characters and check each parameter description against the full definition before adoption.

## Unknown

- Exact first byte/JSON path where r2 diverges from r1 and r3, and the precise producer of that changing content.
- Exact byte stability of system blocks, messages, tool order and cache-control placement in the three captures.
- Installed Claude Agent SDK declaration/version and supported controls for deferred tools, per-session settings and tool selection.
- Why native PowerShell is included alongside Bash on Windows and the safe platform routing for both.
- Exact character counts for each spawn prose paragraph and parameter, and exact 3,000-character count of the rendered draft.
- Full remaining spawn property descriptions after `accountSelection`.
