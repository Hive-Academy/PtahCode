# Code Logic Review — `TASK_2026_2328_5bd6` (Performance-Backed Lane Routing)

- **Reviewer role**: `code-logic-reviewer` (independent family from `codex` implementer)
- **Worktree**: `/home/amun/ptah-extension/.claude-worktrees/performance-backed-routing`
- **Score**: **4 / 10**
- **Verdict**: **REVISE**
- **Summary counts**: **2 BLOCKER**, **8 MAJOR**, **6 MINOR**, **1 NOTE**

> **Score justification**: The architectural decomposition, SQLite schema migration, funnel derivation, seed-source compilation, settings toggle persistence, and native effort plumbing across adapters are structurally sound (above 1–2). However, two BLOCKERs (System One outcome figures silently returning `null` in on mode; `agent:getRoutingEvidence` omitting all `ptah-cli` lanes) and eight MAJOR behavioural defects (including a false native-list reason leaking into off mode, bypassed catalog retry suppression on the routing hot path, broken `user` matrix override precedence, profile-vs-cell shadowing, and Claude/Codex/Copilot/Cursor/OpenCode effort/outcome edge cases) require a revision pass before approval (below 5–6).

> **Review scope & verification notes**:
> - `lane-composer.component.ts` (B31) was skipped per review instructions (still in progress).
> - Settled decisions 1–33 in `decisions.md` were treated as constraints and not re-litigated.
> - `ptah_get_diagnostics` could not complete on the workspace due to a TypeScript worker 1024 MB memory limit; typechecking was not verified by this review.

---

## Findings

### F1 [BLOCKER] System One `outcomeFigures` lookup silently returns `null` for every lane in `on` mode

- **Evidence**:
  - `libs/backend/lane-routing/src/lib/matrix/capability-matrix.store.ts:232-234` passes `{ byModelEffort: choice }` (`true` when performance routing is on) to `outcomeFiguresFrom`.
  - `libs/backend/lane-routing/src/lib/matrix/outcome-figures.ts:41-61` keys the map by `JSON.stringify([laneId, taskKind, choice.model, choice.effort])` when `byModelEffort` is `true`, and its returned lookup takes `(laneId, taskKind, model?, effort = ANY_EFFORT)` — when `model` is omitted, `JSON.stringify([laneId, taskKind, undefined, '*'])` produces `[laneId, taskKind, null, "*"]`, which never matches any inserted key.
  - `libs/backend/lane-routing/src/lib/pipeline/model-refine.ts:419-437` (specifically `:432`) still calls `outcomes(option.laneId, phase.taskKind)` with only 2 arguments.
  - `libs/backend/lane-routing/src/lib/decision-model/decision-payload.ts:90-131` and `libs/backend/lane-routing/src/lib/pipeline/model-refine.ts:505-509` also key and render `figures` strictly by `[laneId, taskKind]`, ignoring `figures.model` and `figures.effort`.
- **Impact**: When `agentOrchestration.performanceRouting` is `true` (the default), every `outcomes(...)` lookup inside `offeredFigures()` returns `null`. System One (`model-refine.ts`) receives zero historical outcome figures (`pastOutcomes: {}`, `figureCount: 0`), regressing against `main` and failing FA7.2 ("each offered `(lane, model, effort)` carries its choice funnel/figures for the decision model").
- **Fix**:
  1. In `model-refine.ts:419-437`, pass `(option.laneId, phase.taskKind, option.model, option.effort)` when `byModelEffort` figures are active (and fall back cleanly when `option.model` is absent or `FAMILY_PROFILE_MODEL`).
  2. In `decision-payload.ts:90-131` and `model-refine.ts:505-509`, key and serialize `model`/`effort` when present on `DecisionOutcomeFigures` while preserving the exact off-mode payload structure when `model`/`effort` are absent.
  3. Add a unit test in `route-choice.spec.ts` / `model-refine.spec.ts` asserting System One receives non-empty `(model, effort)` figures in `on` mode.

---

### F2 [BLOCKER] `agent:getRoutingEvidence` omits all `ptah-cli` lanes and does not mark disabled system CLIs

- **Evidence**:
  - `libs/backend/rpc-handlers/src/lib/handlers/routing-evidence-rpc.handlers.ts:59-61` passes only `await this.cliDetection.detectAll()` into `service.read(rows)`.
  - `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-detection.service.ts:323-348` detects only built-in system CLI adapters in `this.adapters`, never `ptah-cli` agents.
  - By contrast, `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:966-1011` merges `cliDetectionService.detectAll()` with `PtahCliRegistry.listAgents()` and applies the `disabledClis` setting.
  - `libs/backend/lane-routing/src/lib/evidence/routing-evidence.service.ts:76` relies on `row.installed && !row.disabled` before calling `catalog.refreshIfDue(...)`.
