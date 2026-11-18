# Pull request 2 — Claude API pricing and spend

### Design

Electron is the priority host; preserve `platform-cli`, `cli-engine`, and provider CLI lanes. API-key lanes report Ptah-observed pay-per-token spend, never subscription room or organization balance. Implement PR2 before PR3. Batches within each PR have disjoint write sets; cross-PR edits are sequential.

Notation: `S=libs/shared`, `B=libs/backend`, `F=libs/frontend`, `E=apps/ptah-electron`; paths are worktree-relative. New paths are proposed. Evidence: `analysis.md:1-19,80-106,108-127`, `context.md`, `decisions.md`. Read analysis using Windows-1252 without rewriting it. Source ranges below also use its file:line map.

**Dated rates.** Official [Anthropic pricing documentation](https://platform.claude.com/docs/en/about-claude/pricing), retrieved **2026-11-18** through web search and page fetch. USD per million tokens; cache writes below use the 5-minute tier. `anthropic-api-lane-entry.ts:5-18` inherits precisely these eight static IDs from `claude-cli-provider-entry.ts:38-125`:

| Exact model ID | Input | Output | Cache write | Cache read |
| --- | ---: | ---: | ---: | ---: |
| `claude-opus-5-5` | 4 | 20 | 5 | 0.20 |
| `claude-sonnet-5-5` | 2 | 10 | 2.50 | 0.10 |
| `claude-haiku-5-5`, context <=100,000 | 0.10 | 0.50 | 0.125 | 0.01 |
| `claude-haiku-5-5`, context >100,000 | 0.50 | 2.50 | 0.625 | 0.05 |
| `claude-fable-5-2` | 8 | 40 | 10 | 0.20 |
| `claude-fable-5-1` | 10 | 50 | 12.50 | 0.25 |
| `claude-opus-4-8` | 5 | 25 | 6.25 | 0.50 |
| `claude-sonnet-4-6` | 3 | 15 | 3.75 | 0.30 |
| `claude-haiku-4-5` | 1 | 5 | 1.25 | 0.10 |

Default tiers are Opus/Sonnet/Haiku 5.5. Add `anthropic-rate-card.ts` with provenance; spread representable rates into `DEFAULT_MODEL_PRICING`, converting MTok to per-token units once. Correct Sonnet 5.5's registry cache-read fallback (currently 0.20). Provider-qualified direct rates must not be overwritten by hydrated OpenRouter bare slugs. Provider-reported cost always wins.

`TokenBreakdown` (`pricing.utils.ts:49-54`) lacks request context, cache TTL and batch dimensions. Do not apply batch discounts or infer tiers from cumulative turn tokens. Haiku maps to both tariffs, without an unconditional low fallback. Add only optional proven per-request pricing context; absent context/TTL leaves affected estimates null. Never silently assume cache-write TTL is 5 minutes. No general batch/long-context tariff engine in this PR.

**Proposed contracts**; external forms get Zod schemas:
```typescript
type SpendPeriod = 'today' | '7d' | '30d';
interface LaneSpendQuery { ownerKey: string; workspaceKey: string; nowMs: number; }
interface SpendAmount { knownMicroUsd: number; unpricedEvents: number; }
interface ApiLaneSpend {
  kind: 'api-spend'; ownerKey: string; observedAtMs: number;
  periods: Record<SpendPeriod, SpendAmount>; coverage: 'ptah-observed';
  availability: 'available' | 'stale' | 'unavailable';
  budget?: { period: SpendPeriod; limitMicroUsd: number };
}
interface LaneSpendReader {
  read(query: LaneSpendQuery, signal?: AbortSignal): Promise<ApiLaneSpend>;
}
```
Put wire types in `S/src/lib/types/rpc-lane-spend.types.ts`; existing `types/rpc/rpc-lane-plan-limits.types.ts` imports them. Export through shared barrel. Never edit `rpc.types.ts`. Add explicit API-spend snapshot/classifier variants; do not manufacture successful plan windows.

Add `anthropic-api` owner rule in `ptah-cli-lane-plan-limits.ts`, reuse in `LaneOwnerResolver`, and give `planOwnerRead` a spend branch without session/OAuth requirements. Owner uses stable opaque secret-storage reference plus endpoint/provider, never key contents. Credential epoch changes invalidate state; secret-derived fingerprints never cross RPC.

`SessionUsageSink` has provider/run/workspace but no credential owner (`platform-core/.../session-usage-sink.interface.ts:29-64`). Add optional immutable `billingOwnerKey`, validate at `sqlite-session-usage-sink.ts`, and persist new run-to-owner bindings. Extract settlement attribution rather than growing the oversized process manager. Historical facts without reliable binding stay unattributed; never assign to current key. Query accepted durable lane facts, applying event/run revision and absolute-snapshot reconciliation first. Avoid duplicate deltas, repeated model totals and transcript replay.

Authority: provider-reported > exact dated estimate > unpriced, with persisted provenance. Use integer micro-USD/overflow checks. Today means UTC midnight to captured now; 7d/30d are rolling 168h/720h, half-open intervals ending at now. Successful empty query may show $0 with known capture coverage; absent/failing DB is unavailable. Show known subtotal, unpriced count, UTC and observation time. Refresh after durable settlement; active work may lag.

Optional workspace `laneSpendBudget`: `{ ownerKey, period, limitMicroUsd }`, disabled by default, positive finite values, existing settings editor only. Local selection guard, not remote billing cap. >=90% near limit, >=100% at limit; incomplete/unpriced data cannot prove below budget and yields budget-unknown. Without budget, fresh spend is `pay-per-token`, with partial subtotals marked. No default money allowance.

`ptah_agent_list`: `pay-per-token, spend $X today / $Y 7d / $Z 30d (Ptah-observed)`. Exhaustion/cooldown and budget guards dominate eligibility. Orchestrator may choose it under existing vendor/cost preferences, never as confirmed subscription room. Source failures remain unknown.

**API evidence:** Zod-parse bounded structured SDK/HTTP status/type/code/Retry-After. A 429 yields deduplicated owner/model-scoped throughput evidence with time and bounded cooldown, not a plan window. Explicit validated insufficient-credit/balance-exhausted replies yield a credit block; generic 400/401/403/5xx and model text do not prove exhaustion. Credit blocks require explicit successful provider recovery or credential epoch change; 429 timers do not clear them. Keep spend separate; never log credentials/raw bodies.

**RPC/renderer:** reuse lane-plan-limits read/snapshot transport with new imported domain DTOs; thin handlers delegate to read port, existing settings transport persists budgets. Push revisioned redacted snapshots on settlement/budget/epoch changes. `PlanLimitsStore` rejects out-of-order results. `ProviderLaneLimitTileComponent`, `LaneUsageTileComponent`, `LaneSubtotalTileComponent` show spend/coverage/authority; `LimitsAlertComponent` shows real budget/credit/cooldown alerts. `CliLaneUsageSummaryComponent` shares labels. `AnalyticsUsageStore`/`UsageCostSummaryComponent` stay historical analytics; estimates must not be labeled charges.

### Batches

Verification notation: `$P` is the listed project directory, `$T` the listed focused specs, `$W` all listed write paths, expanded to explicit paths. Commands are separate PowerShell invocations; for two projects repeat tsc per project and Jest only where a spec is listed. No commands run during planning. Each batch has <=6 write files (including tests/exports) and <=2 projects. Re-split before adding files.

**2A Pricing; shared; independent.** W: `S/src/lib/utils/{anthropic-rate-card.ts,anthropic-rate-card.spec.ts,pricing.utils.ts,pricing.utils.spec.ts}`, `S/src/lib/providers/entries/claude-cli-provider-entry.ts` (5). R: pricing 28-76,148-260,465-540; entries 5-18/38-125; official table. Accept exact IDs, ambiguous rates null, provider authority and catalog isolation.
Verify `$P='libs/shared'`, `$T`=listed specs, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**2B Contracts; shared + platform-core; after 2A.** W: `S/src/lib/types/rpc-lane-spend.types.ts`, `S/src/lib/types/rpc/rpc-lane-plan-limits.types.ts`, `S/src/index.ts`, `B/platform-core/src/interfaces/{session-usage-sink.interface.ts,lane-spend-reader.interface.ts}`, `B/platform-core/src/index.ts` (6). R: sink 18-76; lane RPC 1-160; planner 28-100. Accept compatible owner attribution and spend union, no concrete service in ports.
Verify `$P='libs/shared'`, then `libs/backend/platform-core`, `$W`=W: `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`. Contract tests in 2F; no port-only mirror tests.

**2C Durable spend; persistence-sqlite; after 2B.** W: `B/persistence-sqlite/src/lib/session-store/{sqlite-session-usage-sink.ts,session-store-migrations.ts,lane-spend.repository.ts,lane-spend.repository.spec.ts,lane-billing-owner.repository.ts}`, `B/persistence-sqlite/src/index.ts` (6). R: sink 17-75,245-325; session-stats-repository 280-355; migrations 1-120. Accept additive run-owner table/index, transactional binding at fact commit, owner conflict refusal, Zod rows, deduped sums and unpriced count.
Verify `$P='libs/backend/persistence-sqlite'`, `$T`=lane-spend.repository.spec.ts, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**2D Owner/settlement; cli-agent-runtime; after 2B/2C.** W: `B/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-lane-plan-limits.ts`, `B/cli-agent-runtime/src/lib/cli-agents/limits/{lane-owner.resolver.ts,plan-owner-read.ts,api-lane-spend.adapter.ts,api-lane-spend.adapter.spec.ts}`, `B/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts` (6). R: rules 89-160; resolver 101-160; planner 110-170; process manager 4061-4140; stream 639-675,822-890. Accept stable owner before capture, API reads without session; extract settlement attribution into adapter, reducing facade lines.
Verify `$P='libs/backend/cli-agent-runtime'`, `$T`=api-lane-spend.adapter.spec.ts, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**2E Evidence; cli-agent-runtime + auth-providers; after 2D.** W: `B/cli-agent-runtime/src/lib/ptah-cli/helpers/{ptah-cli-stream-loop.service.ts,anthropic-api-evidence.ts,anthropic-api-evidence.spec.ts}`, `B/auth-providers/src/lib/quota/{plan-limit-ledger.rules.ts,plan-limit-ledger.rules.spec.ts}` (5). R: stream 680-740; owner helper 253-296; ledger service/rules 1-180. Accept 429/credit distinction, scoped recovery and redaction; extracted error handling reduces stream facade.
Verify `$P='libs/backend/cli-agent-runtime'`, then `libs/backend/auth-providers`, `$T`=listed project specs, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**2F Classifier/list; shared + vscode-lm-tools; after 2B/2E.** W: `S/src/lib/utils/plan-limits/{lane-state.ts,lane-state.spec.ts}`, `S/src/lib/types/{plan-limit.types.ts,rpc-lane-spend.spec.ts}`, `B/vscode-lm-tools/src/lib/code-execution/mcp-core/{agent-limit.formatter.ts,agent-limit.formatter.spec.ts}` (6). R: classifier 303-380; precedence 1-40; formatter 250-380. Accept pay-per-token, no spend-as-plan room, and blocking evidence precedence.
Verify `$P='libs/shared'`, then `libs/backend/vscode-lm-tools`, `$T`=listed project specs, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**2G Budget; settings-core; after 2B.** W: `B/settings-core/src/schema/{lane-spend-schema.ts,lane-spend-schema.spec.ts,index.ts}` (3). R: schema definition 1-160/index 1-100; analysis 99-105. Accept opt-in guard, micro-USD validation and existing persistence; no default allowance/page.
Verify `$P='libs/backend/settings-core'`, `$T`=lane-spend-schema.spec.ts, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**2H Snapshot; cli-agent-runtime + rpc-handlers; after 2D/2F/2G.** W: `B/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-lookup.service.ts`, `B/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts`, `B/rpc-handlers/src/lib/handlers/{lane-plan-limits-rpc.handlers.ts,lane-plan-limits-rpc.schema.ts,lane-plan-limits-rpc.handlers.spec.ts,plan-limits-broadcaster.ts}` (6). R: lookup 173-260; handlers 67-170; snapshot 1-180; PlanUsageService 161-276. Accept bounded cancellable spend read, no subscription reader for API key and revisioned settlement/budget pushes.
Verify `$P='libs/backend/cli-agent-runtime'`, then `libs/backend/rpc-handlers`, `$T`=listed RPC spec, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T` (RPC only); `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**2I Registrar; auth-providers; after 2C/2G/2H.** W: `B/auth-providers/src/lib/di/{register.ts,register-lane-spend.ts,register-lane-spend.spec.ts}`, `B/auth-providers/src/index.ts` (4). R: register 339-410; phase-2 250-285; container 730-770. Accept shared registrar injected with read port/settings/Logger; storage absence returns unavailable.
Verify `$P='libs/backend/auth-providers'`, `$T`=register-lane-spend.spec.ts, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**2J Roots; Electron + cli-engine; after 2I.** W: `E/src/di/{phase-2-libraries.ts,expected-resolvable.ts,lane-spend-bindings.spec.ts}`, `B/cli-engine/src/lib/{container.ts,lane-spend-bindings.spec.ts}` (5). R: phase-2 250-285; container 730-770; expected-resolvable 48-90,227-260. Accept identical read semantics and optional SQLite behavior.
Verify `$P='apps/ptah-electron'`, then `libs/backend/cli-engine`, `$T`=listed host spec, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`; `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json`; `npx eslint $W`.

**2K Renderer state/tiles; core + chat-ui; after 2H; skill `angular-frontend-patterns`.** W: `F/core/src/lib/services/{plan-limits.store.ts,plan-limits.store.spec.ts,claude-rpc.service.ts}`, `F/chat-ui/src/lib/molecules/session/plan-limits/{provider-lane-limit-tile.component.ts,lane-usage-tile.component.ts,lane-subtotal-tile.component.ts}` (6). R: analysis 108-127; store 54-130,220-270; lane RPC 1-160. Accept signal-owned spend, UTC and partial/stale/unavailable labels.
Verify `$P='libs/frontend/core'`, then `libs/frontend/chat-ui`, `$T`=store spec (core only), `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`. Apply renderer gate below.

**2L Renderer alerts/summary; chat-ui + chat; after 2K; skill `angular-frontend-patterns`.** W: `F/chat-ui/src/lib/molecules/session/plan-limits/{limits-alert.component.ts,limits-alert.component.spec.ts}`, `F/chat/src/lib/components/molecules/agent-card/{cli-lane-usage-summary.component.ts,cli-lane-usage-summary.component.spec.ts}` (4). R: analysis 115-124; formatter 250-380; store 54-130. Accept consistent pay-per-token wording, real budget/cooldown alerts, no plan-room gauge.
Verify `$P='libs/frontend/chat-ui'`, then `libs/frontend/chat`, `$T`=listed project spec, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`. Apply renderer gate below.

### Composition roots

2I owns shared registration; 2J installs `LaneSpendReader` backed by persistence in Electron phase 2 before lane lookup/phase-4 RPC. Assert it in `expected-resolvable.ts`; keep concrete services out of platform-core. CLI container supplies same repository where SQLite exists, otherwise unavailable. Preserve platform-cli capability behavior; never bind fake zero. Dependencies use existing port conventions/downward boundaries; no new library/tags.

### Tests

Focused matrix in listed batch specs: all exact IDs, offline pricing, catalog collision, cache/context ambiguity, Haiku boundary, reported cost including zero, duplicate events, cumulative reset/revisions, multimodel totals, parent removed, restart, UTC boundaries, unattributed history, two keys/workspaces, rotation, unavailable DB, unpriced costs, budgets 89/90/100%, credit recovery, 429 expiry, malformed payloads, cancellation and stale push ordering.

Renderer gate for 2K/2L and PR3 renderer batches: standalone OnPush, `inject()`, signal inputs/stores with private writable signals/readonly views, computed state, built-in control flow and stable account tracking; no Subjects, `[innerHTML]`, ngClass or trust bypass. Use existing running Electron renderer with Ptah browser navigation/screenshot; do not start a server. Compare existing tile layout, keyboard access, truncation, theme/narrow widths against known/partial spend, alert and unavailable states. If no running renderer exists, record visual verification pending. Raw tsc cannot prove Angular templates: coordinator must run required `npm run verify -- -t typecheck-templates -p ptah-extension-webview` after handoff; lanes cannot run it under this task's no-verify rule.

### Risks

Settled capture misses active/unobserved activity; show coverage/time. Budgets are advisory; concurrent spawns can overshoot. Historical owner cannot be inferred from current key. Ambiguous tariff dimensions stay unpriced; re-fetch rates before implementation/merge. Existing oversized facades must shrink through extraction; new/extracted files stay below 700 lines.

# Pull request 3 — Limits for a second named Claude account

### Design

Use `ProviderAccountStore`, `ProviderAccountService`, route certification and `ClaudeNamedAccountPersistence`. Discover each nonremoved named profile, including idle/unverifiable ones. Row identity includes profile ID/route fingerprint/revision/auth epoch; label/email alone is insufficient. Bind billing owner after certification. Same-login profiles remain distinct selectable routes, but shared subscription windows are not summed. Ambient remains separate.

Proposed internal auth-providers contracts; safe public DTOs belong in new `S/src/lib/types/rpc-claude-account-limits.types.ts`:
```typescript
interface NamedUsageRequest { profileId: string; expectedRevision: number; signal?: AbortSignal; }
interface NamedRouteProof {
  profileId: string; ownerKey: string; routeFingerprint: string;
  revision: number; authEpoch: number;
}
interface NamedUsageLease {
  proof: NamedRouteProof;
  readUsage(signal?: AbortSignal): Promise<PlanUsageReading>;
  verifyUnchanged(signal?: AbortSignal): Promise<boolean>;
  release(): Promise<void>;
}
interface IdleClaudeUsageReader {
  read(request: NamedUsageRequest): Promise<PlanUsageReading>;
}
```
`PlanUsageReading` is the existing internal type. Lease privately resolves canonical directory/filesystem identity and profile-scoped secret-storage handle. Paths/tokens never cross RPC. Public row has safe profile ID/label, five-hour/weekly windows, observed time, source/freshness and reason. No additions to `rpc.types.ts`.

**Certified idle flow:** discovery enumerates metadata through account service; extract helper from oversized discovery facade. Prefer live `readAccountForRoute`/`readPlanUsageForRoute` only for a matching bound session. Otherwise allow only a certified idle-profile request through `planOwnerRead`; do not remove generic no-session guards or start dummy model sessions.

1. Acquire read/status lease under existing operation rules. Resolve stored physical profile directory; compare fingerprint/revision/auth epoch/filesystem identity. Reject removed/conflicted profiles and concurrent sign-in/out.
2. Certify actual logged-in identity/organization for that route using existing non-inference certifier. Get credential through a profile-scoped secret-storage port; Zod-validate external metadata/credential payloads. Never use ambient HOME/CLAUDE_CONFIG_DIR or default keychain entries.
3. GET `https://api.anthropic.com/api/oauth/usage` with that profile's OAuth credential. Preserve bounded timeout, cancellation, redirect refusal, Retry-After/backoff and current Zod mapping; retain five-hour, weekly and scoped windows. No `/usage` model prompt or inference charge.
4. Re-certify login after HTTP; re-read fingerprint/revision/epoch/filesystem identity before cache/ledger commit. Mismatch discards entire result, invalidates profile state and returns account-unverified. Response identity, when present, must also match; absence does not waive host checks. Release lease in finally; log only safe reason codes.

**Keychain-only:** use existing host secret-storage adapter only if it retrieves and certifies credentials for this exact profile/identity. Otherwise `profile-credentials-unavailable` with safe instruction to use supported account sign-in/open matching session; live matching-session reads still work. No keychain scraping/export, ambient fallback or new keychain integration in this PR.

Cache/single-flight key includes profile ID, route fingerprint, revision, auth epoch and certified owner. Preserve per-waiter cancellation/freshness/backoff. Account change, sign-out/removal, rotation, route replacement and reclaimed operations invalidate results/inflight reads through existing account change publication. Pre/post checks remain authoritative when events race.

`ptah_agent_list` shows one row per account even without sessions: label/profile ID, five-hour and weekly windows, classifier/freshness, actionable `accountSelection: { kind: 'named', profileId }`. Orchestrator chooses fresh model-applicable room, never stale/unknown/unverified. `ptah_agent_spawn` retains fresh explicit `cli:'claude'` restriction, re-certifies at admission and refuses changed accounts. Resumes retain recorded binding; no named selection for anthropic-api. Selection does not reserve remote quota; exhaustion evidence dominates.

Renderer: `PlanLimitsStore` keys by safe account row. `ProviderAccountCardComponent`/`ProviderAccountTileComponent` render one limits tile per account. `PlanLimitTileComponent`/`PlanWindowDetailComponent` show five-hour/weekly/scoped windows, reset time and stale/unavailable reasons. `ProviderLaneLimitTileComponent` consumes same rows. Never infer account from newest unrelated session.

### Batches

Use PR2 command/path notation; write sets within PR3 are disjoint.

**3A Contracts; shared; after PR2.** W: `S/src/lib/types/{rpc-claude-account-limits.types.ts,rpc-claude-account-limits.spec.ts}`, `S/src/lib/types/rpc/rpc-lane-plan-limits.types.ts`, `S/src/index.ts` (4). R: provider-account.types 1-180; lane RPC 1-160; analysis 88-95. Accept safe additive schemas without directories/secrets.
Verify `$P='libs/shared'`, `$T`=listed spec, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**3B Lease/reader; auth-providers; after 3A.** W: `B/auth-providers/src/lib/accounts/{claude-idle-usage-lease.ts,claude-idle-usage-lease.spec.ts}`, `B/auth-providers/src/lib/quota/readers/{claude-idle-profile-usage.reader.ts,claude-idle-profile-usage.reader.spec.ts,claude-oauth-plan-usage.reader.ts}`, `B/auth-providers/src/index.ts` (6). R: account service 107-169,225-245; persistence 102-195; OAuth 65-180; store 123-170,235-365. Accept profile credential proof before/after read and keychain refusal; extract shared transport/mapping into new reader, retaining ambient guard.
Verify `$P='libs/backend/auth-providers'`, `$T`=listed lease/reader specs, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**3C Dispatch/invalidation; auth-providers; after 3B.** W: `B/auth-providers/src/lib/quota/{plan-usage.service.ts,plan-usage.service.spec.ts}`, `B/auth-providers/src/lib/quota/readers/plan-usage-reader.types.ts`, `B/auth-providers/src/lib/accounts/claude-named-account-persistence.ts`, `B/auth-providers/src/lib/di/{register.ts,register-idle-claude-usage.ts}` (6). R: service 21-110,161-290; reader types 49-140; persistence 102-195; register 339-410. Accept proof-bearing target, epoch cache/invalidation, no stale reuse after identity failure and shared capability-limited factory.
Verify `$P='libs/backend/auth-providers'`, `$T`=plan-usage.service.spec.ts, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**3D Discovery/planning; cli-agent-runtime; after 3C.** W: `B/cli-agent-runtime/src/lib/cli-agents/limits/{plan-limit-owner-discovery.service.ts,named-profile-owner-discovery.ts,named-profile-owner-discovery.spec.ts,plan-owner-read.ts,plan-owner-read.spec.ts,lane-owner.resolver.ts}` (6). R: discovery 198-250,483-545,693-760; planner 28-100,129-203; resolver 101-160. Accept one row per profile, bounded parallel idle reads, no generic guard bypass; extraction reduces oversized discovery facade.
Verify `$P='libs/backend/cli-agent-runtime'`, `$T`=listed discovery/planner specs, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**3E List/spawn/RPC; vscode-lm-tools + rpc-handlers; after 3D.** W: `B/vscode-lm-tools/src/lib/code-execution/mcp-core/{agent-limit.formatter.ts,agent-limit.formatter.spec.ts,agent-spawn-args.schema.spec.ts}`, `B/rpc-handlers/src/lib/services/{plan-limits-snapshot.service.ts,plan-limits-snapshot.service.spec.ts}`, `B/rpc-handlers/src/lib/handlers/plan-limits-broadcaster.ts` (6). R: spawn schema 37-55,115-145; dispatcher 317-350,1270-1305; process manager 816-880; snapshot 1-180. Accept actionable row selection and per-account invalidation; existing schema/dispatcher behavior needs no change, regression-test fresh-only named spawn/resume guards.
Verify `$P='libs/backend/vscode-lm-tools'`, then `libs/backend/rpc-handlers`, `$T`=listed project specs, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`.

**3F Roots; Electron + cli-engine; after 3C/3E.** W: `E/src/di/{claude-named-account-bindings.ts,expected-resolvable.ts,claude-idle-usage-bindings.spec.ts}`, `B/cli-engine/src/lib/{container.ts,claude-idle-usage-bindings.spec.ts}` (5). R: bindings 12-65; phase-2 250-285; container 730-785; expected-resolvable 48-90,227-260. Accept profile factory only with storage/certifier/profile-scoped secret port; explicit unsupported adapter elsewhere.
Verify `$P='apps/ptah-electron'`, then `libs/backend/cli-engine`, `$T`=listed host spec, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`; `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json`; `npx eslint $W`.

**3G Renderer state/cards; core + dashboard; after 3E; skill `angular-frontend-patterns`.** W: `F/core/src/lib/services/{plan-limits.store.ts,plan-limits.store.spec.ts}`, `F/dashboard/src/lib/components/provider-account-card/provider-account-card.component.ts`, `F/dashboard/src/lib/components/provider-account-tile/{provider-account-tile.component.ts,provider-account-tile.component.spec.ts}` (5). R: analysis 108-127; store 54-130,220-270; account service 315-335. Accept stable profile-keyed rows, immediate invalidation and two distinct idle account tiles.
Verify `$P='libs/frontend/core'`, then `libs/frontend/dashboard`, `$T`=listed project spec, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`. Renderer gate: compare two labels/windows and unavailable/narrow states against existing tiles.

**3H Renderer windows; chat-ui; after 3G; skill `angular-frontend-patterns`.** W: `F/chat-ui/src/lib/molecules/session/plan-limits/{plan-limit-tile.component.ts,plan-window-detail.component.ts,provider-lane-limit-tile.component.ts,plan-limit-tile.component.spec.ts}` (4). R: analysis 110-118; classifier 303-380; store 54-130. Accept separate five-hour/weekly resets, keychain-only unknown and no duplicate ambient row.
Verify `$P='libs/frontend/chat-ui'`, `$T`=listed spec, `$W`=W: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`. Apply renderer screenshot gate and coordinator-only template validation from PR2.

### Composition roots

3C registers `IdleClaudeUsageReader` and lease-factory dependency through existing auth registrar. Electron `claude-named-account-bindings.ts` supplies account persistence/certification; phase-2 already invokes registrar, no new phase-4 handler needed. Assert supported service in `expected-resolvable.ts`, gated when SQLite is absent. CLI container uses same factory only when its capabilities prove profile, otherwise typed unavailable. Preserve CLI named-account storage refusals/platform-cli compatibility; no ambient substitute.

### Tests

Mock credentials/HTTP only: two idle profiles, same-login profiles, zero sessions, matching/mismatching live route, identity mismatch before/after request, revision/epoch/fingerprint races, directory/symlink replacement, sign-in/out conflicts, removal, expired/missing/keychain-only credentials, 401/403/429, partial/malformed windows, Retry-After, cancel/timeout, late responses after invalidation, independent backoff, duplicate/renamed labels, exact named spawn payload, changed-account admission refusal and resumed binding. Preserve PR2 spend behavior. Verify Electron first, CLI capability refusal second; no live credential reads or inference probes.

### Risks

Certification must bind actual HTTP credential, not adjacent metadata; refuse if host cannot prove it. Read leases must not deadlock account operations or change active run ownership. Endpoint may omit identity, requiring host pre/post proof. Enumeration adds latency; preserve bounded concurrency/per-row unknown. Local account labels use existing permissions; never publish directories/secrets.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| API spend is distinct | Fake quota; forever unknown; explicit spend | analysis 99-105; decisions item 5 | Yes, additive union |
| Reported cost then dated direct rate | Memory; catalog-only; official card | Official pricing retrieved 2026-11-18 | Yes, versioned card |
| Ambiguous tariff stays unpriced | Guess; broad engine; narrow proven context | TokenBreakdown 49-54; Haiku dual tariff | Yes |
| Explicit run owner | Current-key inference; provider totals; immutable binding | Sink 29-64 lacks owner | Additive migration |
| Budget opt-in local guard | Remote cap; default allowance; optional guard | User requirement; no remote cap API in scope | Yes |
| UTC day, rolling 7d/30d | Local calendar; UTC; billing period | Durable timestamps/host-neutral scope | Yes, labeled change |
| Certified idle read | Ambient fallback; live-only; scoped read | analysis 85,91-95; OAuth named refusal | Yes, capability |
| Keychain-only typed refusal | Scrape/export; ambient; unsupported | File-only fallback; differing host capability | Yes, later adapter |
| Existing transport/new domain files | Grow rpc.types; new transport; imported DTOs | Existing lane snapshots/task requirement | Yes |

## Lane-introduced constraints

- Planning only: only this deliverable is written. No source edits, credential reads/output, git mutations, test/build/serve/e2e, `nx`, or `npm run verify` during this lane.
- Implementation: strict types; no `any`/`as unknown as`; `catch (error: unknown)`; Zod for every external payload (file/DB/HTTP/IPC); injected Logger; secrets only through secret-storage port, never logged. New/extracted files below 700 lines; oversized facades lose responsibility rather than grow.
- Focused direct commands only, one heavy check at a time, changed projects only; expand `$T`/`$W` to exact paths, never workspace globs. Coordinator owns final Angular template check because lanes are explicitly prohibited from running required verify wrapper.
- Native CLI skill invocation/discovery is not exposed here. Read `.claude/skills/angular-frontend-patterns/SKILL.md` as filesystem fallback and applied guidance to every renderer batch. No UI artifact produced. Ptah workspace/search/web tools were available; targeted PowerShell/rg reads and web fetch supplemented them.
- Still to prove during implementation: exact profile-scoped keychain capability and availability of per-request tariff dimensions. Safe unavailable/unpriced behavior is specified; neither requires broader credential access or an unresolved user money/security/privacy choice. No clarification is reserved beyond normal plan approval.

## Coordinator addendum (2026-11-18, user request) - account email, pull request 3

Requirement added after this plan was written. It applies to pull request 3.

1. `provider:revealAccountEmail` (merged in PR #1368, `provider-account-actions.service.ts:291`,
   `rpc-provider-accounts.types.ts`) accepts only a `profileId`. Extend the params to a
   discriminated target: `{ kind: 'named', profileId }` or `{ kind: 'ambient' }`. Keep the old
   `{ profileId }` shape valid in the Zod schema.
2. The ambient (main) account reads its email on demand from the same account metadata that
   `claude-oauth-plan-usage.reader.ts:43,111` already parses. The email is not stored and not
   logged. Keychain-only login without metadata gives a typed `email-unavailable` result.
3. `ambient-account-row.component.ts` gets the same masked email control with the show/hide
   button as `account-email-reveal.component.ts` (reuse the component; add a target input).
4. Each Claude limits row in `ptah_agent_list` and each limits tile shows the account name plus
   a MASKED email (`a***@domain`). The full email never goes into `ptah_agent_list` output,
   because that output enters agent transcripts.
5. Tests: ambient reveal success, ambient unavailable, old params shape still accepted, mask
   function (short local parts, no `@`), no email in any log call.
