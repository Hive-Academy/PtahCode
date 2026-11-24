# Batch G2 Report (B05a + B05b) — TASK_2026_2326_5d16

## Environment and tool notes

- Requested skill `nx-workspace-architect` is not listed in this host's available skill catalogue; work proceeded using repository conventions and instruction files (`CLAUDE.md`, `implementation-plan.md`).
- `ptah_code_search_symbols` had an updating/incomplete index (`analyzed: 100, unchecked: 4718`) and `ptah_search_files` returned 0 hits for `.ptah/specs/...`; fallback used scoped `grep -rn` and `ls`.
- No git commands were executed. No usage or quota limits were hit.

---

## B05a — Rules reader and policy condition

### Files changed

- `libs/shared/src/lib/types/rpc/rpc-agents.types.ts` (modified)
- `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts` (new)
- `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.spec.ts` (new)
- `libs/backend/lane-routing/src/lib/pipeline/tier-effort-policy.ts` (modified)
- `libs/backend/lane-routing/src/lib/pipeline/tier-effort-policy.spec.ts` (modified)

### New exports with signatures

In `libs/shared/src/lib/types/rpc/rpc-agents.types.ts` (re-exported via `@ptah-extension/shared`):

- `export const ROUTING_RULES_SETTING_KEY = 'agentOrchestration.routingRules'`
- `export type RoutingRuleMatchValue<T> = T | readonly T[]`
- `export type RoutingRulePhaseShape = 'mechanical' | 'logic' | 'contract' | 'test' | 'docs' | 'review'`
- `export interface RoutingRuleMatch { readonly kind?: RoutingRuleMatchValue<PhaseKind>; readonly shape?: RoutingRuleMatchValue<RoutingRulePhaseShape>; readonly taskType?: RoutingRuleMatchValue<TaskType>; readonly role?: RoutingRuleMatchValue<string>; }`
- `export interface RoutingRuleSet { readonly minTier?: ProviderModelTier; readonly maxTier?: ProviderModelTier; readonly effort?: EffortLevel; readonly prefer?: readonly string[]; readonly exclude?: readonly string[]; }`
- `export interface RoutingRule { readonly id: string; readonly match: RoutingRuleMatch; readonly set: RoutingRuleSet; }`

In `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts`:

- `export const MAX_ROUTING_RULES = 64`
- `export const MAX_ROUTING_RULE_SELECTORS = 32`
- `export interface RoutingRulesReadResult { readonly rules: RoutingRule[]; readonly diagnostics: string[]; }`
- `export interface RoutingRuleMatchPhase { readonly kind: PhaseKind; readonly shape?: PhaseShape; readonly role?: string; }`
- `export function readRoutingRules(raw: unknown): RoutingRulesReadResult`
- `export function matchRoutingRule(phase: RoutingRuleMatchPhase, taskType: TaskType, rules: readonly RoutingRule[]): RoutingRule | undefined`
- `export class RoutingRulesSetting { constructor(workspace: IWorkspaceProvider, logger: LaneRoutingLogger); read(): RoutingRulesReadResult; }`

In `libs/backend/lane-routing/src/lib/pipeline/tier-effort-policy.ts`:

- `export interface PhasePolicy { readonly tier: ModelTier; readonly effort: ModelEffort; readonly ruleId: 'R1' | 'R2' | 'R3' | 'R4' | 'R5'; readonly condition?: string; }`
- `export interface ResolvedPhasePolicy extends PhasePolicy { readonly condition: string; }`
- `export interface AppliedRoutingRulePolicy extends PhasePolicy { readonly appliedRuleId?: string; readonly note: string | null; }`
- `export function policyForPhase(kind: PhaseKind, shape?: PhaseShape, weight?: number): ResolvedPhasePolicy`
- `export function applyRoutingRule(policy: PhasePolicy, rule?: RoutingRule): AppliedRoutingRulePolicy`

### Tests

