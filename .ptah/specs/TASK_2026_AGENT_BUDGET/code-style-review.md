# Code Style Review — `TASK_2026_AGENT_BUDGET`

## Summary

| Metric          | Value        |
| --------------- | ------------ |
| Overall score   | 6/10         |
| Assessment      | NEEDS_REVISION |
| Blocking issues | 1            |
| Serious issues  | 7            |
| Minor issues    | 7            |
| Files reviewed  | 66           |

Scope: the full `git diff 807a6a93a..HEAD -- . ':!.ptah'` (66 files, +1721/−115),
`CLAUDE.md`, `implementation-plan.md`, `batches.md`, and the whole of every new
source file. Modified files were reviewed through their complete diff and the
surrounding file context needed to judge them; sibling implementations were read
for comparison. No source was edited, no test or build was run.

The core design is sound and belongs in this repository: a host-neutral policy in
`libs/shared`, Zod-validated turn telemetry at every adapter boundary, a focused
`AgentBudgetCoordinator` instead of pricing logic in the process manager, and one
shared `LANE_STOP_REASONS` source. The score is held at 6 by two structural
duplications in the composition layer (one of which is applied twice), three
copies of the budget defaults, a duplicated durable record type, and +78 lines on
a 3 911-line service. Those are all fixable without changing the design.

## Five style questions

### 1. What breaks in six months?

- Changing the shipped budget defaults breaks one of three readers. The defaults
  are literal-written in `agent-spawn-environment.service.ts:257-260`,
  `codex-runtime-composition.ts:235-236` and
  `cli-engine/codex-lane-runtime-composition.ts:440-441`, while
  `file-settings-keys.ts:80-89` promises “each default literal lives in one
  place”. A settings change will produce Electron/CLI disagreement.
- Adding a fourth budget stop reason breaks five hand-written classifications:
  `agent-process-manager.service.ts:716`, `lane-completion-notifier.service.ts:857`,
  `lane-resume-gate.ts:116`, `lane-completion-envelope.ts:43`, and the literal
  copy at `messages/schemas.ts:136-145`.
- Adding a field to the durable budget record (`agent-process.types.ts:295-302`)
  does not propagate to `CliSessionReference` (`:635-642`) or
  `LaneResumeGateInput.budget` (`lane-resume-gate.ts:63`), because they are three
  independent anonymous types.

### 2. What would a new team member misread?

- `agent-process-manager.service.ts:856` returns
  `NonNullable<AgentProcessInfo['agentBudget']>` because the record has no name;
  a reader cannot find the durable budget contract by searching a symbol.
- Two functions named the same concept do the same job in different hosts:
  `observeElectronCodexChildBudgets` (`codex-runtime-composition.ts:229`) and the
  budget branch inside `ownedContext` (`cli-engine/codex-lane-runtime-composition.ts:91-160`).
  A newcomer will patch one and not the other.
- `AgentBudgetCoordinator.accept` (`agent-budget-coordinator.ts:31-35`) returns an
  unnamed object, so its contract is invisible at call sites.

### 3. What does this cost to maintain?

- The child-budget observer is ~60 duplicated lines with a 128-entry cap, parent
  map, pending/terminal handling and log copy written twice; the Electron copy is
  also applied twice on the lane path, so the two hosts already diverge.
- Budget deadline arming is copied verbatim inside the same class
  (`agent-process-manager.service.ts:1391-1395` and `:2692-2698`), in a file
  already 3 911 lines long.
- Every adapter writes its own “telemetry unavailable” string and picks its own
  severity (`error` in Copilot/Antigravity/OpenCode, `info` in Cursor/Pi).

### 4. Where is this inconsistent with the rest of the repository?

- `ADVANCED_SETTINGS` uses one property per line everywhere
  (`advanced-settings.types.ts:138-163`) except the four new entries
  (`:165-190`), which are compressed onto shared lines.
