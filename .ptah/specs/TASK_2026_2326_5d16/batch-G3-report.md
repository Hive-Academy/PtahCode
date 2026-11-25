# Group G3 Implementation Report (B06 + B07 + B08) — TASK_2026_2326_5d16

## Environment and skill notes

- Requested skill `resilient-nestjs-patterns` is not listed in the host skill catalogue; continuing without it using repository conventions and instruction files.
- No git commands executed.

---

## B06 — Bounded gather

### Files changed

- `libs/backend/lane-routing/src/lib/pipeline/route-deadline.ts` (new)
- `libs/backend/lane-routing/src/lib/pipeline/gather.ts` (modified)
- `libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts` (modified)
- `libs/backend/lane-routing/src/lib/pipeline/candidate-tools.ts` (modified)

### New exports with signatures

In `libs/backend/lane-routing/src/lib/pipeline/route-deadline.ts`:
- `export interface RouteDeadline { readonly deadlineAtMs: number; remainingMs(): number; }`
- `export type BudgetResult<T> = { readonly kind: 'ok'; readonly value: T } | { readonly kind: 'deadline' } | { readonly kind: 'error'; readonly error: unknown }`
- `export function createRouteDeadline(deadlineAtMs: number, now?: () => number): RouteDeadline`
- `export function capRouteDeadline(deadline: RouteDeadline, maxBudgetMs: number): RouteDeadline`
- `export async function withinBudget<T>(deadline: RouteDeadline, task: (signal: AbortSignal) => Promise<T>, onLateError?: (error: unknown) => void): Promise<BudgetResult<T>>`

In `libs/backend/lane-routing/src/lib/pipeline/candidate-tools.ts`:
- `export interface CandidatePoolSource { readonly lanes: readonly LaneCandidate[]; readonly roles: readonly string[]; readonly childSessionEligible?: boolean; }`
- `export interface CandidateToolsDetailedResult { readonly byPhase: ReadonlyMap<string, ReadonlyMap<string, readonly string[] | null>>; readonly timedOutPhases: readonly string[]; }`
- `export function candidatesForPhase(phase: GatePhase, gathered: CandidatePoolSource): RoutingCandidate[]`
- `export async function readCandidateToolsDetailed(phases: GatePhases, gathered: CandidatePoolSource, source: RouteCandidateSource, logger: LaneRoutingLogger, deadline?: RouteDeadline): Promise<CandidateToolsDetailedResult>`
- `readCandidateTools(..., deadline?: RouteDeadline)` (optional deadline parameter added)

In `libs/backend/lane-routing/src/lib/pipeline/gather.ts`:
- `LaneModelFacts.status?: ModelListStatus`
- `GatheredCall.nowMs?: number`, `GatheredCall.resolvedPhases?: GatePhases`, `GatheredCall.toolNamesByPhase?: ReadonlyMap<string, ReadonlyMap<string, readonly string[] | null>>`
- `gatherRouteCall` input accepts optional `deadline?: RouteDeadline`, `gatherBudgetMs?: number`, `phases?: GatePhases`, `phaseDefinitionReader?: PhaseDefinitionReader`

### Tests (`gather.spec.ts`, 10 tests)

- `route-deadline › returns deadline immediately without calling task when budget is exhausted`
- `route-deadline › caps a parent deadline to a smaller sub-budget`
- `route-deadline › aborts a hanging task on deadline and observes late rejections without throwing`
- `route-deadline › classifies abort-triggered rejection as deadline regardless of callback order`
- `gatherRouteCall › records a thrown child eligibility check as ineligible with a reason`
- `gatherRouteCall › prefers limitEvidence over legacy limits and never calls legacy limits when present`
- `gatherRouteCall › records per-lane model listing statuses (ok, timeout, error, empty, unregistered) without global line`
- `gatherRouteCall › bounds never-resolving ports, keeps completed siblings, and ignores late results`
- `gatherRouteCall › starts roles immediately so completed roles survive a rows timeout`
- `readCandidateTools › keeps completed candidate tools and degrades timed-out or failing reads to null`

