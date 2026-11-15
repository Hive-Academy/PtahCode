# CLI Usage & Quota Source Probe

## Summary

Empirical probe across all 6 locally installed CLIs on Windows shows **every CLI exposes at least one Rank 1 structured source (HTTP API, stdio JSON-RPC, `stream-json` control protocol, or `--output-format json`)**, whereas the blanket proposal *"spawn a CLI process and send `/usage`; it returns all usage"* **works cleanly on only 1 of 6 CLIs (`agy`, and only headlessly via `-p /usage --output-format json` in an isolated temp `cwd`)** — on `codex` and `opencode` `/usage` does not exist and risks sending a billable prompt, on `copilot` `/usage` returns current-session counters (`0` on a fresh process) with **zero** plan quota, on `claude` naive `-p /usage` hangs `>12–15 s` scanning 7-day transcripts, and on `grok` TUI `/usage` requires a full ConPTY (`6.5 s`) and hides `prepaidBalance`.

| CLI | Installed Version | Best Source (Primary → Fallback) | Rank | Per-Model Quota? | Verdict on `"spawn CLI & send /usage"` |
| --- | --- | --- | --- | --- | --- |
| `codex` | `0.169.0` | `codex app-server` `account/rateLimits/read` (`2.2 s`) + `GET https://chatgpt.com/backend-api/wham/usage` (`768 ms`) → rollout JSONL (`<50 ms`) | Rank 1 | **Yes** (`rateLimitsByLimitId` / `normalModelSlug` + `wham/usage` `model_usage.<slug>.available`) | **Fails / Dangerous** — `/usage` does not exist (`/status` is the TUI card); unguarded `/usage` sends a billable prompt and omits `ordinaryUsageAllowed`. |
| `antigravity` (`agy`) | `1.5.9` | `agy -p /usage --output-format json` in temp `cwd` (`5.1 s`) + IDE `language_server` Connect RPC (`<1 s` when IDE open) | Rank 1 | **Yes** (family pools `Gemini Models` vs `Claude and GPT models` + model lists in CLI JSON; per-model in IDE LS / CCPA) | **Works headlessly (no PTY)** via `agy -p /usage --output-format json` **only** with isolated temp `cwd`, `stdin: 'ignore'`, and `12–15 s` timeout (workspace `cwd` boots MCPs and times out at `17.8–25+ s`). |
| `grok` | `1.0.77 [stable]` | `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits` via `~/.grok/auth.json` (`647 ms`) | Rank 1 | **No** (shared `GrokBuild` period window + `prepaidBalance`) | **Inferior last-resort PTY only** — `grok usage --json` exits `1` on shell route; `-p /usage` sends a billable prompt; ConPTY `/usage` takes `~6.5 s` and omits `prepaidBalance` & reset year/timezone. |
| `claude` | `2.1.325` | `GET https://api.anthropic.com/api/oauth/usage` (`628 ms`) → cold `claude -p` `stream-json` `get_usage` (`skip_behaviors: true`, `6.4 s`) → `~/.claude.json` cache (`<10 ms`) | Rank 1 | **Yes** (`seven_day_opus`, `seven_day_sonnet`, `limits[].scope.model`, `model_scoped[]`) | **Fails naively / Unnecessary** — `claude -p /usage` hangs `>12–15 s` scanning 7d transcripts; ConPTY `/usage` takes `10.5 s` and requires `XTVERSION` (`\x1b[>0q`) reply + folder trust. |
| `copilot` | `1.0.101` | `GET https://api.github.com/copilot_internal/user` (`776 ms`) → `copilot --headless --stdio` `account.getQuota` (`16.0 s`) | Rank 1 | **No** (shared monthly `chat` AI-credit or `premium_interactions` pool) | **Wrong data (trap)** — TUI `/usage` prints only *current-session* counters (`Requests: 0 AI Units`), **zero plan quota**, and blocks on folder-trust modal. |
| `opencode` | `v2.0.12` | `GET https://opencode.ai/zen/go/v1/usage` via `opencode.db` (`598 ms`, OpenCode Go only; `opencode stats --json --cost --models` for local spend) | Rank 1 | **No** (Go plan has shared `rolling`/`weekly`/`monthly` windows; `stats --models` is local spend only) | **Fails / Dangerous** — `/usage`, `/quota`, `/cost` do not exist (submits a billable prompt!); `/stats` shows local token/USD history only. |

### Existing Ptah Quota Readers

Files under `libs/backend/auth-providers/src/lib/quota/readers/` (excluding `*.spec.ts` and test fixtures):

- `antigravity-plan-usage.reader.ts` — Orchestrates Antigravity usage lookup via `readUsageSourceChain`: OAuth CCPA API first, then local IDE `language_server` Connect RPC, then `agy -p /usage` CLI fallback.
- `antigravity-oauth-plan-usage.reader.ts` — Exchanges `~/.gemini/antigravity-acp/acp_token.json` refresh token at Google OAuth2 and POSTs `v1internal:retrieveUserQuotaSummary` / `v1internal:fetchAvailableModels` on `(daily-)cloudcode-pa.googleapis.com`.
- `antigravity-ls.provisional.ts` — Defines process discovery args and Zod schema for Antigravity IDE's local `language_server` Connect RPC (`POST /exa.language_server_pb.LanguageServerService/GetUserStatus` with `X-Codeium-Csrf-Token`).
- `antigravity-cli-usage.adapter.ts` — Runs `agy -p /usage` (headless, argument array, 8 s timeout) and parses 4-column TSV lines (`<group>\t<label>\t<remaining%>\t<ISO-UTC>`), requiring `label` to match `/five\s*hour|weekly/i`.
- `antigravity-usage.fixture.ts` — Static 4-line TSV fixture for `antigravity-cli-usage.adapter` tests.
- `claude-plan-usage.reader.ts` — Queries an already-open native Claude Agent SDK session via `SessionQuotaProbe.readPlanUsage` (`SDKControlGetUsageResponse` experimental control request).
- `codex-plan-usage.reader.ts` — Chains `ICodexAccountUsageService.getAccountUsage` (`codex app-server` account/rate-limit RPC with 30 s cache) ahead of the local rollout JSONL fallback (`50_000 ms` chain deadline).
- `codex-rollout-usage.reader.ts` — Tails the last 256 KiB of recent `~/.codex/sessions/**/rollout-*.jsonl` files (freshness <= 15 min) for `event_msg` `token_count` `rate_limits` windows.
- `grok-account-plan-usage.reader.ts` — Reads OAuth bearer key from `~/.grok/auth.json` (when default `grok.com` config applies) and GETs `https://cli-chat-proxy.grok.com/v1/billing?format=credits` (`config.creditUsagePercent`, `config.currentPeriod`).
- `grok-session-usage.reader.ts` — Runs `grok usage <cliSessionId>` (5 s timeout) to read local session token and cost totals for a Ptah-started session.
- `kimi-code-plan-usage.reader.ts` — Calls `GET https://api.kimi.ai/coding/v1/usages` with Bearer auth to read 5h / 7d / monthly usage ratios.
- `ollama-cloud-plan-usage.reader.ts` — Calls `GET https://ollama.com/api/balance` (plan windows/credits) and `GET https://ollama.com/api/usage?range=7d&group_by=model` (secondary request counts) with 60 s per-owner cache.
- `ollama-cloud-usage.parsers.ts` — Bounded JSON reader and Zod schemas mapping Ollama `/api/balance` and `/api/usage` payloads to `PlanLimitWindow` and `PlanLocalUsage`.
- `opencode-go-plan-usage.reader.ts` — Reads OpenCode Go/Zen key or OAuth access token from Ptah store, `auth.json`, or v2 `<data dir>/opencode.db` and GETs `https://opencode.ai/zen/go/v1/usage` (`rolling`, `weekly`, `monthly`).
- `opencode-local-usage.reader.ts` — Runs `opencode stats --json --cost [--days N]` (5 s timeout) for local token/cost accounting (not plan limits).
- `fallback-usage.runner.ts` — Shared bounded child-process runner for CLI usage fallbacks with single-flight deduplication, 30 s cache, backoff on parse/exit errors, and Windows process-tree kill.
- `fallback-usage.constants.ts` — Timeout (8 s), cache (30 s), parse backoff (30 min), short backoff (5 min), and max output (64 KiB) constants for `fallback-usage.runner`.
- `usage-source-chain.ts` — Sequential reader chain (`USAGE_CHAIN_DEADLINE_MS = 11_000`) returning the first source with proven windows or the highest-ranked failure reason.
- `plan-usage-reader.types.ts` — Internal TypeScript contracts (`PlanOwnerTarget`, `PlanUsageReader`, `PlanUsageReading`, `UsageSource`) for quota readers.