- **Impact**:
  1. Every `ptah-cli` lane (Ollama Code, Kimi Code, OpenRouter, etc.) — its catalog status, discovered models, and outcome funnels — is completely missing from the Routing Evidence settings panel (violates FA6.1/FA6.2/FA6.3).
  2. User-disabled system CLIs are passed with `disabled` unset, so opening Routing Evidence triggers background catalog refreshes for CLIs the user explicitly disabled.
- **Fix**: In `RoutingEvidenceRpcHandlers` (or a shared lane-row helper shared with `agent-namespace.builder.ts`), mark system CLIs in `disabledClis` as `disabled: true` and append enabled `PtahCliRegistry.listAgents()` rows (resolving `CLI_AGENT_RUNTIME_TOKENS.SDK_PTAH_CLI_REGISTRY` optionally) before calling `service.read(rows)`.

---

### F3 [MAJOR] `compile-reasons.ts` emits false `"not in <lane> native list; spawn sends no effort"` clause for `ptah-fallback` lists (Coordinator Note 8)

- **Evidence**:
  - `libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts:638-642` checks `input.effortCheck?.inList === false` without checking `input.effortCheck.provenance === 'native'` (or `expected === 'not-in-native-list'`).
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:628-629` sets `inList = supported?.includes(requested) ?? null` for **both** `native` and `ptah-fallback` lists.
- **Impact**:
  1. Whenever a lane uses a `ptah-fallback` list that omits the requested effort (e.g., `codex`/`copilot`/`grok` with `requested: 'max'`, or `cursor`/`opencode` with `supported: []`), the route reason falsely claims `"effort <e> not in <lane> native list; spawn sends no effort at this step"`. That is wrong about provenance (it is not native) and factually false for `codex`/`copilot`/`grok` with `'max'` (where spawn actually sends `'xhigh'` via `'fallback-mapped'`).
  2. Because `LaneModelListingAdapter` attaches `ptah-fallback` efforts even in off mode, this false clause also leaks into **off-mode** route reasons (escaping `route-off-golden.spec.ts` only because its stub omits `efforts`).
- **Fix**: Guard `compile-reasons.ts:638` on `input.effortCheck?.provenance === 'native' && input.effortCheck.inList === false` (or `input.effortCheck?.expected === 'not-in-native-list'`).

---

### F4 [MAJOR] `readCatalogModels` unconditionally calls `catalog.refresh()` when `entry?.lastOkAt == null`, bypassing `CATALOG_RETRY_AFTER_MS` retry suppression

- **Evidence**:
  - `libs/backend/lane-routing/src/lib/pipeline/gather.ts:513-528`: calls `catalog.refreshIfDue(row, nowMs)` (which enforces `CATALOG_RETRY_AFTER_MS = 60_000` in `libs/backend/lane-routing/src/lib/catalog/lane-catalog.store.ts:44-47`), then immediately enters `if (entry?.lastOkAt == null)` and unconditionally calls `catalog.refresh(row, nowMs)` inside `withinBudget(...)`.
- **Impact**: For any lane whose model listing fails (error, timeout, or empty) and has never had a successful `ok` fetch, **every** `ptah_route_decide` call ignores the 60-second retry backoff, re-invokes the failing listing probe, and blocks the routing hot path for up to `MODEL_LISTING_BUDGET_MS` (2000 ms) per failing lane. Violates FA1.2 and PLAN §5 retry suppression.
- **Fix**: Only await `withinBudget(catalog.refresh(row, nowMs), ...)` when a refresh is actually due (`entry === undefined || entry.fetchedAt === null || nowMs - entry.fetchedAt >= CATALOG_RETRY_AFTER_MS`), or have `refreshIfDue` return the in-flight refresh promise when triggered and `null` when suppressed, and race only that returned promise.

---

### F5 [MAJOR] `scoreChoice` skips any non-default pair with `evidence === 'prior'`, breaking `user` matrix overrides (FA4.7)

- **Evidence**:
  - `libs/backend/lane-routing/src/lib/ranking/score.ts:217-227`: `if (pair.resolved.parts.evidence === 'prior') continue;`.
  - `libs/backend/lane-routing/src/lib/ranking/score.ts:229-235`: the legacy prior-only fallback only runs when `!hasEvidence && !isSystemCliLane(laneId)`. Furthermore, `:233` constructs `{ id: legacy.model, provenance: legacy.provenance }` without copying `efforts` from `listed`.
- **Impact**: If a user configures an explicit `user` score (e.g., `95`) in `capability-matrix.json` for a listed model or `(model, effort)` pair that has 0 local runs (`evidence === 'prior'`), and either (a) the lane is a system CLI lane or (b) the default pair already has local runs, `scoreChoice` silently skips the user-configured pair and never promotes it. This violates FA4.7 ("user overrides take precedence over seed and local priors"). Additionally, dropping `efforts` at `:233` strips effort support metadata on the legacy fallback path.
- **Fix**: Allow `priorSource === 'user'` pairs through the loop (`if (pair.resolved.parts.evidence === 'prior' && pair.resolved.parts.priorSource !== 'user') continue;`), and preserve `efforts: listed.find((m) => m.id === legacy.model)?.efforts` at `:233`.

---

### F6 [MAJOR] Effort-specific matrix profile shadows effort-agnostic `(family, model, '*')` cells for other `taskKind`s

- **Evidence**:
  - `libs/backend/lane-routing/src/lib/matrix/capability-matrix.store.ts:557-560`:
    ```ts
    const profile = (pairKey === undefined ? undefined : index.byKey.get(pairKey)) ?? index.byKey.get(key);
    const cell = profile?.cells[taskKind];
    ```
  - `libs/backend/lane-routing/src/lib/matrix/local-derivation.ts:295-297`:
    ```ts
    const cell = (exact ?? profileFor(undefined))?.cells[key.taskKind];
    ```
- **Impact**: Seed rows fill exactly one `taskKind` per row, leaving the other 5 `taskKind` cells as `{ kind: 'unknown' }` (`seed-source.ts:93-102, 179`, FA9.5). If a seed or user matrix has an effort-specific profile `(family, model, 'high')` with a value only for `implement`, and an effort-agnostic profile `(family, model, '*')` with a value for `plan`, looking up `(family, model, 'high', 'plan')` selects the `high` profile, sees `cells.plan = { kind: 'unknown' }`, and returns `undefined`/`NEUTRAL_SCORE` instead of falling back to the `'*'` profile's `plan` cell.
- **Fix**: Fall back at the **cell** level rather than the **profile** level in both `valueAt` (`capability-matrix.store.ts:557-560`) and `priorScore` (`local-derivation.ts:295-297`): check whether `pairProfile?.cells[taskKind]?.kind === 'value'`, and if not, inspect `baseProfile?.cells[taskKind]`.

---

### F7 [MAJOR] `ClaudeCliAdapter.runSdk` overwrites APM's `spawnEffort.disposition` with `'lane-refused'` and can misreport `sent: null`

- **Evidence**:
  - `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/claude-cli.adapter.ts:230-237, 401-403`: rebuilds `candidates` from `[input.reasoningEffort, defaults.effort, ..., defaults.chatEffort]`, sets `hasCandidates = candidates.some(Boolean)`, and attaches `effortDelivery: { sent: null, disposition: 'lane-refused' }` whenever `hasCandidates && effort === undefined`.
  - `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1912-1917`: merges `sdkHandle.effortDelivery` onto `info.spawnEffort`.
  - `libs/backend/lane-routing/src/lib/matrix/choice-evidence.ts:203-205`: increments `effortNotSent` whenever `effortDisposition === 'lane-refused'`.
- **Impact**:
  1. When APM's `resolveLaneEffort` already resolved `input.reasoningEffort = undefined` with an accurate disposition (`'lane-takes-no-effort'`, `'not-in-native-list'`, or `'none-requested'`), `ClaudeCliAdapter` re-injects `defaults.chatEffort` / reviewer `'medium'` into `candidates`. If the model rejects them, `hasCandidates && effort === undefined` overwrites APM's accurate disposition with `'lane-refused'` and inflates `effortNotSent`.
  2. Conversely, if APM passed `input.reasoningEffort = undefined` (e.g., `not-in-native-list`) and `ClaudeCliAdapter` resolves `defaults.chatEffort` or `'medium'` into a non-undefined `effort`, the adapter sends that effort to Claude SDK without emitting `effortDelivery`, leaving `info.spawnEffort.sent === null` in the outcome record while Claude actually ran with an effort.
- **Fix**: In `claude-cli.adapter.ts`, only emit `effortDelivery` reflecting the actual `sent: effort ?? null` and only set `disposition: 'lane-refused'` when `input.reasoningEffort !== undefined` and the adapter refused it (or stop re-running fallback candidate selection in `ClaudeCliAdapter` when APM already ran `resolveLaneEffort`, reporting `sent: effort ?? null` whenever it differs from `input.reasoningEffort`).

---

### F8 [MAJOR] `CodexContext` can clobber `reportedEffort` with `null`/`""`, and unbounded vendor model/effort strings drop entire outcome rows

- **Evidence**:
  - `libs/backend/codex-runtime/src/lib/codex-context.ts:543-556`:
    - Schema allows empty string (`z.string().nullish()`).
    - `threadSettings.effort !== undefined ? threadSettings.effort : threadSettings.reasoningEffort` picks `null` over `reasoningEffort` when `{ effort: null, reasoningEffort: 'high' }`.
    - A model-only `thread/settings/updated` notification (`{ model: 'gpt-5' }` without `effort`/`reasoningEffort`) overwrites `this.reportedEffort` with `null`.
  - `libs/backend/lane-outcomes/src/lib/lane-outcome.schema.ts:48-54, 104`: `resolvedEffort` requires `z.string().min(1).max(32).nullable()` and `resolvedModel` requires `z.string().min(1).max(200).nullable()`.
  - `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:50-79, 106-111`: passes `reportedSession.effort`, `reportedSession.model`, and spawn effort strings straight into `recordLaneCompletion` without trimming, converting `""` to `null`, or capping length (unlike `decisionModel`, which is capped at 128).
- **Impact**:
  1. Any `thread/settings/updated` event that updates only `model` erases Codex's `reportedEffort`.
  2. Any vendor reporting `""` or a >32-char effort string (or >200-char model string) causes `LaneOutcomeRowSchema.parse()` to throw inside `enqueueLaneCompletionOutcome`, silently dropping the **entire** lane outcome row instead of degrading just that field.
- **Fix**:
  1. In `codex-context.ts:545-556`, only update `this.reportedEffort` when `'effort' in threadSettings || 'reasoningEffort' in threadSettings`, coalesce with `threadSettings.effort?.trim() || threadSettings.reasoningEffort?.trim() || null`, and treat blank strings as `null`.
  2. In `lane-completion-outcome.ts:50-79`, normalize optional strings (`trim()`, empty -> `null`, cap effort strings at `MAX_OUTCOME_EFFORT_LENGTH` = 32 and model strings at 200) before recording.

---

### F9 [MAJOR] `cursor` and `opencode` adapters lack `laneEfforts()`, making `assemble-gate.ts` branch dead code and yielding `'fallback-refused'` instead of `'lane-takes-no-effort'`

- **Evidence**:
  - `implementation-plan.md` §2.12.2 & §5 specify `cursor` and `opencode` return `{ provenance: 'ptah-fallback', supported: [], default: null }` and yield disposition `'lane-takes-no-effort'`.
  - `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.ts` and `opencode-cli.adapter.ts` define no `laneEfforts()` method.
  - `libs/backend/rpc-handlers/src/lib/services/cli-model-list.service.ts:69-72` returns `{ provenance: 'unknown' }` when `laneEfforts` is absent.
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:635-642` checks `efforts.provenance === 'ptah-fallback' && efforts.supported.length === 0 && (cli === 'cursor' || cli === 'opencode')`, which is unreachable dead code; it falls through to `'fallback-refused'`.
  - `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:415-420, 445`: because `effortMapperFor('cursor' | 'opencode')` is `null`, step 1 sets `reason = 'fallback-refused'` instead of `'lane-takes-no-effort'`.
