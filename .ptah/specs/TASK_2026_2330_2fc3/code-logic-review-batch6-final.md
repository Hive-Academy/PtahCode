# Batch 6 final code-logic review

**Score:** 7/10  
**Verdict:** REVISE

Eight items are fixed. N3 is partial because round 2 introduced one new Major defect. A healthy initial guidance start can become `interrupted` before the backend registers the run. The later accepted run cannot repair the terminal record. This behavior prevents approval.

The other examined areas have no new Blocking or Major defect. The score is above 6 because the owner, validation, correction, guidance, error-copy, and cleanup fixes have direct test proof. It is below 8 because the orphan defect breaks a supported start path.

## Scope and verification

Source and spec paths below are relative to `libs/frontend/setup-wizard/src/lib/services/`.

- Read the previous review, round-two fix report, Batch 6 contract, implementation plan, current source diff, and the new attempt helper.
- Read all five changed source files and all four focused specs in full.
- Ran the requested focused Jest command. **PASS: 4 suites, 191 tests, 0 failures, 0 snapshots.** Log: `.ptah/tmp/code-logic-review-batch6-final-jest.log`.
- Scoped `ptah_get_diagnostics` reported **0 errors in the five requested source files**. Its compiler target reported eight BigInt target errors in three sibling files. Those files are outside this change.
- Checked the backend guidance start to establish whether a slow start is possible. `enhanced-prompts-rpc.handlers.ts:721`-`:729` awaits source and model resolution before run registration. Model resolution can wait 15 seconds at `:793`-`:799`.
- No source or spec file was edited. No build, workspace-wide check, or mutating git command was run.

## Item status

| Item | Status | Evidence and test proof |
| --- | --- | --- |
| P4 | **FIXED** | Initial blocked replies use `resolveBlockedStart` at `generation-workflow.store.ts:318`-`:335`. Retry and rerun use the same method at `setup-run.store.ts:1039`-`:1052`. Same-ID owners get a fresh lookup at `:1063`-`:1081`. `setup-run.store.spec.ts:1322`-`:1356` covers both initial workflows. `:1669`-`:1701` covers a settled redirect. `:1731`-`:1772` covers same-ID retry. |
| P5 | **FIXED** | `generation-run-event-adapter.ts:36`-`:65` requires a known kind, string content, a finite timestamp, and tool fields. Both stream routes call it at `:92`-`:100`. The test at `generation-run-event-adapter.spec.ts:700`-`:761` rejects binding-only, unknown, and incomplete payloads on both routes. It also proves continued polling and accepted kinds. |
| N1 | **FIXED** | View-driven `reportRun` and `reporterFor` do not mark delivery at `setup-run.store.ts:386`-`:398`. Only `reportStream` calls `pushed` at `:400`-`:420`. The real-view test at `setup-run.store.spec.ts:1300`-`:1320` binds, reads `running`, unbinds, and completes through the shared poll with `unseen: true`. |
| N2 | **FIXED** | The same-ID initial branch clears the stale view and applies the fresh verified run at `generation-workflow.store.ts:326`-`:334`. The parameterized test at `setup-run.store.spec.ts:1322`-`:1356` proves one fresh lookup, a running view, one record, and the owner run ID for agents and guidance. |
| N3 | **PARTIAL** | `setup-run-attempt.ts:255`-`:264` starts and expires the missing grace. `setup-run.store.ts:820`-`:828` interrupts the matching live record and stops later polling. Tests at `setup-run.store.spec.ts:1358`-`:1405` cover persistent null replies, evidence reset, interruption, and poll shutdown. New defect 1 shows that the same timer also runs during a healthy unresolved initial start. |
| N4 | **FIXED** for the reported same-session path | The shared predicate is at `setup-run-attempt.ts:128`-`:139`. The record checks attempt identity, run ID, and finalization proof at `:265`-`:318`. The view captures its reporter before lookup at `generation-workflow.store.ts:410`-`:419` and uses the same predicate at `:518`-`:529`. `setup-run.store.spec.ts:1407`-`:1466` accepts only the proved correction. `:1468`-`:1521` rejects an earlier lookup after retry. |
| N5 | **FIXED** | `hasCommittedGuidance` accepts only `committed` or `unchanged` at `setup-run-attempt.ts:119`-`:122`. Central mapping returns `failed` for an uncommitted completed lifecycle at `:158`-`:165`. The view uses the same helper at `guidance-generation.store.ts:170`-`:183`. `setup-run.store.spec.ts:1523`-`:1556` covers the real view, shared poll, and terminal push. It checks failed status and fixed copy in each route. |
| N6 | **FIXED** | `startRefusalCopy` maps both workspace reasons and the coded model failure at `setup-run-attempt.ts:111`-`:117`. `requestBoundStart` preserves a `WizardRpcError` code at `:374`-`:392`. `setup-run.store.ts:1023`-`:1028` and `:1055`-`:1058` apply the fixed copy. Tests at `setup-run.store.spec.ts:1558`-`:1609` cover retry, rerun, both workspace reasons, and the coded guidance error. |
| N7 | **FIXED** | Terminal settlement clears delivery and missing evidence at `setup-run-attempt.ts:223`-`:237`. `prune` retains only needed redirects or finalization proof at `:240`-`:248`. Eviction and dismissal share `forget` at `setup-run.store.ts:1156`-`:1187`. The test at `setup-run.store.spec.ts:1611`-`:1645` inspects attempt and delivery cleanup, redirect removal, viewing cleanup, and `whenStarted` after eviction. |

