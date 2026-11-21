# Research Report - TASK_2026_2286

## Question

- Decision this supports: whether and how to add one shared "CLI usage command" fallback source for providers whose usage read fails, and how to fix the wrong Grok message.
- Question: per CLI, what non-interactive command prints plan usage with zero model tokens in a few seconds?
- Bounds: no web search (ptah_web_search had no API key configured: tavily `missing-api-key`), so cursor, opencode, pi, copilot are NOT investigated. No login/config changes, no app/nx runs.

## Answer

Two CLIs have a proven zero-turn command: `agy -p /usage --output-format json` (given) and `claude -p /usage --output-format json --max-turns 1` (verified here; free text, not structured). Grok has no working non-interactive plan-limit command on this machine because the machine is signed out: `~/.grok/auth.json` is `{}` (2 bytes). That also explains "Not signed in" and the wrong UI message, which is a hardcoded Antigravity label shared by every provider. A shared adapter is viable, with a per-CLI argv and parser and a mandatory zero-turn proof.

## Evidence

| Claim | Source | Date | Verified how |
| --- | --- | --- | --- |
| `claude -p /usage --output-format json --max-turns 1 </dev/null` (claude 2.1.329) exits in ~2.5 s, `num_turns:0`, `duration_api_ms:0`, `total_cost_usd:0`, `modelUsage:{}`, `local_command:"usage"`, plan text in `result` | ran it from /tmp | 2026-11-20 | ran it (once) |
| Claude `result` is human text, e.g. "Current week (all models): 69% used · resets Nov 21, 5am (Africa/Cairo)" plus per-model weekly lines and a "What's contributing" section; no numeric reset epoch, tz name embedded | same run | 2026-11-20 | ran it |
| `~/.grok/auth.json` is 2 bytes, parses to an empty dict (0 scopes), mtime 2026-11-18 | `stat`, python `-I` (key names only, no values) | 2026-11-20 | ran it |
| Grok's own log: `AuthManager::new auth.json load result ... scopes_on_disk:[], found:false` for scope `https://auth.x.ai::b1a00492-...` | `~/.grok/logs/unified.jsonl` tail | 2026-11-20 | read it |
| Grok docs: headless sign-in failure "stops with 'Not signed in'"; `grok usage` without a session id on the daemon route and without login says not signed in on stderr, exit 1, nothing on stdout; shell route prints "can't show your plan's usage here yet. Run /usage inside grok instead", exit 1; "Usage limits are managed by your team." exit 0 for metered deployments | `~/.grok/docs/user-guide/02-authentication.md:196`, `17-sessions.md:301-303` (grok 1.0.89) | undated (shipped docs) | read it |
| Grok docs name `grok usage` (no session id) as the shell way to read plan limit, "on the daemon route", from "Grok's background service" | `~/.grok/docs/user-guide/04-slash-commands.md:590` | undated | read it |
| `grok -p '/workflow list'` etc. answer with no model turn; headless JSON "when the prompt reached the model, the same object also carries spend fields (`usage`, `num_turns`, `modelUsage`, cost)" - so absence of spend fields is a zero-turn signal | `14-headless-mode.md:186-187, 679` | undated | read it |
| `grok leader list` -> "No background service processes found." (no leader running now); `grok leader` has `list/info/kill/worker`; `--leader-socket` default `~/.grok/leader.sock` | ran it | 2026-11-20 | ran it |
| Codex 0.171.0 `codex app-server` generates a protocol with request `account/rateLimits/read`; response fields `rateLimits`, `rateLimitsByLimitId`, `ordinaryUsageAllowed`; snapshot has `primary`/`secondary` windows with `usedPercent`, `windowDurationMins`, `resetsAt`, plus `planType`, `credits{balance,hasCredits,unlimited}` | `codex app-server generate-json-schema` output | 2026-11-20 | read generated schema; NOT run against a live server |
| Wrong message source: `PLAN_LIMIT_REASON_LABELS['cli-not-signed-in'] = 'Sign in to the Antigravity CLI (run agy once)'` | `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-owner.model.ts:60` | n/a | read it |
| Grok emits `cli-not-signed-in` when no key in auth.json (`'{}'` default) | `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts:~152-156` | n/a | read it |
| The shared fallback runner also emits `cli-not-signed-in` from regex `sign(ed)? in|log in|login|not authenticated` on stderr/stdout of any CLI | `fallback-usage.runner.ts:~190-192` | n/a | read it |

## Options

