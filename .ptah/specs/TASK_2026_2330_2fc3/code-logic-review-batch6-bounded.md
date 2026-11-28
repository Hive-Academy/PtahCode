# Batch 6 bounded correction — code-logic review

**Score:** 8/10  
**Verdict:** APPROVED

The orphan-grace defect from the final review is fixed. A healthy initial agent or guidance start that stays pending past the five-second grace, with null lookups, can no longer become `interrupted`. It ends `running` with the accepted run id. A start that resolves without run evidence still gets interrupted, after a fresh grace. No new Blocking or Major defect was found. Two Minor items remain.

The score is 8, not 9, because one narrow race lets a poll reply that straddles the start click pre-consume the fresh grace of a genuinely lost run (Minor 1), and the deferred-lookup direction has no test (Minor 2). The score is above 7 because the guards cover both lookup orders in code, the release path is exception-safe, and both regression tests exercise the deferred sequence with per-poll assertions.

## Scope and verification

Source and spec paths below are relative to `libs/frontend/setup-wizard/src/lib/services/`, except the deliverable path.

- Read the defect (final review, section "New defects → 1. Major"), the bounded fix report, and the whole `setup-run-attempt.ts`.
- Read `setup-run.store.ts` around the registration (`:395`-`:408`), the reconcile path (`:812`-`:847`), and the retry and blocked-owner paths (`:972`-`:1100`).
- Read `generation-workflow.store.ts` `:100`-`:315` (bind, initial starts, retry, rerun) and `:360`-`:476` (accept, track, refresh, watchdog).
- Read the named tests at `setup-run.store.spec.ts:1322`-`:1405`.
- Ran the focused Jest command: **PASS, 2 suites, 150 tests, 0 failures**. Log: `.ptah/tmp/code-logic-review-batch6-bounded-jest.log`.
- Scoped `ptah_get_diagnostics` on the five changed source files: **0 errors**. Eight BigInt target errors remain in three unchanged sibling files (`capability-id-codec.ts`, `attention-identity.ts`, `pairing-code.ts`), outside this change.
- No source or spec file other than this deliverable was edited. No build, workspace-wide check, or mutating git command was run.

## Question 1 — Is the defect FIXED?

**Yes, fixed.** Evidence:

- `generation-workflow.store.ts:157`-`:166` (agents) and `:200`-`:201` (guidance) route both initial RPCs through `SetupRunStore.startInitial`.
- `setup-run.store.ts:395`-`:408` registers the start only when a live record matches the binding, and marks the record live for this session at `:406`.
- `setup-run-attempt.ts:190`-`:201` counts `pendingInitialStarts` before the RPC (`:193`) and clears earlier missing-state evidence (`:194`), so any grace clock started before the click is erased.
- `setup-run.store.ts:824` snapshots `initialStartPending` before the lookup await. `stillMissing()` at `:832`-`:836` rejects the missing path while the start is pending, both from the snapshot and from the live `pendingInitialStarts` check at `:834`. So a lookup that begins during the start and returns after it settles cannot start or satisfy the grace.
- Valid observations still update the record during the pending start: `setup-run.store.ts:831` calls `observeRun`, and `canObserve` accepts because `startInitial` leaves `attempt.pending` false (`setup-run-attempt.ts:191`-`:193`, `:337`-`:351`).
- The one residual window is a poll tick that begins before the click. Its reply can call `orphaned()` with a stale `attempt`. That call can only set the clock and return `false`, because `startInitial` cleared the clock at click time (`setup-run-attempt.ts:194`, `:271`-`:280`), and only one tick can be in flight (`setup-run-attempt.ts:436`-`:457`). So no healthy pending start can be interrupted.
- Test proof: `setup-run.store.spec.ts:1322`-`:1375` holds the start RPC on a deferred promise, runs four null polls over ten seconds, asserts `running` with `backendRunId: null` after each poll, then accepts the run and asserts `running` with `backendRunId: 'accepted-run'` (`:1370`-`:1373`). Both agents and guidance are parameterized.