## New defects

### 1. Major — The orphan grace interrupts a healthy initial guidance start

- **Evidence.** The grace is five seconds at `setup-run.store.ts:122`. The shared poll includes every running bound record without push delivery at `:201`-`:219`. Initial `startGuidance` awaits its RPC at `generation-workflow.store.ts:185`-`:218`, but it creates no pending `SetupRunAttempt`. Only centralized retry and rerun create that attempt at `setup-run.store.ts:998`-`:1004`.
- **Trigger.** Start project guidance while source or model resolution takes longer than the grace. Let each bound-state lookup return null before the backend registers the run. The backend can spend 15 seconds in model resolution before `guidanceRuns.start` at `enhanced-prompts-rpc.handlers.ts:721`-`:729` and `:793`-`:799`.
- **Failure.** Null replies start and expire the grace at `setup-run.store.ts:820`-`:827` and `setup-run-attempt.ts:255`-`:264`. The record becomes `interrupted`. The pending-attempt guard at `setup-run.store.ts:803`-`:807` cannot protect this initial start because no attempt exists.
- **Impact.** The backend can then accept and run healthy work. The view can show that accepted run, but the persistent record remains `interrupted`. Later running observations are rejected by the terminal guard at `setup-run-attempt.ts:321`-`:334`. Stream pushes cannot repair the record either. Setup therefore reports an interruption while the backend continues the run.
- **Test gap.** The orphan tests begin after the blocked start RPC has resolved at `setup-run.store.spec.ts:1358`-`:1382`. No test holds an initial guidance start pending across two null poll intervals and then accepts it. The 191 passing tests do not exercise this sequence.
- **Fix.** Register initial agent and guidance starts with the attempt tracker before the RPC. Suppress orphan settlement while that start is pending. Begin the missing grace only after the start resolves without valid run evidence. Add a regression test with a deferred guidance start, repeated null replies, and a later accepted running state. Assert that the record never becomes `interrupted` during the pending start.

## Minor follow-ups

1. **Add accepted-kind coverage for enhance streams.** The P5 test rejects invalid payloads on both routes, but its accepted-kind loop uses only generation streams at `generation-run-event-adapter.spec.ts:743`-`:760`. The validator is shared, so this is a coverage gap rather than a demonstrated defect.
2. **Define finalization correction after reload.** The plan does not state this case. `finalizationFailures` is session-local at `setup-run-attempt.ts:179` and receives proof only during observed settlement at `:230`-`:237`. Decide whether a persisted failed record must accept a later completed lookup after reload. Add a reload test if that behavior is required.

## Five logic questions

1. **How does this fail silently?** A slow initial guidance start becomes `interrupted` while backend preparation is still healthy. The later accepted run cannot update the terminal record.
2. **What user action produces unexpected behavior?** Start guidance during slow source or model resolution. Setup can show an interruption before the backend has registered the run.
3. **What input produces a wrong answer?** Repeated null lookups during a pending initial start produce `interrupted` instead of the eventual verified running state.
4. **What happens when a dependency fails or returns an unexpected shape?** RPC rejection returns `undefined` and keeps the last status at `setup-run-attempt.ts:361`-`:371`. Malformed streams are rejected. Persistent null replies now have a bound, except for the pending-start defect above.
5. **What is missing from the requirements?** The plan names an orphan grace but gives no duration or pending-start rule. It also does not define whether finalization correction must survive a renderer reload.

## Decisions

- **Mark N3 partial and block approval.** The options were accepting the five-second grace for every live record or excluding unresolved initial starts. The backend awaits preparation before registration and permits a 15-second model-resolution delay. The review therefore treats premature interruption as a Major defect. This decision is reversible only with evidence that initial starts always register before the grace expires.
- **Keep reload finalization proof as a Minor requirement gap.** The original correction finding and the round-two tests concern an observed failure in the same session. The plan does not require correction after reload. This review does not promote that unspecified case to Major.
- **Run no extra broad checks.** The requested four suites cover the changed paths. Scoped Ptah diagnostics cover the five source files. Broader checks are outside this lane's authorization.

Review family: kimi-code (implementer family: codex, claude)
