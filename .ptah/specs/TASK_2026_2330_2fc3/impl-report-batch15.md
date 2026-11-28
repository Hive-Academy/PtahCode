# Batch 15 implementation report

Split the Setup run workflows into plain collaborators. The root store retains signals, record lifecycle and persistence, workflow dispatch, and the public API. All 538 service tests passed, including the unchanged store spec.

## File map

Paths are relative to `libs/frontend/setup-wizard/src/lib/services/`. Counts include blank lines and comments.

| File | Responsibility | Lines |
| --- | --- | ---: |
| `setup-run.store.ts` | Root service, record index and signals, persistence, effects, and workflow dispatch | 694 |
| `setup-run/setup-run-analysis.coordinator.ts` | Reconcile and adopt analysis runs, synchronize runner signals, start and cancel analysis | 164 |
| `setup-run/setup-run-attempt.ts` | Attempt identity, evidence, delivery state, owner redirects, and bound RPC wrappers | 326 |
| `setup-run/setup-run-binding.ts` | Binding and lifecycle validation, bound record construction, and fixed run and refusal copy | 188 |
| `setup-run/setup-run-bound.coordinator.ts` | Agent and guidance reconciliation, push and terminal verification, start and cancel, poll, and guidance handoff | 434 |
| `setup-run/setup-run-host.ts` | Record host contract, report type, shared run ID and liveness helpers, failure copy, and orphan grace period | 68 |
| `setup-run/setup-run-poll.ts` | Shared poll timer, interval, and stale tick invalidation | 38 |
| `setup-run/setup-run-record.ts` | Apply report fields, including step validation and team-builder fields | 41 |
| `setup-run/setup-run-skill-review.coordinator.ts` | In-flight review cache, stored review lookup, recovery, and record updates | 104 |

The original sibling `setup-run-attempt.ts` moved under `setup-run/`. The event adapter, entry service, and three generation stores changed only the import path for their moved helpers.

## Moved members

| Destination | Members and logic |
| --- | --- |
| Bound coordinator | `reportRun`, `startInitial`, `reporterFor`, `reportStream`, `verifyTerminal`, `whenStarted`, `resolveBlockedStart`, `adoptResumableGeneration`, `observeRun`, `sendBoundStart`, and `restoreGuidanceHandoffs`. `reconcileBound`, `cancelBound`, and `startBound` became `reconcile`, `cancel`, and `start`. The coordinator also owns poll control, guidance completion scheduling, and attempt settlement and eviction calls. |
| Analysis coordinator | `runnerSeen`. `reconcileAnalysis`, `adoptAnalysis`, `syncAnalysisFromRunner`, `runAnalysis`, and `cancelAnalysis` became `reconcile`, `adopt`, `syncFromRunner`, `run`, and `cancel`. |
| Skill-review coordinator | `reviews`, `reviewSkills`, `readStoredReview`, `applyReviewed`, and `reconcileReview` (now `reconcile`). |
| Attempt tracker | Existing `SetupRunAttempts` and the three bound RPC wrappers. `SetupRunAttempt` is exposed as a readonly view. `clearPending`, `assignOwner`, `isPending`, `hasPendingInitialStarts`, `startPromise`, and `resolveTargetId` provide access to attempt state. |
| Binding module | `isBound`, `bindingOf`, `workflowOfBinding`, `isRunLifecycle`, `isTerminalLifecycle`, `matchesBinding`, `isRunBinding`, `startRefusalCopy`, `hasCommittedGuidance`, `isFinalizationCorrection`, and `verifiedRunStatus`, with their constants. `createBoundRunRecord` takes over validation and construction from `adopt`. |
| Host, poll, and report modules | The host exports `SetupRunReport`, `FAILURE_COPY`, `ORPHAN_GRACE_MS`, `isLive`, and `newRunId`. The timer module exports `SetupRunPoll` and the poll interval. `applyReportFields` handles field updates while the store retains terminal transitions, cancellation flags, unseen state, and persistence. |

## Public API

- A TypeScript AST comparison against the pre-edit store matched all 34 public declarations, including the constructor, method parameter declarations and return types, and all public signal initializers. It also matched the direct module export names, both exported interface declarations, and the poll interval value. The store re-exports the moved report type and poll constant.
- SHA-256 comparisons matched the pre-edit bytes for `src/index.ts`, `src/app.ts`, and `setup-run.store.spec.ts`.
- A comparison of the library's relative production TypeScript import graph, including type-only edges, found the same six edges participating in cycles before and after. The store still resolves the existing handoff service lazily. The new collaborators add no providers or cyclic edges.
- Evidence is in `.ptah/tmp/b15-api-and-dependencies.log`.

## Checks

| Check | Result | Log |
| --- | --- | --- |
| Jest, setup-wizard service specs | 17 suites, 538 tests passed | `.ptah/tmp/b15-jest.log` |
| TypeScript, setup-wizard library | Exit 0 | `.ptah/tmp/b15-tsc.log` |
| ESLint, setup-wizard services | Before 0 errors and 48 warnings. After 0 errors and 47 warnings. The store's max-lines warning was removed. | `.ptah/tmp/b15-eslint-before.log`, `.ptah/tmp/b15-eslint-after.log` |
| Degradation audit | Exit 0, total 0 unsuppressed sites | `.ptah/tmp/b15-degradation.log` |

Ptah diagnostics reported zero issues in the requested files. Its wider scan flagged two `guidanceHandoff` fixture typing errors in the byte-identical store spec and eight BigInt target errors in shared dependencies. The requested library typecheck and the service Jest run passed. See `.ptah/tmp/b15-ptah-diagnostics.log`.

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| Bound workflow handles Batch 9 handoff restoration and scheduling. | The root could retain both policy branches. They now sit with generation reconciliation because they act on completed agent records and their guidance children. Activation still restores before reconcile, writes still schedule after record updates, and the root supplies the existing lazy DI lookup. | Yes |
| Skill-review collaborator handles Batch 10. | The root could keep the judged-call cache with dispatch. The cache, stored-review lookup, and review retry and recovery logic share one workflow, so the collaborator owns those while the root keeps the public entry point and retry/rerun dispatch. | Yes |
| Preserve the current style-fix logic on move. | The split could also redesign bound start responses. Binding normalization, refusal handling, typed RPC and observation results, and audit annotations moved with their workflows. The optional response-union redesign remains separate from this refactor. | Yes |
| The store constructs the attempt tracker and passes it to the bound coordinator. | The review places construction in the bound coordinator. The existing cap-eviction regression reads `store['attempts']` and verifies its delivery state, so the store keeps that private field while the coordinator owns operations on the tracker. Clear and owner writes check transaction identity. | Yes |
| Use direct promise forwarding for three facade methods. | Retaining an extra `async` wrapper could add a promise-adoption step to `verifyTerminal`, `reviewSkills`, and `resolveBlockedStart`. The async bodies now live in the coordinators and the public methods return those promises directly with the original signatures. | Yes |
| Extract record field mapping and bound-record construction. | Keeping these bodies on the facade left it over 700 physical lines. The store still owns adoption, record insertion, and side effects. At 694 lines it meets the ceiling and exceeds the preferred 450-line target. | Yes |
| Keep sibling edits to moved imports. | Finding 3 proposes sharing the starting-state literal across two stores. Adopting that helper requires edits to sibling method bodies, beyond the specified imports-only write set. Both call sites retain their existing logic. | Yes |

## Clarifications Needed

None.
