# Implementation Plan - TASK_2026_2309_5bea

Status: revised after Gate 2 round 1. Verified items cite `file:line` (worktree-relative); rule tags
`user-requested`, `project-rule`, `lane-proposed`; `Gate 2 #N` marks a review-driven rule.

## Inputs and constraints

- Requirements used: `decisions.md` (rows 5, 8, 9, 12, 13, 15-18; it supersedes
  `task-description.md`, so "PLAN LIMITS unchanged" and "TASK/GIT out of scope" are void, row 9),
  `design-spec-v3.md` (approved, row 16), `design-spec-v3-review.md` (findings 1-9 binding, row 18),
  `task-description.md` R1-R9 + NFRs, `parity-inventory.md`, `reference/live/live-test-findings.md`.
- Corrections applied: row 12 supersedes row 10 (Orchestrator uses the common row shape); row 18 keeps
  Orchestrator-first order against review finding 5's "restore live-first" (user approved rev 3).
- Design handoff used: `design-spec-v3.md` §§1-11 (prototype HTML not read, by instruction).
- Missing decision-critical input: plan-limit window/group contract was not opened before the stop
  (blocks Component 7 detail; resolved from source in Component 7; Q1 settled).
- Project rules (`project-rule`): Electron renderer only (`apps/ptah-extension-webview`), no TUI / VS
  Code feature work (CLAUDE.md, decision 4); Angular signals; no deep cross-library imports; Nx
  `scope:*`/`type:*` boundaries; no reader changes in `libs/backend/auth-providers` (child task
  `fix/agy-usage-startup-kill` owns them, decision 17).

## Codebase evidence

| Evidence | Location | Architectural implication |
| --- | --- | --- |
| SDK snapshot type: `totalCost`, `knownCost`, `tokens{input,output,cacheRead,cacheCreation}`, `tokenCount`, `modelUsageList[]` with per-model input/output/cacheRead/cacheCreation/costUSD, `coverage`, `pricingCoverage`, `costUnavailableReason`, `cache{ttl,lastRequestAt,expiresAt,idleCompactAt}`, `provisional`, `durationMs`, `contextSnapshot{model,...}` | `libs/shared/src/lib/types/rpc/rpc-session.types.ts:386-508` | All SDK accuracy inputs exist on the renderer; no backend change for totals (answers carry-item 1, 2). Per-model categories are real (question i). |
| Snapshot numeric usage includes Claude SDK subagents, excludes CLI lanes | `parity-inventory.md` abbreviations (Gate 1 verified) ; live defect 2 (`live-test-findings.md`) | Subagent rows must never be added to the session total. |
| Current Total row sums every row (double count) | `inspector-agent-list.ts:105-156` (`agentListTotal`) | Replaced; deleted with its consumers `inspector-agents-section.component.ts:323` and template. |
| Orchestrator row = snapshot tokens/cost, `costEstimated:false`, no accuracy flags | `inspector-agents-section.component.ts:449-479`; card `session-inspector.store.ts:139-158` | Replaced by derived figure (Component 2). |
| Orchestrator model falls back to session-wide model | `session-inspector.store.ts:147` (`live?.model \|\| stats?.model`) | R3.2: fallback removed; `contextSnapshot.model` or live model only, else "model not attributed". |
| Lane usage: subagent tokens via `positive()` (0 -> null), cost `estimatedCostUsd`; CLI tokens partial when not host-exact; CLI cost reported or Codex estimate | `lane-stats.adapters.ts:44-87,99-113,128-150,153-179`; `inspector-agent-usage.ts:34-81` (`costEstimated` true for non-CLI, line 75) | Normalized contributions are derived from `AgentUsageFigures` (`inspector-agent-list.ts:57-68`); a subagent 0 token count is "missing", so subtraction is not derivable. |
| Row list is built inside the agents section from injected roster/monitor/tray | `inspector-agents-section.component.ts:295-321,481-526` | Totals need the same rows above AGENTS: lift row projection out of the section (Component 3). |
| Ordering today: live, Orchestrator, rest | `inspector-agent-list.ts:238-260` | Changes to Orchestrator-first (decision 18). |
| Selection normalisation sub/bg, kept-visible selected row, conditional thread open | `inspector-agent-list.ts:266-277`; `inspector-agents-section.component.ts:331-393` | Keep verbatim (finding 5). |
| Actions: steer/background/stop need a tray context; `hasActions = tray !== null && trayEntryHasAction(tray.entry)` | `inspector-agents-section.component.ts:395-430,444-447,524` | Eligibility stays as-is (question j). |
| Caption running count from list; `active` from store buckets | `inspector-agents-section.component.ts:325-329`; `session-inspector.store.ts:255-305` | Caption counts derive from the one row list (Component 4). |
| Budget state carries `measure` incl. `weighted-fallback`, `used`, `limit`, `percent`, `lowerBound`, `stage` | `libs/shared/src/lib/types/session-budget.types.ts:34-35,80-102` | Renderer reads the measure; no new boundary. |
| Weighted fallback: `limit = config.fallbackWeightedTokens`, sticky path returns the same measure | `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-stage.ts:86-113` | Both R7.5 cases are visible as `measure === 'weighted-fallback'` (question c). |
| Existing weighted-fallback text | `session-budget-format.ts:50-90` | Reused/extended, not duplicated. |
| Rail metrics incl. Time when known | `session-stats-view.ts:197-241` (`compactSessionMetrics`) | Rail Time already exists; keep and route through new totals (finding 6). |
| Session-switch leave/enter + timer cleanup | `session-inspector.component.ts:241-269`; template `.html:147-167` | Keep; wrap the new SESSION section (finding 6). |
| Three mounts, sheet is `role=dialog aria-modal` | `session-inspector.component.html:1-76`; hosts `canvas-inspector-dock.component.ts:125,193,239` | No mount change; compact sheet keeps dialog/focus. |
| One polite live region | `session-inspector.component.html:218` | Single announcer stays outside re-rendered pane. |
| Unknown duration helper (`>0` only) | `session-stats-view.ts:179-182` | R8: absent/null/0 -> `--:--` (decision 5). |
| `ptah-countdown` renders `--` when it cannot compute | `libs/frontend/ui/src/lib/time/countdown.component.ts:109` (decisions row 5) | Precedent for placeholder-in-shared-time-component. |
| Shared UI dirs: `charts/{meter,ring,stat,sparkline}`, `time/{timer,countdown,format-duration}`, `patterns/{table,disclosure,description-list}`, `surfaces/{surface-section,stat-card}` | `libs/frontend/ui/src/lib/**` (listing) | Extension targets for Component 5. |

## Architecture decision

- Chosen approach: one pure, renderer-side usage model (`session-usage-totals`) in `chat-ui` that takes
  normalized contributions (SDK snapshot + CLI lane rows) and returns per-metric value + accuracy +
  cause; every surface (tiles, source bar, legend, Models, share bars, Orchestrator row, rail) reads it.
  Row projection moves from the agents section to an inspector-level helper in `chat` so SESSION and
  AGENTS read the same rows. Shared UI gaps are closed by extending `ptah-meter`, `ptah-ring`,
  `ptah-timer`, `ptah-stat` in `libs/frontend/ui` (user goal: one shared system, R6, `user-requested`).
- Rationale: all inputs are already on the renderer (evidence table); the double count is a renderer
  bug (`agentListTotal`); one model gives one marker precedence across surfaces (v3 §2, finding 1).
- Rejected alternatives:
  - Backend per-agent split / backend whole-session total: needs new RPC fields and touches agent-sdk;
    R4 lists it only as escalation; frontend-only scope (decision 6).
  - Agents section emits totals through an `output()`: renders SESSION one tick late, creates an
    upward data flow and keeps two row computations; loses to a shared computed.
  - Scoped inspector markup for segmented bar / 2-3 px meter / 11 px ring: violates R6.3 (a gap must be
    named, not preferred) and the user goal of a single system.
- Assumptions: A1, A9, A10, A11 below (A2-A8 verified or resolved).
- Effect on existing code: `agentListTotal` and Total row deleted; Orchestrator row content rebuilt;
  `inspector-session-stats` rebuilt (context/compaction/cache tiles move out); limits section restyled
  with unchanged data; GIT/linked restyled only (TASK via the sibling addendum). `ptah-session-stats-summary` and
  `ptah-agent-lane-stats` outputs unchanged (NFR).

## Component specifications

### 1. Session usage totals (pure logic) — `chat-ui`

