# Code Style Review — Round 2 — `TASK_2026_AGENT_BUDGET`

Scope: `git diff c099d9469..c37fe7013` (fix round 1), `.ptah/specs` excluded.
Read-only review: no source file was edited, no commit, no push.

## Summary

| Metric | Value |
| --- | --- |
| Overall score | **8/10** |
| Assessment | **NEEDS_REVISION** |
| Blocking issues | **0** |
| Serious issues (new) | **1** |
| Serious issues carried partially fixed | 1 |
| Minor issues (new) | 9 |
| Round-1 findings closed | 6 of 7 serious, 3 of 7 minor |
| Files changed by the fix round | 44 (+173/−159 outside specs, net −? see note) |

The fix round is a real improvement, not a cosmetic one. The duplicated Codex
observer is gone and replaced by one host-neutral implementation plus a 21-line
context wrapper; the child budget is now attached exactly once, inside
`CodexRuntime.open`, for both Electron chat and Electron lanes; the durable
record, the defaults and the stop-reason predicate each have one definition. The
two large composition roots shrank by 75 and 73 lines.

Two things keep this at REVISE: the fix round **replaced the coordinator spec**
and lost the only direct coverage of `AgentBudgetCoordinator.accept`, and the
3 837-line process manager is still the owner of deadline arming (+69 lines
net). Everything else is minor.

## Round-1 findings — status

### Blocking

| # | Round-1 finding | Status | Evidence |
| --- | --- | --- | --- |
| B1 | Codex child-budget observer applied twice on the Electron lane path | **Fixed** | The host now supplies a port once (`apps/ptah-electron/src/di/codex-runtime-composition.ts:246-251`) and `CodexRuntime.open` attaches one observer per context (`libs/backend/codex-runtime/src/lib/codex-runtime.ts:360,470-488`). The Electron lane only wraps lifecycle (`apps/ptah-electron/src/di/codex-lane-composition.ts:332`). `observeElectronCodexChildBudgets` no longer exists in the tree, and `createElectronCodexScopeFactory` is the single registration point for chat and lane (`:415`, `:319`). |

The "one observer per lane/context" invariant now holds. Verified that
`RuntimeContext.events()` is fan-out (a `Set<Subscriber>` with a per-subscriber
queue, `codex-context.ts:330-389`), so the internal subscription is legitimate
and does not steal or duplicate events from the caller's stream.

### Serious

| # | Round-1 finding | Status | Evidence |
| --- | --- | --- | --- |
| S1 | Observer implemented twice with drift | **Fixed** | One implementation: `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts` (128 lines) + `owned-codex-context.ts` (21 lines). Both hosts import `ownCodexContext` from the barrel (`codex-runtime/src/index.ts:56`). Composition diff: −75 lines (cli-engine), −73 lines (Electron). |
| S2 | Budget defaults copy-pasted into three readers | **Fixed** | `DEFAULT_AGENT_BUDGET_SETTINGS` is derived from the descriptor table (`libs/shared/src/lib/utils/agent-budget-policy.ts:16-26`). Readers pass it as the fallback: `agent-spawn-environment.service.ts:257-263`, `codex-child-budget-observer.ts:30-45`. A repo-wide search finds `3_000_000`/`warnRatio: 0.85` only in descriptors, fixtures and `file-settings-keys.ts` — no production reader keeps a private copy. |
| S3 | Durable budget record is an anonymous type repeated twice | **Fixed** | `AgentBudgetRecord` at `libs/shared/src/lib/types/agent-process.types.ts:328-336`, referenced from `:295` and `:640`; `LaneResumeGateInput.budget` is the named type (`lane-resume-gate.ts:66`); `AgentBudgetCoordinator.record()` returns it (`agent-budget-coordinator.ts:33-44`). The `NonNullable<AgentProcessInfo['agentBudget']>` helper is gone. |
| S4 | Budget stop-reason classification copied five times | **Fixed** | One predicate (`agent-process.types.ts:337-339`), used at `agent-process-manager.service.ts:717`, `lane-completion-envelope.ts:45`, `lane-completion-notifier.service.ts:857`, `lane-resume-gate.ts:117`; `messages/schemas.ts:136` now uses `z.enum(LANE_STOP_REASONS)` instead of a hand-copied list. |
| S5 | 3 911-line manager grew and duplicated its timer block | **Partly fixed** | The duplicated `clearTimeout`/`setTimeout` block is now one private `armBudgetDeadline` (`agent-process-manager.service.ts:857-864`, used at `:1389`, `:1406`, `:2693`). But the file is still 3 906 lines (3 911 at `c099d9469`, 3 837 before the task): deadline arming and the warn/stop sequence still live in the manager rather than in `AgentBudgetCoordinator`, which already owns `remainingMs()`. Net growth vs baseline: +69. |
| S6 | Two adapters fabricate a new turn ID per emission | **Fixed** | `randomUUID` is gone from all three adapters. Antigravity derives `conversation_id:num_turns` or `conversation_id:turnSequence` (`antigravity-cli.adapter.ts:840,867-871`); Copilot uses the native result id or a per-spawn sequence (`copilot-sdk.adapter.ts:512`); OpenCode uses `session:turnNumber` (`opencode-cli.adapter.ts:921`). |
| S7 | New `CodexContext` decorators do not forward the full interface | **Fixed** | The decorators were removed in favour of one wrapper that forwards every member, including `steer(input, expectedTurnId)` (`owned-codex-context.ts:9-20`). A tree-wide search for `steer: (input)` returns nothing. |