- **Impact**: `cursor` and `opencode` show `"not reported"` instead of `"Ptah fallback / None"` in Routing Evidence, and their outcomes/routes record `'fallback-refused'` instead of `'lane-takes-no-effort'`.
- **Fix**: Implement `laneEfforts(): readonly string[] { return []; }` on `CursorCliAdapter` and `OpencodeCliAdapter` (or handle them explicitly in `CliModelListService.effortSupport`), and in `lane-spawn-policy.ts:416-417` emit `'lane-takes-no-effort'` when `mapEffort === null`.

---

### F10 [MAJOR] `copilot-effort-flag.ts` permanently caches transient probe failures and `copilot-sdk.adapter.ts` forks `copilot --version` uncached on every spawn (Coordinator Note 10)

- **Evidence**:
  - `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-effort-flag.ts:14-34`: `readEffortFlag` returns `undefined` on both "flag absent from `--help`" and transient spawn/timeout errors, and `effortFlagProbes.set(key, probe)` caches that resolved `undefined` promise for the entire process lifetime with no failure eviction.
  - `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts:315-321`: calls `probeCliVersionDetailed(...)` on every `runSdk()` spawn with no cache, even though APM already detected `cliVersion` at `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1382`.
- **Impact**:
  1. A single transient `--help` timeout or spawn error permanently disables effort flags for Copilot for the rest of the process lifetime.
  2. Every Copilot lane spawn pays an extra subprocess fork (`copilot --version`) on the critical launch path.
