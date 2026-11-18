# Sticky turn-activity record — follow-up lane report

## Files changed

- `libs/frontend/chat-state/src/lib/session-turn-activity.store.ts` (new): page-lifetime injectable, private `signal<ReadonlySet<string>>`, tracked `hasTurnActivity(sessionId)` read, idempotent `recordTurnActivity(sessionId)` writer.
- `libs/frontend/chat-state/src/index.ts`: public store export at line 23.
- `libs/frontend/chat-state/src/lib/tab-manager.service.ts`: import, injection and synchronous hook in the existing private mutation boundary; nine lines added, final file 3552 physical lines. No terminal-state recording.
- `libs/frontend/chat-state/src/lib/tab-manager.intent-mutators.spec.ts`: seven real TabManager/store regressions in `page-lifetime turn activity` starting at line 146.
- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts`: inject the shared store; replace both eligibility checks with tracked store reads; remove local Set and status sampling. Final file 620 lines. Preserve the coordinating agent's class-comment wording; move its sticky-record field comment to the new store rather than discarding it. No settlement changes.
- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts`: real store with existing fake TabManager pattern; fake streaming/id writes record synchronously; `startAfterTurn` uses the real writer without a detection cycle. Four gate tests retained; add null-budget background, same-tick transition, and store-signal-only wakeup regressions. No existing assertions removed or weakened.
- `.ptah/specs/TASK_2026_2275_9410/lane-report-2.md`: this deliverable.

## Production write sites and safety evidence

There is one production call to the activity writer: `libs/frontend/chat-state/src/lib/tab-manager.service.ts:1785-1791`, before tab writes are committed. It is entered only for an explicit streaming write or a session-id assignment. It resolves an existing active/background tab, merges the intended status/id, and records only a non-null id with resulting `status === 'streaming'`. The store writer at `session-turn-activity.store.ts:12-15` clones the Set only for a new id; neither turn completion nor budget absence clears it. No effect or persistence was added.

The hook covers these accepted writes:

| Write site | Why it establishes running activity and cannot mark a plain idle open/resume |
| --- | --- |
| `tab-manager.service.ts:1877-1885`, `markStreaming()` | Explicit streaming transition; successful message continuation invokes it at `libs/frontend/chat/src/lib/services/message-sender.service.ts:1142`. It is not the resume flag: `markResuming()` writes `resuming`, which the hook rejects. |
| `tab-manager.service.ts:1942-1947,1975-1983`, accepted `applyTurnState()` generating branch | Ownership/revision acceptance runs before the branch; only generating writes streaming. Idle/failed write loaded and never enter the record hook. A live generating status learned during attachment proves a running turn; an idle attached session does not. |
| `tab-manager.service.ts:2238-2249`, `applyNewConversationStreaming()` | Explicit send-path streaming state. An unbound tab records nothing yet; the subsequent id binding below records the id while it is still streaming. |
| `tab-manager.service.ts:2255-2258`, `attachSession()` | Binding alone is insufficient. It records only if the tab already has streaming status. Both initial binding and replacement binding during a running turn are covered. Binding a loaded/resuming tab records nothing. |
| `tab-manager.service.ts:3148-3150`, `setStatus()` | The generic status mutator reaches the same guarded boundary; only a streaming write qualifies. Other statuses do not. |

`rebindTabSession()` at `tab-manager.service.ts:2976-2996` assigns a new id together with `status: 'loaded'`; it does not infer activity from the old session. `applyResumingSession()` at `:3082-3102` sets `resuming` while binding the id, so plain resume records nothing. `applyFinalizedHistory()` at `:2559-2565` writes loaded. `markSessionActive()` changes `hasLiveSession`, not turn activity. Agent/handoff live-tab construction uses an unbound streaming tab (`:1392`, `:1432`); its later `attachSession()` is covered, whereas late adoption constructs a loaded tab.

### Why terminal/statusOnly events are not recorded

The task explicitly permits recording only streaming transitions if terminal freshness cannot be proved. That fallback is necessary:

- `libs/frontend/chat/src/lib/services/chat-store/session-liveness-reconciler.service.ts:14,40,128,152-164` reconciles restored/history tabs via `session:status` and passes its turn state to `TurnStateApplier`, including idle/failed states. The `ordered: false` option disables terminal healing; it does not make a first terminal state unacceptable.
- `libs/frontend/chat-state/src/lib/tab-manager.service.ts:3082-3118` clears last turn-state revision on resume; `:2160-2171` accepts a matching session's first state when the previous revision is undefined. Thus accepted terminal state alone is not evidence that a turn ran this page.
- `libs/frontend/chat/src/lib/services/chat-message-handler.service.ts:597-601` routes `statusOnly` terminal events to `applyHiddenTurnStateStatus()`; `tab-manager.service.ts:2047-2067` uses the same ownership/revision acceptance and writes loaded. It has no page-freshness proof.
- `libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-delivery-coordinator.service.ts:175-190` suppresses hidden generating events and sends terminal-only rail notifications. No backend change is allowed here. There is no reliable new frontend activity marker in those terminal notifications.

The implementation deliberately records neither terminal branch. Unit coverage verifies both accepted normal idle and hidden status-only idle leave the record empty. A hidden externally started turn with no delivered generating event remains outside the supported observation contract; claiming otherwise would reintroduce the old-session false positive risk.

## Coordinator gate

`session-auto-handoff-coordinator.service.ts:178` performs a tracked `hasTurnActivity(sessionId)` read after the setting check; the skip text remains `no turn in this page lifetime`. `:443` revalidates through the same store. Recording no longer depends on `budgetTabs()` or a budget existing. Even if streaming and loaded are written before Angular runs, the signal already contains the session id. A newly recorded id also wakes an already-evaluated idle limit candidate without another tab update.

