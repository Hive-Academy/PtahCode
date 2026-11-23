# S4 SESSION section, Models disclosure and cache detail

## Files changed

Paths are relative to `libs/frontend/chat-ui/src/lib/molecules/session`.

- `inspector-stats/inspector-session-stats.component.ts` and `.spec.ts`
- `inspector-stats/inspector-cache-tile.component.ts` and `.spec.ts`
- `session-stats-view.ts` and `.spec.ts`
- `session-budget-format.ts` and `.spec.ts`
- `session-model-breakdown.component.ts` and `.spec.ts`
- Added two export lines to `libs/frontend/chat-ui/src/index.ts` for `InspectorCacheTileComponent` and `SessionUsageTotals`.

## Selectors and inputs

`ptah-inspector-session-stats`

```ts
readonly stats = input.required<SessionStatsInputs>();
readonly totals = input<SessionUsageTotals | null>(null);
readonly cliContributions = input<readonly UsageContribution[]>([]);
readonly turns = input<number | null>(null);
readonly startedAt = input<PtahTimeInput | null>(null);
readonly durationUnknownReason = input(DURATION_NOT_RECORDED);
readonly agentCount = input<number | null>(null);
readonly liveAgentCount = input<number | null>(null);
```

Pass the same S1 `{ tokens, cost }` to `[totals]` and the rail projection, and the normalized S1 lane contributions to `[cliContributions]`. The latter supplies the source markers and lane coverage counts. Set `agentCount` and `liveAgentCount` from the roster when ready. The component's heading is keyboard programmatically focusable with `[data-inspector-section="session"] h3` scoped to the active inspector during transitions. A host that already supplies a SESSION heading should wire focus to this heading and render a single SESSION heading. Provide a specific `durationUnknownReason` only when the host knows the cause. The optional `startedAt` decorates the duration detail. The root webview supplies `PTAH_CLOCK`, which the shared timer injects even for static figures.

`ptah-session-model-breakdown`

```ts
readonly snapshot = input<SessionStatsEntry | null>(null);
readonly sources = input<readonly [ModelUsageSource, ModelUsageSource] | readonly []>([]);
```

The SESSION component passes the two internally prepared sources, tokens followed by cost. `ModelUsageSource` contains `id`, `sdkLabel`, `cliLabel`, `sourceText`, `reported` and `laneCount`. The legacy standalone rendering uses the same six-column headers, rows and `Total` when only `snapshot` is supplied.

`ptah-inspector-cache-tile`

```ts
readonly cache = input.required<Cache>();
readonly variant = input<'tile' | 'detail'>('tile');
```

S7 can import `InspectorCacheTileComponent` from `@ptah-extension/chat-ui` and mount `<ptah-inspector-cache-tile [cache]="cache" variant="detail" />` when a cache entry is present. Both variants use the same countdown, idle and expiration signals. The detail variant displays the estimate explanation. None of the three components declares outputs.

```ts
export type SessionUsageTotals = Readonly<Record<UsageMetric, UsageTotal>>;

export function compactSessionMetrics(
  stats: SessionStatsInputs,
  totals = sdkSessionTotals(stats.snapshot),
  durationUnknownReason?: string,
): readonly CompactSessionMetric[]
```

The rail always receives a Time metric. `unavailable: true` marks unknown Time for muted styling with the literal `--:--`. The two usage values and full aria labels come from the supplied totals.

## Acceptance coverage

| Batch acceptance | Spec evidence |
| --- | --- |
| Tokens and Cost use S1 totals and the accuracy glyphs | An inconsistent snapshot cannot change supplied totals. A missing CLI cost yields a cost-only stub and the combined marker. Known zero and the muted unknown amounts have separate cases. The rail spec supplies S1 totals with a recovery-gap cause and checks full spoken values. |
| Unknown rail Time is muted `--:--` | The compact spec asserts `--:--`, `unavailable: true` and both generic and specific reasons. The component spec checks the shared timer's muted class and visible turns for undefined, null, zero and non-finite duration. A known duration renders with null start. |
| Parity cases and cache states | Single and multiple model counts, display names, actual categories, session-keyed disclosure state, Escape and focus, accuracy key and unavailable pricing cause are covered. Budget tests cover both weighted-fallback paths, partial cost and partial weighted tokens, including unit, numerator, percent, label, scope and tone. Cache tests assert live seconds, whole-minute spoken values, estimated, idle, warning, expiration and clock release. Context and compactions move to S7 with their shareable formatting helpers intact. |
| S7 cache detail API | A detail-variant instance with idle and expiry data renders the existing countdown plus the visible estimate explanation and releases its clock on destroy. |
| Existing summary behavior | The scoped Models suite checks the original headers, row order, total, pricing states and zero cost with the existing `snapshot` contract. The user-authorized Jest command excludes the separate `session-stats-summary.component.spec.ts` file, so the coordinator should verify that suite. |