- **Fix**:
  1. Distinguish probe failure (timeout / non-zero exit / spawn error) from a successful `--help` without `--reasoning-effort`, and evict failed probes from `effortFlagProbes` (or cache failures only for a short TTL).
  2. Forward `cliVersion` on `CliCommandOptions` from APM (`agent-process-manager.service.ts:1382`) or cache `probeCliVersionDetailed` per binary path with a short TTL.

---

### F11 [MINOR] `agent-namespace.builder.ts` drops `routeFacts` when `request.cli` and `request.ptahCliId` are both omitted (Coordinator Note 11)

- **Evidence**: `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:545-555` computes `const laneId = request.ptahCliId || request.cli;` and requires `facts.laneId === laneId`. When a caller omits both `cli` and `ptahCliId` (relying on default CLI selection) while passing `route`, `laneId` is `undefined` and `routeFacts` is silently dropped with a warning.
- **Impact**: Low in standard routed flows (since `ptah_route_decide` returns the executor id and callers pass `cli` or `ptahCliId`), but any default-CLI spawn passing `route` loses routing attribution (`routingSource: 'not-routed'`).
- **Fix**: Resolve the effective CLI before matching `facts.laneId` (or pass `route` into `AgentProcessManager` so matching occurs after default CLI resolution).

---

