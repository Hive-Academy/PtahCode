## Verdict

**REVISE — 6/10.** The report-only disposal boundary and most failure mappings are sound, but the census shutdown path records a successful join to a request that never starts. Two probe paths can also report eligibility or an open root without proving it. This is above the needs-another-pass band because the core decision order and read-only command guard are implemented; it is below the sound band because a terminal stored outcome can be false.

## Findings

1. **Serious — `libs/backend/task-end-hook/src/lib/steps/index-request.step.ts:240`.** `coalesceDeferredInto` changes every waiting index step to terminal `succeeded/coalesced` before `start` accepts the request. If shutdown has called `CensusCoordinator.dispose()`, `start()` returns `false` at `census-coordinator.ts:135`; the owner becomes `failed/census-interrupted`, but the joined steps remain successful and cannot re-enter. Start or reserve the census before coalescing, or roll the joined steps back to deferred when start refuses. Add a shutdown interleaving spec with two deferred runs.

2. **Moderate — `libs/backend/task-end-hook/src/lib/steps/index-request.step.ts:60`.** `comparablePath` treats every `realpath` failure as a missing path and substitutes its lexical spelling. A permission or I/O failure on `mainRoot` and a registered root with the same spelling therefore passes the open-workspace gate and can start a census even though the real paths were not established. Return a distinct unavailable result for non-ENOENT failures and fail the gate closed. If missing roots may use lexical comparison by product decision, restrict that fallback to a confirmed missing-path error.

3. **Moderate — `libs/backend/task-end-hook/src/lib/dispose/disposal-input.collector.ts:1004`.** `walkIgnored` skips an ignored file when `lstat` says it vanished, and skips a vanished directory at line 1016. A worktree changing between `git status` and the archive census can therefore omit an ignored entry from P7 and record `eligible-report-only` despite an incomplete probe. Map a disappeared status entry to `ignoredFiles.kind = 'error'` so P7 records `precondition-unverifiable`; a fresh evaluation can later prove the new state.

## Risk checks

1. **Confirmed in Phase 1 paths inspected.** `decideDisposal` hardcodes `effectiveMode: 'off'`; `DisposeEvaluateStep` writes rows only. The collector calls git through `ReadOnlyGit`, whose exact vector allow-list covers the six git commands; the seventh command is the read-only PR port. No fetch, removal, move, or archive writer appears in the Phase 1 hook code.
2. **Finding 2.** Explicit `unavailable` activity and census probes do not pass, but a failed realpath can pass the workspace gate.
3. **Confirmed for stored outcomes.** Step and census catches persist fixed outcome codes, not caught exception text. Raw text is sent to debug/error logging, outside the stored row.
4. **Confirmed.** `CensusCoordinator.reconcileAfterRestart()` changes open `running/census-requested` rows to `failed/census-interrupted` and leaves terminal coalesced rows alone.
5. **Confirmed.** `IndexRequestStep` skips a null main root; `DisposeEvaluateStep` blocks the placeholder without probes when the main root is null.
6. **Finding 2.** Existing readable paths are compared by realpath; failed realpath uses lexical comparison.
7. **Finding 1.** Joined deferred steps are stranded as successful when `start()` refuses after shutdown.

## Five logic questions

1. **Silent failure:** Finding 1 records a success-looking coalesced row for a census that never started; finding 3 can record eligibility after an incomplete archive census.
2. **User action:** Ending multiple tasks during one cooldown window, then shutting down as the next census is requested, triggers finding 1.
3. **Wrong-answer input:** An ignored entry disappearing during the P7 walk triggers finding 3; an inaccessible root with a matching lexical path triggers finding 2.
4. **Dependency failure:** Git/PR failures map to unverifiable outcomes, census failures map to fixed failure codes, and store errors generally propagate. Realpath failures need the distinction in finding 2.
5. **Unspecified case:** The plan does not specify how deferred joiners should be restored when the coordinator rejects a census after shutdown; finding 1 supplies the required behavior.

## Decisions