- `parent-envelope.schema.ts:24` correctly uses `z.enum(LANE_STOP_REASONS)`, but
  `messages/schemas.ts:136-145` still hand-copies the list — and already orders it
  differently.
- Sibling settings readers warn once per key (`warnLaneGuardOnce`,
  `agent-spawn-environment.service.ts:273-279`); the new reader logs on every
  spawn (`:269`).
- `AgentBudgetCoordinator` and `CodexChildBudgetTap` construct correctly with no
  DI token, matching the per-lane pattern; no token or registration drift there.

### 5. What would you have done differently?

- One `withCodexChildBudgetObserver(context, tap, logger)` in `codex-runtime`, used
  once by each host composition, forwarding every interface argument.
- `DEFAULT_AGENT_BUDGET_SETTINGS` exported next to `agentBudgetSettingsSchema` in
  `libs/shared`, read by all three compositions.
- `interface AgentBudgetRecord` in `agent-process.types.ts`, referenced by
  `AgentProcessInfo`, `CliSessionReference` and `LaneResumeGateInput`.
- `isAgentBudgetStopReason(reason)` in `libs/shared`, plus `z.enum(LANE_STOP_REASONS)`
  in `messages/schemas.ts`.
- Deadline arming owned by `AgentBudgetCoordinator` (it already owns
  `remainingMs()`), leaving the manager with one `attach`/`detach` call.

## Blocking issues

### Codex child-budget observer is applied twice on the Electron lane path

- File: `apps/ptah-electron/src/di/codex-runtime-composition.ts:326-331` and
  `apps/ptah-electron/src/di/codex-lane-composition.ts:354`
- Problem: `createElectronCodexScopeFactory` replaces `runtime.open` so every
  context is already wrapped by `observeElectronCodexChildBudgets`
  (`codex-runtime-composition.ts:327-331`). `openElectronCodexLane` resolves that
  same runtime (`codex-lane-composition.ts:419-424`) and wraps the returned
  context a second time at `:354`. This breaks the plan's stated invariant of
  “one usage observer per tracked lane” (`implementation-plan.md:94`) and makes
  the Electron chat path (one wrapper) differ from the Electron lane path (two).
- Impact: every child turn is observed and charged by two independent taps, two
  `[Codex budget]` warnings are logged per decision, and closing runs two
  disposals. If the decision ever starts enforcing stop/interrupt, the lane path
  will double-act. The CLI lane path applies it only once, so the hosts disagree.
- Fix: apply the decorator at exactly one layer. Either keep the `runtime.open`
  patch and delete the wrap at `codex-lane-composition.ts:354`, or remove the
  patch and wrap explicitly in both the chat and lane factories. Pick the layer
  the CLI engine also uses, so both hosts decorate once.

## Serious issues

### Child-budget observer implemented twice with drift

- File: `apps/ptah-electron/src/di/codex-runtime-composition.ts:229-296` and
  `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts:91-160`
- Problem: the parent map, 128-entry cap, `remember`, usage/terminal dispatch,
  `completeChildTurn` call and log copy are duplicated almost line for line. They
  have already drifted: the Electron version is unconditional and resolves
  settings inside the helper; the CLI version takes an optional
  `{ tap, logger }` and reads settings at the call site. Both wrappers also drop
  `steer`'s second argument (`codex-runtime-composition.ts:290`,
  `codex-lane-runtime-composition.ts:148`), weakening
  `CodexContext.steer(input, expectedTurnId?)` (`codex-runtime.types.ts:409`);
  the pre-existing wrapper at `codex-lane-composition.ts:108` does the same.
- Tradeoff: the plan called for Codex budget behaviour to live behind the
  codex-runtime registration with ports (`implementation-plan.md:115`), so one
  host-neutral decorator is the shape the design already asked for. Duplicating
  it in two composition roots makes every future fix a two-host fix.
