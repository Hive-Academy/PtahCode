# Final Code Logic Review — TASK_2026_2326_5d16

- **Verdict:** REVISE
- **Score:** 7/10
- **Reviewed head:** `9e1461e07`
- **Scope:** Full non-spec diff `main...HEAD`, with focus on G3 round 2 and the router documentation.
- **Review mode:** Read-only static review. No source file was changed.

## Finding counts

These counts cover new findings from this review. They do not repeat the open G4b findings.

| Severity | Count |
| --- | ---: |
| Blocking | 0 |
| Serious | 0 |
| Moderate | 1 |
| Minor | 3 |

The G3 round-2 gather, override, phase-resolution, and diagnostic-identity fixes work on the reviewed paths. The D7 protected files are unchanged. The branch still needs the new deadline fix, the D16 schema constraint, and documentation corrections. The four Moderate and one Minor G4b findings also remain open at this head and are scheduled for the next fix round.

## New findings

### 1. [Moderate] The hard route deadline does not cover MCP result compaction

- **Evidence:** `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.ts:210-219` creates the absolute deadline and waits for `route.decide`. Lines 137-188 then run full serialization, repeated token estimates, candidate removal, and explanation compaction without consulting that deadline. `ROUTE_RETURN_RESERVE_MS` only bounds work inside `RouteDecideService`.
- **Scenario:** A gate call can return from the service near its 8-second deadline with a dense 100-phase result. The handler can then perform up to thirteen full-result serialization and token-check attempts. The tool returns after the documented hard deadline. The 250 ms return reserve does not bound this work.
- **Why it matters:** The branch promises an 8-second gate deadline and a 4-second pre-flight deadline. A deterministic ranking result can still miss that deadline during the return path. The implementation plan also requires bounded serialization work.
- **Concrete fix:** Pass the absolute deadline into `compactRouteResult`. Check the remaining time before compaction and between serialization attempts. Use the smallest schema-valid representation when the reserve expires. Keep the existing overflow error when even the legacy shape exceeds the output budget. Add a handler spec that advances the injected clock during compaction and proves that repeated attempts stop at the deadline.

### 2. [Minor] Aggregate diagnostic packing can exceed its 4,000-character bound at an omission-digit boundary

- **Evidence:** `libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts:851-865` reserves space for `omittedIfEmitted`, which excludes the current line. When the current line does not fit, lines 864-870 emit a count that includes the current line. The actual omitted count is therefore one greater than the count used for the reservation.
- **Scenario:** At a `9` to `10`, `99` to `100`, or similar boundary, the actual omission marker is one character longer than the reserved marker. A suitable sequence of valid bounded diagnostic lines can make the emitted aggregate 4,001 characters instead of at most 4,000.
- **Why it matters:** The round-2 fix intends a strict aggregate bound. The boundary case reopens a small unbounded path in dense diagnostic output. It also makes the omission-count proof depend on digit length.
- **Concrete fix:** Reserve for the actual stop count, `omittedIfEmitted + 1`, when testing a line. Alternatively, remove emitted lines until the actual omission marker fits, and add those lines to the omitted count. Add specs for the `9` to `10` and `99` to `100` transitions with an exact 4,000-character fill.

### 3. [Minor] D16 is not implemented: `overrideLabel` still accepts an empty string

- **Evidence:** `libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts:111` uses `z.string().max(120).optional()` without `.min(1)`. `libs/backend/lane-routing/src/lib/ranking/spread.ts:152` copies the supplied label directly into result parts.
- **Why it matters:** D16 explicitly defers this contract fix to the final review round. An empty label is not a named override, which weakens the explainability contract.
- **Concrete fix:** Change the field to `z.string().min(1).max(120).optional()`. Add a contract spec that rejects `overrideLabel: ''` and retains the valid built-in label.

### 4. [Minor] Several router documentation statements and the chosen-row example do not match the producer