## codex

- **Installed version**: `codex-cli 0.169.0` (`%APPDATA%\npm\codex.ps1` → `%APPDATA%\npm\node_modules\@openai\codex\bin\codex.js` → vendor `codex.exe`)

### Sources (ranked)

1. **Rank 1 — `codex app-server` JSON-RPC over stdio (`account/rateLimits/read`)**
   - **How to call**: Spawn `codex app-server` (default `--listen stdio://`; bypass `.ps1` wrapper on Windows by invoking `node <npm-root>/@openai/codex/bin/codex.js app-server` or vendor `codex.exe app-server`), send JSON-RPC `initialize` (`{ clientInfo: { name, version } }`), notification `initialized`, then request `account/rateLimits/read` with `params: {}`. (Also emits live notification `account/rateLimits/updated` while open, and exposes `account/tokenUsage/read` for local/account token stats.)
   - **Auth needed**: Uses CLI's own `$CODEX_HOME/auth.json` (`~/.codex/auth.json`, keys `{ auth_mode, OPENAI_API_KEY, tokens: { id_token, access_token, refresh_token, account_id }, last_refresh }`) and coordinates OAuth refresh safely via `~/.codex/auth.lock`.
   - **Wall time**: `2,225 ms` total cold start (`1,522 ms` to `initialize` reply + `703 ms` for `account/rateLimits/read`). Schema generation (`codex app-server generate-json-schema`) took `1,267 ms`.
   - **Fields (verified via live RPC + `v2/GetAccountRateLimitsResponse.json`)**:
     ```json
     {
       "ordinaryUsageAllowed": "<boolean | null>",
       "accountId": "<uuid | null>",
       "rateLimits": {
         "limitId": "codex",
         "limitName": "<string | null>",
         "normalModelSlug": "<string | null>",
         "planType": "<free|go|plus|pro|prolite|promax|team|business|enterprise|... | null>",
         "primary": { "usedPercent": "<int 0..100>", "windowDurationMins": "<int | null>", "resetsAt": "<epoch_sec | null>" },
         "secondary": "<RateLimitWindow | null>",
         "credits": { "hasCredits": "<bool>", "unlimited": "<bool>", "balance": "<string | null>" },
         "individualLimit": { "limit": "<string>", "used": "<string>", "remainingPercent": "<int>", "resetsAt": "<epoch_sec>" },
         "spendControlReached": "<bool | null>",
         "rateLimitReachedType": "<rate_limit_reached | workspace_owner_credits_depleted | workspace_member_credits_depleted | workspace_owner_usage_limit_reached | workspace_member_usage_limit_reached | null>"
       },
       "rateLimitsByLimitId": { "<limitId>": "<RateLimitSnapshot>" },
       "rateLimitResetCredits": { "availableCount": "<int>", "credits": "<RateLimitResetCredit[] | null>" },
       "rateLimitUpsell": "<object | null>"
     }
     ```
   - **Granularity**: Per-window (`primary`, `secondary`, e.g., `300` min 5h and `10080` min weekly) **and** per-metered-bucket via `rateLimitsByLimitId` (with `normalModelSlug` identifying model-specific buckets such as Spark/tier aliases). Note `ordinaryUsageAllowed` is the authoritative gate flag in `0.169.0`.
   - **Risk**: Experimental flag on `app-server`, though first-party VS Code extension depends on its typed v2 JSON schema. Spawning via `.ps1` wrapper or holding stale daemon locks can inflate latency if not bounded.

2. **Rank 1 — Direct Provider HTTP API (`GET https://chatgpt.com/backend-api/wham/usage`)**
   - **How to call**: `GET https://chatgpt.com/backend-api/wham/usage` with `Authorization: Bearer <tokens.access_token>` and `ChatGPT-Account-Id: <tokens.account_id>` (when `auth_mode === "chatgpt"`).
   - **Auth needed**: Read-only parse of `~/.codex/auth.json` (`$CODEX_HOME/auth.json`). Never refresh tokens directly in Ptah (would race `~/.codex/auth.lock` and rotate refresh tokens).
   - **Wall time**: `768 ms` (no subprocess).
   - **Fields**:
     ```json
     {
       "user_id": "<string>",
       "account_id": "<uuid>",
       "email": "<email>",
       "plan_type": "<string>",
       "rate_limit": {
         "allowed": "<bool>",
         "limit_reached": "<bool>",
         "primary_window": { "used_percent": "<int>", "limit_window_seconds": "<int>", "reset_after_seconds": "<int>", "reset_at": "<epoch_sec>" },
         "secondary_window": "<window | null>"
       },
       "code_review_rate_limit": "<rate_limit | null>",
       "additional_rate_limits": "<array_or_map | null>",
       "model_usage": {
         "<model_slug>": { "available": "<bool>", "available_at": "<timestamp | null>", "credits_would_enable": "<bool>" }
       },
       "credits": { "has_credits": "<bool>", "unlimited": "<bool>", "overage_limit_reached": "<bool>", "balance": "<string | null>", "approx_local_messages": ["<int>", "<int>"], "approx_cloud_messages": ["<int>", "<int>"] },
       "spend_control": { "reached": "<bool>", "individual_limit": "<object | null>" },
       "rate_limit_reached_type": "<string | null>",
       "rate_limit_reset_credits": { "available_count": "<int>", "applicable_available_count": "<int>" }
     }
     ```
   - **Granularity**: Per-window (`primary_window`, `secondary_window`, `additional_rate_limits`) **and** per-model availability (`model_usage.<model_slug>.available`, e.g., `gpt-6-astra`).
   - **Risk**: Internal `wham/usage` endpoint (subject to Cloudflare/headers or schema drift) and fails with `401` if `access_token` in `auth.json` is expired; best paired with `codex app-server` when `401` occurs.