- Recommendation: add `withCodexChildBudgetObserver(context, tap, logger)` to
  `libs/backend/codex-runtime/src/lib/`, export it from the barrel, and call it
  once from each composition. Forward `(input, expectedTurnId) =>
  context.steer(input, expectedTurnId)`.

### Budget defaults are copy-pasted into three readers

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts:257-260`,
  `apps/ptah-electron/src/di/codex-runtime-composition.ts:235-236`,
  `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts:440-441`
- Problem: `{ warnRatio: 0.85, stopWeightedTokens: 3_000_000,
  handoffContextTokens: 150_000, maxDurationMin: 90 }` is written three times.
  `advanced-settings.types.ts:6-8` and `file-settings-keys.ts:80-89` both state
  that a default literal lives only in the shared table; `FILE_BASED_SETTINGS_DEFAULTS`
  already derives from it.
- Tradeoff: the table drives the settings UI and the `settings:set` bounds, but
  not these readers, so a UI change silently leaves runtime thresholds behind.
- Recommendation: export `DEFAULT_AGENT_BUDGET_SETTINGS: AgentBudgetSettings` from
  `libs/shared/src/lib/utils/agent-budget-policy.ts` (or derive it from
  `ADVANCED_SETTINGS`) and pass it as the `getConfiguration` fallback in all
  three places.

### The durable budget record is an anonymous type repeated twice

- File: `libs/shared/src/lib/types/agent-process.types.ts:295-302` and `:635-642`;
  partial re-declaration at `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-resume-gate.ts:63`
- Problem: the same six-field `{ weightedTokens, rawTokens, turnIds, startedAtMs,
  stopWeightedTokens?, maxDurationMin? }` shape is inlined on `AgentProcessInfo`
  and `CliSessionReference`, and a three-field subset is inlined again on
  `LaneResumeGateInput`. The manager then needs
  `NonNullable<AgentProcessInfo['agentBudget']>` (`agent-process-manager.service.ts:856`)
  just to name it.
- Tradeoff: adding a field to one copy is invisible to the others, and the
  resume gate cannot accept the full record by name.
- Recommendation: declare `export interface AgentBudgetRecord { readonly
  weightedTokens: number; readonly rawTokens: number; readonly turnIds:
  readonly string[]; readonly startedAtMs: number; readonly stopWeightedTokens?:
  number; readonly maxDurationMin?: number; }` and use it in all three places;
  `budgetRecord()` then returns `AgentBudgetRecord`.

### Budget stop-reason classification is copied five times

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:716`,
  `lane-completion-notifier.service.ts:857`,
  `lane-resume-gate.ts:116`, `lane-completion-envelope.ts:43`, and
  `libs/shared/src/lib/types/messages/schemas.ts:136-145`
- Problem: the triple `'budget' | 'telemetry-unavailable' | 'duration'` is
  hand-written as a boolean predicate in four files, and `messages/schemas.ts`
  still re-lists every `LaneStopReason` literal while
  `parent-envelope.schema.ts:24` has already moved to
  `z.enum(LANE_STOP_REASONS)`. The copies already differ in order and in which
  reasons they include.
- Tradeoff: a new stop reason compiles cleanly in four places and is silently
  mishandled — exactly the drift `LANE_STOP_REASONS` was introduced to stop.
- Recommendation: export `isAgentBudgetStopReason(reason: LaneStopReason |
  undefined): boolean` from `libs/shared` and use it in all four call sites;
  replace the literal enum in `messages/schemas.ts` with
  `z.enum(LANE_STOP_REASONS)`.

