# Batch G4b (B13)

Implemented AM6 payload compaction and the AM7 System One cost gate with the AM8 residency and fallback rules. Residency checks still apply only to local daemon targets. Custom and remote targets reach the cost and deadline checks without a model-cold skip. The four-phase incident fixture dropped from 764.25 to 243.75 estimated input tokens, a 68.1% reduction.

## Files and exported signatures

- `decision-model/decision-payload.ts` — `buildDecisionPayload(input: DecisionPayloadInput): DecisionPayload` emits a shared executor/model table, indexed criteria, and per-lane/task-kind `[deliveryPercent, sampleCount]` aggregates. `DecisionPayloadInput` adds optional `taskType` and `depth`. `LaneChoiceQuestionInput` adds optional `taskKind` for the phase-specific sample count. `formatDecisionOptionLabel(option: DecisionOption): string` still serves the structured provider.
- `decision-model/system-one.schema.ts` — `SystemOneStateSchema` accepts compact and historical state. Added `CompactSystemOneState`. Response validation and choice labels remain compatible.
- `decision-model/decision-caller.ts` — `DecisionCallerDependencies` adds `readPrefillTokensPerSecond?: () => unknown` and a `monotonicNow` seam. `DecisionCaller.dispatchFor(caller: OpenedCaller, budget?: { signal: AbortSignal; remainingMs: () => number }): ModelDispatch` supplies a per-target rate store, a live post-reserve budget, and the timeout-capped caller.
- `pipeline/model-call.ts` — added `SystemOneAdmission`. `callSystemOne(caller, payload, offered, questions, metrics?): Promise<ModelRequestOutcome>` gates fitted requests, measures throughput, and logs one `inputTokens` metric per dispatched System One call with `inputTokensSource` of `usage` or `bytes/4`. `emptyOutcome(cause, requestReason?): ModelRequestOutcome` carries the skip estimate.
- `pipeline/model-refine.ts` — `runLaneRequest(input): Promise<ModelRequestOutcome>` accepts task type and depth. `runFixedRequest(input): Promise<ModelRequestOutcome>` and `runLaneRequest` enforce the System One question cap and pass fitted bytes to admission. `SystemOneCaller.decide(payload, timeoutCapMs?)` passes the fit-time cap. `ModelDispatch` carries optional System One admission, and `ModelRequestOutcome` carries `questionCap?` and `requestReason?`.
- `pipeline/prefill-rate.store.ts` — `PrefillRateStore.rate(target): number | undefined`, `tryStart(target): boolean`, `finish(target): void`, `recordCompleted(target, inputTokens, elapsedMs): void`, and `recordAbort(target, promptTokens, elapsedMs): void`.
- `pipeline/phase-resolve.ts` — `resolvePhase(plan: PhasePlan, context: PassContext): PhaseResolution` applies the per-question cap ahead of request-wide fallback. The existing skip causes remain visible on alternates-only rows.
- `route-decide.service.ts` — `RouteDecideDependencies` adds `readPrefillTokensPerSecond?: () => unknown`. The service passes gate task/depth, preserves capped phases through early deadline and residency returns, and adds estimated cost to the affected gate row or pre-flight reasons.
- `di/register.ts` — `registerLaneRoutingServices` reads the setting via the existing workspace configuration port.
- Specs changed in `decision-model/decision-payload.spec.ts`, `pipeline/model-call.spec.ts`, `pipeline/model-refine.spec.ts`, `pipeline/prefill-rate.store.spec.ts`, and `route-decide.gate.spec.ts`. `routing-constants.ts` already defined `DECISION_QUESTIONS_PER_CALL = 2`, so this batch uses that definition.

## Incident payload measurement

| Request | Questions sent | UTF-8 bytes | Estimated input tokens (bytes ÷ 4) |
| --- | ---: | ---: | ---: |
| Pre-change builder and serializer | 4 | 3,057 | 764.25 |
| B13 fitted request and same serializer | 2 | 975 | 243.75 |

