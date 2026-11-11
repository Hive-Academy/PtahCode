# CLI usage sources survey (read-only, Windows 11)

Probes used only `--version`, `--help`, schema generation, local file key names, and `node-pty`
sessions that sent a local slash command only. No prompt reached a model. No login or config change.
Placeholders: `<HOME>`, `<TOKEN>`, `<ACCOUNT>`, `<EMAIL>`, `<ID>`.
"Ptah today" is taken from the headers in `libs/backend/auth-providers/src/lib/quota/readers/`.

Column order: Source | Rank | Ptah today | Evidence | TTY | Time | Spends quota | Stability | Risk.

## codex
Installed: `codex-cli 0.166.0` (update to 0.167.0 is offered).

| Source | Rank | Ptah today | Evidence | TTY | Time | Spends quota | Stability | Risk |
|---|---|---|---|---|---|---|---|---|
| App Server JSON-RPC `account/rateLimits/read` | 1 | Already used (`codex-plan-usage.reader.ts`) | `codex app-server generate-json-schema --out <TMP>` gives `v2/GetAccountRateLimitsResponse.json`; also `AccountRateLimitsUpdatedNotification.json`, `GetAccountTokenUsageResponse.json` | No | <1 s (not run live; schema only) | No | Versioned schema, experimental flag | Experimental API |
| Schema keys: `rateLimits{primary,secondary{usedPercent:int,windowDurationMins:int,resetsAt:int epoch s},credits{balance,hasCredits,unlimited},planType enum,limitId,limitName,rateLimitReachedType,spendControlReached}`, `rateLimitsByLimitId` map, `rateLimitResetCredits` | 1 | Already used | same schema | No | - | No | Good | Low |
| Session rollout log `<HOME>/.codex/sessions/YYYY/MM/DD/rollout-<TS>-<ID>.jsonl`: events `payload.type=token_count` with `payload.rate_limits{limit_id,limit_name,primary{used_percent,window_minutes,resets_at},secondary,credits,plan_type,rate_limit_reached_type,spend_control_reached}` | 1 (local file) | New | Newest file had a fresh record (age 0.0 h). 1085 rollout files exist | No | ms | No | snake_case, differs from App Server camelCase. Only as fresh as the last turn | Stale if idle. Secondary was `null` on this plan |
| ChatGPT backend usage endpoint with `<HOME>/.codex/auth.json` token (`tokens{id_token,access_token,refresh_token,account_id}`) | 1 (HTTP) | Not needed (App Server wraps it) | Not verified here; endpoint name is from memory, not confirmed | No | - | No | Unknown | Do not refresh tokens |
| TUI `/status` ("show current session configuration and token usage") via pty | 2 | New | pty start 0.4 s, no trust prompt. `/status` was blocked by an update-notice screen (`0.166.0 -> 0.167.0`); the output never reached a status panel | Yes | >14 s, no result | Not observed | Unknown | Update dialog can take the Enter key; version stayed 0.166.0 |

## antigravity (agy)
Installed: `agy` 1.5.5 at `<HOME>\AppData\Local\agy\bin\agy.EXE`. No `antigravity` binary on PATH.
Subcommands: `acp`, `agents`, `models`, `mcp`, `plugin`, `remote-control`. Print mode: `-p`, `--output-format text|json|stream-json`.