### The 3 911-line process manager grew by 78 lines and duplicates its timer block

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1376-1395`,
  `:1509-1533`, `:2692-2698`
- Problem: this task adds budget construction, `budgetRecord`, a 25-line
  telemetry/warn/stop block, and the same `clearTimeout` + `setTimeout(...,
  remainingMs())` block twice (`:1391-1395` and `:2692-2698`). `CLAUDE.md` and the
  review brief treat the file-size warning as a hard limit and name this file as
  the god file not to grow. The plan explicitly said not to extend this manager
  with pricing logic (`implementation-plan.md:94`).
- Tradeoff: the coordinator already owns `remainingMs()` and stop state, so the
  manager only needs to say “lane started” and “turn ended”; inlining the race
  logic here is what makes the timer arm twice and forget once.
- Recommendation: move deadline arming/clearing and the warn-then-stop sequence
  into `AgentBudgetCoordinator` (e.g. `armDeadline(stop)`, `recordTurn(stop,
  notify)`), and have the manager call one method at spawn/continue and one in
  the segment handler. That removes the duplicate six-line block instead of
  adding to the file.

### Two adapters fabricate a new turn ID per emission

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts:836`
  and `cli-adapters/copilot-sdk.adapter.ts:508`
- Problem: `turnId: randomUUID()` cannot be the “one stable accounting ID” the
  shared contract promises (`agent-turn-usage.types.ts:20`). Codex
  (`codex-lane-events.ts`), Cursor (`run_id`), OpenCode (`part.id`) and Pi
  (`session:sequence`) all derive a stable ID. Two adapters differ, so
  `AgentBudgetPolicy`'s `turnIds` dedupe can never fire for them.
- Tradeoff: a replayed terminal event on those two providers is charged twice,
  while the identical event shape is deduped everywhere else.
- Recommendation: use the provider turn/run identifier where the payload carries
  one, and where it does not, follow Pi's per-adapter monotonic sequence
  (`spawnedChildrenSequence++`) rather than a random UUID. Keep the fallback
  documented in the adapter.

### New `CodexContext` decorators do not forward the full interface

- File: `apps/ptah-electron/src/di/codex-runtime-composition.ts:290` and
  `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts:148`
- Problem: `steer: (input) => context.steer(input)` drops
  `expectedTurnId` from `CodexContext.steer(input, expectedTurnId?)`
  (`codex-runtime.types.ts:409`). The pre-existing wrapper at
  `codex-lane-composition.ts:108` does the same, so the new decorators copy the
  defect rather than the contract.
- Tradeoff: a caller that passes the guard token silently loses the “admit steer
  only while this exact turn is active” check the interface documents.
- Recommendation: forward every parameter — `(input, expectedTurnId) =>
  context.steer(input, expectedTurnId)` — in all three wrappers.

## Minor issues

- `libs/shared/src/lib/types/advanced-settings.types.ts:165-190` — the four new
  descriptors compress `key`/`group`/`kind` and `min`/`max`/`integer`/`default`
  onto shared lines, unlike every sibling entry (`:138-163`). Reformat one
  property per line.
- `libs/backend/platform-core/src/agent-budget-settings-migration.ts:8` —
  `type WarningLogger = Pick<{ warn(message: string): void }, 'warn'>` is an
  unreadable way to say `{ warn(message: string): void }`. Use an interface
  (`interface AgentBudgetMigrationLogger`) per the interfaces-for-contracts rule.
- `libs/shared/src/lib/utils/agent-budget-policy.ts:2-3` — `AgentTurnTelemetry`,
  `AgentTurnUsage` and `ModelPricing` are type-only imports without the `type`
  qualifier used by the sibling `agent-process.types.ts:7`. Add `import type`.
- `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts:97-101`
  — the “Agent limits apply even when compaction is off.” copy is gated on
  `group.id === 'context-budgets'` in the template. The shared table is supposed
  to own user-facing copy (`advanced-settings.types.ts:4-10`); add an optional
  `note?: string` to `AdvancedSettingGroup` and render `group.note`.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts:269`
  — invalid values log on every spawn, unlike the bounded `warnLaneGuardOnce`
  pattern beside it (`:273-279`); the file also has two imports from the same
  module (`:28-29`). Reuse the once-per-key warning and merge the imports.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts:857-866`
  — the budget-limit sentence is assembled with a nested ternary here and
  re-derived with another fallback in `lane-completion-envelope.ts:31-34`.
  Compute it once in the envelope (which already owns `hostStopLine`) and pass a
  typed `budgetLimit?: string` through.