### Check results

- Jest (`gather.spec.ts`, `route-decide.gate.spec.ts`, `route-decide.preflight.spec.ts`): **87 passed, 1 failed (88 total)** across 3 suites (`gather.spec.ts` 10/10 passed, `route-decide.preflight.spec.ts` passed).
  - Expected gate spec failure (not edited per scope): `route decide gate › keeps a fast model list when a sibling misses the budget` (`route-decide.gate.spec.ts:932`) asserts the old single global `'models unknown'` line; B06 intentionally replaces it with per-lane `models unknown for <lane> (timeout)`.
- `npx eslint` on all 4 B06 files: **0 errors, 0 warnings**.
- `ptah_get_diagnostics` on all 4 B06 files: **0 errors, 0 warnings**.
- Note: `npx tsc --noEmit -p libs/backend/lane-routing/tsconfig.lib.json` passed with 0 errors on the first run; a second run overlapped with an external concurrent edit to `scope/routing-rules-setting.ts` (outside write set) which settled cleanly immediately afterward.

### Deviations

- None. `candidatesForPhase` was extracted into `candidate-tools.ts` so `gather.ts` can gather candidate tools without introducing a circular import with `phase-plan.ts`.

---

## B07 — Plan and model options

### Files changed

- `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts` (modified)
- `libs/backend/lane-routing/src/lib/pipeline/phase-resolve.ts` (modified)
- `libs/backend/lane-routing/src/lib/pipeline/model-refine.ts` (modified)
- `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts` (modified)
- `libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts` (modified)
- `libs/backend/lane-routing/src/lib/pipeline/live-model-options.spec.ts` (modified)

### New exports with signatures

In `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts`:
- `export const BUILTIN_VISUAL_DESIGN_OVERRIDE_LABEL = 'builtin design/visual-review subagent'`
- `export interface RoutingRulesInput { readonly rules: readonly RoutingRule[]; readonly diagnostics?: readonly string[]; }`
- `export interface LaneOfferDisposition { readonly candidateId: string; readonly inBand: boolean; readonly offered: boolean; readonly prunedCause?: PrunedCause; }`
- `export function effectiveTotal(scored: CandidateScore): number`
- `export function computeLaneOfferDispositions(plan: PhasePlan, outcome?: ModelRequestOutcome | null): ReadonlyMap<string, LaneOfferDisposition>`
- `PhasePlan` optional fields added: `inventory`, `rankedByTotal`, `matchedRule`, `policyRuleNote`, `ruleDiagnostics`
- `ScoredCandidate.preferenceRank?: number`, `ChosenResolution.modelRefined?: boolean`
- `planRoutePhases(..., routingRules?: RoutingRulesInput)` (optional 10th parameter)

In `libs/backend/lane-routing/src/lib/pipeline/model-refine.ts`:
- `ModelRequestOutcome.optionCapOffered?: ReadonlyMap<string, readonly DecisionOption[]>`
- `ModelRequestOutcome.prunedLanes?: ReadonlyMap<string, ReadonlyMap<string, PrunedCause>>`

### Tests

Added in `phase-plan.spec.ts` (21 tests total):
- `B07 additive totals, routing rules, AM3 override, and AM4 model refinement › uses additive total for the model-offer band so preferred or confirmed-room picks are not dropped (finding #3)`
- `B07 additive totals, routing rules, AM3 override, and AM4 model refinement › expresses AM3 builtin design/visual-review override as named part reaching total 100 and yields to a rule or pin`
- `B07 additive totals, routing rules, AM3 override, and AM4 model refinement › applies routing rule prefer, exclude, tier clamp, effort override, and emits unknown/ambiguous diagnostics`
- `B07 additive totals, routing rules, AM3 override, and AM4 model refinement › retains full inventory and ranked totals on pinned phases and lets pin beat user exclusion and tier clamp`
- `B07 additive totals, routing rules, AM3 override, and AM4 model refinement › records AM4 model refinement when the model picks another offered executor and preserves deadline fallback on alternates-only phases`