## Commands and real results (this follow-up)

All commands ran in `D:\projects\ptah-extension\.claude-worktrees\auto-handoff-idle-session`.

### Chat-state focused tests

```powershell
$stateSpecs = @(rg --files libs/frontend/chat-state/src/lib -g '*tab-manager*spec.ts')
npx jest --config libs/frontend/chat-state/jest.config.ts --runInBand --coverage=false --runTestsByPath @stateSpecs
```

PASS, exit 0: **12 suites passed, 324 tests passed, 0 failed**, 17.261 seconds. Included every existing TabManager spec: terminal-failure, service, persistence, notification-pulse, lifecycle, last-terminal-pulse, intent-mutators, history-window, handoff-adoption, cross-workspace, command-center, agent-adoption.

New tests cover immediate sticky streaming; generating/idle in one tick; idle bind/resume/gateway attachment/history load not recording; terminal and hidden terminal not recording; initial/replacement id binding mid-turn; background streaming with no budget; tracked/idempotent store reads.

### Chat focused tests

```powershell
npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.auto-handoff.spec.ts
```

PASS, exit 0: **2 suites passed, 51 tests passed, 0 failed**, 11.207 seconds. Budget actions spec unchanged. Existing settlement, retry, queue and permission assertions remain intact.

### Library typechecks (sequential)

```powershell
npx tsc --noEmit --project libs/frontend/chat-state/tsconfig.lib.json
npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json
```

Both PASS, exit 0 each, zero emitted diagnostics. No spec typecheck command was run in this follow-up, per the narrowed command list.

### Changed-file lint

```powershell
npx eslint libs/frontend/chat-state/src/index.ts libs/frontend/chat-state/src/lib/session-turn-activity.store.ts libs/frontend/chat-state/src/lib/tab-manager.service.ts libs/frontend/chat-state/src/lib/tab-manager.intent-mutators.spec.ts libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts
```

PASS, exit 0: **0 errors, 1 warning**. Warning: existing oversized `tab-manager.service.ts`, max-lines counts 1994 against 700. The file grew by nine physical lines, within the task's approximately 15-line allowance. No boundary-rule skip notices on this run.

### Required Ptah diagnostics

`ptah_get_diagnostics` scoped to the four changed production files (new store, TabManager, public index, coordinator), run twice. First returned unavailable because compilation exceeded 45 seconds. Retry returned **0 diagnostics in requested files**, **402 sibling errors, 0 warnings**. Its project coverage includes specs; one reported error is the pre-existing `ExecutionChatMessage.content` fixture in the edited intent-mutators spec at line 99, before the new tests. Other examples: history-window fixture and lifecycle/persistence specs. No changes made to unrelated fixtures. These diagnostics are a limitation; focused test runs and both permitted library compilers are green.

### Read-only inspection and edits

- First command read `code-logic-review.md` findings 1-3, successfully. Continued using the Angular signal skill already read in the prior lane turn; no skill loader has appeared.
- Ptah AST inspection succeeded for TabManager, message sender, chat-message handler, chat-state index and intent-mutators spec. Ptah search for `**/*turn*spec.ts` returned zero; native `rg --files ... -g '*tab-manager*spec.ts'` supplied the existing suite paths. Ptah located TurnStateApplier in `libs/frontend/chat-streaming`.
- `Get-Content`/scoped `Select-Object` read the write sites, acceptance, resume and liveness paths, coordinator and fixtures. Two guessed read paths were absent (`tab-manager.turn-state.spec.ts`, and TurnStateApplier under chat); corrected using file discovery. These inspection misses did not affect verification commands.
- Free-text `rg` searches traced statusOnly, turn-state, streaming, session-id writes, background updates, record references and final line numbers. Counts: TabManager 3552 physical lines; coordinator 620.
- Native apply-patch and Python/Path writes succeeded. This report was written with native PowerShell. No install, Nx, verify, build, serve, dev, e2e, package or git commands ran. No files outside the permitted directories were edited.
- Parent progress notification was attempted once via `ptah_agent_report` and refused with `parent-inbox-full`; not retried. This file and final response carry the remaining finding.

## Review findings

1. **Closed.** A background tab can stream and finish without any budget. The mutation-boundary writer records activity independently; the first later limit budget fires once. Covered with real TabManager and coordinator tests.
2. **Closed.** Streaming and loaded writes cannot erase the sticky signal record, even in one synchronous flush without change detection. Real accepted generating/idle transitions and the coordinator path are both tested.
3. **Remains, explicitly narrowed under design 2b.** Hidden external turns whose generating event never reaches the renderer are not inferred from terminal-only notifications. Those notifications lack a reliable page-lifetime proof. A complete fix needs a fresh-turn/activity marker or independently delivered generating control event from the backend; that exceeds this frontend-only scope. Recording generic terminals would violate the core idle reopen/resume requirement.

## Decisions and remaining limits

- Follow design 2b's specified safe fallback: record only streaming transitions/id bindings, not terminal acceptance. Evidence and tests above establish why broad terminal inference is unsafe. Reversible once a reliable freshness contract exists.
- Use a small data-access store rather than grow TabManager state; the single guarded hook stays under the requested growth cap. No chat-state import from chat, new effect, subject or persisted state.
- Ordinary old-session open/resume/history loads record nothing; an actual accepted streaming transition marks the session and permits one automatic hand-off under the existing claim rules. Page reload creates a new store.
- No Electron runtime or screenshot check was run; this changes service state only and the task authorizes focused checks exclusively.
