# Code Logic Review: skill ranking

- **Verdict:** PASS (with fixes recommended)
- **Score:** 78 / 100
- **Scope:** `skill-ranking-caller.service.ts`, `skill-ranking.service.ts`, `skill-ranking.types.ts`.
  I also read `skill-ranking.schema.ts`, `skills-sh/di/register.ts`, the lane-routing DI diff and
  `harness-llm-runner.service.ts` to trace the contracts.
- **Verification:** `node scripts/verify.mjs -t typecheck,lint -p lane-routing,rpc-handlers` exit 0
  (4 tasks succeeded, 2 cached). Log: `.ptah/tmp/ranking-verify.log`. No spec ran, so the runtime
  behavior below comes from code reading only.

No finding makes the feature unsafe. The heuristic order is always returned. One finding (F1) can
make the session-model path fail on every call, so it needs a check before release.

## Answers to the five questions

1. **Timeout in `Promise.race`.** Yes, both races always settle.
   - `rankSkillCandidates`: `timedOut` always resolves `null` (`skill-ranking-caller.service.ts:37-43`).
     The timer clears in `finally` (line 132). A late rejection of `rank()` is handled by the race.
   - `withDeadline` always rejects at the deadline and clears its timer (`skill-ranking.service.ts:15-27`).
   - Caveat: the losing operation is not cancelled (F3).
2. **Per-item fallback.** Yes. The envelope schema only checks that `items` is a record
   (`skill-ranking.schema.ts:5`). Each item is validated alone (`skill-ranking.service.ts:53-58`).
   An invalid item keeps `rankedBy: 'heuristic'` and sibling items stay ranked.
   The caller also skips an invalid answer per item (`skill-ranking-caller.service.ts:105-110`).
3. **Three fallback paths.** All reachable.
   - The decision model runs only if the port is registered and an item has more than one candidate.
   - A `null` result or a thrown error leaves items as `heuristic`, and `pending()` then feeds the
     session model.
   - If the session model is missing or fails, the heuristic order stays.
   - Caveat: a hidden failure mode in the session path (F1).
4. **Session model.** `toolAccess: 'none'` and the JSON schema are applied (lines 78, 82).
   Schema validation is applied per item. `maxTurns: 1` is set, but see F1. `tmpdir()` is not
   isolated (F2).
5. **DI.** Both optional dependencies use `{ isOptional: true }` (lines 33-36). The real wiring is
   the factory in `skills-sh/di/register.ts:15-25`, which uses `isRegistered(token, true)` and passes
   `undefined` when a port is missing. This is correct. See F6 for a caching caveat.

## Findings

| # | File:line | Type | Severity |
| --- | --- | --- | --- |
| F1 | `skill-ranking.service.ts:81` | incomplete-logic | Medium |
| F2 | `skill-ranking.service.ts:78` | incomplete-logic | Medium |
| F3 | `skill-ranking.service.ts:15-27`, `skill-ranking-caller.service.ts:126-133` | race-condition | Low |
| F4 | `skill-ranking.schema.ts:10`, `skill-ranking.service.ts:57` | incomplete-logic | Low |
| F5 | `skill-ranking-caller.service.ts:46-52,76,99-101,124`; `skill-ranking.service.ts:64,85` | silent-failure | Low |
| F6 | `skills-sh/di/register.ts:15-25` | race-condition | Low |
| F7 | `skill-ranking-caller.service.ts:93` | incomplete-logic | Low |
| F8 | `skill-ranking.service.ts:11,13` | incomplete-logic | Low |

### F1 - `maxTurns: 1` with `outputFormat: json_schema` may fail every time (Medium, unverified)
Every other caller of `HarnessLlmRunner` that sets `outputFormat` uses `maxTurns` 6 to 10
(`harness-skill-generation.service.ts:129`, `harness-suggestion.service.ts:181`). Structured output
in the SDK can need more than one turn. If it does, the SDK ends with a max-turns error, the catch
block at line 86 hides it at `debug` level, and the session-model path never ranks. The code then
looks correct but always falls back to the heuristic.
**Fix:** run one live call, or add a spec with a fake runner. If it fails, raise `maxTurns` to 2-3.
Keep the 15 s abort as the hard bound.

