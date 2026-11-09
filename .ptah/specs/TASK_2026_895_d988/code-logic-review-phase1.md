# Code Logic Review, Phase 1 (batch-aware tier/effort routing)

## Verdict
**APPROVED**, score **8/10**. There are no Blocking or Serious findings.

Evidence for 8 rather than 9: the policy, schema, roster and pin logic all match the requirement. Three Moderate/Minor items remain: an untested `haiku` subagent alias, an id lookup that repeats work and bypasses the draft's own phase, and boundary tests I did not confirm.

Scope: I read the diff `main...HEAD` for the six focus files, plus `phase-plan.ts` `scoreCandidate`/`applyPinModel` in full. I did not run `npm run verify` or `ptah_get_diagnostics`. Findings come from reading the code and from targeted `git grep` of consumers.

### Five logic questions
1. **Does legacy input parse and route as before?** Yes. `shape` and `weight` are optional on a `.strict()` schema. With no `shape` or `weight`, `policyForPhase` returns:
   - plan/architecture/review/document-review → opus (same as the old `tierFor`);
   - everything else → sonnet (R5, middle bucket, the same as before);
   - `visual-review` → opus (intended change, R2).
2. **Boundaries.**
   - `>= 8000` for xhigh/opus is correct.
   - `< 4000` for haiku and `>= 12000` for opus are correct, and 4000 to 11999 gives sonnet/medium.
   - `weight: 0` is not conflated with undefined, because every check uses `!== undefined`. So 0 gives haiku in R4 and sonnet in R3/R5.
   - No rule emits `max`.
3. **Failure injection.**
   - The new `throw` in `rosterFrom` is unreachable on schema-valid input. `superRefine` rejects duplicate phase ids (`route-decide-args.schema.ts:82`), and `planRoutePhases` emits one draft per phase.
   - The error is a plain `Error`, the same class as the existing coverage throw next to it.
4. **Tier and effort source.** Both come from `draft.plan.policy`, which is set at every `PhasePlan` construction site (both the early `ranked: []` blocked path and the ranked path in `phase-plan.ts`). No roster row is built without them.
5. **Requirements gaps.**
   - Shape `review` on a non-review kind falls to R5. This matches the spec, because R3 and R4 do not list it.
   - R1 and R2 ignore shape.
   - Both are spec-conformant but may surprise callers.

## Findings

1. **Moderate** `phase-plan.ts:291`, `tier-effort-policy.ts:29`. The subagent candidate's configured model alias is now `haiku` for light R4 phases. `seed-matrix.ts:24` records that the subagent lane lists only `opus` and `sonnet`.
   - Scenario: a subagent is chosen with `model: "haiku"` and `provenance: "tier"`. `matrix.resolve` for an unlisted model probably returns `noProfile`, so the score may sit below a sonnet profile for the same candidate.
   - Separately, `applyPinModel` now treats `pin.model === "haiku"` as a `tierPin` for subagents, which previously fell through as an unlisted pin that was ignored.
   - Impact: ranking behaviour changes for haiku-tier phases, and a haiku pin newly takes effect. This is arguably intended, but nothing tests it.
   - Fix: add a `phase-plan` spec for a subagent with a haiku tier. It should assert the roster `model`, the `provenance`, and a haiku pin. Confirm that the Claude subagent runtime accepts `haiku`.

2. **Minor** `assemble-gate.ts:252`. `args.phases.find` looks the phase up by id for every draft, which is O(n²), and it ignores that drafts are built in phase order.
   - It is safe because duplicate ids are rejected at the schema. A caller that bypasses the schema, such as a direct unit call, would silently take the first phase's shape and weight for a duplicate id.
   - Fix: index by position (`args.phases[i]`), or carry `shape` and `weight` on `PhasePlan`. The second option also removes the throw.

3. **Minor** `assemble-gate.ts:288`. `withPolicyReason` prints `weight 0` for 0 and `unset` for omitted, which is correct. If the reason text is later parsed or truncated, the suffix is appended after `withOnlyEligible`. The ordering is correct per spec. `reason` has no max length in the schema (`route-decide-result.schema.ts:127`, `:164`), so there is no overflow risk. The 64k result cap is unaffected.

4. **Minor** `route-tools.ts:118`. The description says tier and effort are "advisory for CLI lanes", but for subagent rows the tier is also the model alias that gets used. Reword to say so, so callers do not assume the model field is independent of the tier for subagents.

## Consumers checked
- `RouteDecideResult` and `PreflightResult` are used in `rpc-handlers/.../host-routing/*`. These are preflight and type-only in the specs, and none constructs `ChosenEntry` or `UnavailableEntry`. There is no break from the new required fields.
- No consumer of `ChosenEntry` or `UnavailableEntry` exists outside `lane-routing` in `libs` or `apps`. `apps/ptah-electron` only wires `LANE_ROUTING_TOKENS` and registration (`phase-2-libraries.ts`, `expected-resolvable.ts`, `container.smoke.spec.ts`). No change is needed there.
- `agent-sdk/.../structured-decision.adapter.ts` consumes only `StructuredDecisionRequest`. The diff does not touch decision-payload construction, and the policy tier is not added to the decision options. So System One still receives no free-form model ids.
- A text search for `haiku` in `lane-routing` finds no consumer that assumes a two-tier set. The old `tierFor` had no external callers.

## Test gaps
- No test pins the subagent model alias or provenance for `haiku` or `opus` through `scoreCandidate` for non-plan kinds (finding 1).
- No test asserts that a legacy call with no shape or weight produces a roster identical to the pre-change golden, apart from `visual-review`. The existing gate specs may cover this partly, but I did not confirm.
- Boundary tests are worth confirming in `tier-effort-policy.spec.ts`: weights 0, 3999, 4000, 11999, 12000, 7999 and 8000, for each of R3, R4 and R5.
- No test covers `shape: 'review'` on a non-review kind (R5 fall-through).
- No test covers an unavailable or blocked phase carrying the policy suffix with `shape` and `weight` set.