- `cli-adapters/copilot-sdk.adapter.ts:771`, `antigravity-cli.adapter.ts:1443`,
  `opencode-cli.adapter.ts:1150` emit an `error` segment for missing telemetry,
  while `cursor-cli.adapter.ts:485` and `pi-cli.adapter.ts:543` emit `info` for
  the same condition. Pick one severity and one shared message helper.

## File-by-file

### `libs/shared/src/lib/utils/agent-budget-policy.ts`

Score 8/10 — 0B, 0S, 1M. Pure, well-bounded policy with validated settings and a
documented fixed reference rate; the only nit is the type-only import style.

### `libs/shared/src/lib/types/agent-turn-usage.types.ts`

Score 8/10 — 0B, 0S, 0M. Zod discriminated unions plus one normalizer, with the
stable-turn-ID rule documented and tested. The normalizer in a `.types.ts` file is
consistent with siblings (`agent-models.types.ts`, `auth-strategy.types.ts`).

### `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.ts`

Score 8/10 — 0B, 0S, 1M. Correctly focused and testable; `accept`'s inline return
object (`:31-35`) should be a named interface.

### `libs/backend/codex-runtime/src/lib/codex-child-budget-tap.ts`

Score 7/10 — 0B, 0S, 0M. Clean decision-side unit with bounded maps and an
explicit `releaseChild`/`dispose`. The problems are in its two consumers, not here.

### `libs/backend/platform-core/src/agent-budget-settings-migration.ts`

Score 8/10 — 0B, 0S, 1M. Follows the `legacy-threshold-migration.ts` shape,
migrates each key independently and writes atomically; the logger alias is the
only style issue.

### `apps/ptah-electron/src/di/codex-runtime-composition.ts`

Score 4/10 — 1B, 1S, 0M. The observer is correct in isolation but the lane
composition applies it a second time, and the implementation duplicates the CLI
copy.

### `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts`

Score 5/10 — 0B, 1S, 0M. Same observer logic re-implemented with an optional
budget and a dropped `steer` argument; the settings block repeats the shared
defaults.

### `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts`

Score 5/10 — 0B, 1S, 0M. Wiring is functionally reasonable, but it grows the
3 911-line god file and adds the same deadline timer twice.

### `libs/shared/src/lib/types/agent-process.types.ts`

Score 6/10 — 0B, 1S, 0M. `LANE_STOP_REASONS` is the right move; the anonymous
`agentBudget` record repeated at `:295` and `:635` is the wrong one.

### `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-resume-gate.ts`

Score 7/10 — 0B, 1S, 0M. The refusal is early and correct; the
`budget?: { weightedTokens; rawTokens; startedAtMs }` inline type and the
hand-written stop-reason triple are the debt.

### `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts`

Score 8/10 — 0B, 0S, 1M. A one-line template change that keeps standalone/OnPush
intact; the group-specific conditional belongs in the shared table.

### Test files (13 new/modified specs and 1 snapshot)

Score 8/10 — 0B, 0S, 0M. Specs are colocated and named after their units, use
`describe`/`it.each` consistent with neighbours, and assert public behaviour
(normalization, dedupe, one stop, storage routing). Existing manager tests were
adjusted by explicitly setting `agentBudget.maxDurationMin` rather than by
loosening assertions — the honest fix.

## Pattern compliance