The regression fixture uses the task context’s FEATURE/Full incident and its four phase IDs (implement, implement, review, tests). The original POST body was unavailable, so the request wording, option models and sample distribution were reconstructed. Before production edits, the old builder and serializer emitted the recorded baseline below. Both measurements use `nimble` with no `keep_alive`. The new fixture test sends the fitted request through `SystemOneClient` with an in-process response, validates the compact request schema, and confirms that both returned option choices validate. The baseline is a serialized-byte estimate, with no live provider tokenizer involved.

## Specs

- Estimate skip and boundary dispatch — `skips over-budget estimates and dispatches at the cost boundary`.
- Setting override and timeout cap — `reads the configured override and caps the actual client timeout after fitting` and the existing pre-flight `caps the configured timeout at the remaining pre-flight budget`.
- EWMA and abort ceiling — `updates the per-target EWMA with alpha 0.3`, `reduces an estimate on abort and never raises it`, and `lowers the rate and logs the estimated input once if the route aborts before transport settles`.
- Overlap — `skips overlapping requests for the same target and keeps other targets independent`.
- Question cap — `keeps the third question capped even when the model pass fails` and `caps one System One request at two questions and marks the rest question-cap`.
- Payload reduction and answers — `cuts estimated input tokens for the four-phase incident by at least 50% and validates answers`.
- Token metric — the cost-boundary spec checks one `usage` metric and both the incident and abort specs check one `bytes/4` metric.
- Historical request compatibility — `still accepts the historical request state with raw counts`.

### Approved gate assertion updates

| Spec line | Previous expectation | Updated expectation |
| --- | --- | --- |
| 622–624 | Offered lane IDs came from roster keys | Offered lane IDs come from the indexed roster tuples |
| 630 | `{ delivered: 3, failed: 1 }` per key | `[75, 4]` delivery percent and sample count per key |
| 1015–1017 | `QUESTIONS_PER_REQUEST` (32) | `DECISION_QUESTIONS_PER_CALL` (2) |
| 1025–1028 | Row 32 ranks with `question-limit` | Row 2 ranks with `question-cap` |
| 1029–1034 | 38 rows have `question-limit` | 68 rows have `question-cap` |

The existing 70-phase scenario stays in place. The 32-question `question-limit` path still applies to structured gate calls. Gate and pre-flight assertions outside the superseded System One request contract were left intact.

## Checks

- Jest — 6 suites passed, 0 failed. 121 tests passed, 0 failed. Log `.ptah/tmp/b13-jest.log`.
  ```sh
  npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/decision-model/decision-payload.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts libs/backend/lane-routing/src/lib/pipeline/prefill-rate.store.spec.ts libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts libs/backend/lane-routing/src/lib/route-decide.preflight.spec.ts
  ```
- TypeScript — exit 0, zero diagnostics. Log `.ptah/tmp/b13-tsc.log`.
  ```sh
  npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json
  ```
- ESLint — exit 0, 14 files, zero errors or warnings. Log `.ptah/tmp/b13-eslint.log`.
  ```sh
  npx eslint libs/backend/lane-routing/src/lib/decision-model/decision-payload.ts libs/backend/lane-routing/src/lib/decision-model/decision-payload.spec.ts libs/backend/lane-routing/src/lib/decision-model/system-one.schema.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts libs/backend/lane-routing/src/lib/pipeline/model-call.ts libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts libs/backend/lane-routing/src/lib/pipeline/prefill-rate.store.ts libs/backend/lane-routing/src/lib/pipeline/prefill-rate.store.spec.ts libs/backend/lane-routing/src/lib/pipeline/phase-resolve.ts libs/backend/lane-routing/src/lib/route-decide.service.ts libs/backend/lane-routing/src/lib/di/register.ts libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts
  ```