### Minor

| # | Round-1 finding | Status | Evidence |
| --- | --- | --- | --- |
| M1 | Advanced-setting descriptors compressed vs one-per-line siblings | **Not fixed** | `libs/shared/src/lib/types/advanced-settings.types.ts:165-190` still packs `key`/`group`/`kind` and `min`/`max`/`integer`/`default` onto shared lines (`:138-163` uses one property per line). |
| M2 | `WarningLogger = Pick<{...}, 'warn'>` alias in the migration | **Fixed** | `interface AgentBudgetMigrationLogger { warn(message: string): void }` (`libs/backend/platform-core/src/agent-budget-settings-migration.ts:8`). |
| M3 | Type-only imports without `type` in `agent-budget-policy.ts` | **Fixed** | `import type { AgentTurnTelemetry, AgentTurnUsage }` and `import type { ModelPricing }` (`agent-budget-policy.ts:2-3`). |
| M4 | Hardcoded “context-budgets” note in the Angular template | **Not fixed** | `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts:97-99` still gates the copy on `group.id === 'context-budgets'`. |
| M5 | Budget settings warn on every spawn; duplicate imports | **Partly fixed** | The warning is now once per rejected value set (`agent-spawn-environment.service.ts:267-272`). The two imports from `./cli-adapters/cli-adapter.interface` remain (`:26-27`), and `@ptah-extension/shared` is still imported on three separate lines (`:24`, `:28`, `:29`). |
| M6 | Budget-limit sentence derived in two files | **Not fixed** | Nested ternary still in `lane-completion-notifier.service.ts:857-866`; the envelope still falls back to `signal.budgetLimit ?? 'configured limit'` (`lane-completion-envelope.ts:33-34`). |
| M7 | Telemetry-unavailable severity drift across adapters | **Partly fixed** | Codex now emits `info` (`codex-lane-events.ts:41,76`), Cursor no longer emits `error`, OpenCode removed the error row (`opencode-cli.adapter.ts:1155-1159`); Antigravity (`antigravity-cli.adapter.ts:1457`) and Copilot (`copilot-sdk.adapter.ts:777`) still emit `error` for the same condition. |

## New findings

### Serious