| Repository rule or nearby convention | Status | Evidence |
| --- | --- | --- |
| Nx module boundaries; shared must not import feature libs | PASS | `libs/shared/src/lib/utils/agent-budget-policy.ts:1-3` |
| `agent-sdk` / `cli-agent-runtime` / `codex-runtime` isolated from each other | PASS (no new coupling) | `codex-runtime/src/lib/codex-child-budget-tap.ts:1-11` imports only shared |
| Imports through `@ptah-extension/*`, no deep `/src/` | PASS | all new imports use public barrels |
| Strict TypeScript: no `any` / `@ts-ignore` / `as unknown as` in new code | PASS | diff scan; the one `as unknown as` is pre-existing `container.ts` |
| Zod at boundaries | PASS | `acp-session-handle.ts:99-107`, `pi-cli.adapter.ts:150-167`, `agent-turn-usage.types.ts:1-40` |
| Injected Logger, no `console.*` in libs | PASS | `console.*` only in `apps/ptah-electron/src/main.ts`, matching the adjacent migration call |
| No silent error swallow (degradation-audit) | PASS | `pi-cli.adapter.ts:742-747` documents the non-JSON line case |
| Small focused new files | PASS | largest new source file is 122 lines |
| Do not grow god files | FAIL | `agent-process-manager.service.ts:1376-1395,1509-1533,2692-2698` (+78) |
| Interfaces for contracts | FAIL | `agent-process.types.ts:295-302,635-642`; `lane-resume-gate.ts:63`; `agent-budget-settings-migration.ts:8` |
| Kebab-case filenames with role suffix | PASS | `agent-budget-coordinator.ts`, `agent-turn-usage.types.ts`, `agent-budget-settings-migration.ts` (matches `legacy-threshold-migration.ts`) |
| `Symbol.for` DI tokens in `di/tokens.ts`; no new token needed | NOT_APPLICABLE | no new injectable registered |
| `container.resolve` only in composition roots | PASS | `apps/ptah-electron/src/di/*`, `libs/backend/cli-engine/src/lib/*-composition.ts` |
| Angular standalone / OnPush / signals / `inject()` preserved | PASS | `advanced-settings-group.component.ts:88-102` template-only change |
| Settings descriptors follow the existing table style | FAIL | `advanced-settings.types.ts:165-190` vs `:138-163` |
| One source for `LaneStopReason` literals | FAIL | `messages/schemas.ts:136-145` vs `parent-envelope.schema.ts:24` |
| Test structure and naming | PASS | new specs colocated, new `describe` blocks, no sibling cases edited |
| New project carries `scope:*` and `type:*` tags | NOT_APPLICABLE | no new project |

## Maintenance debt

- Introduced: three readers with literal budget defaults; a ~60-line observer
  duplicated in two composition roots; two more copies of the budget stop-reason
  predicate; two fabricated turn IDs; +78 lines on the 3 911-line process
  manager; a second inline copy of the durable budget record.
- Retired: three copies of the stop-reason enum collapsed into
  `LANE_STOP_REASONS` for the parent-envelope schemas; the two legacy
  `compaction.subagent*` controls removed from the advanced editor.
- Net: slightly negative — the shared policy/telemetry design is a real
  improvement, but it is offset by composition-layer duplication and god-file
  growth.

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Key concern: the child-budget observer is implemented in two hosts and applied
  twice on the Electron lane path, so the same turn can be charged twice.
- What a 10/10 version would do differently:
  1. Apply the observer exactly once per context, through one host-neutral
     decorator in `codex-runtime`, and forward every interface argument.
  2. Export one `DEFAULT_AGENT_BUDGET_SETTINGS` and one `AgentBudgetRecord` from
     `libs/shared`, and reference them from every reader and record.
  3. Replace the four hand-written stop-reason predicates with
     `isAgentBudgetStopReason`, and derive `messages/schemas.ts` from
     `LANE_STOP_REASONS`.
  4. Move deadline arming and the warn/stop race into `AgentBudgetCoordinator`,
     removing lines from the process manager rather than adding them.
  5. Give Antigravity and Copilot a stable turn ID, and emit one shared
     telemetry-unavailable message at one severity.
  6. Put the new settings descriptors and the group note back into the shared
     table style so the table remains the single source of copy and defaults.