- **Evidence:** `apps/ptah-docs/src/content/docs/agents/agent-orchestration.md:76` omits the optional `override` part from the total equation, although `ranking/score.ts:234` includes it. Line 87 states one model-promotion rule for every lane, but `ranking/score.ts:129-132` disables promotion for system CLI lanes and `pipeline/phase-plan.ts:445-483` offers in-band reported models as alternates. Line 115 says `decided by ranking`, but `pipeline/assemble-gate.ts:492-520` cannot emit that deciding factor; this example takes `score`. The same example pairs plain policy `R2` with `sonnet`, while `pipeline/tier-effort-policy.ts:53-75` gives `R2` an `opus` tier unless a named routing rule changes it.
- **Additional evidence:** Lines 158 and 172 describe `model-cold` only as a confirmed not-loaded probe. `route-decide.service.ts:425-450` also returns `model-cold` for probe failure, timeout, an HTTP error, or an invalid base URL, and only for a local daemon target. Line 168 defines `payload-too-large` only at two options, but `pipeline/model-refine.ts:253-255` also emits it for a fixed-criteria request with no lane options. The new skill text says that compaction keeps the chosen and best alternative before shortening explanations, but `route-tool-handlers.ts:151-171` can remove those candidates before explanation shortening.
- **Why it matters:** This section is the public explanation of the router. The example cannot be produced as written, and the model-selection and fallback rules are too broad.
- **Concrete fix:** Add the optional override to the equation. Scope the promotion rule to non-system-CLI lanes and describe system CLI alternates. Change the example to `decided by score` and use `opus`, or include the routing-rule context for `sonnet`. Describe unknown and failed residency probes and the local-daemon scope. Include fixed-criteria requests in the byte-cap definition. Document candidate removal before explanation shortening in both skill copies.

## Documentation claims check

The table covers the **How the router decides** section and the related skill additions.

