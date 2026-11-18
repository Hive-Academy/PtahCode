## A. Limit-state pipeline

- Scope: read-only inspection of this worktree, 2026-11-18. References are worktree-relative `file:line`; no source changes or verification/build/test commands were run.
- Literal search located the display strings in `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-limit.formatter.ts`: `confirmed room` at 369; `AT LIMIT` at 309, 349, 354; `no usage source` at 107, 255; `limits not tracked` at 109, 285; `API key, no plan` at 259; `usage read paused after a failure` at 273; `limit lookup timed out` at 88, 287. `unsupported-auth` is the machine status behind the API-key label (259), rather than proof that a paid API key is unusable.
- Tool dispatch obtains lane snapshots via `ptahAPI.agent.limits`, optionally with CLI fallback: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:317`. `LaneLimitLookupService` resolves each lane independently, passes owner/session/route to the reader and races cancellation/deadline: `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-lookup.service.ts:173`, `:220`, `:234`, `:239`.
- Ownership and eligibility precede reads. `planOwnerRead` rejects Claude credential owners as `unsupported-auth`; subscription accounts need a session handle, otherwise `service-unavailable`/`no-open-session`: `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-owner-read.ts:129`. A system Claude lane has no synchronous owner rule; its account must be learned later: `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-owner.resolver.ts:118`.
- `PlanUsageService` dispatches by normalized provider, resolves secret references, reads account quota independently from local accounting and merges ledger evidence: `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:161`, `:235`. Ledger persistence/evidence is owned by `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.ts` and its `.rules.ts`/`.persistence.ts` siblings.
- The final shared classifier is `classifyLaneState`: active exhaustion wins, then near-limit, then room only for a successful, fresh, complete, nonempty window set with known applicable model scope and no cooldown/estimated block; everything else is unknown. `libs/shared/src/lib/utils/plan-limits/lane-state.ts:303`, `:314`, `:358`. Near-limit is 90%; freshness is 15 minutes: `libs/shared/src/lib/utils/plan-limits/evidence-precedence.ts:11`.
- Default lookup deadline is 3 s; Codex, Antigravity, Grok and Kimi get 12 s: `libs/shared/src/lib/utils/plan-limits/evidence-precedence.ts:17`, `:25`, `:27`. This outer deadline can truncate a source's longer internal allowance.

Usage-source contract and wiring:

- `PlanUsageReader` is a function from `PlanUsageReadRequest` to `PlanUsageReading`; `UsageSource` has `id`, `label`, `read()` and an explicit success/failure result. Targets include owner, credential reference, session handle, certified Claude route and optional known CLI session ID. `libs/backend/auth-providers/src/lib/quota/readers/plan-usage-reader.types.ts:49`, `:65`, `:111`, `:118`.
- `readUsageSourceChain` composes ordered sources under a 20 s default budget, accepts only complete nonempty proven windows, ranks failure reasons, and stops on account-unverified: `libs/backend/auth-providers/src/lib/quota/readers/usage-source-chain.ts:11`, `:13`, `:24`, `:34`. Concrete chains are Codex App Server/local-rollout and Antigravity OAuth/local-RPC/CLI; Claude combines live SDK then OAuth in the service. Grok account/session and Kimi are reader functions rather than separately injected source classes: `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:204`, `:235`.
- DI factory registers `PLAN_USAGE_SERVICE` and its dependencies in `libs/backend/auth-providers/src/lib/di/register.ts:339`; both roots invoke that shared registrar: Electron `apps/ptah-electron/src/di/phase-2-libraries.ts:262`, CLI `libs/backend/cli-engine/src/lib/container.ts:746`.
- Per-owner service cache: 30 s, single flight, maximum 64 owners, cancellation per waiter. Only same-owner transient failures may reuse the previous available reading as stale; eligibility failures replace it. `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:21`, `:89`, `:276`.
- CLI runner caches success for 30 s, parse failures for 30 min, timeout/exit/not-signed-in/unavailable failures for 5 min; cached failure returns `cli-backoff`. Keys include source, owner, executable and arguments; concurrency is at most two total and one per source. `libs/backend/auth-providers/src/lib/quota/readers/fallback-usage.runner.ts:84`, `:87`, `:95`, `:100`; durations in `fallback-usage.constants.ts:1`. Ordinary refresh does not bypass this failure cache.
- Claude OAuth separately pauses failures for 60 s unless Retry-After supplies a cooldown; explicit refresh can bypass non-rate-limit failure pauses. `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:172`, `:174`, `:211`.
- Do not confuse this quota `UsageSource` with the historical analytics interface of the same name, which reads workspace/time ranges and emits token/cost contributions: `libs/backend/usage-analytics/src/lib/usage-source.types.ts:27`.

## B. Working sources

- **Codex:** `CodexAccountUsageService` starts/uses the App Server, reads `account/read` then `account/rateLimits/read`, parses account/auth/window data, and has its own 30 s cache/single-flight and stale fallback. `libs/backend/auth-providers/src/lib/providers/codex/codex-account-usage.service.ts:37`, `:137`, `:265`, `:431`, `:461`, `:473`, `:502`, `:530`.
- `createCodexPlanUsageReader` adapts that result into owner windows with original observation times, primary/secondary/model buckets and exhaustion/clear evidence. The first source is `provider-api`; eligible failures fall back to a local rollout source. `libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.ts:57`, `:70`, `:91`, `:111`, `:164`.
- Local rollout reads schema-validated `rate_limits` events and checks auth-change/owner provenance rather than treating arbitrary old transcripts as current room. `libs/backend/auth-providers/src/lib/quota/readers/codex-rollout-usage.reader.ts:93`, `:111`, `:122`. Copy the evidence/owner/time mapping, not just the displayed percent.
- **Kimi Code:** `createKimiCodePlanUsageReader` uses `https://api.kimi.ai/coding/v1/usages`, supports OAuth and exact-owner API-key slots, validates response envelopes, maps bounded ratio/reset windows, retries OAuth once after forced refresh on 401/403, and fails closed for malformed/inconsistent data. `libs/backend/auth-providers/src/lib/quota/readers/kimi-code-plan-usage.reader.ts:9`, `:64`, `:91`, `:120`, `:130`, `:141`, `:151`. Registration is conditional on Kimi auth being supplied: `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:243`.
- **GLM/Z.ai:** no dedicated GLM/Z.ai account-plan reader or source is registered in this worktree. The exhaustive reader dispatch at `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:235` contains neither `z-ai` nor `glm`; targeted searches found model/provider routing instead, e.g. `libs/backend/lane-routing/src/lib/matrix/seed-matrix.ts:60`. API-key auth documentation mentions Z.ai, not a quota reader: `libs/backend/auth-providers/src/lib/auth/strategies/api-key.strategy.ts:542`. Do not assume a working GLM quota source exists here.