`libs/backend/lane-routing/src/lib/scope/routing-rules-setting.spec.ts` (16 tests):
- `returns zero rules and zero diagnostics when the setting is undefined`
- `returns zero rules and one diagnostic for a non-array value (%p)` (5 cases: `null`, `'invalid'`, `42`, `true`, `{ id: 'not-array' }`)
- `drops and reports an invalid sibling rule while loading valid siblings in order`
- `keeps the first rule on duplicate ids and reports later duplicates`
- `reports and drops a rule whose minTier is above maxTier`
- `drops rules with invalid ids, empty match arrays, or blank selectors without echoing unsafe text`
- `caps the rule list at 64 entries and reports truncation once`
- `combines match fields with AND across fields and OR inside an array field`
- `picks the first matching rule when multiple rules match`
- `matches every phase with an empty match object and returns undefined when no rule matches`
- `reads and validates rules from ptah.agentOrchestration.routingRules`
- `returns zero rules and one diagnostic without throwing when configuration read fails`

`libs/backend/lane-routing/src/lib/pipeline/tier-effort-policy.spec.ts` (30 tests):
- `uses R1 and reports condition for %s across omitted, 7999, and 8000` (3 cases: `plan`, `architecture`, `batch`)
- `uses R2 and reports condition for %s across omitted, 7999, and 8000` (4 cases: `review`, `document-review`, `visual-review`, `completion`)
- `uses R3 and reports condition for %s across omitted, 7999, and 8000` (2 cases: `logic`, `contract`)
- `uses R4 buckets and reports condition for %s across omitted, 3999/4000, and 11999/12000` (3 cases: `mechanical`, `test`, `docs`)
- `uses R5 and reports condition for absent shape and review shape across omitted, 7999, and 8000`
- `keeps the legacy default for %s` (12 cases across `PHASE_KINDS`)
- `never emits max`
- `clamps tier up when minTier is above the policy tier`
- `clamps tier down when maxTier is below the policy tier`
- `replaces effort independently and alongside tier clamping`
- `returns null note when no rule is given or when the rule leaves tier and effort unchanged`

### Check results

- Jest (`routing-rules-setting.spec.ts` + `tier-effort-policy.spec.ts`): **2/2 suites passed, 46/46 tests passed**.
- `npx tsc --noEmit -p libs/shared/tsconfig.lib.json`: **0 errors**.
- `npx eslint` on all 5 B05a files: **0 errors, 0 warnings**.
- `ptah_get_diagnostics` on B05a files: **0 errors, 0 warnings** in requested files.

### Deviations

- `PhasePolicy.condition` is optional on the `PhasePolicy` interface (`condition?: string`) while `policyForPhase` returns `ResolvedPhasePolicy` with required `condition: string`. This honors the write-set rule ("Every new field on an existing type must be optional so all current callers still compile") so existing literal `PhasePolicy` fixtures in `compile-reasons.spec.ts` (outside write set) continue to compile. Note: `pipeline/phase-plan.spec.ts` (owned by B07, outside write set) has three strict `.toEqual({ tier, effort, ruleId })` assertions on `phase.policy` that will need updating when B07 integrates `condition`.
- `RoutingRulePhaseShape` mirrors the existing `PHASE_SHAPES` literal union in `libs/shared` because `libs/shared` cannot import from `@ptah-extension/lane-routing` and `route-decide-args.schema.ts` is outside the write set.

---

## B05b — Rule exclusion in hard constraints

### Files changed

- `libs/backend/lane-routing/src/lib/ranking/hard-constraints.ts` (modified)
- `libs/backend/lane-routing/src/lib/ranking/hard-constraints.spec.ts` (modified)

### New exports with signatures

In `libs/backend/lane-routing/src/lib/ranking/hard-constraints.ts`:

- `export type ExclusionRule = (typeof EXCLUSION_RULES)[number] | UserRuleExclusion` (widened from `(typeof EXCLUSION_RULES)[number]`)
- `ConstrainPhaseInput.userExclusions?: ReadonlyMap<string, UserRuleExclusion>` (optional input field added)
- `UnavailablePhase.pinRule: HardConstraintRule | null` (tightened from `ExclusionRule | null`; pins can only fail hard constraints or `not-listed`, never user exclusions)

### Tests

`libs/backend/lane-routing/src/lib/ranking/hard-constraints.spec.ts` (39 tests total; 34 existing + 5 new):
- `excludes a user-excluded candidate with its user-rule tag and keeps remaining candidates`
- `lets a pin beat a user exclusion while keeping user exclusions on non-pinned candidates`
- `lets at-limit beat both a pin and a user exclusion without duplicating the exclusion`
- `uses the existing unavailable path when every candidate is excluded by user rules`
- `keeps the reviewer-family fallback cause when the other family is user-excluded`