| Source | Rank | Ptah today | Evidence | TTY | Time | Spends quota | Stability | Risk |
|---|---|---|---|---|---|---|---|---|
| `agy -p /usage` (argument array, no shell) | 1 (headless slash command) | Already used (`antigravity-cli-usage.adapter.ts`, tab lines `<group>\t<label>\t<remaining %>\t<ISO reset>`) | Probe printed nothing and hit my 30 s kill | No | >30 s, no output | No (not reached) | Custom TSV, fail-closed parser | Hangs when not signed in |
| Interactive start | - | - | pty banner: "currently not signed in", spinner "Signing in..." | Yes | 0.15 s first output | - | - | A sign-in flow may start. I stopped there |
| Cloud Code HTTP (`cloudcode-pa.googleapis.com`, `daily-cloudcode-pa...`) with OAuth, ACP profile | 1 (HTTP) | Already used (`antigravity-oauth-plan-usage.reader.ts`) | Reader constants | No | - | No | Internal API | Token refresh |
| Local language-server `GetUserStatus` (Connect protocol, CSRF header from process args) | 1 (local RPC) | Already used (`antigravity-plan-usage.reader.ts`, `antigravity-ls.provisional.ts`) | Reader header says reply shape is provisional | No | - | No | Provisional | Needs IDE LS process running |

Per-model quota: the CLI adapter has a `<group>` and `<label>` column, so rows are per model group. Not verified live (not signed in).

## grok
Installed: `grok 1.0.77`.

| Source | Rank | Ptah today | Evidence | TTY | Time | Spends quota | Stability | Risk |
|---|---|---|---|---|---|---|---|---|
| Billing HTTP `https://cli-chat-proxy.grok.com/v1/billing?format=credits` with `<HOME>/.grok/auth.json` key | 1 | Already used (`grok-account-plan-usage.reader.ts`: `config.creditUsagePercent`, `config.currentPeriod{type,end}`) | Reader source. Not called by me | No | - | No | Internal API | Token handling |
| `grok usage [--json]` | 1 (CLI) | New | Help: "needs Grok's background service". Run result: `Error: grok usage can't show your plan's usage here yet. Run /usage inside grok instead.` | No | 0.35-0.8 s | No | Stub in 1.0.77 | Not usable today. Retest on later versions |
| `grok usage <SESSION_ID> [TURN]` | 1 (local) | Already used (`grok-session-usage.reader.ts`) | Help text. Persisted token and cost per session | No | - | No | Unknown | - |
| TUI `/usage` via pty | 2 | New | Works. Start 0.16 s first byte; modal visible about 3 s after the Enter. No trust prompt, no login prompt | Yes | about 4-6 s total | No ("no model calls yet in this session") | Modal with tabs `Context usage | Usage limit | Session info`; redraw noise | Footer also shows `Weekly limit left: N%` |

`/usage` output structure: `Weekly limit (<PLAN NAME>)`, a block bar, `<N>%`, `Resets: <Month> <day>, <HH:MM>` (local time, no year, no zone), `Session usage: ...`. Observed: bar `100%` while footer said `Weekly limit left: 0%`. So the modal percent is probably USED share, and the footer is LEFT share. Direction was not proven with a second data point. One window (weekly). No per-model rows.

## claude
Installed: `2.1.322 (Claude Code)`.

