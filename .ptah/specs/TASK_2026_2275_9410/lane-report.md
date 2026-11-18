# Idle-session automatic hand-off gate

## Files changed

- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts`: add `activeSessions`, observe streaming inside the existing tracked evaluation before checking budget stage, gate candidates and asynchronous revalidation; update short comments. Final file: 620 lines (below 700).
- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts`: four regression tests; existing scenarios use `startAfterTurn` to observe streaming with a below-limit budget before restoring their original state. Existing assertions, including PR 1422 settlement assertions, retained.
- `.ptah/specs/TASK_2026_2275_9410/lane-report.md`: this report.

## Gate logic (5 lines)

1. Read mounted tabs from `budgetTabs()` in the existing tracked effect evaluation.
2. Record each string `claudeSessionId` observed with `status === 'streaming'`, before filtering budget stage.
3. Retain recorded ids when turns finish, allowing late budget updates to qualify.
4. After the auto-handoff setting check, skip unobserved sessions and log `no turn in this page lifetime`.
5. Return null from `stillQualifies()` for unobserved sessions before an asynchronous send can proceed.

## Validation commands and actual results

All commands ran in `D:\projects\ptah-extension\.claude-worktrees\auto-handoff-idle-session`. No install, Nx, verify, build, serve, dev, e2e, package, commit, push, PR or branch-change commands ran.

### Focused Jest (run twice)

```powershell
npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.auto-handoff.spec.ts
```

- First run: FAIL, exit 1; 1 suite passed / 1 failed, 46 tests passed / 2 failed, 48 total. Failures were the newly added log-format expectation and the priming helper's null budget excluding background tabs from `budgetTabs()`.
- Corrected the assertion to the existing log format and primed fixtures with a below-limit budget instead.
- Final run: PASS, exit 0; 2 suites passed / 0 failed, 48 tests passed / 0 failed; 9.978 seconds.
- `session-budget-actions.auto-handoff.spec.ts` passed without edits.
- New coverage: idle reopened limit session performs no probe/claim/send; that session streams and queues exactly once; streaming ends before the budget reaches limit and still sends; background partition enforces the same no-probe/no-claim/no-send gate until streaming.

### Library TypeScript

```powershell
npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json
```

PASS, exit 0; no diagnostics.

### Spec TypeScript

```powershell
npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json
```

FAIL, exit 2; 383 `error TS` diagnostics, zero containing `session-auto-handoff-coordinator`. Captured PowerShell output and counted `error TS` and coordinator-path matches. Examples: TS2352 in `resize-handle.component.spec.ts:7`, TS2352 in `agent-card-truncation.spec.ts:138,142`, TS2345 in `compact-lane-rows.spec.ts:118`, branded-id and missing event-field errors in `compact-session-card.component.spec.ts`. These concern untouched files; no baseline checkout comparison was run.

### ESLint

```powershell
npx eslint libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts
```

PASS, exit 0; no file lint diagnostics. Two infrastructure notices state that `@nx/enforce-module-boundaries` was skipped because no cached ProjectGraph is available. Did not create a graph by running prohibited Nx commands.

### Ptah diagnostics

`ptah_get_diagnostics` scoped to the two changed TypeScript files, run twice: initial result unavailable while the compiler continued past 45 seconds; retry returned 0 diagnostics in requested files and 380 errors / 0 warnings in sibling files. Its aggregate differs from the explicit spec compiler run above; neither reported an error in the changed files.

## Read-only inspection and tool availability

- `git show HEAD --stat`: PASS, exit 0; confirmed HEAD `7b1ef1585e788f9ae781590cc783010b454a8986`, PR 1422's single-send settlement fix. No edits to `awaitingSettlement` or its assertions.
- Read task `context.md`, root `CLAUDE.md`, the Angular skill, current coordinator/spec, relevant status documentation and manual action code with `Get-Content` (including scoped `Select-Object` reads): successful; test counts not applicable.
- Ptah workspace analysis and AST analysis of both target files succeeded. Ptah file search found both repository Angular skill copies; no native skill-loading tool was listed, so read `.claude/skills/angular-frontend-patterns/SKILL.md` directly and followed it.
- `ptah_search_files` returned zero `AGENTS.md` files; native `rg --files -g AGENTS.md -g tsconfig.spec.json libs/frontend/chat` confirmed the spec config. This was the fallback after the empty Ptah search.
- Requested free-text `rg` searches for `autoHandoff`, `buildHandoffCommand`, `SessionAutoHandoffService.claim` across `libs/frontend`, plus targeted status, claim, queue, fixture and coordinator-wiring searches, supplied the evidence below. No additional files needed edits.
- `(Get-Content libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts).Count`: 620.
- Native apply-patch and Python/Path fixture edits succeeded. No writes outside the two target source files and this report.

## Status evidence and other hand-off triggers

`libs/frontend/chat-types/src/lib/chat-types.ts:493-517` documents all `SessionStatus` literals. Only `streaming` proves active token generation. `resuming` is an attach RPC; `awaiting-background` and `sleeping` explicitly describe an idle agent. No other status qualifies as a live turn for this gate.

The frontend search found no independent automatic hand-off trigger for freshly loaded sessions:

- `ChatStore` injects the root coordinator; it is the same trigger.
- `SessionBudgetActionsService` builds the same command for explicit `requestWrapUp()`/retry actions and resumes an already-requested manual action after compaction. Its deferred-manual timeout can claim an entry to mark failure; it does not initiate an automatic hand-off on load.
- `FollowUpQueueService` reads/releases an existing claim while delivering the queue; it does not create a new automatic request from budget state.
- View/banner code projects queue/cancel state; settings code configures the setting; `session-handoff-prompts.ts` only constructs command text. No second gate fix was needed.

## Decisions

- Use only `streaming`, as required by the task and confirmed by status documentation. Broader status acceptance would admit idle agents. Reversible, confined to the coordinator gate.
- Preserve existing direct-send/settlement scenarios by recording a real tracked streaming fixture state below limit before restoring the original fixture. This exercises the new precondition without changing those assertions. Reversible test-only choice.

## Open risks / verification limits

- Spec-wide compilation is not green because of diagnostics in untouched sibling files; no changes were made to those files. Attempted parent notification via ptah_agent_report was refused with parent-inbox-full; this report and the final response carry the limitation.
- ESLint module-boundary enforcement was unavailable without a cached graph.
- No Electron runtime screenshot or end-to-end check ran: this changes service eligibility only, no templates/styles; only the explicitly authorized focused checks ran.
- Observation is limited to tabs returned by existing `budgetTabs()`; its existing background filter excludes tabs without a budget. This selection was retained as instructed.
- Observed ids persist for the coordinator/page lifetime by design; ending or unmounting a turn does not erase eligibility.