| CLI | Command | Verified here | Output shape | Preconditions | Token cost | Failure modes |
| --- | --- | --- | --- | --- | --- | --- |
| Antigravity agy 1.5.13 | `agy -p /usage --output-format json` | yes (given) | `num_turns:0`, `command.name:"usage"`, `command.data.groups[].buckets[]` | signed in | 0 | per existing parser |
| Claude Code 2.1.329 | `claude -p /usage --output-format json --max-turns 1` (stdin closed) | yes | JSON envelope; plan data only in `result` string (lines `Current week (<scope>): N% used · resets <local date text>`); `local_command:"usage"` | logged in (`claude auth status` loggedIn:true, claude.ai) | 0 (`num_turns:0`, `total_cost_usd:0`, `modelUsage:{}`) | text format may change; reset is local-time prose (parse needs tz/year inference); API-key/Bedrock auth likely has no plan text (unverified); output includes extra "contributing" sections that must be ignored |
| Grok 1.0.89 | `grok usage --json` | yes, fails | on success: JSON plan limit (shape unknown - never observed) | signed in AND a running leader/background service | 0 | here: signed-out. Docs: stderr "not signed in" exit 1; shell route "can't show your plan's usage here yet" exit 1; team-managed "Usage limits are managed by your team." exit 0 (not JSON) |
| Grok alt | `grok -p "/usage" --output-format json` | yes, fails ("Not signed in") | unknown | signed in | docs do not say /usage is local in `-p`; unproven | If it is not intercepted it would go to the model. Only use with the zero-turn proof; do not ship unproven |
| Codex 0.171.0 | `codex app-server` (stdio JSON-RPC: `initialize`, then `account/rateLimits/read`) | schema only | `rateLimits.primary/secondary{usedPercent,windowDurationMins,resetsAt}`, `planType`, `credits` | ChatGPT login | 0 (no turn) | experimental API; needs a JSON-RPC client, not a plain argv. Already covered by provider API reader |
| Copilot, Cursor, opencode, pi | not investigated | no | - | - | - | unknown; no web access this run |

## Disagreements

- Grok docs list `grok usage` as the plan-limit command, but the installed build (shell route) refuses it with "run /usage inside grok". The docs describe the daemon route; which route a bare `grok usage` takes on a given install is unknown. Decided locally: treat it as unreliable, expect `exit 1`.
- User note: "`auth.json` exists" - it exists but holds `{}` (no credentials). Not a conflict; that is the cause of "Not signed in".

## Local consequences

- Grok "Not signed in" cause: user is actually signed out (empty auth.json since 2026-11-18). Fix is user-side (`grok login`/sign in in the TUI). `grok -p "/usage"` failing is expected, not a Ptah or leader issue. The leader was not needed to explain it; whether `grok usage --json` works with a leader and a signed-in account stays unverified.
- Grok most reliable path (when signed in): Ptah's existing billing-endpoint reader `grok-account-plan-usage.reader.ts` (reads the key from auth.json, GROK_BILLING_URL, 5 s) - it already works for signed-in users and needs no CLI. The CLI command is a poorer fallback. Next best: `grok usage --json` with exit code and stdout JSON check; unproven shape.
- Wrong message: `plan-owner.model.ts:60` is a single provider-agnostic map. Any provider whose chain returns `cli-not-signed-in` (Grok via `grok-account-plan-usage.reader.ts:~155`, or the runner regex at `fallback-usage.runner.ts:~192`) shows the Antigravity sentence. Also `PLAN_LIMIT_REASON_LABELS` other `cli-*` entries ("Antigravity CLI (agy) not found", timeout, exit-error, parse-failed, backoff) and `no-oauth`/`no-local-server` have the same defect for Grok/Claude. Fix direction: make labels provider-aware (take provider name or CLI binary from the owner) rather than per-reason constants. Backend `agent-limit.formatter.ts:270` says only "sign in required" (already neutral).
- Shared adapter (recommend, architect decides): one `UsageSource` using `fallback-usage.runner.ts` with per-CLI `{argv, parse, signInPattern}`:
  - guards already in the runner: timeout, abort, output cap (`FALLBACK_MAX_OUTPUT_BYTES`), `cli-busy` concurrency (2 total/1 per source), cache and short/parse backoff.
  - add a zero-turn proof gate in each parser: JSON envelope with `num_turns === 0` (agy, claude) and `total_cost_usd` 0 / empty `modelUsage` / `local_command` or `command.name === 'usage'`; for Grok require no spend fields. Reject (`cli-parse-failed`, long backoff) when absent. Closed stdin, `--max-turns 1`, no tools/`--bare` where available. A failed proof must also trip the backoff so the prompt is never resent.
  - sign-in detection must be per CLI (not a global regex) to avoid mislabeling.
  - Claude parser: regex on `Current week (X): N% used · resets ...`; treat reset as a display string unless year/tz inference is acceptable.

## Unknowns

- Output shape of `grok usage --json` on success, and whether it needs `grok leader` running; smallest experiment: sign in, then run `timeout 10 grok usage --json </dev/null` with and without a leader.
- Whether `grok -p "/usage"` is intercepted locally (docs only confirm `/workflow list|help|runs|stop|resume`). Test only after sign-in, with `--max-turns 1`, and check absence of `num_turns/usage` fields.
- Claude `/usage` text behavior for API-key/enterprise accounts, and format stability across versions (only 2.1.329 seen).
- Codex `account/rateLimits/read` over a live stdio session (schema only).
- Copilot, Cursor, opencode, pi: not investigated (no web search access, none installed).