## C. grok and antigravity today

- **Grok account:** the existing reader directly calls `https://cli-chat-proxy.grok.com/v1/billing?format=credits`; it is not a child-process plan probe. It only accepts the default CLI-store route, skips custom auth/config endpoints, and reads default Grok login credentials. `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts:12`, `:70`, `:76`.
- `XAI_API_KEY` or stored `auth_mode=api_key` deliberately yields no subscription quota (`no-usage-source`, reason `api-key-no-subscription-quota`); a billing HTTP 401 yields `unsupported-auth`, and failures yield `service-unavailable`. `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts:38`, `:45`, `:78`, `:131`, `:145`. Thus the reported old unsupported-auth label may differ from current API-key-specific semantics; an API key does not establish a subscription allowance.
- **Grok local:** an independent reader runs `grok usage <known-session-id>` with a 5 s bound and parses tokens/cost; it requires a Ptah-created session, and cannot establish account-wide capacity. Its Windows implementation currently invokes `cmd.exe /d /s /c`; avoid copying that shell path. `libs/backend/auth-providers/src/lib/quota/readers/grok-session-usage.reader.ts:9`, `:22`, `:41`, `:83`.
- **Antigravity already implements feature 1 substantially:** chain = OAuth quota, local language-server RPC, then optional CLI. CLI is enabled only by `allowCliFallback`; account owners must match CLI-store identity before and after the read. `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts:91`, `:110`, `:116`, `:123`, `:130`.
- Its adapter resolves `agy` on PATH, then Windows `%LOCALAPPDATA%/agy/bin/agy.exe`; executes `['-p','/usage','--output-format','json']` from a temporary directory; parses JSON or strict tabular windows, converting remaining percent to used percent. `libs/backend/auth-providers/src/lib/quota/readers/antigravity-cli-usage.adapter.ts:99`, `:105`, `:120`, `:130`, `:133`, `:164`. A malformed response never becomes zero usage.
- The displayed pause is specifically the runner's cached failure. `service-unavailable` can represent an exhausted source chain; neither label proves whether the initial failure was timeout, authentication, parse shape or missing service. Those cannot be diagnosed from the supplied labels alone. Failure mapping/cache: `libs/backend/auth-providers/src/lib/quota/readers/fallback-usage.runner.ts:100`; formatter cause selection: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-limit.formatter.ts:273`, `:294`.
- **Reusable bounded helper:** `runFallbackUsage` + `nodeFallbackExecutor` provide argument arrays, `shell:false`, hidden Windows window, abort/deadline, 64 KiB cap, termination/close handling, cleanup, cache and backoff. `libs/backend/auth-providers/src/lib/quota/readers/fallback-usage.runner.ts:126`, `:163`, `:252`; `fallback-usage.constants.ts:1`. It uses native `node:child_process.spawn`, not cross-spawn.
- **Runtime spawn helper:** `spawnCli` supports injected `IProcessSpawner` for Electron worker-host spawning and otherwise cross-spawn; short probes must add their own timer/output handling. `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:308`. Avoid importing this feature helper into auth-providers without checking boundaries; extend the existing quota runner or inject its executor instead.