### F12 [MINOR] `LANE_CATALOG_STORE` and `ROUTING_EVIDENCE_SERVICE` unconditionally resolve `LANE_MODEL_LISTING` in DI (Coordinator Note 9)

- **Evidence**:
  - `libs/backend/lane-routing/src/lib/di/register.ts:209-226` calls `c.resolve<LaneModelListing>(LANE_ROUTING_TOKENS.LANE_MODEL_LISTING)` unconditionally, whereas `ROUTE_DECIDE_SERVICE` (`:234-237, 271-274`) treats `LANE_MODEL_LISTING` as optional.
  - Host wiring check:
    - `apps/ptah-electron`: Phase 2 registers `registerLaneRoutingServices` (`phase-2-libraries.ts:412`), Phase 4 registers `LANE_MODEL_LISTING` via `registerSharedRpcHandlers` (`phase-4-handlers.ts:134`, `register-shared-rpc-handlers.ts:116-119`). Safe after Phase 4, though `expected-resolvable.ts` does not assert `LANE_CATALOG_STORE` or `ROUTING_EVIDENCE_SERVICE`.
    - `libs/backend/cli-engine` (serves CLI and TUI hosts): Phase 2 registers `registerLaneRoutingServices` (`container.ts:899`), while Phase 4 registers `registerSharedRpcHandlers` (`container.ts:1042`) **only when `bootstrapMode === 'full'`**.
- **Impact**: In `cli-engine` `minimal` mode (or any stripped DI container / test calling `registerLaneRoutingServices` without `registerSharedRpcHandlers`), resolving `LANE_CATALOG_STORE` or `ROUTING_EVIDENCE_SERVICE` throws (caught by `RoutingEvidenceRpcHandlers` as `PERSISTENCE_UNAVAILABLE`).
- **Fix**: Make `LANE_MODEL_LISTING` optional in `LANE_CATALOG_STORE` (`register.ts:209-226`, skipping live refresh when absent while still serving persisted snapshots + outcome evidence) and include `LANE_CATALOG_STORE` / `ROUTING_EVIDENCE_SERVICE` in Electron's DI smoke list.

---

### F13 [MINOR] `lane-outcome.schema.ts` `decisionModel` lacks `.min(1)` (Coordinator Note 2)

- **Evidence**: `libs/backend/lane-outcomes/src/lib/lane-outcome.schema.ts:111` defines `decisionModel: z.string().max(128).nullable().default(null)` without `.min(1)` (inconsistent with `outcomeModelId` and `outcomeEffort` at `:48-54`). Neither `libs/backend/lane-routing/src/lib/route/route-record.registry.ts:16` nor `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:78` normalizes `""` to `null`.
- **Impact**: Empty-string `decisionModel: ""` passes schema validation and persists in SQLite (mitigated at read time by `choice-evidence.ts:214` `!decisionModel?.trim()`).
- **Fix**: Add `.min(1)` to `decisionModel` at `lane-outcome.schema.ts:111` and normalize blank strings to `null` in `route-record.registry.ts:16` and `lane-completion-outcome.ts:78`.

---

### F14 [MINOR] Positional indexing of `OUTCOME_EFFORT_SOURCES[laneEffort.step - 1]` has no compile-time exhaustiveness check (Coordinator Note 3)

- **Evidence**: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1417` maps `LaneEffortStep` (`1..6`) to `OutcomeEffortSource` via `OUTCOME_EFFORT_SOURCES[laneEffort.step - 1]` (`libs/shared/src/lib/types/lane-outcome.types.ts:75`).
- **Impact**: Currently aligned in order, but any future edit/reordering of either `OUTCOME_EFFORT_SOURCES` or `LaneEffortStep` will silently misattribute `effortSource` without a TypeScript error.
- **Fix**: Replace positional indexing with an explicit `Record<LaneEffortStep, OutcomeEffortSource>` lookup helper in `lane-spawn-policy.ts`.

---

### F15 [MINOR] `provider-session-lane-handle.ts` emits `ptah-fallback` with empty `supported: []` instead of `unknown` when `profileEfforts()` is empty (Coordinator Note 4)

- **Evidence**: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.ts:582-593` always returns `{ provenance: 'ptah-fallback', supported: profileEfforts(), default: null }` whenever `reported.efforts.provenance !== 'native'`, even if `profileEfforts()` is `[]` (e.g., an Antigravity model with an effort suffix or a profile without `sessionConfig`).
- **Impact**: Low runtime impact (APM `captureReportedSession` at `:4554` only writes `provenance === 'native'` into the native registry, and `listTurnOptions` treats both `unknown` and `[]` as `[]`), but semantically conflates "unknown / no fallback configured" with a `ptah-fallback` assertion.
- **Fix**: Return `{ provenance: 'unknown' }` when `profileEfforts().length === 0` (unless the model explicitly asserts it takes no effort).

---

### F16 [MINOR] `ptah-cli` spawn records `sent: null` with `disposition: 'fallback-allowlist'`