- Treat the user-approved report-only mode and local origin/main check as binding; no removal, archive, or fetch implementation is expected in Phase 1. Reversible: yes, only through a later approved scope change.
- Exclude the later store, worker, host composition, and token registrations from this verdict, as the batch plan assigns them to blocked later phases. Reversible: yes, at their own review.
- Classify the missing ignored entry as an incomplete probe, since P7's stated purpose is to prove archive contents and caps. Reversible: yes, if product requirements explicitly accept a changing snapshot.

## Verification

Read the Phase 1 file list and diff index; task context, requirements, implementation plan including the command table, batch decisions, repository guidance, and the relevant source around index, census, disposal, git parsing, read-only git, harvest, and curation. Inspected the source locations cited above and searched the Phase 1 diff for TODO/PLACEHOLDER/STUB markers; no such markers were found. Scoped `ptah_get_diagnostics` for index and collector reported zero TypeScript errors. Ran no git, nx, npm, build, or test commands. This is a source logic review; later-phase integration and runtime behavior remain unverified.

## Round 1

Reviewer: codex (implementer family: claude). Full text: phase-1-round-1-review.md.

Verdict: APPROVED
Score: 8/10

- L1: RESOLVED — `steps/index-request.step.ts:251-264` starts the census before it coalesces;
  joiners stay deferred if start refuses (spec `index-request.step.spec.ts:736-786`).
- L2: RESOLVED — lexical fallback only for ENOENT/ENOTDIR (`index-request.step.ts:58-77`,
  `dispose/candidate-path.resolver.ts:33-56`); other failures fail closed.
- L3: RESOLVED — a vanished entry maps to `error` (`dispose/ignored-files.walker.ts:66-88`),
  outcome `blocked/precondition-unverifiable` (`dispose-evaluate.step.spec.ts:763-778`).
- New defects: none.

## Phase 2 — Round 0 (codex, 2026-11-07)

Implementer family claude; reviewer family codex. Range afb4fb11f..5b3047ffe (Batches 11-15).
Verdict: REVISE, 5/10. Full text: `phase-2-review.md` `## Logic`.

- L1 (Serious) `steps/close-curate.step.ts:407` — shutdown abort during curation records terminal
  `failed/curator-failed`; must stay resumable (also after a port resolves despite abort, :428).
- L2 (Serious) `trigger/repository-identity.ts:147` — every exit 128 with empty stdout is cached as
  `nogit:` (dubious ownership included); classify only "not a git repository", do not cache others.

Revise round 1 of 2 started.

## Phase 2 — Round 1 (codex, 2026-11-07)

Fix round 1: `phase-2-fix-report.md` (diff /var/tmp/b886/phase2-fix1.diff). Re-review:
`phase-2-round-1-review.md`. Verdict: APPROVED, 8/10. L1 resolved (`close-curate.step.ts:412`,
:427-443), L2 resolved (`repository-identity.ts:159`, :177-179). No new defects.
Revise rounds used: 1 of 2. Verify `-p @ptah-extension/task-end-hook` exit 0, 18 suites, 589 tests.

## Phase 3 — Round 0 (codex, 2026-11-07)

Implementer family claude; reviewer family codex. Commits 058d04e3b, 4eaf75ca2, f06747567,
b17853e71 (Batches 16-19). Verdict: REVISE, 6/10. Full text: `phase-3-review.md` `## Logic`.

- L1 (Serious) `task-end-hook.integration.spec.ts:508-511` — teardown `splice(0)` empties boots
  before the loop; `awaitStopped()` never runs before the DB closes.
- L2 (Moderate) `task-end-hook.integration.spec.ts:526-530` — fs spies installed after `endTask`,
  so detection is outside the zero-mutating-fs window.

Production code: no defect (C1, C3, D39, lazy engines, shutdown budget checked OK).
Revise round 1 of 2 started.

## Phase 3 — Round 1 (codex, 2026-11-07)

Fix round 1: `phase-3-fix-report.md` (diff /var/tmp/b886/phase3-fix1.diff). Re-review:
`phase-3-round-1-review.md`. Verdict: APPROVED, 8/10. L1 and L2 resolved; no new defects.
Revise rounds used: 1 of 2. Verify `-p @ptah-extension/task-end-hook` exit 0 (19 suites, 598 tests).