3. **Rank 1 — Local Rollout Session Logs (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`)**
   - **How to call**: Read tail of newest `rollout-*.jsonl` under `$CODEX_HOME/sessions/` and parse last JSONL line matching `type === "event_msg"` and `payload.type === "token_count"`.
   - **Auth needed**: None (local file read).
   - **Wall time**: `< 50 ms` reading newest date folder (`778 ms` full tree walk across `957` rollout files).
   - **Fields**: `payload.rate_limits` with `{ limit_id, limit_name, plan_type, primary: { used_percent, window_minutes, resets_at }, secondary, credits: { has_credits, unlimited, balance }, individual_limit, spend_control_reached, rate_limit_reached_type }`.
   - **Granularity**: Per-window (`primary`, `secondary`) for the session's active `limit_id` only.
   - **Risk**: Passive/stale if no Codex turn ran recently; only reflects the bucket used by the last turn.

4. **Rank 2 — Interactive TUI Slash Commands (`/status`, `/usage`, `/stats`, `/quota`, `/cost`)**
   - **Existence (verified over live ConPTY `codex --no-alt-screen`)**:
     - `/status`: **Exists** — built-in Codex TUI slash command displaying session configuration, active model, token usage, and 5h / Weekly rate-limit bars.
     - `/usage`, `/stats`, `/quota`, `/cost`: **Do NOT exist** as slash commands in `codex-cli 0.169.0` (typing `/usage` or `/quota` without Enter shows no slash-autocomplete match).
   - **TTY requirement**: **Requires a real TTY** (`stdin is not a terminal` error on pipes; `codex exec` headless mode treats slash strings as model prompts). On Windows ConPTY, `crossterm` enables Win32 Input Mode (`\x1b[?9001h`), and typing `/` opens a slash popup where the first `\r` accepts autocomplete rather than submitting immediately.
   - **Wall time**: `> 6,400–9,600 ms` cold over ConPTY — even at `6,443 ms`, submitting `/status` displays `Waiting for startup · esc cancel` until background session bootstrap completes (compared to `2,225 ms` for `codex app-server` and `768 ms` for `wham/usage`).
   - **Output structure**: Unversioned `ratatui` card (`Model: <slug>`, `Account: <email> (<plan>)`, `5h limit: [████░] <remaining_or_used>% (resets <HH:mm>)`, `Weekly limit: [████░] <pct>% (resets <date>)`, `Credits: <balance>`). Crucially, the TUI card **does not expose `ordinaryUsageAllowed`**, which `v2/GetAccountRateLimitsResponse.json` marks as the authoritative gating field in `0.169.0` (*"clients must not infer recovery from percentages or reset times"*).
   - **Spends quota / opens billable session?**: `/status` inside TUI is free (`0` tokens), **but** sending `/usage`, `/quota`, `/stats`, or `/cost` with Enter submits a **billable user prompt** to the model!
   - **Format stability & per-model**: Unversioned ANSI/`ratatui` layout with Win32 Input Mode (`\x1b[?9001h`) and startup wait states; only shows active session bucket + any active secondary bucket, whereas `app-server` returns the full `rateLimitsByLimitId` map and `wham/usage` returns per-model `model_usage`.
   - **Verdict on `"spawn a cli process and send /usage"`**: **Do NOT use** — `/usage` is not a Codex command (sends a billable prompt), `/status` over ConPTY is `3–4×` slower (`6.5–9.5 s`) than `codex app-server` (`2.2 s`), requires Win32 ConPTY input handling, and omits `ordinaryUsageAllowed` (the exact omission behind false `AT LIMIT` vs false recovery bugs).

## antigravity

- **Installed version**: `1.5.9` (`%LOCALAPPDATA%\agy\bin\agy.EXE`)

### Sources (ranked)

1. **Rank 1 — `agy -p /usage --output-format json` (and `agy -p /credits --output-format json`)**
   - **How to call**: Spawn `%LOCALAPPDATA%\agy\bin\agy.exe` with argument array `['-p', '/usage', '--output-format', 'json']` (no shell, `stdio: ['ignore', 'pipe', 'pipe']`, and `cwd` set to an empty/OS temp directory so workspace MCP servers are not booted). Pair with `agy models` (`<model_id>\t<display_name>`) if mapping individual CLI `--model` IDs to group display names.
   - **Auth needed**: Uses `agy`'s own credential in Windows Credential Manager (`LegacyGeneric:target=gemini:antigravity`). Zero token handling required by caller.
   - **Wall time**: `~5.1–5.6 s` from an isolated temp `cwd`; **degrades to `17,813 ms`–`>25,000 ms` (timeout)** when spawned inside a workspace `cwd` that configures MCP servers (which explains Ptah's observed `8,000 ms` / `11,000 ms` fallback timeouts).
   - **Fields**:
     ```json
     {
       "conversation_id": "",
       "status": "SUCCESS",
       "response": "<group>\t<label>\t<remaining_int>%\t<reset_iso_utc>\n...",
       "duration_seconds": 0,
       "num_turns": 0,
       "usage": { "input_tokens": 0, "output_tokens": 0, "thinking_tokens": 0, "cache_read_tokens": 0, "total_tokens": 0 },
       "command": {
         "name": "usage",
         "data": {
           "description": "<string>",
           "groups": [
             {
               "name": "Gemini Models",
               "description": "Models within this group: Gemini 4 Carbon, Gemini 4 Argon, Gemini 4 Hydrogen, Orchestrator (Carbon), Orchestrator (Argon), Gemini 3.8 Flash",
               "buckets": [
                 { "id": "gemini-weekly", "name": "Weekly Limit Remaining", "description": "<string>", "window": "weekly", "remaining_fraction": "<float 0..1>", "reset_time": "<ISO-8601-Z>" },
                 { "id": "gemini-5h", "name": "Five Hour Limit Remaining", "description": "<string>", "window": "5h", "remaining_fraction": "<float 0..1>", "reset_time": "<ISO-8601-Z>" }
               ]
             },
             {
               "name": "Claude and GPT models",
               "description": "Models within this group: Claude Opus 5.5, Claude Sonnet 5.5, GPT-OSS 120B",
               "buckets": [
                 { "id": "3p-weekly", "name": "Weekly Limit Remaining", "description": "<string>", "window": "weekly", "remaining_fraction": "<float 0..1>", "reset_time": "<ISO-8601-Z>" },
                 { "id": "3p-5h", "name": "Five Hour Limit Remaining", "description": "<string>", "window": "5h", "remaining_fraction": "<float 0..1>", "reset_time": "<ISO-8601-Z>" }
               ]
             }
           ]
         }
       }
     }
     ```
     Companion G1 credit check (`agy -p /credits --output-format json`, `5,134 ms`):
     ```json
     {
       "status": "SUCCESS",
       "num_turns": 0,
       "command": { "name": "credits", "data": { "remaining_credits": "<int>", "upgrade_uri": "https://antigravity.google/g1-upgrade" } }
     }
     ```
   - **Granularity**: **Per-model-family pool** (`Gemini Models` vs `Claude and GPT models`), each with `5h` and `weekly` windows, plus explicit model membership in `groups[].description` (joinable with `agy models`, `5,817 ms`, which outputs `22` `<model_id>\t<display_name>` rows). One pool can exhaust (`0%` remaining / HTTP 429) while the other pool remains at `99–100%`.
   - **Risk**: `5–6 s` cold CLI startup; **must** run in an MCP-free temp `cwd` with timeout `>= 12 s` (8 s is too tight under CPU load).

2. **Rank 1 — `agy -p /usage` (plain TSV print mode)**
   - **How to call**: `agy -p /usage` (argument array, no shell, temp `cwd`).
   - **Auth needed**: CLI's Windows Credential Manager entry (`LegacyGeneric:target=gemini:antigravity`).
   - **Wall time**: `5,643 ms`.
   - **Fields**: 4 TSV lines `<group>\t<label>\t<remaining_pct>%\t<ISO-8601-Z>`, e.g. `Gemini Models\tWeekly Limit Remaining\t<pct>%\t<reset_iso>`.
   - **Granularity**: Per-model-family pool (`Gemini Models`, `Claude and GPT models`) × window (`Weekly`, `Five Hour`), but **omits** model-to-group membership descriptions and rounds fractions to integers.

3. **Rank 1 — Antigravity IDE Local `language_server` Connect RPC (`POST /exa.language_server_pb.LanguageServerService/GetUserStatus`)**
   - **How to call**: Discover running IDE `language_server*` process args (`--csrf_token`, `--extension_server_port`) and POST `{ "metadata": { "ideName": "antigravity", "extensionName": "antigravity", "ideVersion": "unknown", "locale": "en" } }` to `127.0.0.1:<port>` with `X-Codeium-Csrf-Token` and `Connect-Protocol-Version: 1`.
   - **Auth needed**: Ephemeral process command-line `--csrf_token`.
   - **Wall time**: `< 200 ms` HTTP call plus ~`300–800 ms` `Get-CimInstance Win32_Process` discovery when IDE is running.
   - **Fields**: `userStatus.cascadeModelConfigData.clientModelConfigs[]` containing `{ label, modelOrAlias: { model }, quotaInfo: { remainingFraction, resetTime } }`.
   - **Granularity**: **Per-model** (`clientModelConfigs` entry per model).
   - **Risk / Availability**: **Unavailable for CLI-only users** — standalone `agy.EXE` processes do not spawn `language_server` with `--csrf_token` (`hasCsrf=False hasExtPort=False` verified live).

4. **Rank 1 — Cloud Code PA HTTP API (`POST https://(daily-)cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary` & `v1internal:fetchAvailableModels`)**
   - **How to call**: `POST /v1internal:retrieveUserQuotaSummary` (grouped buckets) or `POST /v1internal:fetchAvailableModels` (per-model `models.<id>.quotaInfo` and `weeklyQuotaInfo`) with `Authorization: Bearer <access_token>`.
   - **Auth needed**: Historically `~/.gemini/antigravity-acp/acp_token.json` (`client_id`, `client_secret`, `refresh_token`), **which is absent in `agy 1.5.9`** (`~/.gemini/antigravity-acp` missing; `agy` migrated to Windows Credential Manager `LegacyGeneric:target=gemini:antigravity`). Testing `~/.gemini/oauth_creds.json` (Gemini CLI's store) against both CCPA hosts returned `HTTP 401 UNAUTHENTICATED` in `69–188 ms`.
   - **Granularity**: Per-group (`retrieveUserQuotaSummary`) and **per-model** (`fetchAvailableModels`).
   - **Risk**: Currently broken/inapplicable in Ptah (`no-oauth`) unless Ptah reads the native OS keyring entry `gemini:antigravity` (or legacy `acp_token.json` when present).

5. **Rank 2 — Interactive Slash Commands (`/usage`, `/quota`, `/credits`, `/status`, `/stats`, `/cost`)**
   - **Existence (`agy -p /help`, `6,724 ms`)**:
     - `/usage` and alias `/quota`: **Exist** (`View model quota usage`).
     - `/credits`: **Exists** (`Show remaining G1 credits and purchase link`).
     - `/status`, `/stats`, `/cost`: **Do NOT exist** in `agy 1.5.9`.
   - **TTY requirement**: **No TTY needed** when invoked via `-p /usage` or `-p /quota` (with `--output-format json` or `text`). Interactive TUI mode requires a TTY (`bubbletea`) and renders styled/ANSI output.
   - **Spends quota / opens billable session?**: `/usage`, `/quota`, and `/credits` execute locally against the quota RPC with **`0` tokens and `0` model turns**. **Warning**: sending `/status`, `/stats`, or `/cost` treats the unknown slash string as a normal prompt and **opens a billable model turn**.
   - **Format stability & per-model**: `agy -p /usage --output-format json` is structured JSON (Rank 1 quality) with group-level model lists; interactive PTY scraping of `bubbletea` TUI has no advantage over `-p /usage --output-format json`.
   - **Verdict on `"spawn a cli process and send /usage"`**: **Works headlessly via `agy -p /usage --output-format json` (no PTY needed)** if and only if spawned with an empty/temp `cwd`, `stdin: 'ignore'`, argument array (no MSYS/shell `/` mangling), and a `12–15 s` timeout; reports shared model-family pools rather than individual model IDs unless joined with `agy models`.

## grok

- **Installed version**: `grok 1.0.77 (50ca579fa996) [stable]` (`~\.grok\bin\grok.exe`)

### Sources (ranked)

1. **Rank 1 — Provider HTTP Billing API (`GET https://cli-chat-proxy.grok.com/v1/billing?format=credits`)**
   - **How to call**: `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits` with header `Authorization: Bearer <key>` (`redirect: 'error'`).
   - **Auth needed**: `~/.grok/auth.json` (`$GROK_HOME/auth.json` or `$GROK_AUTH`), entry `"https://auth.x.ai::<oidc_client_id>"` (or `"https://accounts.x.ai/sign-in"`), field `key` when `auth_mode` is `"oidc"` / OAuth (not `"api_key"`). Note the entry also stores `expires_at` and `refresh_token`.
   - **Wall time**: `647 ms` (no subprocess).
   - **Fields — verified live while Grok returns HTTP 402 `Grok Build usage balance exhausted`**:
     ```json
     {
       "config": {
         "currentPeriod": {
           "type": "USAGE_PERIOD_TYPE_WEEKLY",
           "start": "<ISO-8601>",
           "end": "<ISO-8601>"
         },
         "creditUsagePercent": 100,
         "productUsage": [
           { "product": "GrokBuild", "usagePercent": 100 }
         ],
         "isUnifiedBillingUser": true,
         "prepaidBalance": { "val": 0 },
         "topUpMethod": "TOP_UP_METHOD_SAVED_PAYMENT_METHOD",
         "billingPeriodStart": "<ISO-8601>",
         "billingPeriodEnd": "<ISO-8601>"
       }
     }
     ```
   - **What it reports in the HTTP 402 `Grok Build usage balance exhausted` state**: It reports **both** a **percent window at `100%`** (`config.creditUsagePercent: 100` and `productUsage[0]: { product: "GrokBuild", usagePercent: 100 }`, resetting at `config.currentPeriod.end`) **and** a **zero prepaid balance** (`config.prepaidBalance: { val: 0 }` with `isUnifiedBillingUser: true`). When `creditUsagePercent >= 100` and `(prepaidBalance?.val ?? 0) <= 0`, the `GrokBuild` allowance is exhausted; conversely, if a unified-billing user has `creditUsagePercent === 100` *with* positive `prepaidBalance.val > 0`, prepaid credits can still fund turns (so gating should check `prepaidBalance.val` alongside `creditUsagePercent`, and classify runtime HTTP 402 `usage balance exhausted` as a live `usage-limit` exhaustion signal).
   - **Granularity**: Product/plan window (`GrokBuild` weekly/monthly period) + prepaid balance. Shared across Build models (`grok-4.6`, `grok-4.7`), not per-model.
   - **Risk**: Internal proxy endpoint (`cli-chat-proxy.grok.com`); skipped for custom enterprise OIDC/proxy overrides or `XAI_API_KEY` mode (where no subscription window exists).

2. **Rank 1 (conditional / currently non-functional on shell route) — `grok usage --json`**
   - **How to call**: `grok usage --json` (no session ID).
   - **Auth needed**: Uses CLI's own `~/.grok/auth.json` via Grok's background daemon service.
   - **Wall time**: `586 ms` (`grok usage --json`), `715 ms` (`grok usage`) to fail on the shell route.
   - **Behavior (verified live + `~/.grok/docs/user-guide/17-sessions.md`)**: On the default **shell route** in `grok 1.0.77`, both `grok usage` and `grok usage --json` exit with code `1` and stderr:
     ``Error: `grok usage` can't show your plan's usage here yet. Run /usage inside grok instead.``
     It only returns plan usage on the **daemon route** when a new-enough background daemon is running (or prints `Usage limits are managed by your team.` exit `0` on team-metered deployments). Passing a `<session-id>` (`grok usage <session-id>`) returns persisted local session `{ tokens, cost }` JSON, not plan limits.

3. **Rank 2 — Interactive TUI Slash Commands (`/usage`, `/cost`, `/status`, `/stats`, `/quota`)**
   - **Existence (`~/.grok/docs/user-guide/04-slash-commands.md` + live ConPTY)**:
     - `/usage` and alias `/cost`: **Exist** — open the TUI `[Dashboard]` modal on the `Usage limit` tab.
     - `/status` (alias of `/session-info`): **Exists** — shows session/context/model state (`No active session.`, `<used_k> / <context_k>`), **not** plan quota.
     - `/stats`, `/quota`: **Do NOT exist** in `grok 1.0.77`.
   - **TTY requirement**: **Requires a real TTY** (ConPTY / `node-pty`, optionally with `--no-alt-screen` to suppress `\x1b[?1049h`). Passing `/usage` to `grok -p` is **not** treated as a slash command and submits a model prompt.
   - **Wall time**: `~5.0–6.5 s` cold over ConPTY (`~3.5–4.5 s` until prompt box mounts + `~2.0 s` past `Loading usage…` for the billing fetch to repaint).
   - **Output structure (verified live over ConPTY in HTTP 402 `Grok Build usage balance exhausted` state)**:
     ```text
     [Dashboard]
     ┌────────────────────────────────────────────────────────────────────── [x] ─┐
     │ Context usage   Usage limit   Session info                                 │
     │   Weekly limit (<plan_name>)                                               │
     │   ██████████████████████████████ <used_pct>%                               │
     │   Resets: <Month> <DD>, <HH>:<mm>                                          │
     │ Tab switch | ↑ / ↓ scroll | Esc close                                      │
     └────────────────────────────────────────────────────────────────────────────┘
     Weekly limit left: <remaining_pct>%
     ```
     In the live HTTP 402 state, the modal rendered `Weekly limit (SuperGrok Lite)` at `100%` used and footer `Weekly limit left: 0%`, omitting `prepaidBalance` (`0`) and omitting year/timezone on `Resets:`.
   - **Spends quota / opens billable session?**: `0` tokens when sent inside TUI after prompt mount; **billable prompt** if passed via `-p` or if an unknown command (`/quota`, `/stats`) is submitted.
   - **Format stability**: **Unversioned & fragile** — Unicode box-drawing (`┌─┐│└─┘`, `█`), cursor-addressed incremental repaints interleaved with background session-spinner frames (`| Starting session… 0.3s`), async `Loading usage…` state before data arrives, and human-formatted local reset timestamp without year or UTC offset.
   - **Granularity**: Plan-wide window only (`Weekly limit (<plan_name>)`), not per-model.
   - **Verdict on `"spawn a cli process and send /usage"`**: **Poor primary, acceptable only as a last-resort PTY fallback** — `grok usage --json` fails on the default shell route (`exit 1`), and ConPTY `/usage` is `10×` slower (`6.5 s` vs `647 ms` HTTP), omits `prepaidBalance` and timezone/year, and requires full VT screen emulation to avoid scraping `Loading usage…` or spinner noise.

## claude

- **Installed version**: `2.1.325 (Claude Code)` (`~\.local\bin\claude.exe`)

### Sources (ranked)

1. **Rank 1 — Provider OAuth Usage HTTP API (`GET https://api.anthropic.com/api/oauth/usage`)**
   - **How to call**: `GET https://api.anthropic.com/api/oauth/usage` with headers `Authorization: Bearer <claudeAiOauth.accessToken>`, `anthropic-beta: oauth-2025-04-20`, `Accept: application/json` (`redirect: 'error'`).
   - **Auth needed**: Read-only parse of `~/.claude/.credentials.json` (`claudeAiOauth: { accessToken, refreshToken, expiresAt, refreshTokenExpiresAt, scopes, subscriptionType, rateLimitTier }`). Only applicable when `claudeAiOauth.accessToken` is present (first-party `claude.ai` subscription; API key / Bedrock / Vertex have no plan windows). Do **not** refresh `refreshToken` directly in Ptah if rotation could invalidate Claude Code's copy; fall back to Source 2 on expired `expiresAt` or `401`.
   - **Wall time**: `628 ms` (no subprocess, works with **zero open Claude sessions**).
   - **Fields (verified live)**:
     ```json
     {
       "five_hour": "{ utilization: <number|null>, resets_at: <ISO-8601|null> } | null",
       "seven_day": {
         "utilization": "<number 0..100>",
         "resets_at": "<ISO-8601>",
         "limit_dollars": "<number|null>",
         "used_dollars": "<number|null>",
         "remaining_dollars": "<number|null>",
         "locked_reason": "<string|null>"
       },
       "seven_day_opus": "<window|null>",
       "seven_day_sonnet": "<window|null>",
       "seven_day_oauth_apps": "<window|null>",
       "seven_day_cowork": "<window|null>",
       "extra_usage": {
         "is_enabled": "<bool>",
         "monthly_limit": "<int|null>",
         "used_credits": "<number|null>",
         "utilization": "<number|null>",
         "currency": "USD",
         "decimal_places": 2,
         "disabled_reason": "<out_of_credits|...|null>",
         "user_disabled": "<bool>",
         "spend_limit_reached": "<bool>"
       },
       "limits": [
         {
           "kind": "<weekly_all | weekly_scoped | five_hour | ...>",
           "group": "<weekly | session | ...>",
           "percent": "<number 0..100>",
           "severity": "<normal | warning | limit_reached | ...>",
           "resets_at": "<ISO-8601>",
           "scope": "{ model: { id: <string|null>, display_name: <string> }, surface: <string|null> } | null",
           "is_active": "<bool>"
         }
       ],
       "spend": {
         "used": { "amount_minor": "<int>", "currency": "USD", "exponent": 2 },
         "limit": { "amount_minor": "<int>", "currency": "USD", "exponent": 2 },
         "percent": "<number>",
         "severity": "<string>",
         "enabled": "<bool>",
         "disabled_reason": "<string|null>"
       },
       "seven_day_breakdown": {
         "as_of": "<ISO-8601>",
         "window_started_at": "<ISO-8601>",
         "rows": [{ "key": "<string>", "display_name": "<Claude Code|Chats|Cowork|Other>", "percent": "<number>" }]
       },
       "weekly_scoped_shares": [{ "limit_index": "<int>", "used_percent_of_weekly": "<number>", "allowance_percent_of_weekly": "<number>" }]
     }
     ```
   - **Granularity**: Per-window (`five_hour`, `seven_day`, `extra_usage`) **and** per-model-tier (`seven_day_opus`, `seven_day_sonnet`, plus normalized `limits[]` entries with `scope.model.display_name`, e.g. `"Fable"` / `"Opus"`).

2. **Rank 1 — Headless `stream-json` Control Request (`subtype: "get_usage"`, `skip_behaviors: true`) / Active SDK Session Probe**
   - **How to call**:
     - If Ptah already holds an open Claude Agent SDK session: call `SessionQuotaProbe.readPlanUsage` (`SDKControlGetUsageRequest` `{ subtype: "get_usage", skip_behaviors: true }`).
     - Cold (no open session): spawn `claude -p --input-format stream-json --output-format stream-json --verbose --no-session-persistence`, write one line `{"type":"control_request","request_id":"1","request":{"subtype":"get_usage","skip_behaviors":true}}\n` to `stdin`, read the `{"type":"control_response",...}` JSON line from `stdout`, then close `stdin` / terminate. **Zero user prompt is sent; `total_cost_usd: 0`, `total_api_duration_ms: 0`.**
   - **Auth needed**: Uses and refreshes Claude Code's own stored OAuth credentials (`~/.claude/.credentials.json`) + respects `claude auth status` (`1,868 ms`, JSON `{ loggedIn, authMethod, apiProvider, subscriptionType, planTier }`).
   - **Wall time**: `6,437 ms` cold (`< 1,000 ms` on an already-open SDK session). **Crucial**: `skip_behaviors: true` is mandatory — omitting it scans every local transcript touched in the last 7 days (`sdk.d.ts` line 158), causing `> 12–15 s` timeouts on active developer machines.
   - **Fields**: `SDKControlGetUsageResponse` (`{ session, subscription_type, rate_limits_available, rate_limits: <same payload as /api/oauth/usage plus model_scoped[]>, behaviors: null }`).
   - **Granularity**: Per-window and per-model-tier (`limits[]`, `model_scoped[]`, `seven_day_opus`, `seven_day_sonnet`).

3. **Rank 1 — Local Cached Utilization in `~/.claude.json` / `~/.claude/.claude.json`**
   - **How to call**: Read JSON key `cachedUsageUtilization` (verifying `accountUuid` matches `oauthAccount.accountUuid` and checking `fetchedAtMs` age). Note `~/.claude/policy-limits.json` contains enterprise feature flags (`restrictions`), **not** quota windows.
   - **Auth needed**: None (local file read).
   - **Wall time**: `< 10 ms`.
   - **Fields**: `{ fetchedAtMs: <epoch_ms>, accountUuid: <uuid>, utilization: <exact /api/oauth/usage object> }`.
   - **Granularity**: Same as Source 1, passive/cached from last Claude Code fetch (note `~/.claude.json` and `~/.claude/.claude.json` can hold different timestamps/accounts — always check `fetchedAtMs` and `accountUuid`).

4. **Rank 2 — Interactive TUI Slash Commands (`/usage`, `/cost`, `/stats`, `/status`, `/quota`)**
   - **Existence (`claude.exe` `2.1.325` bundle + live ConPTY)**:
     - `/usage` (with built-in aliases `/cost` and `/stats` in `2.1.325`): **Exists** — opens the Ink `Settings` panel on the `Usage` tab (or `Stats` tab).
     - `/status`: **Exists** (`requires: { ink: true }`) — opens `Settings → Status` (auth/model/MCP/environment diagnostics, **not** quota windows).
     - `/quota`: **Does NOT exist** in `claude 2.1.325`.
   - **TTY requirement**:
     - Interactive `/usage` **requires a real TTY** (Ink alternate-screen `\x1b[?1049h`, Win32 Input Mode `\x1b[?9001h`, and blocks on startup until the host answers terminal capability queries including `XTVERSION` `\x1b[>0q`! Also blocks on a `"Do you trust the files in this folder?"` modal in untrusted directories).
     - Plain pipe `claude -p /usage` **hangs `> 12–15 s` (timed out in probe)** because without `skip_behaviors: true` it scans all local session transcripts modified in the last 7 days (and waits up to 3 s if `stdin` is not closed).
   - **Wall time**: `10,486 ms` cold over ConPTY (vs `628 ms` for `GET https://api.anthropic.com/api/oauth/usage` and `6,437 ms` for cold `stream-json` `get_usage` with `skip_behaviors: true`).
   - **Output structure (verified live over ConPTY)**:
     ```text
     Settings:  Status   Config   Usage   Stats
     Current week (all models)
     ██████████████████ <used_pct>% used
     Resets <Mon> <DD>, <h[:mm]am|pm> (<IANA_Timezone>)
     What's contributing to your usage?
     Approximate · sessions on this machine only
     Scanning local sessions…
     Current week (<ScopedModelDisplayName>)
     <used_pct>% used
     Resets <Mon> <DD>, <h[:mm]am|pm> (<IANA_Timezone>)
     Usage credits
     Usage credits are <on|off> · /usage-credits to turn them on
     Esc to cancel
     ```
   - **Spends quota / opens billable session?**: `0` tokens (`Total cost: $0.0000`, `Total duration (API): 0s` verified live) for `/usage`, `/cost`, `/stats`, `/status`; **billable prompt** if `/quota` is submitted.
   - **Format stability & per-model**: **Unversioned & fragile** — Ink incremental cell-diff overwrites corrupt naive ANSI text strippers (e.g. `Total duratio (API)` across redraws), requires `XTVERSION` (`\x1b[>0q`) terminal query response, omits reset year, and interleaves `Scanning local sessions…` / `Refreshing…` spinners. Shows model-scoped weekly bar (`Current week (<ScopedModelDisplayName>)`) when applicable, but far less structured than `/api/oauth/usage` `limits[]`.
   - **Verdict on `"spawn a cli process and send /usage"`**: **Do NOT use PTY or plain `-p /usage`** — `GET https://api.anthropic.com/api/oauth/usage` (`628 ms`) and cold `stream-json` `control_request` `{ subtype: "get_usage", skip_behaviors: true }` (`6.4 s`, refreshes OAuth) return the exact underlying JSON with zero TUI/PTY fragility.

## copilot

- **Installed version**: `GitHub Copilot CLI 1.0.101` (`%APPDATA%\npm\copilot.ps1` → `%APPDATA%\npm\node_modules\@github\copilot\npm-loader.js`)

### Sources (ranked)

1. **Rank 1 — GitHub Copilot Internal User HTTP API (`GET https://api.github.com/copilot_internal/user`)**
   - **How to call**: `GET https://api.github.com/copilot_internal/user` with headers `Authorization: Bearer <github_oauth_token>`, `Accept: application/json`, and `User-Agent: ptah-quota-probe` (`redirect: 'error'`).
   - **Auth needed**: GitHub OAuth token stored in Windows Credential Manager under `LegacyGeneric:target=copilot-cli/https://github.com:<login>` (discover `<login>` from `~/.copilot/config.json` `logged_in_users[]`), fallback `LegacyGeneric:target=gh:github.com:<login>` / `gh auth token`, or env `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN` when OAuth-authorized.
   - **Wall time**: `776 ms` (no subprocess).
   - **Fields (verified live)**:
     ```json
     {
       "copilot_plan": "<individual | individual_pro | business | enterprise | ...>",
       "access_type_sku": "<string>",
       "chat_enabled": "<bool>",
       "token_based_billing": "<bool>",
       "quota_reset_date": "<YYYY-MM-DD>",
       "quota_reset_date_utc": "<ISO-8601-Z>",
       "quota_snapshots": {
         "chat": {
           "entitlement": "<number>",
           "remaining": "<number>",
           "quota_remaining": "<number>",
           "credits_used": "<number>",
           "percent_remaining": "<number 0..100>",
           "overage_count": "<number>",
           "overage_permitted": "<bool>",
           "unlimited": "<bool>",
           "has_quota": "<bool>",
           "token_based_billing": "<bool>",
           "quota_id": "chat",
           "timestamp_utc": "<ISO-8601-Z>"
         },
         "completions": "<QuotaSnapshot>",
         "premium_interactions": "<QuotaSnapshot>"
       }
     }
     ```
   - **Granularity & Critical Billing Trap**: Shared monthly quota pool (`chat` AI credits or `premium_interactions` premium requests), **not** per-model (all models draw from the shared pool at model-specific multipliers). **Critical trap verified live**: on AI-credit billing (`token_based_billing: true`), the active monthly AI-credit pool (`entitlement: 200`) is reported under `quota_snapshots.chat` (`has_quota: true, unlimited: false, percent_remaining: <float>`), while `quota_snapshots.premium_interactions` returns `{ has_quota: false, entitlement: 0, remaining: 0, percent_remaining: 0, unlimited: false }`. Treating a snapshot with `has_quota: false` as `0%` remaining would cause a false `AT LIMIT` lock.
   - **Risk**: Internal GitHub endpoint (`copilot_internal/user`, used by VS Code Copilot); requires OS keyring read (or `gh auth token`) on desktop hosts. Fine-grained PATs (`github_pat_*`) may not have access to `copilot_internal/user`.

2. **Rank 1 — Headless Copilot Server JSON-RPC (`copilot --headless --stdio` → `account.getQuota`)**
   - **How to call**: Spawn `node <npm-root>/@github/copilot/npm-loader.js --headless --no-auto-update --log-level error --stdio` (or `@github/copilot/sdk` `CopilotClient` `.rpc.account.getQuota()`) and call JSON-RPC method `account.getQuota` (`params: {}`, typed in `@github/copilot/schemas/api.schema.json`).
   - **Auth needed**: Uses Copilot CLI's own OS keyring token automatically; caller needs zero keyring code.
   - **Wall time**: `15,989 ms` cold (`12,164 ms` server boot + `3,825 ms` `account.getQuota`).
   - **Fields (verified live)**:
     ```json
     {
       "quotaSnapshots": {
         "<chat | completions | premium_interactions>": {
           "entitlementRequests": "<number>",
           "usedRequests": "<number>",
           "remainingPercentage": "<number 0..100>",
           "overage": "<number>",
           "overageAllowedWithExhaustedQuota": "<bool>",
           "resetDate": "<ISO-8601-Z>"
         }
       }
     }
     ```
   - **Granularity**: Same shared quota pools (`chat`, `completions`, `premium_interactions`), not per-model. Note `account.getQuota` omits `has_quota`, so inactive `premium_interactions` appears as `entitlementRequests: 0, usedRequests: 0, remainingPercentage: 0` and must be ignored when `entitlementRequests === 0 && usedRequests === 0`.
   - **Risk**: `12–16 s` cold boot exceeds Ptah's `11 s` chain deadline unless persistent or given a `20 s` timeout.

3. **Rank 1 — Per-Session Structured Output (`--usage-output-file <file>`, `--output-format json` `assistant.usage`, and `~/.copilot/session-store.db`)**
   - **How to call**: Pass `--usage-output-file <file>` or `--output-format json` on Ptah-spawned prompt turns.
   - **Auth needed**: Active Copilot CLI run.
   - **Fields**: `--usage-output-file` writes per-session `{ totalPremiumRequestCost, totalNanoAiu, totalApiDurationMs, totalSessionDurationMs, modelMetrics: { "<model>": { requests, usage } } }`; JSONL `assistant.usage` events during `--output-format json` runs also embed live `quotaSnapshots` (`@github/copilot/schemas/session-events.schema.json`).
   - **Granularity**: Per-model local session usage (`modelMetrics`) + piggybacked plan `quotaSnapshots` on active turns.

4. **Rank 2 — Interactive TUI Slash Commands (`/usage`, `/limits`, `/status`, `/stats`, `/quota`, `/cost`)**
   - **Existence (`copilot help commands`, `app.js` command registry, and live ConPTY)**:
     - `/usage`: **Exists** (`description: "Display session usage metrics and statistics"`).
     - `/limits`: **Exists** (views/sets user-defined session AI-credit soft cap `--max-ai-credits`, **not** account plan quota).
     - `/status`, `/stats`, `/quota`, `/cost`: **Do NOT exist** in Copilot CLI `1.0.101` (`/statusline` only configures footer UI visibility).
   - **TTY requirement**: **Requires a real TTY** (`altScreen=True`, Win32 Input Mode `\x1b[?9001h`). Furthermore, interactive startup blocks on a modal **`Confirm folder trust`** dialog (`Do you trust the files in this folder? 1. Yes / 2. Yes, and remember... / 3. No`) before any slash command can be entered.
   - **Wall time**: `~8,000–11,000 ms` over ConPTY just to reach the folder-trust modal (note `%APPDATA%\npm\...\npm-loader.js` also delegates to cached `~/.copilot/pkg/...` binaries).
   - **Output structure (verified directly from `app.js` `/usage` handler `Acs(t)`)**:
     ```text
     Session Usage

     Changes: +<linesAdded> -<linesRemoved>
     Requests: <totalPremiumRequests> <AI Units | Premium> (<elapsed_duration>)
     Tokens: input <in>, output <out>, cached <cache>[, reasoning <reasoning>]
     ```
     **Critical finding**: Copilot's `/usage` command **does NOT print plan quota, entitlement, `percent_remaining`, or `quota_reset_date_utc` at all** — on a freshly spawned process it prints `Changes: +0 -0` and `Requests: 0 AI Units (0s)`. Plan remaining percentage only appears passively in the TUI statusline footer after folder trust is accepted and auth loads.
   - **Spends quota / opens billable session?**: `/usage` is `0` tokens inside TUI; submitting `/status`, `/stats`, `/quota`, or `/cost` sends a **billable prompt**.
   - **Format stability & per-model**: Plain session summary without plan limits; not per-model (aggregates `modelMetrics` into one token line).
   - **Verdict on `"spawn a cli process and send /usage"`**: **Completely ineffective (trap)** — returns `0` current-session counters instead of monthly plan quota, while blocking on folder-trust UI. Use `GET https://api.github.com/copilot_internal/user` (`776 ms`) or headless `--stdio` `account.getQuota` (`16 s`).

## opencode

- **Installed version**: `opencode v2.0.12` (`%APPDATA%\npm\opencode.ps1` → `%APPDATA%\npm\node_modules\@opencode\cli\bin\opencode.exe`)

### Sources (ranked)

1. **Rank 1 — OpenCode Go / Zen HTTP Usage API (`GET https://opencode.ai/zen/go/v1/usage`)**
   - **How to call**: `GET https://opencode.ai/zen/go/v1/usage` with `Authorization: Bearer <token_or_key>` (`redirect: 'error'`).
   - **Auth needed**: `OPENCODE_API_KEY`, legacy `~/.local/share/opencode/auth.json`, or v2 SQLite `~/.local/share/opencode/opencode.db` (`opencode debug paths` → `data` dir; table `credential`, `integration_id = 'opencode'`, `value` JSON `{ type: "oauth", access, refresh, expires, metadata: { server, accountID, email, orgID, orgName } }` or `{ type: "key", key }`).
   - **Wall time**: `598 ms` (no subprocess).
   - **Fields**:
     - Subscribed OpenCode Go account (`200 OK`): `{ "usage": { "rolling": { "percent": "<number>", "resetsAt": "<epoch>" }, "weekly": { "percent": "<number>", "resetsAt": "<epoch>" }, "monthly": { "percent": "<number>", "resetsAt": "<epoch>" } } }`.
     - OAuth account without Go entitlement (`HTTP 403`, verified live): `{ "type": "error", "error": { "type": "EntitlementError", "message": "<string>" } }`. *(Ptah's `opencode-go-plan-usage.reader.ts` currently maps `403` to `service-unavailable`; it should classify `403` `EntitlementError` as `no-usage-source` / unentitled rather than transient failure.)*
   - **Granularity**: Plan windows (`rolling`, `weekly`, `monthly`) for OpenCode Go only; BYOK / third-party provider credentials in `opencode.db` have no unified OpenCode plan window.
   - **Risk**: Only covers OpenCode Go subscribers; OAuth `access` token in `opencode.db` can expire if OpenCode hasn't refreshed it.

2. **Rank 1 — Local Stats CLI Subcommand (`opencode stats --json --cost --models [--days N]`)**
   - **How to call**: `opencode stats --json --cost --models --days 7` (reads `opencode.db` directly).
   - **Auth needed**: None (local SQLite read).
   - **Wall time**: `2,112 ms`.
   - **Fields (verified live)**: `{ range: { days, start, end }, sessions, subagents, prompts, steps, tokens: { input, output, reasoning, cache: { read, write } }, cost, tools, models: [{ model, steps, tokens, cost }] }`.
   - **Granularity**: Per-model **local token and USD cost accounting only** — reports zero plan limits or remaining quota.
   - **Risk**: Local accounting only. **Warning**: do **not** run `opencode auth list` headlessly — without a running OpenCode background server it hangs `> 15,000 ms` (and rejects `--standalone`).

3. **Rank 2 — Interactive TUI Slash Commands (`/usage`, `/status`, `/stats`, `/quota`, `/cost`)**
   - **Existence (`opencode.exe` `v2.0.12` slash registry + live ConPTY)**:
     - `/usage`, `/quota`, `/cost`: **Do NOT exist** (full built-in slash set is `/cd`, `/editor`, `/skills`, `/worktrees`, `/share`, `/rename`, `/timeline`, `/fork`, `/compact`, `/unshare`, `/undo`, `/redo`, `/copy`, `/export`, `/terminal`, `/sessions`, `/new`, `/open`, `/models`, `/agents`, `/mcps`, `/variants`, `/connect`, `/settings`, `/status`, `/update`, `/pair`, `/restart`, `/reload`, `/debug`, `/themes`, `/help`, `/exit`, `/btw`, `/diff`, `/plugins`, `/stats`).
     - `/status`: **Exists** (`opencode.status` — `View status`), opens MCP/LSP/provider connection status dialog, **not** plan quota.
     - `/stats`: **Exists** (`stats.open` — `Usage statistics`), navigates to the TUI stats view backed by the exact same local `opencode.db` token/cost tables as `opencode stats --json --cost --models`.
   - **TTY requirement**: **Requires a real TTY** (`opentui` full-screen renderer with Win32 Input Mode `\x1b[?9001h` and 24-bit RGB cell frames).
   - **Wall time**: `~6,000–7,200 ms` over ConPTY (`6,188` bytes of raw cell-positioned ANSI output).
   - **Spends quota / opens billable session?**: `/status` and `/stats` are local (`0` tokens), **but** sending `/usage`, `/quota`, or `/cost` submits a **billable prompt** to the active model!
   - **Format stability & per-model**: `opentui` cell-rendered TUI (not line-oriented text); `/stats` shows local per-model token/USD history only, zero plan limits.
   - **Verdict on `"spawn a cli process and send /usage"`**: **Do NOT use** — `/usage` does not exist and bills a prompt; `/stats` is already available cleanly in `2.1 s` via `opencode stats --json --cost --models`, and OpenCode Go plan windows come only from `GET https://opencode.ai/zen/go/v1/usage` (`598 ms`).

## Recommendation

### 1. Ordered Usage-Source Chain per CLI

1. **`codex`**
   - **Source 1**: `codex app-server` stdio JSON-RPC `account/rateLimits/read` (`2.2 s` cold; invoke `node <npm-root>/@openai/codex/bin/codex.js app-server` or vendor `codex.exe app-server` directly, bypassing `codex.ps1`). **Gate on `ordinaryUsageAllowed === false`** (and `spendControlReached` / `rateLimitReachedType`), **not** inferred percentages or stale reset timestamps, and preserve `rateLimitsByLimitId` (`normalModelSlug`) for model-specific buckets.
   - **Source 2**: `GET https://chatgpt.com/backend-api/wham/usage` using read-only `~/.codex/auth.json` (`768 ms`) — fast non-subprocess check or cross-check when `app-server` times out; also supplies per-model `model_usage.<slug>.available`. Never refresh `~/.codex/auth.json` tokens from Ptah.
   - **Source 3**: Recent `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` tail (`< 50 ms`, freshness `<= 15 min`) as passive offline fallback.

2. **`antigravity` (`agy`)**
   - **Source 1 (when IDE is running)**: Local `language_server` Connect RPC `GetUserStatus` (`< 1 s`) — returns true per-model `clientModelConfigs[].quotaInfo`.
   - **Source 2 (universal CLI + IDE)**: `agy -p /usage --output-format json` (`~5.1–5.6 s`) spawned with **isolated `cwd: os.tmpdir()`**, `stdio: ['ignore', 'pipe', 'pipe']`, argument array (no shell), and `15 s` timeout. Parse `command.data.groups[]` (`Gemini Models` vs `Claude and GPT models`, floating-point `remaining_fraction`, `reset_time`, and model names in `groups[].description` joined with cached `agy models` output) so exhausting one family pool (e.g. Claude/GPT) does **not** mark Gemini models `AT LIMIT` (or vice versa). Optionally pair with `agy -p /credits --output-format json` when G1 credits apply.
   - **Source 3 (legacy / optional keyring)**: CCPA `v1internal:fetchAvailableModels` / `retrieveUserQuotaSummary` only when legacy `acp_token.json` exists or OS keyring `gemini:antigravity` support is added (fail fast in `< 50 ms` when absent so chain deadline is not wasted).

3. **`grok`**
   - **Source 1**: `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits` via `~/.grok/auth.json` (`647 ms`). Parse `config.creditUsagePercent`, `config.productUsage[]`, `config.currentPeriod`, **and** `config.prepaidBalance.val` (`isUnifiedBillingUser`): treat `GrokBuild` as exhausted when `creditUsagePercent >= 100 && (prepaidBalance?.val ?? 0) <= 0`, and also feed runtime HTTP 402 `usage balance exhausted` responses directly into live plan-limit state.
   - **Source 2 (forward-compatible daemon route)**: `grok usage --json` (`< 1 s` when daemon route active; fast-fail `exit 1` in `586 ms` on current shell route — treat the `"can't show your plan's usage here yet"` message as `unsupported` without long backoff).
   - **Local session accounting (separate from plan limits)**: `grok usage <cliSessionId>`.

4. **`claude`**
   - **Source 1**: Active SDK session `SessionQuotaProbe.readPlanUsage` (`< 1 s` when a Ptah Claude SDK session is already open; pass `skip_behaviors: true`).
   - **Source 2 (cold, zero open session)**: `GET https://api.anthropic.com/api/oauth/usage` with `Bearer <claudeAiOauth.accessToken>` from `~/.claude/.credentials.json` and header `anthropic-beta: oauth-2025-04-20` (`628 ms`). Parse `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`, `extra_usage`, and per-model `limits[]` (`scope.model`).
   - **Source 3 (expired OAuth token fallback)**: Cold headless `claude -p --input-format stream-json --output-format stream-json --verbose --no-session-persistence` sending `{"type":"control_request","request_id":"1","request":{"subtype":"get_usage","skip_behaviors":true}}` (`6.4 s`, `$0`, safely refreshes OAuth via Claude Code itself).
   - **Source 4 (instant passive fallback)**: `~/.claude.json` / `~/.claude/.claude.json` `cachedUsageUtilization` (`< 10 ms`, gated on matching `accountUuid` and `fetchedAtMs` freshness).

5. **`copilot`**
   - **Source 1**: `GET https://api.github.com/copilot_internal/user` (`776 ms`) using OAuth token from OS keyring (`copilot-cli/https://github.com:<login>` or `gh:github.com:<login>` / `gh auth token` / env). **Filter `quota_snapshots` by `has_quota === true && !unlimited`** so inactive `premium_interactions` (`has_quota: false, percent_remaining: 0` under `token_based_billing: true`) never triggers a false `AT LIMIT`.
   - **Source 2 (keyring-free fallback)**: `copilot --headless --no-auto-update --log-level error --stdio` JSON-RPC `account.getQuota` (`16 s` cold, or `< 1 s` if warm; ignore snapshots with `entitlementRequests === 0 && usedRequests === 0`).
   - **Active-turn piggyback**: Capture `quotaSnapshots` emitted inside `assistant.usage` JSONL events during `--output-format json` turns, and `--usage-output-file` for per-model local session metrics.

6. **`opencode`**
   - **Source 1**: `GET https://opencode.ai/zen/go/v1/usage` (`598 ms`) via `OPENCODE_API_KEY`, `auth.json`, or v2 `<data dir>/opencode.db` `credential` (`integration_id = 'opencode'`). Map `HTTP 403` `EntitlementError` to `no-usage-source` (unentitled to OpenCode Go), **not** `service-unavailable`.
   - **Local accounting (separate from plan limits)**: `opencode stats --json --cost --models --days 7` (`2.1 s`). Never spawn `opencode auth list` without a running server (`> 15 s` hang).

### 2. Is a PTY (`/usage`) Fallback Worth Building?

**No.** Across all 6 CLIs:
- **5 of 6 CLIs have zero benefit and high risk from PTY scraping**: `codex` and `opencode` lack `/usage` (risking billable prompts), `copilot` `/usage` returns `0`-session counters without plan quota and blocks on folder-trust UI, `claude` has `628 ms` HTTP + `6.4 s` `stream-json` control protocol, and `agy` natively supports headless `agy -p /usage --output-format json` over standard pipes (`5.1 s`).
- **Windows ConPTY hazards verified empirically**: Modern TUIs enable Win32 Input Mode (`\x1b[?9001h`), block on terminal capability queries (`XTVERSION` `\x1b[>0q`, DSR `\x1b[6n`), block on workspace folder-trust modals, require `STARTF_USESTDHANDLES` (`0x100`) with null handles when the parent host has redirected stdio, and paint incremental cursor-addressed diffs that corrupt regex text strippers.
- **Only `grok`** lacks a working headless CLI flag on the shell route today, yet its Rank 1 HTTP endpoint (`cli-chat-proxy.grok.com/v1/billing?format=credits`) responds in `647 ms` with richer data (`prepaidBalance` + ISO timestamps) than the TUI modal, and `grok usage --json` is already being rolled out on Grok's daemon route.

### 3. Timeout & Cache TTL Recommendations

| Stage / Setting | Recommended Value | Rationale from Probe Timings |
| --- | --- | --- |
| Direct HTTP Rank 1 timeout | `5,000 ms` | All 5 HTTP endpoints responded in `598–776 ms` live; `5 s` absorbs TLS/DNS jitter without stalling chains. |
| CLI / stdio JSON-RPC Rank 1 timeout (`FALLBACK_TIMEOUT_MS`) | `15,000 ms` (`22,000 ms` for cold `copilot --headless`) | `agy -p /usage --output-format json` takes `5.1–5.6 s` cold (and `8 s` was too tight under load); cold `claude` `stream-json` takes `6.4 s`; `codex app-server` takes `2.2 s`; cold `copilot --headless` takes `16.0 s`. |
| Overall chain deadline (`USAGE_CHAIN_DEADLINE_MS`) | `20,000 ms` | Allows a `5 s` primary timeout + `15 s` CLI fallback without premature chain abort (currently `11,000 ms`). |
| Positive plan-usage cache TTL | `60 s` (`30 s` when `< 10%` remaining) | Balances freshness with rate-limit safety across background polls; deduplicate single-flight per `(provider, accountId)`. |
| At-limit re-probe cadence | `60–120 s` (or at `resetsAt` when authoritative) | Codex `GetAccountRateLimitsResponse` forbids inferring recovery solely from percentages/reset times (`ordinaryUsageAllowed`); periodic lightweight re-probe detects credit top-ups or early resets. |
| Error / backoff TTL | `5 min` transient exit/timeout; `30 min` parse error; **permanent-until-auth-change** on `403 EntitlementError` / API-key mode | Prevents hammering broken binaries while avoiding false "service unavailable" banners for unsubscribed OpenCode/API-key accounts. |

## Decisions

- **Probed ConPTY directly via Win32 `CreatePseudoConsole` (`STARTF_USESTDHANDLES` + terminal query responder) instead of installing `node-pty`**: Neither the worktree nor parent repo had `node-pty` installed, and `npm install` is forbidden in this lane. A self-contained C#/PowerShell ConPTY harness in the scratch directory verified real TTY attachment (`isTTY=true,true`), terminal handshake requirements (`\x1b[?9001h`, `\x1b[>0q`), timings, and sanitized TUI layouts with zero workspace modifications.
- **Avoided pressing Enter on nonexistent slash commands (`/usage` on `codex` and `opencode`)**: Verified slash existence via TUI autocomplete without `\r` plus local binary command-table inspection, honoring the zero-model-prompt / zero-billable-turn constraint.
- **Tested OAuth endpoints strictly read-only**: Used existing access tokens on disk/keyring without triggering OAuth refresh-token exchanges from custom scripts, preventing refresh-token rotation races with user CLIs.

## Open questions

1. **Cross-platform OS keyring access for `agy 1.5.9` and `copilot 1.0.101`**: On Windows, `agy` stores credentials in `LegacyGeneric:target=gemini:antigravity` and `copilot` in `LegacyGeneric:target=copilot-cli/https://github.com:<login>`. For `agy`, `agy -p /usage --output-format json` avoids needing keyring access entirely (`5.1 s`); for `copilot`, should Ptah read OS keyrings across Windows Credential Manager / macOS Keychain / Linux Secret Service (to hit the `776 ms` `copilot_internal/user` endpoint) or keep a warm/22 s `copilot --headless --stdio` RPC client?
2. **Grok daemon-route rollout timeline**: In `grok 1.0.77` on Windows, the default shell route still rejects `grok usage --json` (`exit 1`). Once xAI flips Windows defaults to the daemon route, what is the exact JSON schema emitted by `grok usage --json` for plan windows vs team-managed accounts?
3. **Antigravity model-to-pool mapping stability**: `agy -p /usage --output-format json` currently lists member display names in prose inside `command.data.groups[].description` (`"Models within this group: ..."`), joinable against `agy models` (`<id>\t<display_name>`). If `agy` adds new model IDs whose display names diverge slightly from `groups[].description`, should Ptah maintain a family-prefix fallback (`claude-*` / `gpt-*` → `Claude and GPT models`, `gemini-*` → `Gemini Models`) when exact display-name matching misses?