| Source | Rank | Ptah today | Evidence | TTY | Time | Spends quota | Stability | Risk |
|---|---|---|---|---|---|---|---|---|
| SDK control request `getUsage` on an open session (`SDKControlGetUsageResponse`) | 1 | Already used (`claude-plan-usage.reader.ts`, via `SessionQuotaProbe`) | Reader header. Needs an open session | No | - | No | Experimental SDK API | `no-open-session` gap |
| Status-line stdin JSON `rate_limits.five_hour / seven_day {used_percentage, resets_at}` | 1 (callback) | New | `<HOME>/.claude/settings.json` has `statusLine{type,command,padding,refreshInterval}`. Docs per third-party guides ([guide](https://skoula.cz/blog/2026/6/how-to-display-context-and-5h-7d-limits-in-the-claude-code-status-bar/), [issue 45133](https://github.com/anthropics/claude-code/issues/45133)) | No | per refresh | No | `resets_at` type differs between sources (epoch s or ISO); one issue reports the field missing in v2.1.96 | Needs a user status-line hook, conflicts with the user's own |
| OAuth usage HTTP with `<HOME>/.claude/.credentials.json` `claudeAiOauth{accessToken,refreshToken,expiresAt,scopes,subscriptionType,rateLimitTier}` | 1 (HTTP) | New | Used by third-party monitors ([ccusage](https://pypi.org/project/ccusage/)). Endpoint name not verified by me | No | - | No | Undocumented | Must not refresh tokens |
| `<HOME>/.claude/stats-cache.json` | 1 (local) | New | Keys: `dailyActivity`, `dailyModelTokens`, `modelUsage`, `totalSessions`... | No | ms | No | - | Token counts only, no plan windows |
| TUI `/usage` via pty | 2 | New | Start blocked: a "New MCP server found in this project: ptah" approval dialog. In an untrusted temp folder a trust dialog shows. I stopped | Yes | - | - | - | A dialog can accept keys. Not driven |

## copilot
Installed: `GitHub Copilot CLI 1.0.101` (`copilot.cmd` and a VS Code shim also on PATH).

| Source | Rank | Ptah today | Evidence | TTY | Time | Spends quota | Stability | Risk |
|---|---|---|---|---|---|---|---|---|
| `GET api.github.com/copilot_internal/user` -> `quota_snapshots{premium_interactions,...}`, `quota_reset_date` | 1 (HTTP) | No copilot reader in the folder | Third-party sources ([project](https://huggingface.co/spaces/imspsycho/copilot-api/blob/main/src/services/github/get-copilot-usage.ts)). Not called by me | No | - | No | Internal; cached some minutes | Token scope can fail |
| `--usage-output-file <file>` | 1 (local file) | New | Help: final usage statistics as JSON; per session, not plan | No | per run | Needs a real turn | - | Not a plan quota |
| `--acp` | 1 (protocol) | - | Flag exists. No usage method verified | No | - | - | - | - |
| `<HOME>/.copilot/session-store.db` | 1 (local) | New | File exists. Not opened | No | - | No | Unknown | - |
| TUI `/usage` (session credits, token breakdown, "usage-limit progress when limits apply"); `/limits`; status-line `quota` item | 2 | New | `copilot help billing`. Start blocked by trust dialog ("Yes / remember / No") in both temp folder and worktree | Yes | - | - | - | Not driven |

## opencode
Installed: `opencode v2.0.12`.

| Source | Rank | Ptah today | Evidence | TTY | Time | Spends quota | Stability | Risk |
|---|---|---|---|---|---|---|---|---|
| Go usage HTTP `https://opencode.ai/zen/go/v1/usage` with a stored key or OAuth token | 1 | Already used (`opencode-go-plan-usage.reader.ts`) | Reader header says verified live | No | - | No | Internal | Never refresh tokens |
| `opencode stats --json [--days N --models --cost]` | 1 (local) | Already used (`opencode-local-usage.reader.ts`) | Keys: `range, sessions, subagents, prompts, steps, tokens, cost, tools, activeDays, streak, activity[], models[]` | No | seconds | No | JSON | Local accounting, not plan |
| `opencode acp` / `serve` / `api` | 1 (protocol) | - | Subcommands exist. No usage method verified | No | - | - | - | - |
| TUI slash command | 2 | - | Not probed: no usage command in `--help` | Yes | - | - | - | - |

## cursor-agent and pi
Neither binary is on PATH (`where.exe` found nothing). Not surveyed.

## Verdict on the /usage proposal
The proposal is partly right. A slash command exists in several CLIs, but it is not one uniform answer.

- codex: pty not needed. App Server `account/rateLimits/read` is structured and already used. `/status` was blocked by an update screen.
- antigravity: headless `agy -p /usage` already is the "spawn and send /usage" idea. It hangs when the CLI is not signed in. No pty needed.
- grok: pty `/usage` is useful as a fallback. It works today (verified). `grok usage` says "run /usage inside grok". The HTTP billing reader is better when a token exists.
- claude: pty is not recommended. Start shows approval and trust dialogs. The SDK request already returns the full table.
- copilot: pty `/usage` probably works after the trust dialog. Not verified. Prefer the HTTP endpoint.
- opencode: not applicable. No usage slash command found. HTTP plus `stats --json` cover it.

General cost of a pty scrape: TUI redraw noise, trust/update/login dialogs that take keystrokes, local date formats without year or zone, changes between versions. Parsing must fail closed.

## Recommended source order per CLI
1. codex: App Server `account/rateLimits/read`, then newest rollout `token_count.rate_limits`, then none.
2. antigravity: Cloud Code OAuth HTTP, then `agy -p /usage` (with timeout and sign-in check), then local language server.
3. grok: billing HTTP, then pty `/usage` (new fallback), then `grok usage` when it works.
4. claude: SDK usage request, then OAuth usage HTTP (new), then status-line JSON.
5. copilot: `copilot_internal/user` HTTP (new reader), then pty `/usage` after a trust check.
6. opencode: Go usage HTTP, then `opencode stats --json` for local numbers.

## Decisions (not verified)
- node-pty is NOT in this worktree or the main checkout `node_modules`. I loaded it read-only from another worktree (`native-loop`). The task text says it is installed in the repository.
- codex `/status`: the update screen stopped the probe. Live App Server response not called. Codex HTTP endpoint name is not verified.
- agy: not signed in, so I could not see real output or per-model rows. The `-p /usage` probe produced no output within 30 s.
- claude, copilot: dialogs block the pty. I did not answer them (rule: stop and record).
- Endpoints for claude OAuth usage and copilot come from third-party sources only. I did not call them.
- grok: percent direction (used or left) rests on one data point.
- Temp probe files in `<TMP>/ptyprobe` and `<TMP>/cdxschema` are deleted at the end of the run.

## Coordinator corrections (verified 2026-11-10, after the lane survey)

- antigravity: the lane probe ran in an environment where `agy` showed "not signed in". In the
  normal user environment `agy -p /usage` works: exit 0 in 3.5 to 7 s (three runs), no TTY, stdin
  open or closed. Output is 4 tab-separated lines:
  `<group>\t<Weekly|Five Hour> Limit Remaining\t<N>%\t<ISO UTC reset>`.
  Groups on this plan: `Gemini Models` and `Claude and GPT models`. Quota is per model GROUP,
  each with a weekly and a five-hour window. `antigravity-cli-usage.adapter.ts` parses this shape.
- antigravity risk: print mode expands slash commands (`--disable-slash-commands` exists). When
  the argument is not a known slash command, `-p` sends it to a model as a prompt. One probe from
  Git Bash converted `/usage` to a Windows path and got a model answer in 16 s, so it spent one
  small prompt. A reader must pass the argument without a shell (it does: `execFile`,
  `shell: false`) and must back off after a parse failure, because a removed `/usage` command
  would spend quota on each refresh.
- antigravity reader failure, cause: `<HOME>/.gemini/google_accounts.json` exists, so
  `antigravityOwnerRef` (`provider-owner.resolver.ts:422`) returns an `account` owner. For an
  `account` owner `antigravity-plan-usage.reader.ts:77-83,103-109` skips the OAuth source and the
  CLI source. Only the IDE language server remains, and it does not run. The reader returns
  `service-unavailable` with no `statusReason`, which the formatter shows as "reader failed".
- codex false AT LIMIT, cause: see `cause-analysis.md`. The persisted ledger
  (`<APPDATA>/Ptah/global-state.json`, key `ptah.planLimits.exhaustion.v1`) held one `weekly`
  window: exhaustion source `provider-api`, observed 2026-11-10 10:40 UTC, reset 2026-11-14 14:20
  UTC (borrowed from the old window). The provider then reported a new window (7% used, reset
  2026-11-17 10:46 UTC). `readingClears` did not clear an exhaustion with a known reset.