## Checks

- Scoped `ptah_get_diagnostics` on the five changed component/helper files returned no compiler result after its 45-second timeout. Used the permitted native Angular template check.
- PASS. `npx ngc --noEmit --project libs/frontend/chat-ui/tsconfig.lib.json`

- PASS, 87 tests across five suites. `npx jest --config libs/frontend/chat-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-cache-tile.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/session-stats-view.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/session-model-breakdown.component.spec.ts`
- PASS, zero errors and four pre-existing `no-non-null-assertion` warnings in the context tests. `npx eslint libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.ts libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-cache-tile.component.ts libs/frontend/chat-ui/src/lib/molecules/session/session-stats-view.ts libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.ts libs/frontend/chat-ui/src/lib/molecules/session/session-model-breakdown.component.ts libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-cache-tile.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/session-stats-view.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/session-model-breakdown.component.spec.ts libs/frontend/chat-ui/src/index.ts`
- The first Jest run failed in the SESSION fixture because it lacked the shared timer clock provider. The first ESLint run flagged a loose null comparison in the Budget template. The final runs above passed after the fixture provider and template comparison were corrected.

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| Keep the existing inputs and add an optional S1 totals input | Required totals would break callers pending S8. The fallback also uses S1 projections. S8 supplies its already computed totals to preserve metric-specific recovery signals. | Yes, the contract can require totals after migration. |
| Use a bounded grid style around the shared disclosure | The prototype places its trigger in the second row and its panel at full width. The shared component owns the native button and accessible controlled panel. Local styles position its existing slots in the grid. | Yes, local styles. |
| Show expanded cost cents and keep compact rail dollars above $10 | The reference shows `$17.54` on the tile and drops cents on the rail. The expanded formatter retains decimal digits without rounding a lower bound upward. | Yes, formatting only. |
| Keep the original Models table for existing snapshot-only callers | The existing summary tests assert its six-column headings and original total. Passing sources adds SESSION subtotals, cost basis and coverage. | Yes, by changing the opt-in renderer. |
| Reuse the cache component with a detail variant | The same clock and state logic drives both presentations. S7 can use the exported component. | Yes, additive variant. |

## Extra reads and remaining work

- Read the prescribed batch and plan excerpts, S1 and S2 reports and SESSION reference excerpts. Inspected `lanes-400-dark.png` directly for the compact three-column grid, inline Models affordance, SDK/CLI bars and legend, and budget scope cue. Electron rendering and comparison remain the coordinator's check.
- Ptah `ptah_search_files` returned zero results for the task-folder path. Used the existing supplied path after one `rg --files` fallback. Used `ptah_ast_analyze` on the five implementation files, S1 totals and formatting, and `plan-limits/stats-tile-expansion.state.ts`. Native source excerpts supplied template details and exact declarations.
- Skill files read from the supplied worktree were `.claude/skills/angular-frontend-patterns/SKILL.md`, `.claude/skills/angular-frontend-patterns/references/component-patterns.md` and `.claude/skills/ui-ux-designer/SKILL.md`. The host listed no dedicated skill loader.
- Source contracts verified from `session-usage-totals.ts`, `session-usage-format.ts`, `plan-limits/stats-tile-expansion.state.ts`, `session-stats-format.ts`, and the `session-stats-summary.component.spec.ts` table assertion locations.
- Shared source reads were `libs/shared/src/lib/types/rpc/rpc-session.types.ts`, `libs/shared/src/lib/types/session-budget.types.ts`, and the budget measurement references in `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-stage.ts`. Verified legacy basis labels from `libs/frontend/chat-ui/src/lib/atoms/cost-badge.component.ts`.
- Verified UI declarations and template behavior in `charts/chart.types.ts`, `charts/chart-geometry.ts`, `charts/stat.component.ts`, `charts/meter.component.ts`, `patterns/disclosure/disclosure.component.ts`, `surfaces/surface-section.component.ts`, `time/timer.component.ts`, `time/format-duration.ts`, `time/time-input.ts`, `time/clock.token.ts`, and the public barrels. The Jest dependency error prompted the clock token read and a literal search for `provide: PTAH_CLOCK` in app config.
- S7 owns placement of Context, compactions and cache detail. S8 owns the host bindings, rail styles and loading/transition behavior. No host or shared UI files were changed by this lane. The supplied worktree was used throughout.