- Scoped `ptah_get_diagnostics` returned zero errors and warnings. The hidden task folder was omitted by `ptah_search_files`, so `rg --files --hidden` enumerated the task documents. No host skill loader was listed and no matching skill was assigned.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Use compact state alongside the historical shape | Extend the request-state schema or carry the new data inside existing free text | The strict schema requires full historical roster and counts. The coordinator approved the narrow schema edit, per-question resolution, and service cap and reason wiring. Historical fixtures still parse. | Yes |
| Update the two System One gate expectations | Replace the superseded assertions or retain them as known failures | The coordinator approved the two gate scenarios above. The pre-flight suite had no assertions requiring updates. | Yes |
| Place `PrefillRateStore` under `pipeline/` | Store beside the pipeline admission code or in the decision-model transport directory | The rate, elapsed time, and overlap state belong to routing admission. The store lives for one `DecisionCaller` and uses the existing normalized selection/base-URL key. | Yes |
| Keep the rate estimate conservative on errors | Use failed-call duration as successful throughput or limit measurements to valid responses and abort bounds | HTTP and connection failures can return immediately without inference. Valid responses update the EWMA. An abort bounds the rate and keeps the target busy until its transport promise settles. | Yes |
| Keep reported usage separate from telemetry estimates | Populate result usage with estimates or preserve actual reported usage in results | G4 tracks unknown billed input/output as null. The per-call metric records estimated input with explicit provenance when usage is missing. | Yes |

## Open questions

None for B13. The permitted command set excluded `assemble-gate.spec.ts`. Its existing alternates-only `model-cold` test was preserved and the focused gate suite passed.

## Recorded pre-change fixture

The following is the serialized pre-change request, captured without a trailing newline in the measured file.

```json
{"model":"nimble","state":{"request":"Investigate and fix the issue, review the change, and run regression tests.","availableExecutors":{"kimi":{"family":"moonshot","model":"kimi-for-coding","limitState":"confirmed-room","score":75},"codex":{"family":"openai","model":"gpt-5","limitState":"unknown","score":72},"ollama-code":{"family":"ollama","model":"qwen3-coder","limitState":"unknown","score":69},"antigravity":{"family":"google","model":"gemini-3-pro","limitState":"unknown","score":67}},"pastOutcomes":{"codex/implement":{"delivered":15,"failed":3}}},"questions":{"impl-backend":{"type":"choice","instructions":"Choose the executor for this phase. Each score already includes past outcomes; pastOutcomes lists the delivered and failed run counts behind it. No entry means no verified runs were available for that executor in the outcome window.","criteria":{"o1":"lane kimi, family moonshot, model kimi-for-coding, limit state confirmed-room, score 75","o2":"lane codex, family openai, model gpt-5, limit state unknown, score 72","o3":"lane ollama-code, family ollama, model qwen3-coder, limit state unknown, score 69","o4":"lane antigravity, family google, model gemini-3-pro, limit state unknown, score 67"}},"impl-frontend":{"type":"choice","instructions":"Choose the executor for this phase. Each score already includes past outcomes; pastOutcomes lists the delivered and failed run counts behind it. No entry means no verified runs were available for that executor in the outcome window.","criteria":{"o1":"lane kimi, family moonshot, model kimi-for-coding, limit state confirmed-room, score 75","o2":"lane codex, family openai, model gpt-5, limit state unknown, score 72","o3":"lane ollama-code, family ollama, model qwen3-coder, limit state unknown, score 69","o4":"lane antigravity, family google, model gemini-3-pro, limit state unknown, score 67"}},"code-review":{"type":"choice","instructions":"Choose the executor for this phase. Each score already includes past outcomes; pastOutcomes lists the delivered and failed run counts behind it. No entry means no verified runs were available for that executor in the outcome window.","criteria":{"o1":"lane codex, family openai, model gpt-5, limit state unknown, score 72","o2":"lane ollama-code, family ollama, model qwen3-coder, limit state unknown, score 69","o3":"lane antigravity, family google, model gemini-3-pro, limit state unknown, score 67"}},"tests":{"type":"choice","instructions":"Choose the executor for this phase. Each score already includes past outcomes; pastOutcomes lists the delivered and failed run counts behind it. No entry means no verified runs were available for that executor in the outcome window.","criteria":{"o1":"lane kimi, family moonshot, model kimi-for-coding, limit state confirmed-room, score 75","o2":"lane codex, family openai, model gpt-5, limit state unknown, score 72","o3":"lane ollama-code, family ollama, model qwen3-coder, limit state unknown, score 69","o4":"lane antigravity, family google, model gemini-3-pro, limit state unknown, score 67"}}}}
```