Added in `model-refine.spec.ts` (11 tests total):
- `runLaneRequest outcome figures › tracks optionCapOffered and distinguishes option-cap, payload-fit, and below-band without pruning lanes on alternate drops`

Added in `live-model-options.spec.ts` (8 tests total):
- `scores alternate models with the lane preference boost and limit adjustment`

### Check results

- Jest (`phase-plan.spec.ts`, `model-refine.spec.ts`, `live-model-options.spec.ts`, `route-decide.gate.spec.ts`, `route-decide.preflight.spec.ts`): **118 passed, 1 failed (119 total)** across 5 suites (all 3 B07 specs and `route-decide.preflight.spec.ts` passed; only the expected B06 gate-spec failure at `route-decide.gate.spec.ts:932` for the old global `'models unknown'` line).
- `npx tsc --noEmit -p libs/backend/lane-routing/tsconfig.lib.json`: **0 errors**.
- `npx eslint` on all 6 B07 files: **0 errors, 1 warning** (`max-lines` on `phase-plan.ts`, 722 vs 700; compacted below 700 in the follow-up edit).
- `ptah_get_diagnostics` on all 6 B07 files: **0 errors, 0 warnings** in requested files.

### Deviations

- Fixed two legacy test matrix fixtures in `phase-plan.spec.ts` (`live-three` score 54 and `low-*` score 40) that previously returned `cell: { kind: 'unknown' }` with non-neutral `score`; updated them to `cell: { kind: 'value', source: 'seed', ... }` so `scoreResolvedCell` evaluates their real scores without weakening any assertion.

---

## B08 — Trace and reasons

### Files changed

- `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts` (modified)
- `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.spec.ts` (modified)
- `libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts` (modified)
- `libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts` (modified)

### New exports with signatures

In `libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts`:
- `export type DecidingFactor = 'score' | 'pin' | 'rotation' | 'tie-break' | 'model refinement' | \`rule ${string}\``
- `export interface ExplanationAlternative { readonly id: string; readonly displayName: string; readonly total: number; readonly parts?: ScoreParts; }`
- `export interface PreferenceLossNote { readonly candidateDisplayName: string; readonly candidateTotal: number; readonly boost: number; }`
- `export interface ChosenExplanationInput { ... }`
- `export interface UnavailableExplanationInput { ... }`
- `export function formatScoreParts(parts: ScoreParts): string`
- `export function formatLimitAge(readAt: number | null | undefined, nowMs: number | undefined): string`
- `export function compileChosenExplanation(input: ChosenExplanationInput): string`
- `export function compileUnavailableExplanation(input: UnavailableExplanationInput): string`
- `GateReasonInput.extraReasons?: readonly string[]` (optional deduplicated aggregate diagnostics; suppresses generic `'models unknown'` when per-lane `'models unknown for '` detail is present)

### Tests

`assemble-gate.spec.ts` (5 tests total):
- `names the excluded capability`
- `uses the typed reason when an exclusion has no capability name`
- `assembleGateResult trace and explanations › orders candidates chosen -> excluded (hard/user & pruned with cause) -> ranked and validates schema`
- `assembleGateResult trace and explanations › produces ranking-only trace with preference loss, rotation, pin, and AM3 override explanations`
- `assembleGateResult trace and explanations › retains synthetic not-listed legacy exclusion and ranked inventory on pin-unavailable rows`