- Purpose: normalize contributions and compute whole-session Tokens and Cost with accuracy (question a).
- Responsibilities (`user-requested` R1/R2 unless tagged):
  - Types (Gate 2 #1): `UsageAmount = { value: number | null; estimated: boolean; lowerBound: boolean;
    comparable: boolean; causes: readonly string[] }` — basis flags and causes are kept even when
    `value` is null. `UsageContribution = { source; id; label; tokens: UsageAmount; cost: UsageAmount }`.
    `UsageTotal = { state; value; sdk; cli; coverage: 'full' | 'partial' | 'missing'; reportedCount;
    missingCount; causes }` per metric (`state` as before: exact/estimate/lower-bound/both/unknown).
  - `sdkContribution(snapshot | null)` (Gate 2 R1): no blanket `empty` shortcut. `status` only selects
    rows 1-2; every other snapshot is classified PER METRIC from its own fields
    (rpc-session.types.ts:396-406,448-473,497). Verified shapes: `emptySessionStats` = `tokenCount: 0`,
    `coverage: 'complete'`, `totalCost: null`, `knownCost: null`, `pricingCoverage: 'none'`
    (session-usage-aggregator.ts:127-143); the ledger sets `status: 'empty'` from `usageRecords === 0`
    while `coverage` is `'partial'` whenever `unreadableSubagents > 0` (`:305-309`), so an empty
    snapshot can be incomplete; `failedSessionStats` = `status: 'error'`, `tokenCount: 0` (`:145-159`).

    | # | Snapshot state | Tokens | Cost |
    | --- | --- | --- | --- |
    | 1 | absent | missing, "SDK usage not loaded yet" | missing, same cause |
    | 2 | `status: 'error'` | missing, "SDK usage could not be read" (sentinel 0 never a value) | missing, same cause |
    | 3 | `empty`, `coverage: 'complete'` | exact 0 (measured zero) | missing, "No priced SDK usage recorded" (`totalCost` null, `pricingCoverage: 'none'`; never $0) |
    | 4 | `empty`, `coverage: 'partial'` | `≥ 0` lower bound, "Some SDK usage could not be counted" (generic: the field also covers history-prefix, unattributed and timestamp gaps; never exact 0) | missing, same cause |
    | 5 | `ok`, `pricingCoverage: 'full'`, `totalCost` finite | `tokenCount`; `≥` iff `coverage: 'partial'` | `totalCost` (a reported `0` is a genuine priced $0, exact); `≥` iff `coverage: 'partial'` |
    | 6 | `ok`, `pricingCoverage: 'partial'` | as row 5 | `knownCost` as `≥` (null `knownCost` -> missing) |
    | 7 | `ok`, `pricingCoverage: 'none'` | as row 5 | missing, cause from `costUnavailableReason`/`costBasis` |
    | 8 | `ok`, `pricingCoverage` ABSENT (legacy snapshot; the field is optional, `rpc-session.types.ts:391-415`, and compact stats today use a finite `totalCost` with no coverage check, `session-stats-view.ts:127-157,197-203`) | as row 5 | finite reported `totalCost` used as-is, including a reported `0` (exact $0); `≥` iff `coverage: 'partial'`; estimate flags as below; `totalCost` null/absent -> missing, "SDK cost not reported" (never $0) |

    In every row with a value: estimated iff `provisional` (tokens) and iff `provisional ||
    costBasis === 'estimated'` (cost, also on final snapshots); `covered-by-subscription` keeps its
    explanation in causes (F5, F10). A non-finite or negative field -> that metric missing.
  - `cliContribution(run)`: `kind === 'cli'` rows only (subagent/background are inside the snapshot).
    Token basis (Gate 2 #3, round 3 #2; `cliUsageTokenTotal` is NOT reused, cli-usage.utils.ts:25-46).
    Three reported shapes, decided per lane from the raw `CliUsageTotals` fields:
    - Ordinary split (both `inputTokens` and `outputTokens` present and valid, with or without
      `totalTokens` and cache fields): INCLUDED as a full, comparable contribution, value
      input+output, NO `lowerBound`, no cause. Under decisions.md row 22 the uncertainty whether the
      provider's input already includes cache is a basis uncertainty, not a detected gap, and gets
      no mark. A provider on the four-class allowlist (constant in this file, initially empty,
      Assumption A1) additionally adds its reported cache read/creation fields to the value; the
      allowlist changes only the value's composition, never the mark.
    - Detected token-class omission (exactly one of `inputTokens`/`outputTokens` present and valid):
      the present class is included, `lowerBound`, cause "<lane> reported only <class> tokens".
    - Opaque provider-only total (`totalTokens` with no split fields): `comparable: false`, value
      shown on the row only, missing from the sum with `≥` and cause "<lane> reports a provider total
      on another basis".
    The existing adapter is left alone: `resolveCliLaneUsage`/`cliLaneStats` keep flagging a split as
    `tokensPartial` for the agent-lane stats bar (`lane-stats.adapters.ts:99-112,152-166`); the
    inspector does not read that flag. Cost: `costEstimated` -> estimated; `costPartial` ->
    lowerBound; null -> missing. Split fields are validated before addition: each present field must
    be a finite number >= 0, else that lane's tokens are missing (never summed as 0).
  - Accuracy rule = "trust the data" (decisions.md row 22, `user-requested`, overrides Gate 2 R2/R3):
    Tokens and Cost show exact or `~` as in approved v3; `≥` appears ONLY on a DETECTED loss or gap.
    `cliCoverage` = `{ complete, causes }`, `complete: true` unless a row below fires. Undetected loss
    (e.g. a lane evicted while no inspector was mounted) is accepted as unmarked (user accepts rare
    unmarked error); the backend ledger in `## Follow-ups` would make the marks provable.

    | Detectable condition | Detected from (existing field/event) | Tokens | Cost |
    | --- | --- | --- | --- |
    | SDK read failed | snapshot `status: 'error'` (`rpc-session.types.ts:448`; `failedSessionStats`, aggregator `:145-159`) | SDK unknown; headline `≥` CLI part, or unknown if no CLI | same |
    | Partial SDK usage (generic cause) | `coverage: 'partial'` (`rpc-session.types.ts:455`; aggregator `:305-309`) | `≥` (truth-table rows 4-6) | `≥` |
    | Lane removed/evicted while the inspector is open, usage RETAINED for the metric | lane leaves `agentsOwnedBySession` (`agent-monitor.store.ts:1295`) and is absent from `monitor.agents()` (paths `:1982-2004,2344-2376,2430-2434,2544-2565`); retained map holds a value for that metric (Component 3) | retained value counted, mark UNCHANGED (exact stays exact; this row adds no `≥`) | same, per metric |
    | Lane removed/evicted while the inspector is open, usage MISSING for the metric | same removal signal; retained map has no value for that metric | `≥`, cause "A removed lane's usage was not captured" | same, per metric |
    | Lane reported no usage | lane `AgentUsageFigures` tokens/cost null (`inspector-agent-list.ts:57-68`) or invalid split (above) | `≥`, cause "N of M lanes report no usage" | `≥` |
    | Lane reports a token-class omission | exactly one of input/output present (token basis above) | present class included, `≥` + cause | per its cost flags |
    | Lane reports an incomparable provider total | provider-total-only usage, no split fields (`cli-usage.utils.ts:25-46`) | excluded, `≥` + cause | per its cost flags |
    | Resumed session with an OBSERVED CLI gap | history open (session bound and `resuming` after a successful `session:load`, `tab-manager.service.ts:944-981,1874-1901,3086-3114`) AND, after CLI recovery (`applyCliSessions` -> `loadCliSessions`, `session-loader.service.ts:1540-1554`), a known CLI lane reference for this session with no usable value for the metric, or an explicit relevant recovery failure (Assumption A9). `hasLiveSession` is NOT used (`chat-types.ts:840-850` describes the SDK handle, not the CLI inventory) | CLI part `≥`, cause "N CLI lanes from an earlier run have no recorded usage" (or the recovery failure cause) | same, per metric |
    | Resumed session, no observed CLI gap | history open with no CLI lane references, or every restored lane has a usable value for the metric | unmarked (decisions.md row 22, trust the data) | same |
    | Missing price | `pricingCoverage: 'partial'` (row 6), CLI `costPartial` or null cost | n/a | `≥` |

    Estimates stay `~` (`costEstimated`, `costBasis: 'estimated'`, provisional snapshot cost).
  - `sessionTotal(contributions, cliCoverage, metric)`: R1 precedence rows 1-5; known zeros included;
    F7 exact 0, F8 `≥ 0`, F9 unknown (never 0, never `≥`); incomplete scope never renders exact 0.
  - Causes are per metric and name source kind + count (`1 of 2 lanes report no cost`).