## Question 2 — Does the grace still interrupt a truly lost run?

**Yes.** After the start resolves without run evidence, the `finally` block releases the counter (`setup-run-attempt.ts:197`-`:200`). The first eligible null reply then starts the clock inside `orphaned()` (`setup-run-attempt.ts:271`-`:280`), and a null at least five seconds later (`setup-run.store.ts:122`, interval `:86`) interrupts the record (`setup-run.store.ts:839`-`:845`).

Test proof: `setup-run.store.spec.ts:1377`-`:1405`. The record stays `running` through ten seconds of polls while the start is pending, stays `running` through two polls after settlement without evidence, and becomes `interrupted` with `backendRunId: null` on the third poll. The grace therefore starts fresh after settlement, in the tested ordering. The race in Minor 1 can shorten this fresh grace but cannot skip the interrupt.

## Question 3 — Did the fix introduce a new Blocking or Major defect?

**No.** Findings per checked case:

1. **Entry never released.** `startInitial` uses `try`/`finally` (`setup-run-attempt.ts:195`-`:200`), so an RPC throw decrements the counter. The workflow stores catch the rethrown error (`generation-workflow.store.ts:174`-`:184`, `:210`-`:221`). A never-settling RPC keeps the entry, which only protects the record, the same protection `hold` gives retry paths. `prune` refuses to drop an entry with `pendingInitialStarts` (`:255`-`:264`).
2. **Start for a non-matching, non-live, or absent record.** `setup-run.store.ts:399`-`:405` falls back to an untracked `send()`. This is the pre-fix behavior and matches the fix report's scope decision: orphan reconciliation applies to live records. A record created by `adopt` during such a start receives a stream push that sets delivery to `push` and stops the poll (`setup-run.store.ts:415`-`:436`).
3. **Lookup that begins during the start and returns after it.** Covered twice: the `initialStartPending` snapshot at `setup-run.store.ts:824` and the live recheck at `:834`. The opposite order (reply straddles the click) relies on the cleared clock and the single in-flight tick; the stale variable itself is Minor 1, not a healthy-run hazard.
4. **Double registration on repeated clicks.** `startAgents` and `startGuidance` return early while bound (`generation-workflow.store.ts:147`-`:152`, `:190`-`:195`, `isBound` at `:69`-`:76`). If a second start still occurred, `pendingInitialStarts` is a counter, not a flag (`setup-run-attempt.ts:193`, `:198`), so each registration releases exactly once.
5. **Retry and rerun paths.** `startBound` still uses `attempts.start` (`setup-run.store.ts:1016`-`:1023`), `sendBoundStart` is unchanged (`:1025`-`:1078`), and `hold` and `resolveBlockedStart` are unchanged (`:1081`-`:1100`). The added prune condition ignores entries without `pendingInitialStarts`, so retry pruning behaves as before. The full suites, including the same-ID retry and blocked-owner tests, pass.

## Question 4 — Do the named tests exercise the deferred sequence?

**Yes, with one gap.** Both tests hold the start RPC on a manual promise, advance the real poll interval, and assert after each poll. The acceptance test proves four null polls past the grace never interrupt and that the accepted run id lands on the record (`setup-run.store.spec.ts:1357`-`:1373`). The no-evidence test proves the fresh grace after settlement (`:1393`-`:1404`).

The gap: no test holds a `getBoundRunState` reply pending across the settlement of an initial start. Both orderings of lookup and settlement are covered in code (`setup-run.store.ts:824`, `:834`), but only by the snapshot and the recheck, not by a test. See Minor 2.

## New defects

### 1. Minor — A poll reply that straddles the start click can pre-consume the fresh grace