#### S1 — The fix round deleted the coordinator's `accept` coverage instead of extending it

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.spec.ts:1-17`
- Problem: the whole file was rewritten into a single `describe('AgentBudgetCoordinator late session binding')` with one `rebind` test. The previous two tests — warn-once + `turnIds` dedupe + hard-limit stop, and fail-closed for missing totals with the original deadline — are gone, and they were not moved anywhere else. `agent-budget-policy.spec.ts` covers the policy layer, but nothing now covers the coordinator-specific seams: `turnCount` increment (`agent-budget-coordinator.ts:71`), the `turnIds.slice(-256)` bound (`:37,74`), `this.stopReason ??=` (`:75`), `expired()` (`:84-86`) or the `costUnavailable` mapping (`:79`).
- Impact: the single most important accounting path in the task — “charge this turn once” — is exercised only indirectly through the manager's 90-minute test and one rehydration test. A regression in dedupe, `turnCount` or the 256-entry bound would ship silently. The fix-round report does not mention the removal.
- Fix: restore the two deleted cases next to the new one (warn/dedupe/stop, missing-totals fail-closed) and add one assertion for `turnCount` and for a duplicate turn ID. This is a test-only commit; the production code in `agent-budget-coordinator.ts` reads correctly.

### Minor

#### M1 — The barrel exports the observer's internals with no consumer

- File: `libs/backend/codex-runtime/src/index.ts:113-127`
- Problem: `settleCodexChildBudgetEvent`, `readCodexChildBudgetSettings` and `CODEX_CHILD_BUDGET_MAX_ENTRIES` are re-exported even though every use is inside the library (`codex-child-budget-observer.ts`, `codex-child-budget-tap.ts`) or its specs. The public surface a host needs is `ownCodexContext`, `observeCodexChildBudgets`, `CodexChildBudgetPort`, `CodexChildBudgetObserver`, plus the tap types the codex-runtime already used.
- Impact: two more names become API that a future refactor has to keep compatible, and a host can now settle child turns behind the runtime's back.
- Fix: keep only the host-facing names in `index.ts:113-127`; import the helpers relatively inside the library.

#### M2 — The Codex lane grace period is a bare 100 ms timer with a duplicated fallback payload

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts:677-687`
  and `.../codex/codex-lane-events.ts:38-48,70-84`
- Problem: `awaitingUsage` is resolved by `setTimeout(..., 100)` with an inline magic number, not a named constant, not cleared (only guarded by `active !== turn`) and not `unref()`ed, unlike every timer the manager creates (`agent-process-manager.service.ts:857-864` uses `unrefTimer`). The “telemetry unavailable” segment is then built in `finishPendingUsage()` and again in the invalid-usage branch of `map()`, with two slightly different payloads.
- Impact: a reader has to reason about wall-clock timing inside an event adapter to understand when a Codex turn ends, and the two fallbacks can drift.
- Fix: name the grace constant next to `CodexLaneEvents`, expose one `fallbackTelemetry(withUsage?)` builder used by both paths, and clear the timer when the adapter closes.

#### M3 — `errorClass` exists as a helper and as repeated inline expressions in the same library

- File: `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts:47-49` vs `libs/backend/codex-runtime/src/lib/codex-runtime.ts:484`
- Problem: the new observer extracts `errorClass()`; `attachChildBudget` re-inlines `error instanceof Error ? error.constructor.name : typeof error` three lines away, and the same idiom already existed at `codex-runtime.ts:133,172,353,394`.
- Fix: export `errorClass` from the observer module (or a small shared util in the library) and use it at `:484`, `:353`, etc.

#### M4 — Two observer lifecycles, two teardown verbs in one class

- File: `libs/backend/codex-runtime/src/lib/codex-runtime.ts:339,493`
- Problem: `CodexRuntime` calls `observer?.dispose()` for `RateLimitsObserver` and `entry.observer.stop()` for `CodexChildBudgetObserver`. Both mean “stop observing”; the interface was introduced in this task and could have matched the established verb.
- Fix: rename `stop` to `dispose` (or `CodexChildBudgetObserver.stop` to `dispose`) so both observers in `CodexRuntime` read the same.