### F2 - `tmpdir()` is shared, not isolated (Medium)
`os.tmpdir()` returns the shared system temp directory, not a unique folder. Other processes can
write there, and the SDK can store session or project data there. `toolAccess: 'none'` lowers the
risk, but the directory is not isolated.
**Fix:** `await mkdtemp(join(tmpdir(), 'ptah-skill-rank-'))` and remove it in `finally`. This is
also the isolation that the task intent states.

### F3 - The losing operation keeps running (Low)
When the 3 s race is lost, `rank()` and `runFixedRequest` continue without an abort signal. The
`expired` flag only stops `noteLive` and result use. The outer `withDeadline` has the same limit.
For the session path the runner has its own abort at 15 s, so that part is bounded.
The two decision timers are also equal (3 s each). The caller timer starts first, so the caller
usually returns `null` before the outer timer rejects.
**Fix:** pass an `AbortSignal` to `runFixedRequest` if it supports one. Otherwise accept the leak
and note it.

### F4 - An empty `order` counts as a model ranking (Low)
`order: []` passes validation, and the transform pads it with all labels. The item is then marked
`rankedBy: 'decision-model'` or `'session-model'` with the heuristic order. The provenance is false
and the top-level `rankedBy` can be wrong.
**Fix:** require `order.length >= 1` and `order[0]` to be an allowed label. Reject the item
otherwise.

### F5 - Fallbacks are mostly silent (Low)
A `null` from the decision caller (timeout, unavailable model, all answers invalid) is not logged.
The `catch` in `rankSkillCandidates` also hides all errors. In `skill-ranking.service.ts`, a failed
envelope parse (line 51) and `undefined` `structuredOutput` return without a log. Only thrown errors
reach `logger.debug`. An operator cannot tell why every result is `heuristic`.
**Fix:** log one `debug` line with the cause (`timeout`, `unavailable`, `invalid-envelope`,
`invalid-items`: count) at each fallback.

### F6 - The factory caches an early missing port (Low)
`instanceCachingFactory` resolves the optional ports once, on first resolve. If the service is
resolved before the lane-routing or harness registration, the port stays `undefined` for the whole
process. The comment says registration is lazy. I did not check the Electron phase order in this
review. `container.smoke.spec.ts:819-822` suggests lane routing registers in phase 2.
**Fix:** add a smoke assertion that `SKILL_RANKING_SERVICE` has both ports in the Electron container.

### F7 - The absolute workspace path goes to the model (Low, privacy)
`request` includes `JSON.stringify(workspaceRoot)` (`skill-ranking-caller.service.ts:93`). The
decision model can be a remote provider. The path does not help to rank skills.
**Fix:** remove it from the request text.

### F8 - Duplicate timeout constant (Low)
`DECISION_TIMEOUT_MS = 3_000` repeats `DECISION_REQUEST_TIMEOUT_MS` from lane-routing. The two can
drift. The decision caller also spends part of the 3 s on `openCaller`, so the model gets less than
3 s.
**Fix:** import the lane-routing constant (or export one) and give the outer deadline a small margin.

## Other observations (no action)

- The decision model returns one choice per item. The wrapper moves that label first and keeps the
  other labels in input order (`skill-ranking-caller.service.ts:111-120`). This is a partial ranking
  by design and the doc comment states it.
- Items with 0 or 1 candidate are never sent to a model, so they stay `heuristic`. This is correct.
- Candidate metadata goes through `JSON.stringify` and the prompt says to treat it as data. The JSON
  schema limits `order` entries to an enum of labels per item. This reduces prompt-injection impact.
- `skill-ranking.types.ts` has no defects. `z.number().finite().nonnegative()` rejects `NaN`.
  The result schema allows `reason` up to 140 characters, and the item schema truncates before then.

## Decisions

- Verdict is PASS because the deterministic order is always returned and no error can escape
  `rank()`. Evidence: both `try` blocks catch all errors (`skill-ranking.service.ts:62-69,73-89`).
  Reversible: yes.