Added in `compile-reasons.spec.ts` (4 new tests in `B08 one-sentence explanations and per-lane reason deduplication`):
- `formats limit age cleanly and renders age unknown when timestamp is absent`
- `renders a chosen one-sentence explanation with parts, signed gap, deciding factor, preference diagnostics, policy rule note, and limit age`
- `renders an unavailable one-sentence explanation naming the blocking constraint`
- `removes generic models unknown when per-lane model status is supplied and deduplicates extraReasons`

### Sample explanation sentences (from `compile-reasons.spec.ts`)

1. Chosen row with routing rule, preference override, policy clamp, and fresh limit evidence:
   > `Selected Kimi Code (kimi-cli) (model kimi-k2) with total 87 [prior 70 (seed), learned +5 (exploration +5, n=0), preference +12, limit +0] over runner-up codex at total 85 [prior 80 (seed), learned +5 (exploration +5, n=0), preference +0, limit +0] (gap +2), decided by rule ui-review, preferences from rule (overridden: call, configured, Kimi Code->kimi-cli via displayName (#1)), policy R3 shape=logic weight>=8000, sonnet/xhigh after rule ui-review capped tier opus->sonnet, limit confirmed-room (age 30s).`
2. Unavailable row naming the blocking constraint:
   > `Phase review is unavailable due to blocking constraint reviewer-family (disclosed fallback required, excluded: codex by reviewer-family), policy R2 kind=review weight omitted, opus/high.`

### Check results

- Jest (`assemble-gate.spec.ts`, `compile-reasons.spec.ts`, `route-decide.gate.spec.ts`, `route-decide.preflight.spec.ts`): **158 passed, 1 failed (159 total)** across 4 suites (`assemble-gate.spec.ts` 5/5 passed, `compile-reasons.spec.ts` passed, `route-decide.preflight.spec.ts` passed).
- Combined G3 Jest run across all 6 changed specs + `route-decide.gate.spec.ts` + `route-decide.preflight.spec.ts`: **209 passed, 1 failed (210 total)** across 8 suites.
  - Expected gate spec failure (not edited per scope): `route decide gate › keeps a fast model list when a sibling misses the budget` (`route-decide.gate.spec.ts:932`) expects the old single global `'models unknown'` string; B06/B08 intentionally emits per-lane `models unknown for <lane> (timeout)` and removes the generic `'models unknown'` line when per-lane detail is available.