## D. CLI probe results

Executed help/version only, with native child-process argument arrays, `shell:false`, hidden windows, ignored stdin and a 19 s kill timer per command. No interactive process or model prompt was sent. All exited 0, below 1 s. These are observed machine results, not inferred documentation.

| Probe | Installed path / result |
| --- | --- |
| `grok --help` | `C:\Users\abdal\.grok\bin\grok.exe`; 197 ms |
| `grok --version` | `grok 1.0.77 (50ca579fa996)`; 151 ms |
| `agy --help` | `C:\Users\abdal\AppData\Local\agy\bin\agy.exe`; 648 ms |
| `grok usage --help` | exit 0; additional help-only probe to establish exact flags |

Relevant Grok help lines (verbatim):

> usage        Print your plan's usage limit, or a session's persisted token and cost usage

> -p, --single <PROMPT>
> Single-turn prompt. Prints the response to stdout and exits

> --output-format <OUTPUT_FORMAT>
> Output format for headless mode [default: plain] [possible values: plain, json, streaming-json, streaming-messages-json]

`grok usage --help` additionally says:

> Usage: grok usage [OPTIONS] [SESSION_ID] [TURN]
> Session ID. Omit for your plan's usage limit (needs Grok's background service)
> --json
> Print the plan's usage limit as JSON

Therefore prefer **`grok usage --json` with no session argument** for the account plan. Its actual payload, auth behavior and background-service startup were not exercised. A `-p` prompt is unnecessary; slash handling in that mode remains unverified.

Relevant Antigravity help lines (verbatim):

> --print                         Run a single prompt non-interactively and print the response
> -p                              Short alias for --print
> --output-format                 Output format for print mode (text, json, stream-json) (default text)
> --disable-slash-commands        Disable slash command and skill expansion in print mode
> --print-timeout                 Optional time limit for print mode; 0 waits until the turn completes (default 0s)

No standalone `usage` command appears in `agy --help`. Help confirms print-mode slash expansion generally; it does not enumerate `/usage` or prove that it bypasses inference. The current adapter sends `/usage` in one shot with `-p` and JSON output (`libs/backend/auth-providers/src/lib/quota/readers/antigravity-cli-usage.adapter.ts:133`). It is therefore not justified to call `/usage` interactive-only. Its live response was intentionally not requested under the no-token-prompt constraint.

## E. Claude plan, named accounts, API pricing

Main-session plan:

- Native Claude uses `SessionQuotaProbe.readPlanUsage` / SDK experimental usage control, validated into 5-hour, weekly, model-scoped and extra-usage windows. API key/Bedrock/Vertex report unavailable plan limits rather than a fabricated quota. `libs/backend/auth-providers/src/lib/quota/readers/claude-plan-usage.reader.ts:1`, `:45`, `:104`, `:145`; probe methods: `libs/backend/agent-sdk/src/lib/helpers/plan-limits/session-quota-probe.service.ts:104`, `:112`, `:218`, `:230`.
- When live SDK is unavailable, ambient Claude OAuth can read `https://api.anthropic.com/api/oauth/usage`, using `.credentials.json` plus `.claude.json` account metadata and verifying the requested owner. Keychain-only credentials cannot use this file-based fallback. Named routes are explicitly excluded. `libs/backend/auth-providers/src/lib/quota/readers/claude-oauth-plan-usage.reader.ts:1`, `:11`, `:83`, `:89`, `:108`, `:126`; service ordering: `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:204`.
- This does not mean a standalone system Claude lane automatically has limits: ownership/session binding must reach its lookup. `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-owner.resolver.ts:118`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-owner-read.ts:129`.

Named Claude accounts:

- MCP schema accepts `accountSelection` only on fresh explicit `cli:"claude"` lanes; resumed lanes retain stored account binding. Dispatcher forwards it. `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-args.schema.ts:37`, `:47`, `:115`; `protocol-dispatcher.ts:1270`. Process manager resolves requested/stored selections: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:816`, `:855`.
- `ProviderAccountStore` persists SQLite profile metadata, route fingerprint, canonical directory, revisions/auth epoch, run bindings and session links; credentials reside in isolated Claude directories, not profile labels. `libs/backend/auth-providers/src/lib/accounts/provider-account.store.ts:48`, `:163`, `:235`, `:343`. New account directories live beside the account DB under `provider-accounts/claude/<profileId>`: `libs/backend/auth-providers/src/lib/accounts/provider-account.service.ts:225`, `:235`, `:245`.
- Admission leases the profile, resolves physical directory identity, certifies login and returns an immutable named route/resource context. `libs/backend/auth-providers/src/lib/accounts/provider-account.service.ts:107`, `:126`, `:140`, `:158`. Route validation and epoch/session persistence are in `libs/backend/auth-providers/src/lib/accounts/claude-named-account-persistence.ts:102`, `:147`, `:168`, `:182`.
- **Already possible with a live matching session:** pass its session ID plus certified named route, require `readAccountForRoute` identity match and `readPlanUsageForRoute`; never fall back to the ambient query. `libs/backend/auth-providers/src/lib/quota/readers/claude-plan-usage.reader.ts:164`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-owner-read.ts:136`.
- **Needed for listing an idle second account:** discover profile-specific lookup rows, safely resolve/certify that profile and add a profile-aware non-inference usage path. The current OAuth reader refuses named routes (`claude-oauth-plan-usage.reader.ts:83`), and the read planner requires an open session (`plan-owner-read.ts:136`). Extend both deliberately, preserve route fingerprint/revision/auth epoch and owner checks, and invalidate on account changes. A profile ID alone cannot certify which login a credential belongs to.
- Electron named bindings are centralized at `apps/ptah-electron/src/di/claude-named-account-bindings.ts:30`; keep CLI capability/storage refusal behavior consistent rather than assuming every host can certify every profile.

Claude API pricing and usage:

- `anthropic-api` is explicitly a direct API-key **lane** provider, excluded from main-provider lists; it reuses Claude CLI static model IDs/tiers. `libs/shared/src/lib/providers/entries/anthropic-api-lane-entry.ts:5`, `:17`. It should have spend/rate-limit semantics distinct from subscription plan windows.
- Concrete gap: Ptah CLI plan owner rules include `claude-cli`, Ollama Cloud and Kimi, but not `anthropic-api`; no owner rule yields unknown/untracked. `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-lane-plan-limits.ts:89`, `:130`. Even an Anthropic credential owner is presently excluded from plan reads (`plan-owner-read.ts:136`).
- Pricing authority is `ModelPricing` and `DEFAULT_MODEL_PRICING`, runtime `registerProviderPricing`, `findModelPricing`, `calculateMessageCost`: `libs/shared/src/lib/utils/pricing.utils.ts:28`, `:88`, `:189`, `:242`, `:465`. The bundled table has GPT/local/Ollama/Codex entries but **no Claude fallback entries**; a cold/offline catalog can leave Claude API tokens unpriced. The header's LiteLLM description is stale relative to the OpenRouter hydration described below it (`pricing.utils.ts:5`, `:65`).
- OpenRouter catalog service hydrates shared prices, aliases IDs and uses a 5 min cache: `libs/backend/auth-providers/src/lib/providers/openrouter/openrouter-pricing.service.ts:11`, `:95`, `:125`. These are catalog estimates, not evidence of direct Anthropic billing rates or organization balance; exact current Anthropic rate coverage was not externally audited here.
- Analytics pricing prefers provider-reported cost; otherwise requires model rates including cache rates and leaves unknown prices null. `libs/backend/usage-analytics/src/lib/usage-pricing.service.ts:11`, `:27`, `:30`. The shared token breakdown has one cache-write bucket, with no cache TTL, batch or service-tier dimension (`libs/shared/src/lib/utils/pricing.utils.ts:51`); expanded direct-API pricing may need richer dimensions and dated provenance.
- **Spend-so-far foundation exists:** Ptah CLI stream maps input/output/cache counters and SDK cumulative `total_cost_usd` into per-turn deltas; it emits reported cost with usage. `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.ts:639`, `:655`, `:822`, `:873`. `LaneUsageNormalizer` converts cumulative counters to deltas (`libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-usage-normalizer.ts:22`).
- Durable lane capture writes through `SessionUsageSink` at process-manager settlement, including lanes whose chat parent disappeared: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:4061`. SQLite validates CLI-lane producers/model cost authority: `libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts:20`, `:40`, `:245`. Expose a run/lane subtotal from these facts; its coverage is Ptah-observed activity, not organization-wide API spend or remaining credits.
- Historical Claude analytics also scans ambient and observed named transcript roots without merging physical routes: `libs/backend/usage-analytics/src/lib/sources/claude-ledger.source.ts:35`, `:60`, `:90`. Existing profile-root collector registration occurs in Electron `apps/ptah-electron/src/di/phase-2-libraries.ts:273` and CLI `libs/backend/cli-engine/src/lib/container.ts:757`.