| Claim | Status | Code evidence and correction |
| --- | --- | --- |
| Each phase returns one row. Candidates are chosen, ranked, or excluded with a named rule. | PASS | `pipeline/assemble-gate.ts:91-146,378-472`. Pruned candidates use `disposition: 'excluded'` and `rule: 'pruned'`. |
| Total is `prior + learned + preference + limit`. | PARTIAL | The base formula is correct. Add the optional `override` from `ranking/score.ts:234`. |
| Prior is user, else seed, else 50. | PASS | `ranking/score.ts:205-215,224-234`. |
| Local delta is capped at ±15. Exploration adds 5 when no user value exists and samples are below 3. Exploration is part of learned. | PASS | `ranking/score.ts:210-215`. The cap applies to the delta before exploration. |
| Preference boosts are 12, 8, 4, and 2. | PASS | `routing-constants.ts:32-33`, `ranking/score.ts:238-240`. |
| Limit adjustments are 0, -5, and -10. At-limit is excluded before scoring. | PASS | `routing-constants.ts:38-43`, `ranking/hard-constraints.ts:152-156`, `ranking/score.ts:216-219`. |
| Matrix cells are integers from 0 to 100. The additive total is not clamped. | PASS | `matrix/matrix.schema.ts:28-38`, `ranking/score.ts:224-235`. |
| A listed model is promoted only when its own cell beats the family cell by more than 5. Otherwise the configured model or `lane-default` applies. | PARTIAL | This describes non-system-CLI promotion. System CLI lanes skip promotion and can offer in-band reported alternates. See Finding 4. |
| The built-in design and visual-review subagent override lifts the total to 100. | PASS | `pipeline/phase-plan.ts:256-275`, `ranking/spread.ts:131-156`. A pin or matched routing rule disables the override. |
| Preferences match an id, display name, family, or CLI name. Earlier entries receive larger boosts and do not pin. | PASS | `ranking/preference-match.ts:28-63`, `ranking/score.ts:238-240`. |
| Explanations report blank, unknown, ambiguous, duplicate, and ineligible selectors. | PASS | `reasons/compile-reasons.ts:464-535`. Repeated diagnostics can appear only once across the result. |
| Rule preferences override call preferences. Call preferences override configured lane ranks. | PASS | `ranking/preference-match.ts:87-109`. Empty higher-precedence lists are ignored and disclosed. |
| A chosen explanation names the choice, total, parts, runner-up, gap, deciding factor, preferences, policy, and limit state. | PASS | `reasons/compile-reasons.ts:567-578`, `pipeline/assemble-gate.ts:623-657`. With no alternative, it says so. |
| `reason` ends with the policy clause. | PASS | `pipeline/assemble-gate.ts:334-341,672`. |
| The JSON chosen-row example represents normal producer output. | FAIL | The schema accepts the shape, but `decided by ranking` is not a producer value and plain `R2` does not produce `sonnet`. See Finding 4. |
| Top-level exclusions use the documented built-in rules, `user-rule:<id>`, and three prune causes. | PASS | `contracts/route-decide-result.schema.ts:33-42,73-81`, `pipeline/assemble-gate.ts:249-271`. |
| Routing-rule match fields use AND. Values inside one field use OR. Empty `match` matches every phase. | PASS | `scope/routing-rules-setting.ts:260-315`. |
| The routing-rule example is valid. | PASS | `scope/routing-rules-setting.ts:45-85`. |
| Rules are capped at 64 and selectors at 32. Selectors have 1-200 characters. Ids use the stated pattern and 64-character cap. | PASS | `scope/routing-rules-setting.ts:24-27,45-57,79-85`, `routing-constants.ts:35-36`. |
| `set` needs a field, `minTier` cannot exceed `maxTier`, invalid rules are dropped, and valid siblings keep order. | PASS | `scope/routing-rules-setting.ts:195-258`. Duplicate ids are also dropped. |
| The prefill setting controls cost estimation. Timeout is bounded to 1,000-60,000 ms. | PASS | `decision-model/decision-caller.ts:148-157`, `shared/src/lib/types/rpc/rpc-agents.types.ts:298-309`. |
| Tool-entry deadlines are 8 seconds for gate and 4 seconds for pre-flight. The router reserves 250 ms and falls back to ranking. | PARTIAL | The service implements these budgets. MCP compaction sits outside them. See Finding 1. |
| A System One lane request takes at most two questions. Later phases receive `question-cap`. | PASS | `route-decide.service.ts:539-587`, `pipeline/phase-resolve.ts:21-27,75`. Fixed-criteria host requests are intentionally not capped. |
| A known prefill rate gates dispatch by estimated cost. A call that cannot fit returns `deadline`. | PASS with known G4b issue | `pipeline/model-call.ts:99-117`. G4b finding 1 covers the smaller target-timeout budget. |
| One request runs per target. An overlapping route request returns `model-busy`. | PASS with known G4b issue | `pipeline/model-call.ts:105-106`, `decision-model/decision-caller.ts:135-143`. G4b finding 4 covers lock release. |
| `model-cold` means a local residency probe showed a model was not loaded. | PARTIAL | Unknown, failed, timed-out, and HTTP-error probes also return `model-cold`. The check applies only to a local daemon target. |
| `timeout`, `unreachable`, `auth`, `provider-error`, `bad-output`, and `low-confidence` meanings are correct. | PASS | `pipeline/model-call.ts:150-174,233-249,398-405`, `pipeline/answer-validation.ts`. |
| `payload-too-large` means the request did not fit at two options. | PARTIAL | This is correct for lane choices. Fixed-criteria requests can fail the same byte cap without options. |
| `question-limit` and `question-cap` meanings are correct. | PASS | `route-decide.service.ts:550-585`, `pipeline/phase-resolve.ts:65-77`. |
| `deadline` and `model-busy` meanings are correct. | PASS | `route-decide.service.ts:424-504`, `pipeline/model-call.ts:102-116`. |
| The capability matrix path, user-edit ownership, template creation, and view path are correct. | PASS | `matrix/capability-matrix.store.ts:69-75,236-265,392-423`. A later missing file can cause another template creation. |
| View cell precedence is user, local, seed, then unknown. | PASS | `matrix/capability-matrix.store.ts:477-508,536-558`. |
| `*` is the family profile. Profiles cover the six listed task kinds. | PASS | `matrix/capability-matrix.store.ts:511-524`, `matrix/matrix.schema.ts:86-104`. |
| Cells are unknown or values with score, source, date, and stale state. The example is valid. | PASS | `matrix/matrix.schema.ts:24-38,81-128`. Values can also carry the documented source-specific fields. |
| Seed values need `sourceRef` and `note`. Local values need `sampleCount` and no `sourceRef`. | PASS | `matrix/matrix.schema.ts:40-79`. |
| A cell becomes stale after 180 days. | PASS | `matrix/seed-matrix.ts:71-77`. The comparison is strictly greater than 180 days. |
| A chosen-row `fallbackCause` means deterministic ranking, not the model, decided. | PASS | `pipeline/phase-resolve.ts:55-116`. Model-sourced resolutions have a null cause. |
| Skill compaction keeps the chosen and best alternative, then shortens and drops explanations. | PARTIAL | The initial shortlist does this. Two later rounds can remove candidates before explanation shortening. |