- `npx tsc --noEmit -p libs/backend/lane-routing/tsconfig.lib.json`: **0 errors**.
- `npx eslint` across all 14 changed G3 files: **0 errors, 0 warnings**.
- `ptah_get_diagnostics` across all 14 changed G3 files: **0 errors, 0 warnings** in requested files. (Note: `ptah_get_diagnostics` reported 4 TypeScript parse errors in sibling file `scope/routing-rules-setting.spec.ts:314-316`, outside G3's write set.)

### Deviations

- Legacy `withPolicyReason` in `assemble-gate.ts` retains its exact existing legacy format (`; policy R...; tier ..., effort ..., shape ..., weight ...`) on `entry.reason` so all existing legacy reason regex checks pass, while `entry.explanation` renders the rich policy condition and rule tier/effort note (`R3 shape=logic weight>=8000, sonnet/xhigh after rule ...`).

---

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Keep `LaneModelFacts.status` and new `GatheredCall`/`PhasePlan`/`ModelRequestOutcome` fields optional on types while always populated by producers | (a) Required fields (breaks legacy test fixtures in other specs); (b) Optional on structural types, always emitted by `gatherRouteCall`, `planRoutePhases`, `runLaneRequest` | Prompt scope rule ("Every new parameter or field optional so other callers compile") and existing fixtures in `phase-plan.spec.ts` / `live-model-options.spec.ts` | Yes |
| Extract `candidatesForPhase` into `candidate-tools.ts` and delegate from `phase-plan.ts` | (a) Have `gather.ts` import `candidatesFor` from `phase-plan.ts` (circular dependency); (b) Pure helper in `candidate-tools.ts` with no import on `phase-plan.ts` | Keeps clean acyclic dependency graph `route-deadline -> candidate-tools -> gather -> phase-plan` | Yes |
| Keep `PhasePlan.policy` clean (`tier`, `effort`, `ruleId`, `condition`) and store `matchedRule`, `policyRuleNote`, `ruleDiagnostics` as separate optional fields on `PhasePlan` | (a) Embed `note: null` on `PhasePlan.policy` (breaks exact `.toEqual` assertions in `phase-plan.spec.ts`); (b) Separate fields on `PhasePlan` | Preserves all existing `phase-plan.spec.ts` assertions without weakening them | Yes |
| Suppress AM3 builtin design/visual-review override whenever a routing rule matches or a pin is accepted (`!constraint.pinAccepted && matchedRule === undefined`) | (a) Only suppress when rule sets `prefer`/`exclude`; (b) Suppress for any matching rule or accepted pin | AM3 & B07 brief: "A matching rule or pin still wins over it" | Yes |
| Keep missing pin target (`not-listed`) as a synthetic legacy exclusion only (not in `roster[i].candidates`), while scoring non-excluded inventory candidates on `pin-unavailable` | (a) Synthesize a fake candidate entry in `candidates`; (b) Keep `not-listed` in `excluded`/`excludedBy` and keep `candidates` strictly to real inventory candidates | Component 3: "A missing pin target stays a synthetic legacy exclusion" and B08: "every candidate exactly once" | Yes |

## Open questions

1. **Out-of-scope sibling file note:** `ptah_get_diagnostics` observed 4 syntax errors in `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.spec.ts:314-316` (outside G3 write set, untouched by G3). Coordinator should confirm G2's spec file is clean before merging.
2. **Expected gate spec update for B09:** `libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts:930-932` (`keeps a fast model list when a sibling misses the budget`) should be updated in B09 to assert per-lane `models unknown for <lane> (timeout)` instead of the removed global `'models unknown'` line.

## Handoff to B09/B10

- **B09 (`route-decide.service.ts`, `di/register.ts`, `decision-model/decision-caller.ts`, gate/preflight specs):**
  - Create one monotonic `RouteDeadline` via `createRouteDeadline(now() + ROUTE_DEADLINE_MS[stage], monotonicNow)` (or forward caller's `context.deadlineAtMs`).
  - Pass `deadline`, `phases: args.phases`, and `phaseDefinitionReader: this.deps.phaseDefinitionReader` into `gatherRouteCall(...)`. `gatherRouteCall` caps gather to `GATHER_BUDGET_MS` (2000 ms), starts `rows`, `roles`, and `phaseDefinitions` immediately in parallel, consumes `limitEvidence(rows)` when present, populates per-lane `LaneModelFacts.status`, captures wall-clock `nowMs`, and returns `resolvedPhases` and `toolNamesByPhase`.
  - Read `RoutingRulesSetting.read()` once per gate call and pass `{ rules, diagnostics }` as the 10th argument (`routingRules`) to both `planRoutePhases` passes.
  - Use `withinBudget` for decision-caller opening and pre-flight/gate dispatch passes; `resolvePhase` already preserves `fallbackCause: 'deadline'` even on alternates-only phases.
  - Update `route-decide.gate.spec.ts:930-932` for per-lane `models unknown for <lane> (timeout)`.
- **B10 (`route-namespace.builder.ts`, `route-tool-handlers.ts`):**
  - Implement optional `limitEvidence(rows)` on `RouteCandidateSource` returning `ReadonlyMap<string, LimitEvidence> | null`; `gatherRouteCall` automatically prefers it over legacy `limits(rows)` and propagates `limitEvidence` to `LaneCandidate`, `CandidateTrace.limitEvidence`, and explanation freshness age.
  - Implement result-size compaction on the assembled `GateResult` using `candidates`, `explanation`, and `traceOmitted` (not implemented in G3).