#### M5 — `rebind` is public only to serve `rebindRecord`, and rebinding mutates public state

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.ts:15-18,46-58`
- Problem: `startedAtMs`, `turnCount` and `stopReason` are mutable public fields, and `rebind()` is a public method whose only caller is `rebindRecord()`. `startedAtMs` was `readonly` before this round. Two entry points for the same operation invite a caller to rebind a snapshot without a record.
- Fix: make `rebind` private, keep `record()`/`rebindRecord()` as the API, and expose `startedAtMs`/`turnCount` through getters.

#### M6 — The settings port resolves the workspace provider on every read

- File: `apps/ptah-electron/src/di/codex-runtime-composition.ts:246-251` and `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts:363-369`
- Problem: `readSetting` calls `container.resolve(IWorkspaceProvider)` inside the lambda, so every context open performs four service resolutions, and the composition root no longer shows the dependency at registration time. Sibling code resolves once and closes over the value (`codex-runtime-composition.ts:379,481`).
- Fix: resolve once before `registerCodexRuntime(...)` and have `readSetting` call `workspace.getConfiguration(...)`.

#### M7 — A bare event-loop yield inside the ACP prompt path

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp/acp-session-handle.ts:790-791`
- Problem: `await new Promise<void>((resolve) => setImmediate(resolve));` delays every successful ACP prompt by one tick so a queued `usage_update` can land. The comment explains why, but there is no bound and no named helper; a slower agent re-introduces the exact race this line works around.
- Fix: keep it if no protocol signal exists, but lift it into a named `drainQueuedUsageUpdates()` with the ordering assumption documented, so the next reader does not delete it as a stray delay.

#### M8 — The stop-reason predicate re-lists the triple instead of deriving it

- File: `libs/shared/src/lib/types/agent-process.types.ts:323-327,337-339`
- Problem: `LANE_STOP_REASONS` is the single list, yet `isAgentBudgetStopReason` hard-codes `'budget' || 'duration' || 'telemetry-unavailable'` six lines below it. The five call sites are fixed, but a new budget reason still has to be added in two places in this file.
- Fix: `const AGENT_BUDGET_STOP_REASONS = ['budget','duration','telemetry-unavailable'] as const satisfies readonly LaneStopReason[]` and derive both the array and the predicate from it.

#### M9 — Cursor always says “Cursor turn usage.” even when there is no usage

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.ts:479-486`
- Problem: the fix removed the “telemetry unavailable” branch and now always emits `content: 'Cursor turn usage.'` while conditionally omitting the `usage` field. When the run returns no usage the user sees a usage banner with no numbers. ACP (`acp-session-handle.ts:800`) and Pi (`pi-cli.adapter.ts:543`) still switch the copy on availability.
- Fix: keep the single payload but choose the sentence: `usage ? 'Cursor turn usage.' : 'Cursor turn telemetry unavailable.'`.

## Compliance checks

| Rule | Result | Evidence |
| --- | --- | --- |
| Layer / dependency direction | PASS | `codex-runtime` observer imports only `@ptah-extension/shared` and its own modules (`codex-child-budget-observer.ts:1-10`); `owned-codex-context.ts:1` imports a type only. No new `codex-runtime` → `cli-agent-runtime` or reverse edge. |
| Public barrel imports, no deep `/src/` | PASS | Both hosts import `ownCodexContext` via `@ptah-extension/codex-runtime` (`codex-lane-composition.ts:25`, `codex-lane-runtime-composition.ts:29`). |
| Strict TypeScript (no `any`, `@ts-ignore`, `@ts-expect-error`, `as unknown as`) | PASS | Diff scan of `c099d9469..c37fe7013` returns none outside `.ptah`; the pre-existing `container.ts` cast is untouched. |
| DI conventions | PASS | No new token or injectable; the port is a registration field (`codex-runtime/src/lib/di/registration.ts:22-23`), matching `usage`/`sink`. |
| Small, focused new files | PASS | 128 + 21 source lines; 195 + 38 spec lines. |
| Do not grow god files | PARTIAL | Manager +69 net vs baseline; duplicated timer removed. New logic still added to `agent-process-manager.service.ts` rather than the coordinator. |
| No silent error swallow | PASS | Both new catch blocks carry `// degradation-audit: reported` and log a structured `errorClass` (`codex-child-budget-observer.ts:107-126`, `codex-runtime.ts:481-486`). |
| Naming | PASS with one nit | `CodexChildBudgetObserver`, `CodexChildBudgetPort`, `ownCodexContext`, `CodexChildBudgetSettingKey` are descriptive and kebab-cased by file. Only the `stop`/`dispose` verb differs (M4). |
| Test structure | FAIL | New specs are colocated and use the shared fixture style, but `agent-budget-coordinator.spec.ts` lost two cases (S1). |
| Settings descriptor table style | NOT FIXED | `advanced-settings.types.ts:165-190` (carried minor M1). |