- **Evidence**:
  - `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:570-575, 648-656`: logs that Ptah CLI lanes ignore `effort`, sets `sent: null`, yet sets `disposition: 'fallback-allowlist'`.
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:657-658`: also predicts `'fallback-allowlist'` for `'ptah-cli'`.
  - `libs/shared/src/lib/types/lane-native-values.types.ts:16-17` defines `'fallback-allowlist'` as "sent the value unchanged" and `'lane-takes-no-effort'` as "lane has no effort transport".
- **Impact**: Although this mirrors a literal sentence in `implementation-plan.md` §2.12.4, it produces self-contradictory outcome records (`requestedEffort: 'high'`, `effort: null`, `effortDisposition: 'fallback-allowlist'`).
- **Fix**: Use `'lane-takes-no-effort'` for `ptah-cli` lanes when an effort was requested and not sent (both in `agent-namespace.builder.ts:654` and `assemble-gate.ts:657-658`).

---

### F17 [NOTE] `PiCliAdapter` `get_state` tightened to `event.success === true` (Coordinator Note 5)

- **Evidence**: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/pi-cli.adapter.ts:32, 800-803` changed `event.command === 'get_state' && event.data` to `event.command === 'get_state' && event.success === true`.
- **Impact**: Matches Pi's documented RPC protocol (`pi-cli.adapter.ts:32`) and prevents parsing error responses as valid state; note only that an older Pi build omitting `success` would now also skip `sessionId`/`sessionFile` extraction (`event.success !== false && event.data !== undefined` would be strictly more defensive).

---

## Coordinator Notes (1–12)

| # | Area | Ruling | Evidence & Summary |
| --- | --- | --- | --- |
| **1** | B6: Refused reviewer default falls through to step 5 | **Acceptable** | `lane-spawn-policy.ts:456-463`. Matches PLAN §2.12.4 step 3 & D18 ("continue with the next step — today's rule for an unsupported value"), while `requested` and `disposition` remain pinned to step 4 (`'medium'` / `'not-in-native-list'`) and `'medium'` is logged in `ignored`. |
| **2** | B5: `decisionModel` schema lacks `.min(1)` | **Defect (F13, MINOR)** | `lane-outcome.schema.ts:111`, `route-record.registry.ts:16`, `lane-completion-outcome.ts:78`. Allows `""` into SQLite; mitigated on read at `choice-evidence.ts:214`. |
| **3** | B16: `OUTCOME_EFFORT_SOURCES[laneEffort.step - 1]` positional indexing | **Defect (F14, MINOR)** | `agent-process-manager.service.ts:1417`, `lane-outcome.types.ts:75`. No compile-time exhaustiveness guarantee if either union/array changes. |
| **4** | B18: `provider-session-lane-handle.ts` `ptah-fallback` with empty `supported` | **Defect (F15, MINOR)** | `provider-session-lane-handle.ts:582-593`. Emits `ptah-fallback` with `supported: []` instead of `unknown` when `profileEfforts()` is empty. |
| **5** | B13: `PiCliAdapter` `get_state` requires `event.success === true` | **Acceptable (F17, NOTE)** | `pi-cli.adapter.ts:32, 800-803`. Matches documented Pi RPC response contract; guards against error-response `data`. |
| **6** | Decision 30: Keep prior-only choice when no pair has evidence | **Acceptable for settled D30; Defect on `user` overrides (F5, MAJOR)** | `score.ts:217-235`. Preserving FA4.3 prior-only choice for non-system-CLI lanes when `!hasEvidence` follows Decision 30, **but** `:217` skips `priorSource === 'user'` pairs whenever `hasEvidence` is true or on system CLI lanes (violating FA4.7), and `:233` drops `efforts`. |
| **7** | V4: No outcome row when spawn fails before reply | **Acceptable** | `agent-process-manager.service.ts:840-847, 1522-1528`. Explicitly settled in `decisions.md` row 21 (V4) and PLAN §5 ("No synthetic row"). Post-ack `runSdk` failures do stamp `spawnSettings` and write failed outcome rows under the routed model. |
| **8** | B19: `compile-reasons.ts` `inList === false` clause on `ptah-fallback` | **Defect (F3, MAJOR)** | `compile-reasons.ts:638-642`, `assemble-gate.ts:628-629`. Emits false `"not in <lane> native list; spawn sends no effort"` for `ptah-fallback` lists (and leaks into off mode). |
| **9** | B25: `RoutingEvidenceService` DI across hosts/modes | **Defect (F12, MINOR)** | `register.ts:209-226`. Safe in Electron (Phase 4 registers `LANE_MODEL_LISTING`), but throws in `cli-engine` `bootstrapMode === 'minimal'` (`cli-engine/src/lib/container.ts:899, 1042`) or stripped containers. |
| **10** | B20: `copilot-effort-flag.ts` caches transient failures & uncached `--version` | **Defect (F10, MAJOR)** | `copilot-effort-flag.ts:14-34`, `copilot-sdk.adapter.ts:315-321`. Permanent process-lifetime caching of failed `--help` probes + uncached `--version` fork on every Copilot spawn. |
| **11** | B28: `agent-namespace.builder.ts` drops `routeFacts` when `request.cli` omitted | **Defect (F11, MINOR)** | `agent-namespace.builder.ts:545-555`. `laneId` is `undefined` on default-CLI spawns, dropping `routeFacts`. |
| **12** | B27/B30: Evidence RPC error mapping & settings toggle read-back | **Toggle & error codes Acceptable; Evidence RPC has BLOCKER Defect (F2)** | `performance-routing-setting.component.ts:107-166` correctly holds prior state until `settings:get` confirms, handles interrupted writes, and matches `lane-rotation-setting.component.ts`. `routing-evidence-rpc.handlers.ts:46-76` maps `INVALID_PARAMS`/`PERSISTENCE_UNAVAILABLE` safely, **but** `:59-61` omits all `ptah-cli` lanes and disabled-CLI filtering (F2). |

