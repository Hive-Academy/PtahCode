# Usage sources per CLI (TASK_2026_1180_d4cd)

Sources: `cli-probe.md` (antigravity lane, live probe on this machine, 2026-11-15) and
`code-findings.md` (codex lanes, code analysis). The coordinator spot-checked each cause
below against the code. Placeholders only; no identifiers.

Rank 1 = structured (HTTP API with the CLI's stored credentials, JSON-RPC / `--output-format
json`, local state file). Rank 2 = interactive slash command through a pseudo-terminal.

## Verdict on "spawn the CLI and send /usage"

A PTY `/usage` fallback is not worth building. Every installed CLI has a Rank 1 source.

| CLI | `/usage` in a PTY | Why not |
| --- | --- | --- |
| codex 0.169.0 | does not exist (`/status` is a TUI card) | an unknown slash command is sent as a billable prompt |
| antigravity (agy) 1.5.9 | exists, and also works headless: `agy -p /usage --output-format json` | no PTY needed |
| grok 1.0.77 | TUI only, about 6.5 s in ConPTY | hides `prepaidBalance`; `-p /usage` is a billable prompt |
| claude 2.1.325 | about 10.5 s in ConPTY; `-p /usage` hangs > 12 s | needs XTVERSION reply and folder trust |
| copilot 1.0.101 | shows current-session counters only | no plan quota at all (trap) |
| opencode 2.0.12 | does not exist | sent as a billable prompt |

ConPTY hazards seen: Win32 input mode, terminal capability queries that block, folder-trust
modals, cursor-addressed repaint that breaks text parsers.

## Ordered sources per CLI

| CLI | Rank | Source | Time | Per-model | In Ptah today | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| codex | 1 | `codex app-server` JSON-RPC `account/rateLimits/read` | 2.2 s cold | yes, `rateLimitsByLimitId` buckets | yes (primary) | cold start vs 12 s lookup deadline |
| codex | 1 | `GET chatgpt.com/backend-api/wham/usage` with `~/.codex/auth.json` | 0.8 s | yes | no | unofficial endpoint; never refresh tokens |
| codex | 1 | `~/.codex/sessions/**/rollout-*.jsonl` `rate_limits` | < 50 ms | no | yes (fallback) | only fresh after a recent codex turn |
| antigravity | 1 | IDE `language_server` Connect RPC `GetUserStatus` | < 1 s | yes, per model | yes (2nd) | only when the IDE runs |
| antigravity | 1 | `agy -p /usage --output-format json`, temp `cwd`, stdin ignored | 5.1-5.6 s | per family pool (Gemini vs Claude and GPT) with model lists | text form only, workspace `cwd`, 8 s | in a workspace `cwd` MCP servers boot: 17-25 s |
| antigravity | 1 | CCPA `fetchAvailableModels` / `retrieveUserQuotaSummary` | < 1 s | yes | yes (1st) | needs legacy `acp_token.json`; agy 1.5.9 keeps the token in the OS keyring |
| grok | 1 | `GET cli-chat-proxy.grok.com/v1/billing?format=credits` with `~/.grok/auth.json` | 0.65 s | no (one period window + prepaid balance) | yes, without `prepaidBalance` | none known |
| grok | 1 | `grok usage --json` | < 1 s | no | no | exits 1 on the current shell route |
| claude | 1 | open SDK session `get_usage` control request | < 1 s | yes | yes (only with a live session) | none |
| claude | 1 | `GET api.anthropic.com/api/oauth/usage` with `~/.claude/.credentials.json`, beta header | 0.6 s | yes (`seven_day_opus`, `seven_day_sonnet`, `limits[].scope.model`) | no | beta header; expired token gives no read (never refresh) |
| claude | 1 | cold `claude -p` stream-json `get_usage` with `skip_behaviors` | 6.4 s | yes | no | process cost; no model turn |
| claude | 1 | `~/.claude.json` `cachedUsageUtilization` | < 10 ms | partial | no | freshness and account match needed |
| Claude Api (API key) | - | none for subscription windows | - | - | correctly `unsupported-auth` | stays unknown |
| copilot | 1 | `GET api.github.com/copilot_internal/user` with an OS-keyring token | 0.8 s | no | no | keyring read per OS; filter `has_quota && !unlimited` |
| copilot | 1 | `copilot --headless --stdio` JSON-RPC `account.getQuota` | 16 s cold | no | no | slow cold start |
| opencode | 1 | `GET opencode.ai/zen/go/v1/usage` (OpenCode Go only) | 0.6 s | no | yes (Go route) | 403 EntitlementError must map to no-usage-source |
| opencode | - | `opencode stats --json` | 2.1 s | local spend | yes, then discarded on purpose | accounting, not a limit |

## Causes of the reported symptoms

1. **codex false AT LIMIT (7% weekly, LIMIT REACHED).** `codex-plan-usage.reader.ts:187-196`
   copies the bucket-level `rateLimitReachedType` onto both windows of the bucket.
   `namesGate` (`plan-limit-ledger.rules.ts:180`) then treats the 7% weekly window as a gate,
   so `readingClears` never clears the held exhaustion. Commit d91f6b2a8 fixed only the
   case without a flag. The reader also ignores `ordinaryUsageAllowed`, which the protocol
   parses (`codex-protocol-methods.ts:245`) and which is the provider's own gate.
2. **codex/grok "limit lookup timed out".** Outer deadline 12 s for codex, 3 s for grok
   (`evidence-precedence.ts`). Grok's HTTP read allows 5 s. A cold codex chain can take
   longer than 12 s. The spawn MCP call waits for the same lookup, so it also times out
   while the lane starts (two duplicate lanes started in this task).
3. **antigravity "reader failed" / "no windows reported".** OAuth needs `acp_token.json`,
   which agy 1.5.9 does not write. Local RPC needs the IDE. The CLI fallback runs `agy -p
   /usage` with the inherited `cwd`, which boots MCP servers, so it exceeds its 8 s timeout
   (`fallback-usage.constants.ts:1`, chain deadline 11 s).
4. **100% window shows "near limit".** `classifyWindow` gives `limit-reached` only with
   exhaustion evidence. Glm/kimi readers do not set it at 100%.
5. **grok 402 "usage balance exhausted"** is not classified as a limit. The billing reader
   ignores `prepaidBalance`; 402 in lane output gives `failed`, not `usage-limit`.
6. **copilot, cursor, pi** are short-circuited on purpose (`lane-limit-lookup.service.ts:143`).
   **opencode** local output is discarded on purpose (`plan-usage.service.ts:182-184`).

## Fix list (batches)

| Batch | Change | Main files | Tests |
| --- | --- | --- | --- |
| a | Reached flag gates only the window at >= 100%; `ordinaryUsageAllowed === false` with no window at limit becomes a named bucket gate; 7% clears held table hits. Provider-api percent >= 100 classifies as `limit-reached`. Spawn reply does not wait for a slow lookup (bounded wait, then `unknown (lookup pending)`). Grok deadline >= HTTP timeout. | codex-plan-usage.reader.ts, plan-limit-ledger.rules.ts, lane-state.ts / classifyWindow, evidence-precedence.ts, agent-spawn-limit-gate.ts | reader + rules + classifier specs; spawn gate timing spec |
| b | Antigravity CLI source: `--output-format json`, temp `cwd`, stdin ignored, 15 s timeout, Zod schema for `groups[]`, keep TSV parser as second parse; OAuth source fails fast when the token file is absent. Chain deadline 20 s off the critical path. | antigravity-cli-usage.adapter.ts, fallback-usage.runner.ts (cwd option), fallback-usage.constants.ts, antigravity-oauth-plan-usage.reader.ts | fixtures for JSON and TSV; cwd and kill specs |
| c | New Rank 1 sources behind `UsageSource`: claude OAuth usage endpoint + stream-json `get_usage`; grok `prepaidBalance` and 402 classification; copilot `copilot_internal/user` (when a token is readable) then headless `account.getQuota`; opencode 403 mapping. Remove a CLI from `NO_USAGE_SOURCE_CLIS` only when its source lands. | readers/*, plan-usage.service.ts registry, lane-limit-lookup.service.ts | per-source Zod fixtures; owner-proof specs |
| d | Per-model: map agy family pools to model ids (join `agy models`, prefix fallback), set `modelScope` per window, attach `modelScope` to 429 evidence, pass the routed model into the lookup row so one exhausted pool does not block the lane. PR #1061 (tier map) merged, so no branch overlap. | antigravity adapter, lane-limit-lookup.service.ts, ledger, lane-limit-classifier.ts | two pools with different states; unresolved model stays unknown |

## Out of scope / unknown

- Claude Api (API key): no subscription windows. It stays `unknown (limits not tracked)`.
- cursor and pi are not installed on this machine, so they were not probed.