## D7 protected-file check

`git diff --exit-code main...HEAD -- <four protected paths>` returned exit code 0 with no diff.

| Protected file | Result |
| --- | --- |
| `libs/backend/lane-routing/src/lib/decision-model/system-one.client.ts` | Unchanged |
| `libs/backend/lane-routing/src/lib/decision-model/system-one.residency.ts` | Unchanged |
| `libs/backend/lane-routing/src/lib/decision-model/decision-model.config.ts` | Unchanged |
| `libs/backend/lane-routing/src/lib/decision-model/decision-model.target.ts` | Unchanged |

No endpoint-setting or keep-alive implementation changed. The router-side dispatch passes `coldTimeoutMs: undefined` and preserves the existing `keepAlive` value. This is the permitted request-path deadline policy, not a connection-file edit.

## D16 answer: can a producer emit an empty `overrideLabel`?

No current production producer emits an empty string at this head. `pipeline/phase-plan.ts:64-65,267-273` supplies the non-empty constant `builtin design/visual-review subagent`, and `ranking/spread.ts:152` copies it. The generic internal `spread` input would propagate an empty label if another caller supplied one. The public result schema also accepts such a result today. Add `.min(1)` as D16 requires.

## Caller and contract review

- `gatherRouteCall`, `runLaneRequest`, and `planRoutePhases` have one production caller each in `RouteDecideService`. Their changed data stays inside the gate pipeline.
- `buildDecisionPayload` has one production caller in `model-refine.ts`. The optional `taskKind` issue for direct legacy callers remains the known G4b finding 3.
- `runFixedRequest` retains five production callers: route pre-flight, scope check, task-kind classification, skill ranking, and child-setting routing. The two-question cap applies only to lane questions, so fixed-criteria callers keep all answers.
- `handleRouteToolCall` retains two production callers: `protocol-dispatcher.ts:3410` and `agent-tool.dispatcher.ts:347`. The optional context change is compatible.
- `buildRouteCandidateSource` retains the route namespace and host-routing coordinator callers. Its new arguments are optional. `buildRouteNamespace` keeps the existing API-builder call shape.
- `RouteDecideResult`, `GateResult`, `CandidateTrace`, `ScoreParts`, and `LimitEvidence` have no direct consumers in `apps/ptah-electron` or `libs/frontend`. Electron and CLI registration call the unchanged `registerLaneRoutingServices` signature.
- Shared `RoutingRule` tier and effort types match the Zod vocabularies. File settings, settings export, and DI read the same new keys.
- No new broken caller, unhandled rejection, or contract mismatch was confirmed on these paths beyond the findings above and the recorded G4b items.

## Prior G4b status

The four Moderate and one Minor findings in `code-logic-review-G4b.md` are still present at `9e1461e07`. They are not repeated as new findings here. They cover target-timeout cost gating, reviewer-family deadline attribution, omitted `taskKind` outcome figures, in-flight lock release, and the noted test gaps.

## Commands and checks run

1. `git diff --name-status main...HEAD`, `git diff --stat main...HEAD`, and `git log --oneline main..HEAD` to inventory the branch.
2. `git show --stat --oneline 9e1461e07` and `git show --stat --oneline 42bafe99c` to scope the final commits.
3. `git show ae02a9915 -- <G3 files>` and focused `git diff main...HEAD -- <files>` for implementation and documentation review.
4. `git diff --exit-code main...HEAD -- <four D7 paths>` for the protected-file check. Exit code 0.
5. Ptah AST analysis on the changed routing, schema, MCP, and settings files. Ptah symbol search for shared types.
6. `ptah_lsp_references` on changed exported functions. The host returned a text-scan approximation rooted at the main checkout, so caller verification used scoped worktree `git grep` commands instead.
7. Scoped `git grep` commands for changed exports, schemas, override producers, settings consumers, MCP dispatchers, Electron, and frontend consumers.
8. `git diff --check main...HEAD`. It reported trailing whitespace and one blank-line-at-EOF issue only in task-spec Markdown files. Those files are outside the requested non-spec finding scope.
9. No Jest, TypeScript, or ESLint command was run. This review used static code traces and existing committed test reports. No `nx`, `npm run verify`, build, serve, or end-to-end command was run.