---

## Five Logic Questions

1. **Does the implementation match the requirements and spec (FA1–FA9)?**
   - Mostly in architecture, but **no** on several functional requirements: FA7.2 is broken in `on` mode (F1), FA6.1–FA6.3 omit all `ptah-cli` lanes (F2), FA1.2 retry suppression is bypassed on never-succeeded lanes (F4), FA4.7 `user` matrix overrides are skipped when baseline has evidence (F5), FA9.5 single-kind effort profiles shadow `'*'` profiles (F6), and FA8.4/FA8.5 effort disposition/reporting has defects in `compile-reasons.ts` (F3), Claude SDK (F7), Codex (F8), Cursor/OpenCode (F9), and Copilot (F10).
2. **Are off-mode routing results preserved identically (WU0 golden & full data flow)?**
   - Almost: `route-decide.service.ts:291`, `gather.ts:224-248`, `capability-matrix.store.ts:225, 244-257`, `score.ts:129`, and `assemble-gate.ts:129-133` cleanly bypass catalog reading, `(model, effort)` scoring, and choice evidence when `performanceRouting === false`. **However**, F3 (`compile-reasons.ts:638-642`) leaks a false `"not in <lane> native list"` clause into off-mode reasons whenever `LaneModelListingAdapter` supplies a `ptah-fallback` effort list omitting `plan.policy.effort`.
3. **Are edge cases, concurrency, error paths, and retries handled without silent data corruption?**
   - **No**: F4 re-probes failing catalogs on every route call; F7 corrupts `effortDisposition`/`sent` on Claude SDK; F8 drops entire outcome rows on blank/oversized vendor effort/model strings and erases Codex `reportedEffort` on model-only updates; F10 permanently caches transient Copilot `--help` errors.
4. **Is data integrity preserved end-to-end from route → spawn → outcome → evidence → ranking?**
   - **Broken in two links**: (a) route → System One prompt loses all outcome figures in `on` mode (F1); (b) spawn → outcome can drop rows on vendor string bounds (F8) or misattribute `effortDisposition`/`sent` (F7, F9, F16). Outcome → SQLite → `ChoiceEvidence` funnel math itself (`choice-evidence.ts:127-299`) is consistent (`spawned = capacityDropped + completed`, `completed = unverified + noDeliverable + failed + delivered`, `delivered >= reviewed = approved + rejected + unresolvedRevise`, run deduplication, 30-day window).
5. **Are DI wiring, host boundaries, and RPC/UI contracts consistent across hosts?**
   - `apps/ptah-electron` Phase 2/Phase 4 DI order works at runtime; `libs/backend/cli-engine` works in `full` mode but fails to resolve `ROUTING_EVIDENCE_SERVICE`/`LANE_CATALOG_STORE` in `minimal` mode (F12). `RoutingEvidenceRpcHandlers` violates the lane-inventory contract by omitting `ptah-cli` lanes (F2).

---

## Off-Mode Golden & Data Flow Trace

1. **Setting read (`gather.ts:224-230`, `route-decide.service.ts:291`)**: Missing/absent setting defaults to `true` (D25); explicit `false` sets `performanceRouting = false`.
2. **Catalog vs direct listing (`gather.ts:232-248`)**: Off mode bypasses `LaneCatalogStore` and uses `listModels` directly (existing behaviour).
3. **Matrix load (`capability-matrix.store.ts:225, 232-234, 244-257`)**: Off mode passes `byModelEffort: false` to `outcomeFiguresFrom` and leaves `evidence`/`resolvePair` undefined.
4. **Scoring (`score.ts:129`)**: Off mode executes the legacy `scoreLane` path untouched.
5. **Assembly & Reasons (`assemble-gate.ts:129-133, 619-644`, `compile-reasons.ts:615-642`)**: Off mode keeps `plan.policy.effort`, **except** `assemble-gate.ts:628-629` populates `effortCheck.inList = false` for `ptah-fallback` lists, causing `compile-reasons.ts:638-642` to append a false native-list warning in off mode (F3).