- **Severity:** Minor.
- **File:line:** `setup-run.store.ts:817`, `:824`, `:832`-`:836`; `setup-run-attempt.ts:271`-`:280`.
- **Evidence.** `reconcileBound` captures `attempt` once at `:817`, before the lookup await at `:825`. If the tick begins before an initial start, the capture is `undefined`. When the null reply arrives after the click, `stillMissing()` rechecks the captured `attempt`, not the map, so it cannot see the new `pendingInitialStarts` entry and calls `orphaned()`. That call sets the grace clock during the pending start.
- **Impact.** If the start later resolves without run evidence and more than five seconds passed since the stray set, the first post-settlement null interrupts immediately, instead of after a fresh five-second grace. No healthy start can be interrupted: `startInitial` clears the clock at click time (`setup-run-attempt.ts:194`) and only one tick can be in flight (`:436`-`:457`), so the stray call always returns `false`. The shortened grace only affects a genuinely lost run, by up to five seconds.
- **Fix.** Inside `stillMissing()`, read `this.attempts.get(record.id)` fresh instead of reusing the captured `attempt`, and derive the pending check from that fresh entry. Add a test that holds one `getBoundRunState` reply pending across the start click and the settlement.

## Minor follow-ups

1. **Cover the deferred-lookup direction in a test.** Hold a `getBoundRunState` reply pending across the settlement of an initial start, for both a healthy and a lost run, and assert the missing path never applies during the pending phase. The code covers it (`setup-run.store.ts:824`, `:834`); the tests do not.
2. **Lingering attempt entries.** An entry created by `startInitial` is never pruned until terminal settlement or `forget`, because `prune` requires `attempt.settled` (`setup-run-attempt.ts:255`-`:264`). The entry is inert: `canObserve`, `cancelBound`, and `reporterFor` behave the same as with no entry. This matches the existing pattern for started records, so no action is required now.
3. **Untracked fallback scope.** The non-matching and non-live fallback at `setup-run.store.ts:399`-`:405` keeps the pre-fix behavior. If a later batch binds views to records more loosely, revisit whether those starts need the same protection.

## Five logic questions

1. **How does this fail silently?** Only through the Minor 1 race: a lost run can be interrupted up to five seconds earlier than the documented fresh grace. No status is reported wrongly; the record still reaches `interrupted`.
2. **What user action produces unexpected behavior?** Clicking start while a poll reply for the same record is in flight, then letting the start resolve without evidence. The visible effect is a shorter wait before the interruption, which the user cannot distinguish from normal reconciliation.
3. **What input produces a wrong answer?** A null bound-state reply whose lookup began before the start click and returned after it. It sets the grace clock early instead of being ignored.
4. **What happens when a dependency fails or returns an unexpected shape?** An RPC throw inside `startInitial` releases the counter in the `finally` block (`setup-run-attempt.ts:197`-`:200`) and propagates to the workflow catch. A thrown state read returns `undefined` and skips the missing path (`setup-run.store.ts:825`, `:837`).
5. **What is missing from the requirements?** The plan still does not state a pending-start rule or a grace duration; the implementation chose five seconds (`setup-run.store.ts:122`) and a pending-start suppression. The fix report records the scope decision to track only matching live records.

## Decisions

- **Approve despite the Minor 1 race.** The options were to hold the bounded fix for a fresh-lookup recheck, or approve and leave the recheck as a follow-up. The race cannot interrupt a healthy start (the clock is cleared at click time and only one tick is in flight), and it only shortens the grace of a run that is already lost. The defect under review is fixed with direct test proof. This decision is reversible: the fix is a two-line change in `stillMissing()` plus one test.
- **Treat the stale-reply ordering as Minor, not Major.** The final review's Major was a healthy run shown as `interrupted` while the backend worked. That failure mode is closed. The race changes only how quickly a genuinely lost run is reconciled, so it does not block approval.
- **Run no extra broad checks.** The two named suites and scoped diagnostics cover the correction. Broader checks are outside this lane's authorization.

Review family: ollama-cloud (implementer family: codex)
