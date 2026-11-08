# Code Style Review — Round 3 — `TASK_2026_AGENT_BUDGET`

Scope: `git show 45bc31626` (fix round 2) and `git show 41ede79ae` (batch G), `.ptah/specs` and merge commits excluded. Head `41ede79ae`, branch `feat/agent-budget`.
Read-only review: no source file was edited, no commit, no push.
Not reviewed: `libs/backend/agent-sdk/**` (another session's open work) — one line of it is cited as evidence only, never as a finding.

## Summary

| Metric | Value |
| --- | --- |
| Overall score | **7/10** |
| Assessment | **NEEDS_REVISION** |
| Blocking issues | **0** |
| Serious issues (new this round) | **4** |
| Serious issues carried partly fixed | 2 |
| Minor issues (new this round) | 12 |
| Round-2 findings closed | 8 of 10 (1 partly, 1 partly carried) |
| Files reviewed | 17 (2 large files through their changed surface only) |
| TypeScript diagnostics | 0 errors, 0 warnings on the 4 `cli-agent-runtime` files (`ptah_get_diagnostics`) |

Fix round 2 is a clean close-out of the previous review: the barrel is trimmed, the observer has one teardown verb, `errorClass` has one definition, the Codex unavailable payload has one builder, the Cursor copy follows its siblings, coordinator state is private with getters, the stop-reason triple derives from one tuple, and the coordinator spec regained its `accept`/dedupe/`turnCount` coverage. Batch G's extraction is the right instinct but the wrong seam, and its Claude telemetry adds a second answer to a question the repository has already answered once.

The score drops from 8 to 7 because batch G, the newest and least reviewed commit, introduces three structural problems in a single file (`lane-budget-deadline.ts`) plus a duplicated cost derivation — and its head-line claim ("no longer than on main") is met by deleting 23 separator lines rather than by shrinking the module. It is not 6/10: no boundary is crossed, no type safety is weakened, and the package compiles clean; every serious item below is a contained, same-day fix.

## Round-2 findings — status

### Serious (round 2)

| # | Round-2 finding | Status | Evidence |
| --- | --- | --- | --- |
| S1 | Fix round deleted the coordinator's `accept` coverage | **Fixed** | `agent-budget-coordinator.spec.ts:16-25` covers warn-once, duplicate-ID dedupe (`turnCount` stays 1), `costUnavailable`, and the `budget` stop; `:27-31` covers missing totals → `telemetry-unavailable` and expiry at the original deadline; `:33-45` covers the late ledger merge. All three coordinator seams named in round 2 (`turnCount`, `stopReason ??=`, `costUnavailable`) now have a direct assertion. |

### Minor (round 2)

| # | Round-2 finding | Status | Evidence |
| --- | --- | --- | --- |
| M1 | Barrel exported observer internals | **Fixed** | `codex-runtime/src/index.ts:115-124` now exports `CodexChildBudgetTap`, `CodexChildBudgetDecision`, `observeCodexChildBudgets` and three types only. `readCodexChildBudgetSettings`, `settleCodexChildBudgetEvent`, `CODEX_CHILD_BUDGET_MAX_ENTRIES` and the newly exported `errorClass` stay inside the library. |
| M2 | Codex 100 ms grace timer with duplicated fallback payload | **Fixed** | Named bound `CODEX_LANE_USAGE_DRAIN_MS = 2_000` (`codex-app-server-lane.adapter.ts:70-71`), cleared on close (`:438`) and on terminal (`:698`), unref'd (`:694`); one builder `unavailableTelemetry(usage?, modelId?)` (`codex-lane-events.ts:45-54`) used by both the drain (`:42`) and the invalid-usage branch (`:75`). |
| M3 | `errorClass` duplicated inline | **Fixed** | One definition (`codex-child-budget-observer.ts:47-49`), used at `codex-runtime.ts:134,354,485`. |
| M4 | Two teardown verbs for two observers | **Fixed** | `CodexChildBudgetObserver.dispose` (`codex-child-budget-observer.ts:24,122`) and `codex-runtime.ts:493`; spec updated (`codex-child-budget-observer.spec.ts:109,115-116,143`). |
| M5 | Public `rebind` and mutable public state | **Fixed** | Private `_startedAtMs/_stopReason/_turnCount` with getters (`agent-budget-coordinator.ts:16-18,32-34`), `rebind` private (`:65`). New nits: stale doc comment on `rebind` and the merge arithmetic — minor M10 below. |
| M6 | Settings port resolved on every read | **Fixed** | Once per scope in all three roots: `apps/ptah-electron/src/di/codex-runtime-composition.ts:239,248`, `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts:300,350`, `apps/ptah-electron/src/di/codex-lane-composition.ts:117-119,154,204`; the Electron scope specs supply the port (`codex-runtime-composition.spec.ts:63,121-125`). New nits: three names for one dependency, and the resolve sits outside the scope's cleanup `try` — minors M3/M4 below. |
| M7 | Bare event-loop yield in the ACP prompt path | **Partly fixed** | The one-tick `setImmediate` is gone and replaced by a named bound and an explicit resolver (`acp-session-handle.ts:87-88,801-807`). But the new wait is *less* careful than its own neighbour: it is not abort-aware, not unref'd, and its timer handle is unreachable after `finally` (`:828`). Serious S3 below. |
| M8 | Stop-reason predicate re-listed the triple | **Fixed** | `AGENT_BUDGET_STOP_REASONS` tuple + spread + predicate (`libs/shared/src/lib/types/agent-process.types.ts:325-342`). New nit: the JSDoc that documents the list now attaches to the private tuple — minor M8 below. |
| M9 | Cursor always said “Cursor turn usage.” | **Fixed** | `cursor-cli.adapter.ts:487` selects the unavailable sentence when `usage` is absent and keeps one payload. |

### Carried from round 2, not a round-2 numbered finding

| Item | Status | Evidence |
| --- | --- | --- |
| S5 — 3 9xx-line manager owns deadline and warn/stop | **Partly fixed** | Confirmed: **3 848** physical lines in the worktree vs **3 849** in `origin/main` (`ff5f40803`) — one line shorter, as the brief states. But non-blank code lines are **3 694 vs 3 675** (+19), because batch G also deleted **23 blank separator lines** (`git show 41ede79ae` on the manager: 86 removed / 16 added, 23 of the removals blank, 0 blank added). The module is no longer the owner of the deadline/warn logic, which is the real win; the size claim is a line-count artefact — minor M9 below. |

## New findings — Serious

### S1 — `lane-budget-deadline.ts` is split by line count, not by responsibility

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-budget-deadline.ts:6-21,23-35,51-76`
- Problem: five exports, three unrelated concerns. `laneRecordsForSession` (`:6-10`) and `previousResumeRecord` (`:12-21`) are session-record lookups with no budget content; `createLaneBudget` (`:23-35`) is budget construction; `armLaneBudgetDeadline` (`:37-49`) is the deadline; `acceptLaneTurnTelemetry` (`:51-76`) is an orchestration step. Only 26 of 76 lines are about a deadline, yet the file is named after it. Two of the lookups duplicate the responsibility of `lane-restore.ts`, which already owns lane-record helpers (`lane-restore.ts:91 laneLastActivityAt`).
- Impact: the next change to "which record a resume continues" has to know to look in a file named after budget deadlines, and the manager's import list (`agent-process-manager.service.ts:112`) now pulls five names from a module that answers two different questions.
- Fix: keep `createLaneBudget` + `armLaneBudgetDeadline` here (the name then fits), move the two lookups next to `laneLastActivityAt` in `lane-restore.ts`, and `acceptLaneTurnTelemetry` back into the manager as a private method (see S2).

### S2 — the extracted telemetry handler carries the manager's side effects and its log namespace

- File: `lane-budget-deadline.ts:51-76`; caller `agent-process-manager.service.ts:1467-1476`
- Problem: `acceptLaneTurnTelemetry` takes `agentId`, a `Logger`, a `warn` callback and a `stop` callback, and then (a) re-checks `tracked.info.status !== 'running'` (`:61`) although its only caller already guards exactly that condition (`agent-process-manager.service.ts:1467`), (b) emits two log lines prefixed `[AgentProcessManager]` from a module that is not the manager (`:66,70,72`), and (c) owns the steer text `'Budget warning: finish your current work…'` (`agent-process-manager.service.ts:1471`). Both callbacks have exactly one implementation, which the repository's simplicity rule forbids as an abstraction. What is genuinely reusable is the pure decision: `budget.accept()` → `{ record, warning, stopReason, costUnavailable }`.
- Impact: the lane's warning/stop flow can no longer be read in one place — a reader following `onSegment` jumps files and comes back to discover who steers, who stops and what the user sees. The `[AgentProcessManager]` prefix is now attributable to two files, so log-based triage lies.
- Fix: make the helper pure and side-effect free (`settleLaneBudget(tracked, telemetry)` returning the record and the flags, or keep `budget.accept()` inline as before) and leave `sendToAgent` → steer, `logger.warn/info/error` and `stopLaneForGuard` in the manager, which already owns all three. That keeps the 100-line extraction of `createLaneBudget`/`armLaneBudgetDeadline` and drops the callback plumbing.

### S3 — the new ACP usage drain has no release path and no abort awareness, unlike the wait three hundred lines above it

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp/acp-session-handle.ts:798-807,826-831`
- Problem: `await new Promise(resolve => setTimeout(resolve, ACP_USAGE_DRAIN_MS))` holds the event loop for up to two seconds, is not `unref()`ed, and its handle becomes unreachable when `finally` sets `resolveUsageUpdate = undefined` (`:828`). Closing the handle (`abort`) while a prompt is draining cannot clear it, because no one keeps the `timer`. This file already demonstrates the correct shape for the same problem at `:862-880`: an abort-aware `Promise.race` with its own `AbortController` so the listener is released. The Codex sibling does the other half correctly (`codex-app-server-lane.adapter.ts:438,694` clears and unrefs). Evidence that the timer is live: an existing handshake test had to be taught to advance it (`acp-session-handle.spec.ts:1137-1143`).
- Impact: a cancelled or closed ACP lane keeps the Electron main process alive for up to two seconds and leaves a jest open-handle whenever a test closes mid-drain; the two identical 2 s bounds now behave differently under teardown.
- Fix: keep the resolver, but hold the handle (`let usageDrainTimer`), `clearTimeout` it in the `finally` and in the abort listener, and `unref()` it, matching `:862-880` and the Codex adapter. The bounded-wait decision itself is sound and documented.

### S4 — one turn now carries two costs with two different meanings, in the same emission

- File: `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.ts:652-661` vs `:861-863,874-876`
- Problem: batch G derives a per-turn delta (`Math.max(0, msg.total_cost_usd - this.previousTurnCostUsd)`, `:652-653`) and puts it in `turnTelemetry.usage.providerCostUsd` (`:659`), while `turnUsage()` still returns the raw cumulative `msg.total_cost_usd` as `usage.costUsd` (`:861-863`, `:874-876`), which the same turn emits on the segment three lines above (`:666`). Nothing in the code says which one is the turn's cost. The repository already answered this question once, with a restored base and a test contract (`stream-transformer.spec.ts:3041,3045-3050`, TASK_2026_575: “`total_cost_usd` … is cumulative: never republished as a turn cost”), and the new code answers it a second time with a zero base and no comment.
- Impact: a reader who sums `segment.usage.costUsd` per turn inflates a session; a reader who copies the zero-base formula into a resume path over-counts the first turn. Two formulas for one quantity with no marker is exactly the drift this review exists to stop. (The behavioural question — whether the zero base is wrong on a resumed process — belongs to `code-logic-reviewer`; I am reporting only the duplicated derivation.)
- Fix: one source. Either return the delta as `usage.costUsd` and delete the cumulative assignments at `:861-863,874-876`, or name the two fields so their difference is visible (`usage.sessionCostUsd` vs `providerCostUsd`) and comment it once. Do not leave both under `costUsd`/`providerCostUsd` with no note.

## New findings — Minor

| # | Finding | File:line | Note |
| --- | --- | --- | --- |
| M1 | Named domain type bypassed for a `ReturnType` expression | `lane-budget-deadline.ts:57` | `stop: (reason: NonNullable<ReturnType<AgentBudgetCoordinator['accept']>['stopReason']>) => void` — `AgentBudgetStopReason` is exported from `@ptah-extension/shared` and is exactly this type (`agent-budget-coordinator.ts:7,74`). The derived form makes a caller read two files to learn the parameter. |
| M2 | One module, two shapes for the same object | `lane-budget-deadline.ts:37-41` vs `:52` | `armLaneBudgetDeadline` takes a structural `{budget?, budgetTimer?, info:{status}}`; `acceptLaneTurnTelemetry` takes `TrackedAgent`. `TrackedAgent` already declares `budget`/`budgetTimer` (`tracked-agent.ts:12-13`), so the structural type buys nothing and forces the spec to hand-build an object and cast (`lane-budget-deadline.spec.ts:13,27`). Use `TrackedAgent` in both. |
| M3 | Three names and two shapes for the cached workspace provider | `apps/ptah-electron/src/di/codex-runtime-composition.ts:239` (`budgetSettings`, holds an `IWorkspaceProvider`); `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts:300` (`workspaceProvider`, holds the provider); `apps/ptah-electron/src/di/codex-lane-composition.ts:118` (`workspaceProvider()`, is a getter) | `budgetSettings` is the worst of the three: `budgetSettings.getConfiguration(...)` reads as if `AgentBudgetSettings` had a config reader. The getter also breaks the naming of the two memos directly above it (`getMetadata`, `getStore`, `:100-110`). Pick `workspace` / `getWorkspace` in all three. |
| M4 | New dependency resolved outside the guard that releases the scope | `codex-runtime-composition.ts:238-240`; `codex-lane-runtime-composition.ts:299-300` | `createChildContainer()` then `resolve(IWorkspaceProvider)` then `try`: a throw from the resolve skips `container.dispose()` / `scope.dispose()`. Move the resolve one line inside the `try` (or use the lazy memo the Electron lane root already uses). |
| M5 | A cumulative total named as if it were the previous turn | `ptah-cli-stream-loop.service.ts:273` | `previousTurnCostUsd` holds the previous *cumulative* `total_cost_usd`; its neighbour documents exactly that distinction (`:269-272`). Rename to `previousResultCostUsd`/`previousCumulativeCostUsd` and give it a one-line comment; today it reads as "last turn's cost", which is what subtracting it produces, not what it stores. |
| M6 | `sessionModel` is now write-only, with a comment that still claims otherwise | `ptah-cli-stream-loop.service.ts:267,475` (assignment) vs `:816` (no longer read) | Batch G changed `const model = this.turnModel ?? this.sessionModel` to `this.turnModel`, orphaning the field and its doc (“the usage segment's fallback model”). Delete the field, the assignment and the comment, or keep a reader. |
| M7 | `'mixed-model'` is a sentinel in a domain field with no declaration | `ptah-cli-stream-loop.service.ts:657` | `modelId` is documented as the model that incurred the delta (`agent-turn-usage.types.ts:20`) and `'mixed-model'` will miss every pricing lookup. The batch-G report records the justification (the schema requires `modelId`), but the code does not: name it (`const MULTI_MODEL_ID = 'mixed-model'`) and state the rule where it is used. |
| M8 | The documented stop-reason list lost its JSDoc | `libs/shared/src/lib/types/agent-process.types.ts:315-329` | The comment explaining why a host ends a lane (“TASK_2026_597, R9.4”, `:315-324`) now documents the private `AGENT_BUDGET_STOP_REASONS` tuple; the exported `LANE_STOP_REASONS` has no doc. Move the tuple above the comment. |
| M9 | 23 separator lines deleted to meet a size target | `agent-process-manager.service.ts:142-165,199-206,322-356` | Every top-level declaration in this file now abuts the next, unlike any sibling file. The 3 848-vs-3 849 claim is one physical line; code lines are +19 vs main. Report the real number instead of buying a line with spacing. |
| M10 | `rebindRecord` merge arithmetic and a stale `rebind` doc | `agent-budget-coordinator.ts:49-62,64-65` | The merge is three `sameLedger ? 0 : …` ternaries (`:57,58,61`) plus `Math.min` of two starts; `sameLedger` really means “the prior record already contains every provisional turn ID”. The doc on `rebind` (`:64`) still says “before accepting its first completed turn”, which `rebindRecord` now deliberately allows after one. Extract `mergeBudgetLedgers(prior, snapshot, turnCount)` and fix the sentence. |
| M11 | The `turnCount` fallback rule is written three times | `agent-budget-coordinator.ts:24,61`; `lane-budget-deadline.ts:33` | `record.turnCount ?? record.turnIds.length` and its two variants encode one rule in three places; one `turnCountOf(record)` (or making `turnCount` required on `AgentBudgetRecord`) removes it. |
| M12 | A fourth timer-release idiom | `codex-app-server-lane.adapter.ts:694` | `usageDrainTimer.unref?.()` — the repository uses `unrefTimer` (`agent-process-manager.service.ts:2928-2931`) or `(timer as { unref: () => void }).unref()` (e.g. `libs/backend/cli-engine/src/lib/platform/cli-platform-commands.ts:156`). `?.` on a `NodeJS.Timeout` is dead optionality. Minor; the release itself is correct. |

## New files and new surface — assessment

### `lane-budget-deadline.ts` (+ spec) — 5/10

Correct instinct (the deadline and the resumed-budget construction belong outside a 3 848-line service), wrong seam: three responsibilities, a name that covers one, the manager's side effects and log prefix inside a free function, and a structural parameter type that its own sibling in the same file does not use (S1, S2, M2). The spec (`lane-budget-deadline.spec.ts`, 36 lines) covers the two arming behaviours well — remaining time, rearm clears the stale timer — and nothing else.

Coverage gap worth naming on its own: **four of the five exports have no direct test** — `createLaneBudget`, `previousResumeRecord`, `laneRecordsForSession` and `acceptLaneTurnTelemetry`. The last one owns the budget warning steer, the cost-unavailable warning and the stop dispatch, and the manager spec exercises none of them (`agent-process-manager.service.spec.ts` touches only `agentBudget.maxDurationMin` and the restored record, `:2287-2357`). Round 2's only serious finding was “an extraction lost its direct coverage”; this extraction repeats it. That is why the score is 5, not 6, and it is the single cheapest item to close.

### Workspace-provider caching in the three composition roots — 7/10

The fix is right: one resolve per scope, settings values still read fresh through `getConfiguration`, and the Electron lane's lazy memo mirrors `getMetadata`/`getStore` immediately above it (`codex-lane-composition.ts:97-119`) with the Phase-2 ordering constraint documented at `:115-116`. Deductions are naming and placement only (M3, M4). Boundary check: `apps/ptah-electron` and `libs/backend/cli-engine` import `IWorkspaceProvider` and `PLATFORM_TOKENS` from `@ptah-extension/platform-core` as their siblings do — no new deep import, no new vscode coupling.

### Claude telemetry in `ptah-cli-stream-loop.service.ts` — 6/10

The right primitives are used (`completedTurnTelemetry`, `AgentUsageSource`, the existing delta-per-result shape) and the turn ID stays `${session}:${turnIndex}`, so the accounting identity matches the other adapters. The cumulative-delta math is the weakest part: the cost delta is a nullable scalar, the token delta is a map, the two are computed in different methods, only the telemetry copy is per-turn, and the field that used to name the model is now dead. See S4, M5, M6, M7. Against the other adapters (`antigravity:839`, `acp:812`, `copilot:511`, `cursor:489`, `opencode:958`, `pi:545`) this file is the only one that has to manufacture a per-turn value, which is where the extra state came from — acceptable, provided one value is authoritative.

File growth: 880 lines vs 862 on main (+18). It was already over the 700-line warning threshold in `eslint.config.mjs:517-520`; +18 does not change the verdict, but it is another 18 lines in a file that should be the next split candidate.

## Five style questions

### 1. What breaks in six months?

- A new budget stop reason has one place to change (`agent-process.types.ts:325`) — good. A new *lane budget behaviour* (e.g. warn-then-extend) has to be added to a file named `lane-budget-deadline.ts` that also owns session lookups, or to `acceptLaneTurnTelemetry`, which knows the manager's log prefix — someone will add it to the wrong one (S1/S2).
- A change to the per-turn cost rule will be made in `turnUsage` and silently leave the telemetry formula at `:652` untouched, because nothing ties them together (S4).
- An ACP transport change (a new usage flush, or a new cancel path) meets a 2 s timer with no handle in scope (`acp-session-handle.ts:801-807`); the next author deletes it as stray, and the 100 ms regression of round 1 returns.

### 2. What would a new team member misread?

- `budgetSettings.getConfiguration(...)` (`codex-runtime-composition.ts:239,248`) — they will look for `AgentBudgetSettings` and find a workspace port.
- `previousTurnCostUsd` (`ptah-cli-stream-loop.service.ts:273`) — they will subtract it as if it were the last turn's cost; that is the operation it feeds, not what it stores.
- `'mixed-model'` (`:657`) — they cannot tell it is a sentinel, so they will assume a provider called “mixed”.
- `lane-budget-deadline.ts` — they will assume all five exports are deadline logic (four are not).
- `rebind`'s doc (`agent-budget-coordinator.ts:64`) still says the binding happens “before accepting its first completed turn”, which the new merge exists to handle *after*.

### 3. What does this cost to maintain?

- One extra hop per budget event (manager → free function → two callbacks → manager), a duplicated status guard, and two log lines attributed to a file that does not emit them.
- Three encodings of the `turnCount` default, two of the “start of a ledger”, one of the “same ledger” test — all in the accounting path the whole task is about.
- 23 deleted separator lines that will be reintroduced by the next formatter or author, re-creating the churn in an already large diff.

### 4. Where is this inconsistent with the rest of the repository?

- Every sibling module in `cli-agents/` that extracts lane-record logic puts it in `lane-restore.ts` (`lane-restore.ts:91-118`); the new module keeps lookups in a budget file.
- The repository has one documented per-turn cost contract with a restored base (`stream-transformer.spec.ts:3045-3050`); this file adds a second with a zero base.
- Timer release is `unrefTimer` / `(timer as { unref })()` everywhere (`agent-process-manager.service.ts:2928`, `cli-platform-commands.ts:156`); the two new drains use `unref?.()` (Codex) and nothing (ACP).
- Sibling memo getters are `getX` (`codex-lane-composition.ts:100,105`); the new one is `workspaceProvider()`.
- Every other top-level declaration in the backend libs is separated by a blank line; the manager's no longer are.

### 5. What would you have done differently?

- `lane-budget-deadline.ts` = `createLaneBudget` + `armLaneBudgetDeadline` only; lookups to `lane-restore.ts`; the manager keeps its own steering/stopping/logging with `budget.accept()` inline or behind a pure `settleLaneBudget`.
- Coordinator: `mergeBudgetLedgers(prior, snapshot, turnCount)` as a named function with one branch, and `turnCountOf(record)` shared by `record`/`rebindRecord`/`createLaneBudget`.
- ACP: copy the abort-aware wait from `acp-session-handle.ts:862-880` (Promise.race + AbortController + unref) instead of a bare timer.
- Stream loop: one `usageDelta(msg)` returning `{ usage, costUsd }` where `costUsd` is the turn delta only, so `usage.costUsd` and `providerCostUsd` cannot disagree; delete `sessionModel`.
- Report size honestly: 3 848 physical / 3 694 code lines vs main's 3 849 / 3 675, with the two extracted modules counted.

## File-by-file

| File | Score | B/S/M | Note |
| --- | --- | --- | --- |
| `cli-agents/lane-budget-deadline.ts` | 5/10 | 0/2/2 | Three concerns, misleading name, manager side effects inside, structural param (S1, S2, M1, M2). |
| `cli-agents/lane-budget-deadline.spec.ts` | 6/10 | 0/1/1 | Two arming cases are good; 4 of 5 exports untested (coverage gap above). |
| `cli-agents/agent-budget-coordinator.ts` | 8/10 | 0/0/2 | Private state + getters fixed M5; merge arithmetic and stale `rebind` doc (M10, M11). |
| `cli-agents/agent-budget-coordinator.spec.ts` | 9/10 | 0/0/0 | Round-2 S1 closed; dedupe, `turnCount`, stop, expiry and merge all asserted. |
| `cli-agents/agent-process-manager.service.ts` | 7/10 | 0/0/2 | Deadline/warn logic now delegated (`:830-833,1339,1468`); 23 blank lines deleted, five-name import line (M9). 3 848 lines. |
| `cli-agents/cli-adapters/acp/acp-session-handle.ts` | 7/10 | 0/1/0 | Named bound and resolver; no abort/release path (S3). |
| `cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts` | 8/10 | 0/0/1 | Named, unref'd, cleared drain (M12 idiom). |
| `cli-agents/cli-adapters/codex/codex-lane-events.ts` | 9/10 | 0/0/0 | One `unavailableTelemetry` builder; drain and invalid-usage paths share it. |
| `cli-agents/cli-adapters/cursor-cli.adapter.ts` | 9/10 | 0/0/0 | Copy now matches ACP/Pi. |
| `libs/backend/codex-runtime/src/index.ts` | 9/10 | 0/0/0 | Barrel trimmed to the host-facing surface. |
| `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts` | 9/10 | 0/0/0 | `dispose`, shared `errorClass`, internals unexported. |
| `libs/backend/codex-runtime/src/lib/codex-runtime.ts` | 9/10 | 0/0/0 | One verb, one helper, three call sites. |
| `libs/shared/src/lib/types/agent-process.types.ts` | 9/10 | 0/0/1 | One tuple drives list and predicate; JSDoc misplaced (M8). |
| `apps/ptah-electron/src/di/codex-runtime-composition.ts` | 7/10 | 0/0/2 | Resolves once; misleading name, resolve outside `try` (M3, M4). |
| `apps/ptah-electron/src/di/codex-lane-composition.ts` | 7/10 | 0/0/1 | Lazy memo matches neighbours, wrong verb name (M3). |
| `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts` | 8/10 | 0/0/1 | Resolves once; resolve outside `try` (M4). |
| `ptah-cli/helpers/ptah-cli-stream-loop.service.ts` | 6/10 | 0/1/3 | Two cost meanings in one emission (S4); dead `sessionModel`, cumulative-named field, undeclared sentinel (M5-M7). 880 lines. |

## Pattern compliance

| Repository rule or nearby convention | Status | Evidence |
| --- | --- | --- |
| `scope:*`/`type:*` tags and `@nx/enforce-module-boundaries` | NOT_APPLICABLE | No new project or tag was added in these two commits. |
| Cross-lib imports through `@ptah-extension/<lib>` barrels, no deep `/src/` | PASS | `lane-budget-deadline.ts:1-2` imports `@ptah-extension/shared` and `@ptah-extension/vscode-core`; the manager imports the helper relatively inside its own lib (`agent-process-manager.service.ts:112`); both roots use `@ptah-extension/platform-core` (`codex-runtime-composition.ts:239`, `codex-lane-runtime-composition.ts:300`). |
| No new `vscode-core` leak | PASS (pre-existing coupling) | `lane-budget-deadline.ts:2` imports `type Logger` from `@ptah-extension/vscode-core`; `cli-agent-runtime` already does this at its root (`agent-process-manager.service.ts:18-23`), so this is the library's existing shape, not a new edge. Worth retiring, not a finding. |
| Hexagonal direction: agnostic libs depend on ports, not adapters | PASS | `cli-engine` resolves `IWorkspaceProvider` through `PLATFORM_TOKENS`, never a concrete implementation (`codex-lane-runtime-composition.ts:300`). |
| Electron DI phase file + `expected-resolvable.ts` | PASS | No token or registrable class was added; the scope factory gains a resolve of an existing port only (`codex-runtime-composition.ts:239`). |
| Tokens `Symbol.for(...)`, ports `I*`, kebab-case role-suffixed filenames | PASS | No new token or port. `lane-budget-deadline.ts` matches its directory's naming (`agent-budget-coordinator.ts`, `lane-budget-guard.ts`, `lane-resume-gate.ts`). |
| Type precision: no `any`, `@ts-ignore`, `@ts-expect-error`, `as unknown as` in production | PASS | Diff scan of both commits: the only hits are doc prose (`AgentWaitMode` comment) and `as unknown as SDKMessage` in `ptah-cli-stream-loop.service.spec.ts:972,980` (spec fixture idiom, repo-wide). `ptah_get_diagnostics` on the four `cli-agent-runtime` files: 0 errors, 0 warnings. |
| No new god file | PARTIAL | `lane-budget-deadline.ts` 76 lines (fine); `ptah-cli-stream-loop.service.ts` +18 over the 700-line warning threshold; manager −1 physical / +19 code lines vs main. |
| One responsibility per unit | FAIL | `lane-budget-deadline.ts` (S1); `acceptLaneTurnTelemetry` (S2). |
| Every timer/listener has a release path | FAIL | ACP drain timer (S3). Codex drain and deadline timer are correct (`codex-app-server-lane.adapter.ts:438,694`; `lane-budget-deadline.ts:43-48`). |
| One derivation per value | FAIL | Per-turn cost (S4); `turnCount` default (M11). |
| Test at the right level, one regression test per fix | PARTIAL | Coordinator and Codex/ACP regressions are pinned; the new module's four untested exports (coverage gap above) are not. |
| Naming reads like its neighbours | PARTIAL | `budgetSettings` as a workspace port, `workspaceProvider()` next to `getMetadata()`, `previousTurnCostUsd`, `'mixed-model'` (M3, M5, M7). |
| No silent error swallow | PASS | New catch blocks log a structured `errorClass` (`codex-child-budget-observer.ts:47`, `codex-runtime.ts:485`) and the new `warn().catch` logs with an `Error` (`lane-budget-deadline.ts:71-73`). |
| `max-lines` warning (700, non-blank, non-comment) | FAIL (pre-existing) | `agent-process-manager.service.ts` and `ptah-cli-stream-loop.service.ts` already exceed it; neither is made worse in physical lines, the second grows by 18. |

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| `'mixed-model'` is a naming defect, not a design error | `agentTurnUsageSchema` requires `modelId: z.string().min(1)` (`agent-turn-usage.types.ts:23`), and `completedTurnTelemetry` turns `'unknown'` into an unavailable record (`:59,67`). A sentinel is the only way to keep real totals, as `fix-round-2-report.md`/`batch-G-report.md` both argue. Reported as M7 (name it, document it), not as a request to remove it. | Yes |
| The two 2 s drains stay separate | Codex drains an SDK event stream, ACP drains an ACP notification after the prompt response; the repository's simplicity rule keeps similar code in different contexts apart until a third real use. Only the release behaviour is inconsistent, so only that is a finding (S3). | Yes |
| The manager's size claim is reported, not enforced | The brief asked for confirmation (3 848 vs 3 849 — confirmed); the code-line delta and the 23 deleted blanks are reported as M9 rather than reopening the extraction as a blocking item, since the deadline/warn ownership did move. | Yes |
| No skill was loaded | The host lists a skill tool; no catalogue description matches a read-only structural re-review of an already-implemented batch, and the task assigned none. | Yes |

## Maintenance debt

- Introduced: a five-export module with one name for three concerns; a callback-based extraction whose two callbacks have one implementation; a fourth timer-release idiom; a second per-turn cost formula with no shared base; 23 blank lines of churn in a 3 848-line file; 4 untested exports.
- Retired: the duplicated 100 ms and one-tick waits (both replaced by named bounds), the barrel's internal exports, the inline `errorClass` expressions, the public mutable coordinator state, the hand-copied stop-reason triple, the Cursor missing-usage copy, and the per-read workspace resolutions in all three composition roots.
- Net: behaviourally positive, structurally mixed. Round 1 and round 2 findings are closed; batch G should not be the last commit on this PR before the merge.

## Verdict

- Recommendation: **NEEDS_REVISION**
- Confidence: **MEDIUM** — both commits' production surfaces were read whole; the 3 848-line manager and the 880-line stream loop were reviewed through their changed hunks and surrounding context, not line by line. The three composition roots' typecheck is reported by `batch-G-report.md`; my `ptah_get_diagnostics` call for them returned `unchecked` after the 45 s cap, and I did not run `npm run verify` (preferring code reading, as instructed).
- Key concern: batch G moved the right logic out of the manager but into a module that does not fit its own name, left four of five exports untested, and gave Claude turns a second, uncommented cost formula.
- What a 10/10 version would do differently:
  1. `lane-budget-deadline.ts` holds only `createLaneBudget`/`armLaneBudgetDeadline`; lookups go to `lane-restore.ts`, and the manager keeps its own steer/stop/log with `budget.accept()` behind a pure `settleLaneBudget`.
  2. One spec each for `createLaneBudget` (previous → start, counts, turn IDs), `previousResumeRecord` (latest by `startedAt`, mismatched CLI ignored), `laneRecordsForSession` (ordering) and `acceptLaneTurnTelemetry` (warn-once, cost warning, stop dispatch).
  3. ACP drain: `Promise.race` + abort listener + `unref`, mirroring `acp-session-handle.ts:862-880`; timer cleared in `finally`.
  4. One per-turn cost value per turn, named so a reader cannot confuse it with the cumulative total; `sessionModel` deleted; `'mixed-model'` a declared constant.
  5. `workspace`/`getWorkspace` in all three composition roots, resolved inside the scope's cleanup `try`; the manager's blank lines and the size claim reported as they are.