## F. Renderer surfaces

- `PlanLimitsStore` — `libs/frontend/core/src/lib/services/plan-limits.store.ts`
- `ProviderAccountCardComponent` — `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-account-card.component.ts`
- `ProviderAccountTileComponent` — `libs/frontend/dashboard/src/lib/components/provider-account-tile/provider-account-tile.component.ts`
- `PlanLimitTileComponent` — `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tile.component.ts`
- `PlanWindowDetailComponent` — `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-window-detail.component.ts`
- `ProviderLaneLimitTileComponent` — `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/provider-lane-limit-tile.component.ts`
- `LaneUsageTileComponent` — `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/lane-usage-tile.component.ts`
- `LaneSubtotalTileComponent` — `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/lane-subtotal-tile.component.ts`
- `LimitsAlertComponent` — `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/limits-alert.component.ts`
- `CliLaneUsageSummaryComponent` — `libs/frontend/chat/src/lib/components/molecules/agent-card/cli-lane-usage-summary.component.ts`
- `AnalyticsUsageStore` — `libs/frontend/dashboard/src/lib/services/analytics-usage.store.ts`
- `UsageDashboardComponent` — `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.ts`
- `UsageCostSummaryComponent` — `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-cost-summary.component.ts`
- `UsageCostQualityComponent` — `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-cost-quality.component.ts`
- `UsageKpiStripComponent` — `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-kpi-strip.component.ts`
- `UsageBreakdownTableComponent` — `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-breakdown-table.component.ts`
- `UsageTopSessionsComponent` — `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-top-sessions.component.ts`
- `UsageCostDonutComponent` — `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-cost-donut.component.ts`

## Proposed approach