## New-file assessment

### `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts` — 8/10

Good separation: a port (`readSetting`, optional `pricing`), a settings reader that validates once and falls back as a complete set, a pure settle step and a lifecycle wrapper. The internal subscription is the right call given the fan-out `events()` contract, and it is documented. Deductions: `errorClass` duplication (M3) and the barrel re-export (M1).

### `libs/backend/codex-runtime/src/lib/owned-codex-context.ts` — 9/10

Twenty-one lines that forward the full `CodexContext` and memoize close. Correct home (lifecycle belongs with the context type), correct barrel export. The only ambiguity is the name: it owns the scope, not the context, which its doc comment does state.

### Specs

`codex-child-budget-observer.spec.ts` covers the three behaviours that matter (one subscription, abort idempotence, one failed charge does not stop later ones) with a hand-rolled fan-out fake that mirrors `codex-context.ts` — acceptable, since the real context is not available in unit scope. `owned-codex-context.spec.ts` pins the two regressions this round fixed (`steer` forwarding, single `dispose`).

## File-by-file (round-1 → round-2)

| File | Round 1 | Round 2 | Note |
| --- | --- | --- | --- |
| `apps/ptah-electron/src/di/codex-runtime-composition.ts` | 4/10 | 8/10 | Observer removed; one port registration. −73 lines. |
| `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts` | 5/10 | 8/10 | Same; −75 lines. |
| `libs/backend/codex-runtime/src/lib/codex-runtime.ts` | — | 8/10 | Attachment lifecycle is clear; `stop`/`dispose` nit. 504 lines. |
| `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts` | — | 8/10 | New; see above. |
| `libs/backend/codex-runtime/src/lib/owned-codex-context.ts` | — | 9/10 | New; see above. |
| `libs/backend/cli-agent-runtime/.../agent-process-manager.service.ts` | 5/10 | 7/10 | Timer deduplicated; still +69 lines, still owns deadline arming. |
| `libs/backend/cli-agent-runtime/.../agent-budget-coordinator.ts` | 8/10 | 7/10 | `record`/`rebindRecord` are good; public `rebind` and mutable fields (M5). |
| `libs/backend/cli-agent-runtime/.../agent-budget-coordinator.spec.ts` | — | 3/10 | Coverage regression (S1). |
| `libs/shared/src/lib/types/agent-process.types.ts` | — | 8/10 | Named record + predicate; predicate re-lists the triple (M8). |
| Adapters (`antigravity`, `copilot`, `opencode`, `cursor`) | — | 8/10 | Stable turn IDs fixed; Cursor copy regression (M9). |

## Verdict

**NEEDS_REVISION — 8/10.**

No architectural blocker remains: the child-budget observer has one implementation,
one attachment point and one settings reader; the duplicated record, defaults and
stop-reason predicate are single-sourced; the two Electron scopes now behave
identically; and the adapters no longer fabricate turn IDs.

One short commit closes the review:

1. restore the two deleted `AgentBudgetCoordinator` cases and add a `turnCount`
   and duplicate-turn assertion (S1);
2. optional, same commit: rename `stop`→`dispose` (M4), add the last
   `telemetry-unavailable` copy to Cursor (M9), and trim the barrel exports (M1).

The remaining items (S5 manager growth, descriptor formatting, Angular copy,
notifier sentence) are debt that should be tracked, not reasons to hold the PR
indefinitely.