### Check results

- Combined Jest (`routing-rules-setting.spec.ts`, `tier-effort-policy.spec.ts`, `hard-constraints.spec.ts`): **3/3 suites passed, 85/85 tests passed** (`JEST_RC=0`).
- `npx tsc --noEmit -p libs/shared/tsconfig.lib.json`: **0 errors** (`TSC_SHARED_RC=0`).
- `npx eslint` on all 7 changed files: **0 errors, 0 warnings** (`ESLINT_RC=0`).
- `npx tsc --noEmit -p libs/backend/lane-routing/tsconfig.lib.json`: **2 errors in sibling file outside write set** (`TSC_LR_RC=2`):
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts(153,5): error TS2322` (`CandidateExclusion[]` -> `CandidateRuleFact[]`)
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts(219,9): error TS2322` (`ExclusionRule` -> `compile-reasons.ts`'s `ExclusionRule`)
  - Root cause: `libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts:66` (owned by B08, outside this lane's write set) still defines `export type ExclusionRule = (typeof EXCLUSION_RULES)[number]` without `| UserRuleExclusion`, whereas `route-decide-result.schema.ts` already accepts `UserRuleExclusion` and `compile-reasons.ts` already handles it at runtime.
  - All 7 files in G2's write set have **0 TypeScript errors**.

### Deviations

- Kept `libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts` untouched to strictly respect the write-set boundary (`do not touch other files`), and reported the 1-line `ExclusionRule` seam to the parent session via `ptah_agent_report`.

---

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Keep `PhasePolicy.condition` optional on `PhasePolicy` and required on `ResolvedPhasePolicy` returned by `policyForPhase` | (a) Required on `PhasePolicy` (breaks `compile-reasons.spec.ts` outside write set); (b) Optional on `PhasePolicy`, required on `ResolvedPhasePolicy` | Prompt write-set rule ("Every new field on an existing type must be optional so all current callers still compile") and `compile-reasons.spec.ts:453,610` | Yes — make required once B08 updates `compile-reasons.spec.ts` |
| Define `RoutingRulePhaseShape` in `rpc-agents.types.ts` mirroring `PHASE_SHAPES`, reusing existing `PhaseKind`, `TaskType`, `ProviderModelTier`, and `EffortLevel` from `libs/shared` | (a) Move `PHASE_SHAPES` to `libs/shared` (touches `route-decide-args.schema.ts` outside write set); (b) Mirror the exact literal union in `rpc-agents.types.ts` and validate with `PhaseShapeSchema` in `lane-routing` | `libs/shared` cannot import `@ptah-extension/lane-routing`; write set forbids editing `route-decide-args.schema.ts` | Yes — deduplicate in a later shared refactor if desired |
| Tighten `UnavailablePhase.pinRule` to `HardConstraintRule \| null` | (a) Widen `pinRule` to include `UserRuleExclusion`; (b) Narrow to `HardConstraintRule \| null` | Pins beat user exclusions, so a pin can only fail hard constraints or `not-listed`; also avoids an unnecessary TS error at `assemble-gate.ts:154` | Yes |
| Do not edit `compile-reasons.ts` outside the G2 write set | (a) Edit `compile-reasons.ts:66` outside write set; (b) Leave untouched and escalate the 1-line widening to the coordinator | Prompt explicitly states "Scope (write set; nothing else) ... do not touch other files" | Yes — coordinator or B08 can apply the 1-line widening |

## Open questions

1. **Coordinator action needed for `tsc --noEmit -p libs/backend/lane-routing/tsconfig.lib.json`:** Authorize or apply the 1-line widening in `libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts:66` (`export type ExclusionRule = (typeof EXCLUSION_RULES)[number] | UserRuleExclusion;`) to clear the 2 TS2322 errors in `assemble-gate.ts:153,219` (reported to parent via `ptah_agent_report`), or carry them into G3/B08.
2. **Downstream B07 note:** `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts` lines 596, 620, and 643 assert exact `.toEqual({ tier, effort, ruleId })` on `phase.policy`; B07 will update those assertions to include `condition` (or use `toMatchObject`).