- Bound-safe formatting (`session-usage-format`, same lib):
  - `formatUsageTokens(total)`, `formatUsageCost(total)`: compact figures FLOOR for every state
    (`lane-proposed`, v3 §2; required for lower bounds, finding 1: `usd(0.086)` must read `≥$0.08`).
    Cost < $0.01 -> 3 decimals; rail drops cents from $10 (`lane-proposed`). Flooring is decimal-safe
    (integer micro-units, never `Math.floor(v * 100)` on a float) (Gate 2 #10).
  - Marker prefix `≥`, `~`, `≥ ~`; spoken sentence "at least", "about", "at least about" + full value
    (unrounded, `toLocaleString`) + scope + causes (v3 §6). One function feeds tooltip and accessible
    text so they cannot drift.
- Verified contracts: snapshot fields `rpc-session.types.ts:386-508`; `AgentUsageFigures`
  `inspector-agent-list.ts:57-68` (type moves to `chat-ui` or is mirrored by a structural input; it
  must not be imported from `chat` into `chat-ui`, dependency direction chat -> chat-ui, verified by
  imports `inspector-agent-list.ts` from `@ptah-extension/chat-ui`).
- Dependencies: `@ptah-extension/shared` types only. No Angular.
- Failure behaviour: non-finite or negative inputs -> missing, never 0.
- Verification seam: Jest spec with fixtures F1-F10 asserting value + state + coverage per metric;
  one case per truth-table row 1-8 (row 8 legacy fixtures: `ok` without `pricingCoverage` and
  `totalCost: 0` -> exact $0; same with `totalCost: 0.42` and `provisional: true` -> `~$0.42`; same
  with `totalCost` null -> cost missing, tokens per row 5), using the literal `emptySessionStats()` shape (row 3: tokens exact
  0, cost missing, not $0), the same shape with `coverage: 'partial'` (row 4: `≥ 0`, cost missing) and a
  genuine zero-price `ok` snapshot (`pricingCoverage: 'full'`, `totalCost: 0` -> exact $0); F5
  provisional cost `~`; F9 with the literal `failedSessionStats()` shape -> unknown (not `≥0`); F10
  partial coverage -> cost `≥`; final `costBasis: 'estimated'` -> `~`; CLI-only subtotal with SDK
  missing -> `≥` + cause; CLI shapes (round 3 #2): provider-total-only -> excluded, `≥`; input-only
  and output-only -> present class, `≥`; ordinary split `{inputTokens, outputTokens}` (also with a
  `totalTokens` beside it) -> included, NO `≥`; split with NaN/negative output -> missing, not 0.
  F3/F4/F6/F7 are NORMALIZED AGGREGATION fixtures: their CLI lane is an ordinary split whose
  input+output equals the task-description figure (e.g. F3 `{inputTokens: 150, outputTokens: 50}`,
  $0.10), so tokens read exact as `task-description.md:130-134` requires. A separate raw-adapter case
  feeds the same ordinary split through `cliContribution` with the actual initial (empty) allowlist
  and asserts value input+output, comparable, no `lowerBound`, cache fields not added; and asserts
  `cliLaneStats` still reports `tokensPartial: true` for it (adapter unchanged). Each POSITIVE
  detectable-loss row -> `≥` with its cause (removed-lane MISSING row, lane without usage, token-class
  omission, incomparable total, resumed with observed gap, missing price, failed read, partial
  coverage); the negative cases -> no `≥`: removed-lane RETAINED row (exact stays exact); exact SDK +
  one CLI lane with ordinary split -> exact; estimated CLI cost -> `~` only; resumed fixtures per
  Component 3 (history open with no CLI lanes -> unmarked; restored lane with usable data ->
  unmarked; identified lane still missing usage -> `≥` for that metric only); F7 exact 0 with
  `complete: true`; formatting
  $0.086 -> `≥$0.08`, $0.29 exact, $0.0049, $10.00 rail boundary; live fixture (`fx=live-small`)
  asserts STATE per the table (its numerator recomputed from split fields; the old number that
  included opaque provider totals is deleted); double-count regression (R2.1).
- Files: CREATE `libs/frontend/chat-ui/src/lib/molecules/session/session-usage-totals.ts`,
  `session-usage-totals.spec.ts`, `session-usage-format.ts`, `session-usage-format.spec.ts`; MODIFY
  `libs/frontend/chat-ui/src/index.ts` (public barrel; Verified `tsconfig.base.json:62` maps
  `@ptah-extension/chat-ui` to it).

### 2. Orchestrator derived figure + main-request facts (pure logic) — `chat-ui`

- Purpose: Orchestrator Tokens/Cost and main-request metadata (questions b, i; R3, R4; decision 12).
- Rules (`user-requested` decision 12, constrained by finding 1):
  - Correspondence (Gate 2 #2): the snapshot carries no subagent id set, only `agentSessionCount`
    (unique subagents, descendants included; `rpc-session.types.ts:425-430`), and the owner passes it
    as metadata apart from the usage contributions (`session-stats-owner.service.ts:1064-1107`). So:
  - Derivation ("trust the data", decisions.md row 22, overrides Gate 2 R2): per metric,
    Orchestrator = SDK snapshot value (Component 1 table) minus the sum of the SDK subagent/background
    rows' usage (Component 3 rows), shown with `~`. The membership/watermark mismatch R2 named
    (count only, no member ids, `rpc-session.types.ts:425-430`, `session-stats-owner.service.ts:1064-1107`;
    `normalizeAgentKey` keeps sub/bg aliases, `inspector-agent-list.ts:262-277`) is accepted unmarked
    beyond `~`; aliases are deduped by row key before summing.
  - With 0 subagent rows the figure is the snapshot value itself with the snapshot's own mark (exact,
    `~`, `≥`), per approved v3 §3.
  - Muted `—` (R4.3, decision 12) only when: the snapshot is absent or its metric has no value under
    Component 1's table (error, empty cost) -> Component 1 cause; the result is negative -> "Subagent
    usage exceeds the session snapshot"; a subagent row has no usage for that metric -> "A subagent
    reported no usage".
  - Token basis (Verified): snapshot `tokenCount` = input + output + cacheRead + cacheCreation
    (`session-usage-aggregator.ts:453,482-484`); `agentSessionCount = countUniqueSubagents(subagentIds)`
    (`:456`), so a count of 0 means no subagent usage in the snapshot.
- Main-request model: `live.model` or `snapshot.contextSnapshot.model`; never `snapshot.model`
  (fixes `session-inspector.store.ts:147`); none -> "Model not attributed" (R3.2).
- Context %/used/capacity, compactions, cache state are read from existing `SessionContextCue`
  (`session-stats-view.ts:21-27,96-123`) and the existing cache-tile logic
  (`inspector-cache-tile.component.ts:100-138`); unknown stays unknown, never 0 (R3.4).
- Orchestrator inline detail: Context used/capacity, Compactions, Cache TTL + idle + state + remaining
  countdown (also at 300/336 px, finding 4), unknown cache with cause when TTL absent. It does NOT
  repeat "SDK total" (R4 duplication; the SDK subtotal lives in Models) — deviation from v3 §3, see
  Decisions.
- Verification seam: Jest spec: 0 subagents -> snapshot value with its own mark (exact; provisional
  `~`; partial coverage `≥`); 2 subagents with usage -> snapshot minus sum, `~`; sub/bg alias counted
  once; negative result -> `—` + cause; one subagent row without cost -> cost `—`, tokens still `~`;
  absent/error snapshot -> `—`; empty snapshot -> tokens per row 3, cost `—`; model cases.
- Files: CREATE `libs/frontend/chat-ui/src/lib/molecules/session/orchestrator-usage.ts` + `.spec.ts`.

### 3. Inspector agent rows (shared projection) — `chat`

- Purpose: build the row list once per tab for SESSION totals, AGENTS, rail and caption.
- Responsibilities: move `orchestratorRow`, `laneRow`, `list`, `now` ticking out of
  `inspector-agents-section.component.ts:295-321,449-526` into an injection-context factory
  (`injectInspectorAgentRows(tabId, sessionId, laneRuns)`) returning signals `rows`, `contributions`,
  `totals`, `orchestratorUsage`, `captionCounts`, `cliCoverage`. `SessionInspectorComponent` calls it
  and passes results as inputs to SESSION and AGENTS.
- CLI lifetime (Gate 2 #3): CLI contributions come from `agentsOwnedBySession(sessionId)`
  (`agent-monitor.store.ts:1295`, exact parent match, as `session-stats-source.ts:196-204`), not from the
  tab roster's unscoped `monitor.agents()` (`session-agent-roster.service.ts:79-84`). No store change
  (no eviction counter). The factory keeps a retained map `agentId -> last CLI contribution` for its
  session while mounted (cheap: bounded by the session's lanes): a lane that leaves
  `agentsOwnedBySession` but is ABSENT from `monitor.agents()` (evicted, removed, cleared) keeps its
  last contribution and its mark, per metric; a metric with nothing retained for it adds `≥` (the
  other metric keeps its retained value and mark); a lane still
  present with another `parentSessionId` (re-parented) is dropped; the map resets when `sessionId`
  changes or the factory is destroyed. Resumed-session gap (round 3 #1, Component 1 table, A9): the
  factory does NOT latch on `hasLiveSession`. It marks a metric `≥` only on an observed CLI gap after
  recovery: a CLI lane reference known for this session (in `agentsOwnedBySession`, including
  restored cards from `loadCliSessions`, `session-loader.service.ts:1540-1554`) with no usable value
  for that metric, or an explicit relevant recovery failure. A history open with no CLI lanes, or
  with restored lanes that carry usable data, stays unmarked (decisions.md row 22). The gap clears as
  soon as the lane reports usable data for the metric. After a remount an earlier removal is not
  detectable and stays unmarked (decisions.md row 22).
- Ordering (`user-requested`, decision 18): Orchestrator, then needs-you (requests or `waiting`), then
  running/starting/queued, then the rest in store recency order. Replaces `orderAgentList`
  (`inspector-agent-list.ts:253-260`); `normalizeAgentKey` kept.
- Live lane timing keeps `injectWallClock('second', hasRunning)` (`inspector-agents-section...:313`); a
  single clock per tab, not per row (runtime-cost rule).
- Failure behaviour: roster not ready -> `rows: null` (loading), never an empty list (R5.6, finding 6).
- Verification seam: update `inspector-agent-list.spec.ts` (ordering, normalisation),
  `inspector-agent-usage.spec.ts` (unchanged figures), new factory spec with a TestBed host: a lane
  evicted, removed, cleared-completed and force-cleared each keeps its contribution with its mark
  unchanged (exact stays exact); a removed lane with retained tokens but no retained cost -> tokens
  unchanged, cost `≥`; a removed lane with no retained usage -> `≥` on both; a re-parented lane
  leaves the total; session id change resets the map; same-session remount starts from the store.
  Resumed fixtures (round 3 #1): (a) history open (bound id, `resuming` after successful
  `session:load`, `hasLiveSession` false/absent) with NO CLI lane references -> both metrics
  unmarked; (b) history open with a restored CLI lane carrying usable split + cost -> unmarked, exact
  where its data is exact; (c) history open with an identified restored lane still missing usage
  after recovery -> `≥` with the resumed cause for the missing metric only, cleared once the lane
  reports usable data; a fresh tab -> unmarked.
- Files: CREATE `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-rows.ts`
  + `.spec.ts`; MODIFY `inspector-agent-list.ts` (delete `agentListTotal`, `AgentListTotal`; new order),
  `inspector-agent-list.spec.ts`. `agent-monitor.store.ts` is NOT modified.
  `session-inspector.component.{ts,html}` is owned by Component 6 (Gate 2 #7); this component hands
  its factory call and bindings to that owner.

### 4. AGENTS section + agent row — `chat`

- Purpose: render v3 roster (decision 8, 12): same row shape for Orchestrator, share bar, caption.
- Responsibilities:
  - Caption (question e, R5.1-5.3, finding 5): counts from Component 3 rows only — `N running`
    (starting/running), `N asking` (open requests or `waiting`), `N sub` (subagent + background
    kinds), `N CLI` (kind `cli`). Every number labelled. `stats.limits.inspectorRuns` no longer feeds a
    count (it stays for role/start detail, `inspector-agents-section...:290-293`). Roster loading ->
    caption loading state, not 0.
  - Share bar (Gate 2 #10, decisions.md row 22): width = row tokens / session token total (Component
    1). Shown whenever the total is a positive known value that is not a lower bound (exact or `~`;
    `~` reads "About N% of session tokens", question d, v3 §4). Hidden (space kept) only when the
    total is a lower bound, unknown or 0. A true 0 row draws an empty track; a row with no value
    draws no fill (its gap already makes the total `≥`); the Orchestrator row uses its `~` figure,
    no fill when `—`. The denominator is Component 1's deduplicated session token total under the
    round 3 token rule, so an ordinary-split CLI lane keeps the total exact and the bars SHOWN;
    a token-class omission, provider-only total or other detected gap makes it `≥` and the bars
    hidden. Verification (round 3 #2): spec cases (i) exact SDK + one ordinary-split CLI lane ->
    bars shown, widths = row tokens / that total, widths sum to 100% within rounding; (ii) same with
    the lane provider-total-only -> total `≥`, bars hidden, space kept; (iii) a removed lane with
    retained tokens -> bars still shown and its row keeps its width.
  - Orchestrator columns from Component 2; model line ring 11 px + cache countdown; at <=340 px the
    cache group and CLI role leave the line but stay in the selected detail and tooltip (finding 4).
  - Row Time: `ptah-timer` for known durations, `1h26m` compact >= 1 h with full clock in tooltip and
    accessible name; unknown -> `--:--` + cause (decision 5, R8.5).
  - Keyboard route to metric detail (finding 7): each row's metric cells are described by the row
    button (`aria-describedby` to a visually hidden per-row sentence with full tokens, cost, duration,
    states, causes); selected row detail (controlled region, `aria-expanded`/`aria-controls`) holds the
    same values visibly; Escape closes detail/tooltip and returns focus to the row button.
  - Kept verbatim (finding 5, R9): selection current state, conditional `canOpen`, kept-visible
    selected row, sub/bg normalisation, steer/background/stop menu eligibility, steer input (subagent)
    vs lane composer (CLI, "Message <name>"), steer error alert + retry, request panel focus return,
    `Show N more` counting hidden rows, empty line "No subagents or CLI lanes yet", request outputs,
    the separate CLI composer, starting/queued/waiting/asking row states. Selected detail keeps row start
    time and input/output split (`inspector-agent-row.component.ts:31-83`) (Gate 2 #8).
  - CLI row actions (question j): only what `trayEntryHasAction` allows today plus the lane composer;
    no new action (Assumption A5 on CLI tray eligibility).
- Files: MODIFY `inspector-agents-section.component.ts` + `.spec.ts`, `inspector-agent-row.component.ts`,
  `inspector-request-panel.component.ts` (focus/Escape only if needed), `inspector-agent-actions-menu.component.ts`
  (styling only).
- Verification seam: `inspector-agents-section.component.spec.ts` updated: caption from roster,
  no Total row, share shown on exact and `~` totals, hidden on lower bound, zero-width on 0,
  Orchestrator `—` and `~` cases, focus
  return, Escape.

### 5. Shared UI extensions — `ui` (question g, h)

- Current API (Verified, `libs/frontend/ui/src/lib/charts/` and `time/`): `ptah-meter` requires
  `value`/`max`/`label`, sizes via `PtahChartSize` `xs|sm|md` (`meter.component.ts:5,29,52-75`), width
  `percentOf` with no minimum fill (`chart-geometry.ts:37-40`, `meter.component.ts:82-83`), single value
  only; `ptah-ring` sizes `PtahRingSize` (smallest `xs` 24 px, `ring.component.ts:5-14,77,114-145`);
  `ptah-timer` requires `startedAt`, `endedAt` null -> running else frozen (`timer.component.ts:17,31-44`),
  invalid start renders `--` (`format-duration.ts:17`); `ptah-stat` has `value`, `placeholder` (default
  `Unavailable`), `loading`, `error`, no accuracy prefix (`stat.component.ts:53,140-191`).
- New inputs/variants this task adds (extend in place, no `V2` copies):
  - `ptah-meter`: optional `segments` (default `null` = today's single-value path, byte-identical
    output) of `{ value, tone, label }`; `value`/`max`/`label` stay required and mean known subtotal /
    proportional denominator / accessible name; `valueText` carries full per-source values + coverage
    causes; `barRole` unchanged. Optional `unreported: 'none' | 'partial' | 'missing'` (default `none`)
    draws a fixed-width hatched stub (existing `stripes` recipe, `meter.component.ts:8`) OUTSIDE the
    proportional track; it never scales with any amount (Gate 2 #10). With known subtotal > 0 segment
    widths sum exactly to the proportional width (last segment takes the remainder); subtotal 0 ->
    empty track; all missing -> no track, text "No usage reported". Optional `track: '2px' | '3px'`
    (default unset = `size` heights; NOT added to `PtahChartSize`, `chart.types.ts:13`).
  - `ptah-ring`: add `PtahRingSize` members `dot` (11 px) and `inline` (20 px) in `chart.types.ts:16`
    and in EVERY exhaustive size map in `ring.component.ts` (all four, `:6-49`); accessible value text
    unchanged.
  - `ptah-timer` (Gate 2 R6, widen only): `startedAt` becomes `input.required<PtahTimeInput | null>()`
    (`PtahTimeInput` = number | Date | string stays accepted, `time-input.ts:2-16`, `timer.component.ts:31`).
    New optional `durationMs = input<number | null>(null)`: a finite value > 0 renders that static known
    duration with no clock, independent of `startedAt` (R8.1). Unknown = `startedAt` null AND no known
    `durationMs` -> new `PtahTimerState` `'unknown'`: muted `--:--`, `unknownReason` spoken in the host
    `aria-label`, no clock (gate the `injectPtahClock` predicate `:42-44`). With no new input set,
    `running`/`frozen`/Stopped, `title` "Started …" and the label default are unchanged. Optional
    `description` replaces the `title` text when set. Spec pins Date and ISO-string `startedAt`
    unchanged, null -> unknown, `durationMs` with null start -> static value.
  - `ptah-stat`: optional `accuracy` (default `exact` = no glyph, today's markup) rendering `≥`/`~`/`≥~`
    at 84% size; `value` must be the UNPREFIXED compact figure (callers never pass a marked string).
    Optional `accessibleValue`: when set it is the single spoken owner and the visible glyph+value are
    `aria-hidden` (no double speech). Detail tooltip opens on hover and focus (tile `tabindex=0` only
    when it has detail), closes on blur/Escape, Escape keeps focus on the tile. `placeholder` covers `—`.
- Failure behaviour: invalid/negative segment values ignored with zero width; max 0 -> empty track.
- Verification seam: extend `meter.component.spec.ts`, `charts.a11y.spec.ts`,
  `meter.marker.a11y.spec.ts`, `ring.component.spec.ts`, `timer.component.spec.ts`, `time-a11y.spec.ts`,
  `stat.component.spec.ts` (zero width, no floor, sizes, placeholder, spoken text).
- Files: MODIFY the four component files + their specs in `libs/frontend/ui/src/lib/{charts,time}`,
  and `libs/frontend/ui/src/lib/charts/chart.types.ts` (sole owner of these files, Gate 2 #7).

### 6. SESSION section + Models disclosure + rail — `chat-ui` / `chat`

- Tiles (`ptah-stat` grid): Tokens, Cost (Component 1), Budget (only when a budget exists, R7.4),
  Time + turns (R8.4), Models. Source bar = segmented meter SDK vs CLI + legend
  (`SDK 23.5M`, `CLI ~2.4M`, `1 unreported`) with per-metric coverage (token and cost gaps named
  separately, finding 1).
- Budget (question c, R7, Gate 2 #4): used, limit, percent, `lowerBound` and stage all come from the
  SAME budget state (`session-budget-stage.ts:69-113`). Unit from `measure`: `tokens`/`weighted-tokens`/
  `weighted-fallback` -> tokens, `cost`/`cost-lower-bound` -> $. The `≥` marker + floor format apply
  to used AND percent whenever `lowerBound` is true, for EVERY measure (partial coverage sets it on
  tokens, weighted, fallback and `cost`, `:74-103`), not only `cost-lower-bound`. `weighted-fallback`
  (non-sticky `:113` and sticky `:94`) -> label "Weighted tokens in place of cost", limit
  `fallbackWeightedTokens`; no "cost unavailable" claim (false on the sticky path once cost returns).
  Scope swatch + tooltip "SDK usage only, CLI lanes are not counted". Tone: `limit` -> error,
  `tighten`/`handoff` -> warning, else gold (`inspector-session-stats.component.ts:510-515`, corrected).
  Spec asserts numerator, limit, label, tone for: both fallback paths (sticky with cost available),
  partial-coverage `cost`, partial-coverage weighted tokens.
- Models disclosure (`ptah-disclosure`, question i, finding 4): entry labelled "SDK scope —
  orchestrator and SDK subagents, no CLI lanes" always (also single-model, no-lane); aggregate SDK
  categories (uncached input, output, cache read, cache creation from `snapshot.tokens`); per-model
  rows from `modelUsageList` (real categories, not proportional); SDK subtotal; `CLI lanes` row; cost
  basis (reported / estimated / subscription / partial pricing / unavailable cause); lane coverage
  `with tokens a/b`, `with cost a/b`. Escape closes; `aria-expanded`/`aria-controls`;
  expansion keyed by session via existing `StatsTileExpansionState` (`plan-limits/stats-tile-expansion.state.ts`).
- Moves out: Context, compactions, cache tile -> Orchestrator (R3.1). `InspectorCacheTileComponent`
  logic reused by the Orchestrator detail, not copied.
- Rail (findings 6, 7): Tok and Cost from Component 1 with same markers; Time when known (existing
  `compactSessionMetrics`); context labelled main-request; plan-limit cue; each button's accessible
  name = the full spoken sentence (full value + causes, not compact figures); loading gates each
  metric by its own readiness (skeleton for Tok/Cost until stats; context only when live stats known;
  attention only when roster ready). Focus targets (Gate 2 #5): the existing `focusSection` union
  (SESSION | AGENTS, `session-inspector.component.ts:285-292`) gains `orchestrator` and `limits`.
  Tok/Cost/Time -> SESSION heading; context -> the Orchestrator row button; plan-limit cue -> PLAN
  LIMITS heading; attention -> first asking row. Compact sheet dismissal (Gate 2 R4) is owned by the
  canvas host, because canvas destroys the rail while the sheet is open (`canvas-inspector-dock.
  component.ts:117-151`) and today always focuses the expand control (`:363-389`). Each rail button
  carries `data-rail-control="<tokens|cost|time|context|limits|attention>"`; `expandInspector`
  (`:434-443`) records the active element's `data-rail-control` key (not the element) before opening
  the sheet; `focusRailExpand` first queries `[data-inspector-rail] [data-rail-control="<key>"]` with
  the same MutationObserver wait, then falls back to `[data-inspector-expand]`. No output contract
  change. Spec in `canvas-inspector-dock.component.spec.ts`: open from Cost, dismiss -> Cost focused;
  no key -> expand control.
- Full-value routes (Gate 2 #5): Tokens/Cost tiles use `ptah-stat` focus/hover detail (Component 5)
  holding full value, scope and causes; the SDK/CLI source meter's `valueText` speaks both full
  subtotals and coverage causes, and the same text is the visible Models disclosure body; Time uses
  `ptah-timer`. R8 (Gate 2 R4): known = `durationMsOf(snapshot)` (finite and > 0,
  `session-stats-view.ts:179-182`), passed as `durationMs`, rendered statically whether or not a
  start exists. `durationMs` absent, null or 0 -> `--:--` (never `0s`, R8.2); cause is a specific one
  only when the data identifies it (resumed live owner with an unknown earlier prefix), else "duration
  not recorded" (R8.3). The Time tile is focusable (`tabindex=0`) and its focus/hover detail holds the
  full duration (or the cause) and the start when known; the same text is its accessible name, so it
  is not only a native `title`. Turns render whenever `turnCount` is known, independent of duration
  (R8.4). Orchestrator duration follows the same rules (R8.5). Regression spec: `durationMs: 0` ->
  placeholder; known duration with null start -> value; known turns with unknown duration -> turns.
- Session switch (Gate 2 #5): keep leave/enter (`session-inspector.component.ts:241-269`, citation
  corrected) and its local reduced-motion rule (`:115-119`; theme override `ptah-tokens.css:555-563`).
  The leaving node binds a frozen `leavingModel` (stats + totals + coverage + rows + orchestrator
  usage) captured with its session id at the same point `leavingStats` is set — never live inputs —
  and is `inert` + `aria-hidden="true"`. The single live region announces the change; Models/row
  expansion keyed by session id. Spec: A->B and B->A, SDK ready before lanes and lanes before SDK,
  56 px rail, the real compact sheet dialog.
- Kept (Gate 2 #8): accuracy key legend, model count + disclosure affordance
  (`inspector-session-stats.component.ts:53-111`), context limit cue (moves into Orchestrator detail),
  cache countdown/idle/estimated/expired/warning states (`inspector-cache-tile.component.ts:100-138`).
- Files: REWRITE `inspector-stats/inspector-session-stats.component.ts` + `.spec.ts`; MODIFY
  `session-stats-view.ts` + `session-stats-view.spec.ts` (`compactSessionMetrics` takes totals),
  `session-budget-format.ts` + spec, `session-model-breakdown.component.ts` + spec (SDK label, categories),
  `inspector-cache-tile.component.ts` (reuse in Orchestrator detail); MODIFY
  `libs/frontend/chat/.../session-inspector.component.{ts,html}` + `.spec.ts`; MODIFY
  `libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.ts` + its spec (invoker
  restore only).

### 7. PLAN LIMITS restyle + state mapping — `chat-ui` (question f, finding 8)

- Layout v3 §5: provider line (name, account id, source badge), optional 11 px group caption, one line
  per window (`30px | 1fr | 46px | 60px`), session provider first, provider count and refresh notice
  (`role=status`) kept (`inspector-limits-lanes.component.ts:10-45`).
- Required states, each a fixture + acceptance case (`user-requested`, decision 17):
  1. usage available, several windows (5h + weekly) and model groups (agy: "Gemini models",
     "Claude and GPT models", each 5h + weekly; decision 15);
  2. provider at limit — Kimi: monthly windows 100% + 5-hour 0% -> provider tone error from owner state
     `limit`, the 0% window draws an empty track (no floor), percent text exact;
  3. no usage source — grok: "no usage source" ONLY when its owner's `status === 'no-usage-source'`;
     a grok lane with no owner (lane returns before a status lookup) keeps the existing `untracked`
     owner-state line ("usage not tracked"), never "no source" (Gate 2 #6);
  4. usage unavailable — reader failed: muted italic `usage unavailable`, reason in tooltip;
  5. partial window/reset: missing reset -> reset cell `—` with cause; missing `used` -> no meter.
  Existing branches kept verbatim under the restyle (Gate 2 #6): zero/multiple owners and multiple
  scopes (`stats-limit-view-model.ts:91-146`), account/scope ownership, `stale` with `staleSince`
  (`plan-limit-tiles.ts:229-233`), unsupported reasons (`:296-299`), evidence and cooldown tiles
  (`:117-123`, `:364+`). Only statuses that fall through those branches map to state 4. `used` as an
  amount renders "N of M" with meter value/max = amount/limit, never as a percent.
- Tone (Gate 2 #6): from the existing classified `PlanWindowState`/`LaneLimitState` only
  (`limit-reached`/`at-limit` -> error, `near-limit` -> warning). The lane-proposed raw >=75%/100%
  thresholds are DROPPED, so a stale, `aged` or `reset-usage-unknown` window cannot regain a warning.
  Rail cue (Gate 2 R5) = the existing session-level `indicator` from `indicatorFor(classifyLaneState(
  …))` (`plan-limit-tiles.ts:100-127,423-443`), i.e. owner-level state AND window state with the
  classifier's precedence: active owner evidence or exhausted window -> `at-limit` (error), else any
  `near-limit` window -> warning, else no cue (`lane-state.ts:314-355`); its text (including "window
  unknown" and scoped reset) is the cue's accessible name. The dock reads the same result: the
  indicator for the owner banner and each `ClassifiedWindow.state` for its window tone. No
  window-only aggregate exists. Extra fixtures: owner-only exhaustion with zero windows -> rail
  `at-limit`; stale or invalidated 100% window -> no cue. Fixture: Kimi monthly 100% + 5h 0% together, successful agy, unknown account, grok
  owned and unowned, reader failure, cached/partial reset.
- Full window name, full reset (date + zone) in tooltip and meter value text.
- Data shape (Verified, `libs/shared/src/lib/types/plan-limit.types.ts`): several windows per owner
  (`PlanLimitOwnerSnapshot.windows`), view model `ProviderLaneLimitModel.windows[]` + `ownerState`
  `single|multiple|untracked` (`stats-limit-view-model.types.ts`); window `key`, `kind`, `label`,
  `modelScope?`, `used?` (percent or amount), `resetsAt?`, `observedAt` (`:40-41,82-102`); owner
  `QuotaOwnerRef`, `account?`, `source?`, `staleSince?`, `cooldown?`, `statusReason?` (`:142-148,211-232`).
  Window state `PlanWindowState` (`utils/plan-limits/window-state.ts:20-28`), lane `LaneLimitState`
  (`lane-state.ts:158-159`). State 3 vs 4: `status` `'no-usage-source'` vs other non-available
  statuses (`rpc-providers.types.ts:215-225`) after the kept branches above; cause from `statusReason`.
  - Model group: NO structured field today; agy encodes it only in `label`/`key`, `kind` `other`
    (`auth-providers/.../antigravity-usage-window.ts:14`, `antigravity-usage.parser.ts:5-6,67-84`). Q1.
  - Group compatibility path (Gate 2 #6): one helper `windowGroupOf(window: PlanLimitWindow): string |
    null` in `stats-limit-view-model.ts` reads the member through a local widened type
    (`PlanLimitWindow & { readonly group?: unknown }`), returning a trimmed non-empty string or null.
    It compiles against today's interface and after the sibling adds `group?`. The projection copies
    it to a new `group: string | null` on the inspector window view model (`stats-limit-view-model.types.ts`).
    Grouped rendering only when EVERY window of a provider has a group; absent, invalid or mixed ->
    ungrouped. The line text is always the full `label`; the caption is additive. No label parsing.
    Specs: pre-merge ungrouped fixture and a post-merge agy fixture (two groups) through the projection.
- Files: MODIFY `inspector-stats/inspector-limits-lanes.component.ts` + spec, `plan-limits/plan-limit-tile.component.ts`,
  `plan-window-detail.component.ts`, `provider-lane-limit-tile.component.ts`, `stats-limit-view-model.ts`,
  `stats-limit-view-model.types.ts` (+ specs). `plan-limit-tiles.ts` is shared with the summary: changes
  are additive and `session-stats-summary.component.spec.ts` must stay green (Gate 2 #7).

### 8. TASK, GIT, linked sessions, header restyle — `chat` / `chat-ui` (decision 9)

- Presentation only on shared surfaces (`ptah-surface-section`, `ptah-description-list`, `span[ptahBadge]`);
  behaviour and data unchanged (parity rows `SIC.html:84-127,197-215`). GIT shows a `detached` badge
  next to `HEAD` (v3 §1; Assumption A4: detached state is in the git section's data — check
  `inspector-git-section.component.ts`; if absent, the badge is dropped and listed under Q3).
- Header request line "Answer" (Gate 2 #8): the existing handler still emits the request id and its
  focus restore to the close control is kept (`session-inspector.component.html:132-142`); selecting
  the asking row and focusing its request panel is additive, and that panel keeps the request controls.
- Scope: header, GIT and linked sessions only. The TASK section's restyle is delivered by the sibling
  addendum `implementation-plan-task-digest.md` (its batch B3) with the same tokens and row styles;
  this plan does not touch `inspector-task-section.component.ts`, `session-task-reader.ts` or their specs.
- Files: MODIFY `inspector-git-section.component.ts`, `inspector-linked-sessions.component.ts`,
  `inspector-session-actions.component.html` (styles) + their specs. The header "Answer" binding
  (select asking row, focus its request panel) and its integration fixture live in
  `session-inspector.component.{ts,html,spec}`, owned by Component 6; this component hands that
  binding and fixture to Component 6 before the final inspector integration lands.

## Integration architecture

- Data flow: `SessionInspectorStore.modelFor(tab)` + `stats()` (`SessionStatsInputs`) ->
  `injectInspectorAgentRows` (rows, contributions) -> `sessionTotal` (Component 1) and
  `orchestratorUsage` (Component 2) -> inputs of `ptah-inspector-session-stats`, `ptah-inspector-agents-section`,
  rail metrics. No new RPC.
- State: all derived signals, owned by `SessionInspectorComponent` per mount; detail expansion keyed by
  session id; one wall clock per tab while something runs.
- External boundaries: none new; snapshot and limits arrive through existing typed RPC state.
- Failure and rollback: any missing input degrades to `—`/`unknown`/`≥` with cause; never 0.
- Observability: causes are visible in tooltips/accessible text; no new logging.

## Review finding traceability

Design findings 1-9 map to components as in `implementation-plan-review.md` "Finding traceability
check". Current status lives in that file's `## Recheck round 2` (R1, R4, R5, R6 resolved; R2, R3
superseded by decisions.md row 22) and its three remaining findings are answered in
`## Gate 2 round 3 responses` below; closure is the reviewer's call on the next recheck.

## Architecture-level quality requirements

- Functional: every Tokens/Cost figure carries its Component 1 state; `≥` only on a detectable-loss
  row, never an unknown value shown as exact or 0; R1 F1-F10 exact; Orchestrator per Component 2 (`~`
  derivation, `—` only on its three causes); no second total in AGENTS (R1.8); unknown duration
  `--:--` with its cause (R8); rail plan-limit cue and dock use one classification (Component 7).
- Widths (`user-requested` NFR, finding 9): dock 300 (min), 336, 400, 448; compact sheet 360; rail 56.
  Numeric columns 52/54/50 px at <=336, 56/62/58 above (`lane-proposed`); names ellipsize with full
  value in the row tooltip/accessible name; no numeric wrap or clip; focus outlines not clipped.
  Verification matrix (Gate 2 #9), Electron dark AND light: dock 300/336/400/448 expanded, rail 56,
  the real 360 px compact sheet. Content fixtures at each: longest lane name + model, full reset
  date+zone, duration >= 10 h, paired glyphs `≥ ~` with 7-digit figures, narrow focus outlines,
  loading, running, resumed, switched, missing, Kimi-at-limit. Each case names its entry point
  (the three canvas mounts, `canvas-inspector-dock.component.ts:125,193,239`) and its scoped check.
- Clock ownership: one clock per rendered inspector mount, and only the active mount runs the
  projection (Assumption A10).
- Accessibility: no state by colour alone; `role=meter`/`img` with value text; spoken markers; Escape
  on disclosures/tooltips; WCAG AA contrast per v3 §10 in dark and light.
- Performance: one wall clock per tab, none per row; ticking text not announced; the timer holds no
  clock in the `unknown` or static-duration state; the retained CLI map is bounded by the session's
  lanes and released with the factory.
- Security: not applicable (renderer-only, no new input boundary).
- Maintainability: dependency direction chat -> chat-ui -> ui and shared only; no `chat-ui` import from
  `chat`; no deep imports; delete `agentListTotal` rather than keep it; no backend or shared-contract
  change; public component inputs only widen (`ptah-session-stats-summary`, `ptah-agent-lane-stats`
  outputs unchanged, NFR).
- Testability: Jest unit spec per rule (precedence, formatting floor, derivation, budget measures,
  caption counts, share-bar show/hide, zero-width meter, plan-limit states); each truth-table row,
  each detectable-loss row and its negative case, each Orchestrator condition, the R8 cases, the
  owner-only limit case and the canvas focus restore have a named spec case.

## Team-leader handoff

- Recommended executors: frontend-developer for all components (UI + pure TS logic in frontend libs);
  senior-tester for fixture specs; visual-reviewer for Electron dark+light at width fixtures vs
  `prototype/v3/screenshots/*`.
- Complexity: HIGH (four libraries, accuracy rules, a11y parity).
- Dependencies and ordering (Gate 2 R6): 1 before 2 (2 imports 1's types); the `chat-ui/src/index.ts`
  barrel is owned by 1 and gains 2's export only after 2's file exists (same owner, after 2); 5
  independent of 1-2; 3 needs 1-2 exports; `inspector-cache-tile.component.ts` (cache-detail API) is
  produced by 6's chat-ui part BEFORE 4 consumes it in the Orchestrator detail; 4 needs 3, 5 and that
  cache API; 7 needs 5; 8 needs 5 only; the canvas focus host (6, `canvas-inspector-dock`) needs the
  rail's `data-rail-control` markup; final inspector integration (`session-inspector.component.{ts,
  html,spec}`, owner 6) lands last, after 3 and 4.
- Parallel-safe work: {1→2} || {5}; then {3} || {6 chat-ui files incl. cache tile} || {7} || {8}; then
  {4}; then {6 inspector integration + canvas host}.
  Single file owners (Gate 2 #7): `chat-ui/src/index.ts` -> 1; `chart.types.ts` + ring maps + timer
  -> 5; `session-inspector.component.{ts,html,spec}`, `inspector-cache-tile.component.ts` and
  `canvas-inspector-dock.component.ts` -> 6; `plan-limit-tiles.ts` + summary-shared defaults -> 7.
  Not owned here: `agent-monitor.store.ts` (unchanged) and the TASK section files
  (`inspector-task-section.component.ts` + spec: sibling addendum batch B3; `session-task-reader.ts`
  + spec: sibling addendum batch B2, `implementation-plan-task-digest.md`).
  Estimated 6 batches.
- Files affected: CREATE — Component 1/2 files in `libs/frontend/chat-ui/src/lib/molecules/session/`,
  `inspector-agent-rows.ts(+spec)` in `libs/frontend/chat/.../session-inspector/`. MODIFY — listed per
  component (including `libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.ts`
  + spec). REWRITE — `inspector-session-stats.component.ts` + spec. No backend or shared-contract file
  (Q1 settled: no shared-contract change in this task).
- Verification points (`project-rule`, CLAUDE.md): Nx project names Verified from each `project.json`
  `name`: `@ptah-extension/ui`, `@ptah-extension/chat-ui`, `@ptah-extension/chat`,
  `@ptah-extension/canvas`, `ptah-extension-webview`.
  Inner loop `npm run verify -- --related -p @ptah-extension/ui,@ptah-extension/chat-ui,@ptah-extension/chat,@ptah-extension/canvas`
  and `npm run verify -- -t lint,typecheck -p @ptah-extension/ui,@ptah-extension/chat-ui,@ptah-extension/chat,@ptah-extension/canvas`;
  gate `npm run verify -- -p @ptah-extension/ui,@ptah-extension/chat-ui,@ptah-extension/chat,@ptah-extension/canvas,ptah-extension-webview`;
  after template changes `npm run verify -- -t typecheck-templates -p ptah-extension-webview`. CLI lanes run
  only focused `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath
  <specs>`, `npx tsc --noEmit --project <tsconfig>`, `npx eslint <files>`. Specs that must stay green:
  `session-stats-summary.component.spec.ts`, agent-lane-stats specs (NFR), all parity-inventory specs.
- Implementer checks (from `implementation-plan-review.md` `## Carry to implementation`):
  - Use one SDK lane identity for `sub:` and `bg:` aliases when needed. The roster already suppresses
    a separate background entry when a subagent shares its tool-call ID; `normalizeAgentKey`
    preserves an existing literal key and does not itself deduplicate both aliases. Use the alias
    fixture in Component 2 (`session-agent-roster.ts:150-184`, `inspector-agent-list.ts:262-277`).
  - Keep SDK partial-coverage copy generic unless the source carries a narrower cause (the same
    `coverage: 'partial'` also covers a missing history prefix, unattributed live usage and
    out-of-range timestamps; name a subagent read failure only when the input distinguishes it).
  - Carry forward the duration validity check and the existing reduced-motion and keyboard cases.
    Q2 has a defined R8 placeholder; Q3 is settled. A1 is a conservative adapter starting point now
    that the explicit token contract (Component 1) has landed; A4/A5/A8 are resolved.
  - A reported "Not priced" needs a rate-missing reason (`rpc-session.types.ts:396-406,461-473`);
    null CLI cost or `costPartial` alone gets the generic cost-gap cause
    (`inspector-agent-usage.ts:64-75`).
  - Decision 22 accepts unobserved loss and snapshot/roster mismatch; no backend ledger or strict
    membership proof is a gate condition.

## Assumptions

Resolved and folded into components: A2 (Component 2), A3 (Component 5), A6 (Component 7), A7
(handoff verification points, Component 1). Remaining, each with its check:

- A1 (rewritten, Gate 2 #3; the old proof was false: `cliUsageTokenTotal` prefers an opaque provider
  total, `cli-usage.utils.ts:25-46`). The four-class allowlist starts empty. A provider joins only when
  its adapter maps to uncached input + output + cache read + cache creation AND the monitor's usage
  carries all four; Codex computes these (`codex-event-translator.ts:32-43`) — check that the renderer's
  CLI usage keeps `uncachedInputTokens`/`cacheCreationTokens` before adding it. Until then Codex counts
  as an ordinary split (input+output, included with no `≥`, round 3 #2); the allowlist only adds the
  cache classes to the value and never changes the mark.
- A4, A5, A8 resolved by the review: null branch on known Git state -> `detached` badge
  (`inspector-git-section.component.ts:60,139-147`); tray joins only subagent/background rows, CLI keeps
  its composer (`session-agent-tray.service.ts:50-75`, `inspector-agent-actions-menu.component.ts:35-51`);
  A8 see Component 6 session switch.
- A9 (rewritten, round 3 #1) resumed-session gap: `hasLiveSession` describes the SDK handle and
  carries no CLI inventory (`chat-types.ts:840-850`), so it is NOT the signal. A history open is a
  bound session id entering `resuming` after a successful `session:load`
  (`tab-manager.service.ts:944-981,1874-1901,3086-3114`; `session-loader.service.ts:1014-1050,1068-1094`);
  CLI references are restored separately (`applyCliSessions` -> `agentMonitorStore.loadCliSessions`,
  `session-loader.service.ts:1540-1554`). The `≥` fires only on an OBSERVED gap: a known CLI lane
  reference for the session with no usable value for a metric after recovery, or an explicit
  relevant recovery failure. Check for the implementer: whether the CLI-reference fetch/restore path
  exposes a failure state the renderer can read (none was verified in the cited ranges); if none
  exists, only the reference-without-usage condition is wired and a silent recovery failure stays
  unmarked (accepted, row 22). No gap -> unmarked, including a history open with no CLI lanes.
- A11 Orchestrator subtraction trusts that SDK subagent rows match the snapshot's subagents (row 22);
  a mismatch is visible only as a negative result (`—`). The ledger follow-up removes the trust.
- A10 confirmed by the recheck: one `SessionInspectorComponent` per focused tab in the canvas host
  (`canvas-inspector-dock.component.ts:117-151,226-254`); the factory stays per mount.

## Open questions

- Q1 SETTLED (evidence in Component 7): every field exists today except a structured model-group
  field. "No usage source" vs "reader failed" is already `status: 'no-usage-source'` vs other statuses +
  `statusReason`. Named dependency: child task `fix/agy-usage-startup-kill` (owns
  `libs/backend/auth-providers` readers) to add optional `group?: string` on `PlanLimitWindow` in
  `libs/shared/src/lib/types/plan-limit.types.ts` and fill it from `antigravityWindowIdentity`. This task
  does NOT edit that file; it renders `group` when present and otherwise an ungrouped list using the
  full window `label` (which already reads "Gemini Models · 5 Hour"). No label parsing in the renderer.
  Type-safe before and after the sibling merge via `windowGroupOf` (Component 7, Gate 2 #6).
- Q2 (user, decision 5 still "pending confirmation"): unknown duration `--:--` (Recommended, planned)
  vs zeroes.
- Q3 SETTLED by Gate 2 review: SDK subtotal lives in Models only (R4); Orchestrator detail omits it.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Totals model is renderer-side pure logic in `chat-ui` | backend total / renderer | all fields on `SessionStatsEntry` (rpc-session.types.ts:386-508); decision 6 | yes |
| Row projection lifted to an inspector factory | output() from section / shared computed | `inspector-agents-section.component.ts:295-321` injected sources | yes |
| Orchestrator-first ordering | live-first (finding 5) / Orchestrator-first | decision 18 | yes |
| Accuracy rule "trust the data": `≥` only on a detectable-loss row (Component 1 table) (`user-requested`, decisions.md row 22, overrides Gate 2 recheck R2/R3 strict proof) | backend ledger / trust the data / strict proof | user answer 2026-11-23; frontend-only scope (decision 6) | yes; the Follow-ups ledger makes marks provable |
| Share bar shown on exact or `~` positive total, hidden only on a lower-bound/unknown/0 total | hide / "at most N%" | v3 §4 approved; decisions.md row 22 | yes |
| Floor all compact figures | floor lower bounds only / floor all | v3 §2, finding 1 | yes |
| Extend shared UI components | scoped markup / extend | R6.3, user goal | yes |
| Orchestrator = SDK snapshot minus SDK subagent rows, `~`; 0 subagents = snapshot with its own mark; `—` only for absent snapshot, negative result or a subagent row without usage (decisions.md row 22, overrides R2) | no subtraction / subtraction with `~` | approved v3 §3; snapshot has a count but no member ids (`rpc-session.types.ts:425-430`), accepted (A11) | yes; a backend orchestrator-only figure (Follow-ups) replaces it |
| Raw-percent plan-limit tone thresholds dropped (Gate 2 #6) | keep v3 >=75%/100% / classified state only | `lane-proposed` only; classified `PlanWindowState` already encodes near/at limit and excludes stale/aged windows | yes |
| Removed lanes keep their last usage per metric while the inspector is mounted (retained map, no store change); resumed `≥` only on an observed CLI gap after recovery, never from `hasLiveSession` (round 3 #1) | eviction counter / retained map / always `≥`; `hasLiveSession` latch | loss paths `agent-monitor.store.ts:1982-2004,2344-2376,2430-2434,2544-2565`; `session-loader.service.ts:1540-1554`; `chat-types.ts:840-850`; decisions.md row 22 | yes |
| Ordinary CLI input/output split = full comparable contribution, no `≥`; `≥` only for a token-class omission or an opaque provider-only total (round 3 #2) | split as lower bound (contradicts F3/F4/F6/F7 and row 22) | `cli-usage.utils.ts:25-46`; `lane-stats.adapters.ts:99-112,152-166`; `task-description.md:128-137`; decisions.md row 22 | yes |
| Legacy `ok` snapshot without `pricingCoverage` uses finite reported `totalCost` incl. 0 (round 3 #3) | treat as missing | `rpc-session.types.ts:391-415`; `session-stats-view.ts:127-157,197-203` | yes |
| SDK `empty` snapshot classified per metric, cost never invented as $0 (Gate 2 R1) | blanket exact 0 / per-metric table | `session-usage-aggregator.ts:127-143,296-315` | yes |
| Rail plan-limit cue = session `indicatorFor(classifyLaneState)` (Gate 2 R5) | worst window / classified owner + windows | `lane-state.ts:314-355`, `plan-limit-tiles.ts:100-127,423-443` | yes |

## Follow-ups

- Backend orchestrator-only usage: a snapshot field with root-only tokens/cost, or per-subagent member
  ids with usage and a shared revision, would allow a real Orchestrator figure with subagents present.
- Backend session-usage ledger (follow-up task, decisions.md row 22): lifetime tokens/cost per
  session (surviving eviction, clears and app restarts) plus a created-in-this-run marker and
  subagent member ids, would make every `≥`/`~` mark provable instead of trusted.

## Gate 2 round 1 responses

Round 1 resolutions are folded into the components above; their status is recorded in
`implementation-plan-review.md` `## Recheck round 1`.

## Gate 2 round 2 responses

| R# | Plan section changed | Resolution |
| --- | --- | --- |
| R1 | Component 1 `sdkContribution` + seam; Decisions | Blanket `empty` shortcut removed; 7-row truth table (state x pricing x coverage); empty+complete = tokens exact 0, cost missing; empty+partial = `≥ 0`; genuine `totalCost: 0` = exact $0; fixtures per row |
| R2 | Component 2 rules + seam; Decisions; A11; Follow-ups | Overridden by the user (decisions.md row 22, "trust the data"): Orchestrator = snapshot minus SDK subagent rows, `~`; 0 subagents = snapshot with its own mark; `—` only for absent snapshot, negative result or a subagent row without usage. The unprovable membership R2 named is accepted (A11); the ledger follow-up makes it provable |
| R3 | Component 1 detectable-loss table + split validation + seam; Component 3 retained map + resumed latch + seam; Component 4 share bar; A9; Decisions; Follow-ups | Overridden by the user (decisions.md row 22): "always incomplete" removed; `≥` only on a detected loss (failed read, partial coverage, removed lane without retained usage, lane without usage, incomparable total, resumed session, missing price); removed lanes keep their usage while mounted; share bars show on exact/`~` totals; split fields validated; stale exact live numerator deleted |
| R4 | Component 6 R8 + rail focus + files; handoff | Static known duration via timer `durationMs`, independent of start; 0/null/absent -> `--:--` with R8.3 cause; focusable Time detail; canvas host records and restores the `data-rail-control` key, fallback expand control |
| R5 | Component 7 tone/rail cue; Decisions | Rail cue = existing `indicatorFor(classifyLaneState)` (owner evidence + windows, same precedence as dock); owner-only and stale-100% fixtures |
| R6 | Component 5 timer; handoff ordering/owners; Component 8 | `startedAt: PtahTimeInput \| null` (widened); defaults pinned; barrel after 2, cache API before 4, integration last; canvas host owned by 6; TASK files moved to the sibling addendum (B3) |

## Gate 2 round 3 responses

| Finding | Plan section changed | Resolution |
| --- | --- | --- |
| 1 (Serious) resumed marker | Component 1 detectable-loss table; Component 3 CLI lifetime + seam; A9; Decisions | `hasLiveSession` latch removed. `≥` only on an observed CLI gap after recovery (known lane reference with no usable value for the metric, or an explicit relevant recovery failure), per metric; no gap -> unmarked (row 22). Fixtures: history open with no CLI lanes -> unmarked; restored lane with usable data -> unmarked; identified lane still missing usage -> `≥` for that metric. A9 rewritten with the recovery-failure signal as an implementer check |
| 2 (Serious) CLI token rule vs fixtures | Component 1 token basis, loss table, seam; Component 4 share bar; A1; Decisions | Ordinary input/output split = included, comparable, no `≥` (basis uncertainty is not a detected gap); `≥` only for a token-class omission or an opaque provider-only total. Allowlist changes value composition only. F3/F4/F6/F7 declared normalized aggregation fixtures with ordinary splits; separate raw-adapter case with the empty allowlist (and `cliLaneStats` unchanged). Removed-lane row split into retained (mark unchanged) and missing (`≥`), per metric. Share-bar consequence cases added |
| 3 (Moderate) legacy SDK cost | Component 1 truth table row 8 + seam; Decisions | `ok` without `pricingCoverage` uses finite reported `totalCost` incl. 0, estimate flags kept, `≥` iff partial coverage, null -> missing; three legacy fixtures |
| Tail: traceability claim | Review finding traceability | Blanket closure claim replaced by a pointer to recheck round 2 statuses and this table |
| Tail: B2/B3 labels | Team-leader handoff | TASK section + spec -> addendum B3; reader + spec -> addendum B2 |
| Tail: Component 8 header binding | Component 8 files | Header "Answer" binding and integration fixture handed to Component 6 (owner of `session-inspector.component.{ts,html,spec}`) |
| Carry to implementation | Team-leader handoff "Implementer checks"; Component 1 row 4 copy | Items copied; partial-coverage copy made generic |