---

## Requirements Fulfilment (FA1–FA9)

| Requirement | Status | Notes |
| --- | --- | --- |
| **FA1** Model & effort catalog discovery, persistence, freshness, budgets | **Partial (F4, F9)** | Persistence/TTL/stale-read-while-refresh works once `lastOkAt` is set, but never-succeeded lanes bypass 60s retry suppression on every route (F4). `cursor`/`opencode` lack `ptah-fallback` empty effort support (F9). |
| **FA2** Outcome attribution (`resolvedModel`, `effort`, provenance, disposition) | **Partial (F7, F8, F9, F16)** | Schema v2 migration and core plumbing are solid; defects in Claude SDK override (F7), Codex `thread/settings/updated` + schema bounds (F8), Cursor/OpenCode disposition (F9), and `ptah-cli` disposition (F16). |
| **FA3** Funnel & choice evidence derivation | **Pass** | `choice-evidence.ts` funnel invariants, capacity exclusion from local scoring, native default dual-bucketing (`[resolvedModel, '*']`), and `decisionModels` rollup match spec. |
| **FA4** `(model, effort)` ranking, exploration, baselines, user prior precedence | **Partial (F5, F6)** | Local blending, tie-breaking, and System Two exploration work, but `user` matrix overrides are skipped when `evidence === 'prior'` (F5) and effort profiles shadow `'*'` profiles for other task kinds (F6). |
| **FA5** Route → spawn correlation & post-ack failure attribution | **Pass (with F11 minor)** | `RouteRecordRegistry` + `spawnSettings` stamping on `admitted.info` work for routed spawns; minor gap when `request.cli` omitted (F11). |
| **FA6** Routing Evidence RPC & UI | **Fail (F2)** | UI rendering and error handling are clean, but `RoutingEvidenceRpcHandlers` omits all `ptah-cli` lanes and does not filter disabled system CLIs (F2). |
| **FA7** System One decision-model payload & feedback | **Fail (F1)** | `offeredFigures()` calls 2-arg `outcomes(laneId, taskKind)` against a 4-key map in `on` mode, silently sending zero outcome figures to System One (F1). |
| **FA8** Native effort discovery, spawn resolution, Copilot flag probe | **Partial (F3, F7, F9, F10)** | Native effort capture across Claude/Codex/ACP/Pi/Copilot is mostly thorough, with defects in `compile-reasons` provenance check (F3), Claude SDK `effortDelivery` (F7), Cursor/OpenCode (F9), and Copilot probe caching/version fork (F10). |
| **FA9** Seed provenance, alias compilation, single-kind rows | **Partial (F6)** | `seed-source.ts` strict schema, exact alias matching, duplicate/invalid counters, and staleness check are solid; cell-level fallback across effort vs `'*'` profiles is broken in matrix lookup (F6). |

---

## Edge Cases Checked

| Edge Case | Result | Reference |
| --- | --- | --- |
| Never-succeeded catalog entry on repeated route calls | **Bug (F4)** | `gather.ts:513-528` |
| `user` matrix override on unrun `(model, effort)` when default has runs | **Bug (F5)** | `score.ts:217-227` |
| Seed/user profile with effort `'high'` for `implement` + `'*'` for `plan` | **Bug (F6)** | `capability-matrix.store.ts:557-560`, `local-derivation.ts:295-297` |
| System One invoked in `on` mode with historical outcomes | **Bug (F1)** | `model-refine.ts:432`, `outcome-figures.ts:58-61` |
| `ptah-cli` lane present when opening Routing Evidence | **Bug (F2)** | `routing-evidence-rpc.handlers.ts:59-61` |
| Disabled system CLI present when opening Routing Evidence | **Bug (F2)** | `routing-evidence-rpc.handlers.ts:59-61`, `routing-evidence.service.ts:76` |
| Codex `thread/settings/updated` carrying `model` only or `effort: ""` | **Bug (F8)** | `codex-context.ts:543-556`, `lane-completion-outcome.ts:50-79` |
| Copilot `--help` transient timeout on first spawn | **Bug (F10)** | `copilot-effort-flag.ts:14-34` |
| Performance routing setting absent in store | **Pass (D25)** | `performance-routing-setting.component.ts:159`, `gather.ts:227` |
| Interrupted `settings:set` toggle in UI | **Pass** | `performance-routing-setting.component.ts:120-148` |
| Post-ack `runSdk` failure outcome attribution | **Pass** | `agent-process-manager.service.ts:1522-1528` |
| Duplicate outcome rows for same `runId` | **Pass** | `choice-evidence.ts:242`, `outcome-figures.ts:25` |

---

## Verdict

**REVISE (4 / 10)** — Resolve **F1** and **F2** (BLOCKERs) and **F3–F10** (MAJORs) before re-review. Addressing **F11–F16** (MINORs) in the same revision pass is recommended for clean contract alignment.