1. Grok: add `grok-cli-plan-usage.adapter.ts` beside existing quota readers; run `grok usage --json` through `runFallbackUsage`, validate a captured payload, and attach it as a bounded account-source fallback in `grok-account-plan-usage.reader.ts`/`plan-usage.service.ts`.
2. Antigravity: retain the existing adapter/chain; diagnose first failure and current JSON shape, reconcile outer 12 s deadline with 15 s CLI allowance, expose original failure/retry time, and preserve before/after account identity checks.
3. Shared probes: extend `fallback-usage.runner.ts` only where needed for Windows executable resolution/Electron process-host execution; keep no-shell arguments, bounded bytes/time, single flight, child cleanup and per-owner cache.
4. Wire injectable executor/dependencies through `auth-providers/src/lib/di/register.ts`; review Electron `apps/ptah-electron/src/di/phase-2-libraries.ts` and CLI `libs/backend/cli-engine/src/lib/container.ts` together. Pure reader functions need no redundant root registrations.
5. API pricing: add a dated Anthropic rate card under `libs/shared/src/lib/utils/`, merge exact model IDs in `pricing.utils.ts`, retain provider-reported cost precedence and mark estimates/provenance; extend cache/service-tier dimensions only for actual supported billing cases.
6. API spend: add explicit `anthropic-api` ownership/accounting in `ptah-cli-lane-plan-limits.ts` and lane-owner resolver; add run subtotal response fields via separate shared RPC contract and thin RPC handler over durable usage facts. Do not label a spend total as subscription room.
7. Named Claude: extend `plan-limit-owner-discovery.service.ts`, `plan-owner-read.ts`, Claude reader/OAuth route handling and account-service adapter for certified idle-profile reads; reuse live route-bound SDK reads whenever present.
8. Register any new profile/spend application service through shared registration, Electron `apps/ptah-electron/src/di/claude-named-account-bindings.ts`/`phase-2-libraries.ts`, and CLI `libs/backend/cli-engine/src/lib/container.ts`; preserve explicit unsupported host capability results.
9. Surface spend and named-profile states through existing stores/tiles; a later UI implementation requires Angular skills and template checks. Later targeted tests should cover malformed output, API-key/no-plan, timeout/backoff, account change, stale evidence, duplicate turn usage and unpriced models. No tests were run for this analysis.

## Risks and open questions

- Actual Grok plan JSON and Antigravity `/usage` output remain uncaptured. Help proves available invocation flags, not output shape, token-free handling, account ownership or successful authentication.
- Grok account usage requires its background service; whether the installed command starts it safely is untested. API-key users may still have no subscription plan to report after adding the probe.
- The exact earlier Antigravity failure and remaining backoff were not determined. Avoid clearing backoff blindly or recording stale output with a new observation timestamp.
- No GLM quota source was found in current reader registration. Clarify whether “Glm source” means another branch, a provider integration outside quota, or GLM running through Ollama Cloud.
- No named profile IDs, secrets or credential payloads were inspected. Account storage/certification on CLI hosts and idle-profile OAuth token refresh need implementation-specific decisions.
- Decide whether API eligibility should be based on a configured local spend budget, actual provider rate-limit headers, or permissive unknown-with-spend. Ptah-observed spend cannot prove account-wide credit availability.
- Direct Anthropic current model prices, long-context/cache TTL/service-tier coverage and administrative usage/billing API permissions need authoritative verification during implementation. This report establishes repository gaps rather than asserting new prices.

## Decisions

- Write only this deliverable; no source modification, git mutation, build, test, verification, interactive session or token-using prompt.
- Reuse the existing quota chain/runner; do not implement a second Antigravity probe. Prefer Grok's dedicated usage subcommand over slash prompts.
- Preserve unknown versus proven room and separate subscription capacity, API rate limits and observed spend. Keep named-account identity and auth epochs isolated.
- Ptah workspace analysis and AST inspection were available and used. Native PowerShell/rg provided literal searches, targeted reads and bounded process probes. CLI-native skill discovery was unavailable; no skill was required or applied for this read-only analysis. Renderer work was identification only, so no render/screenshot or design skill was needed.

