# S5 Plan Limits restyle and provider states

## Files changed and public API

Paths below are relative to `libs/frontend/chat-ui/src/lib/molecules/session`.

- `inspector-stats/inspector-limits-lanes.component.ts` and `inspector-stats/inspector-limits-lanes.component.spec.ts`
- `plan-limits/plan-limit-tile.component.ts` and `plan-limits/plan-limit-tile.component.spec.ts`
- `plan-limits/plan-window-detail.component.ts` and `plan-limits/plan-window-detail.component.spec.ts`
- `plan-limits/provider-lane-limit-tile.component.ts` and `plan-limits/provider-lane-limit-tile.component.spec.ts`
- `plan-limits/stats-limit-view-model.ts`, `plan-limits/stats-limit-view-model.spec.ts`, and `plan-limits/stats-limit-view-model.types.ts`
- `plan-limits/plan-limit-tiles.ts` adds the native meter range, source metadata, reader-failure flag, and signed-out reason.
- `plan-limits/lane-tiles.ts` adds the typed reason fallback in the no-source lane note.

The internal projected metadata is additive. The package barrel and the session inspector and summary files were left untouched. No files in the shared plan-limit types or auth-provider implementation were edited.

```ts
export function buildStatsLimitViewModel(
  input: StatsLimitViewModelInput,
): StatsLimitViewModel
export function windowMeter(
  window: PlanWindowDetailModel | undefined,
): { readonly value: number; readonly max: number } | null

// SessionPlan
readonly source?: PlanLimitOwnerSnapshot['source'];

// PlanWindowDetailModel
readonly amount?: { readonly value: number; readonly max: number };
readonly group?: string | null;
readonly reset?: { readonly short: string; readonly full: string };

// PlanLimitTileModel
readonly usageUnavailable?: true;

// StatsLimitViewModel
readonly sessionProviderAccountId?: string;
readonly sessionProviderSource?: UsageSourceLabel;

// ProviderLaneLimitModel
readonly accountId?: string;
readonly source?: UsageSourceLabel;
readonly indicator?: StatsLimitIndicator;

// InspectorLimitsLanesComponent
readonly limits = input.required<StatsLimitViewModel>();
readonly sessionId = input<string | null>(null);

// ProviderLaneLimitTileComponent
readonly provider = input.required<ProviderLaneLimitModel>();

// PlanLimitTileComponent
readonly tile = input.required<PlanLimitTileModel>();
readonly variant = input<'strip' | 'inspector'>('strip');
readonly open = input<boolean>(false);
readonly captionShared = input<boolean>(false);
readonly sharedSources = input<readonly string[]>([]);
readonly toggled = output<void>();

// PlanWindowDetailComponent
readonly window = input.required<PlanWindowDetailModel>();
readonly showSummary = input<boolean>(true);
```

## Acceptance and spec coverage

- `uses the typed signed-out reason in the plan tile, provider and lane note` covers all three wording paths. `shows the signed-out reason for owned Grok and no meter or invented percent` covers the rendered session and lane. `keeps the generic no-source wording for an owned Grok without a reason and untracked for an unowned lane` covers the generic and no-owner branches.
- `projects a trimmed group or null for the same window on older and newer snapshots` covers the pure projection for session and lane windows. `renders a reported window group only when every window has a valid group, keeping the full labels` covers agy with two groups and two windows per group, as well as absent, mixed, blank and malformed groups.
- `shows Kimi limit reached with exact 100% and a zero-width 0% track` covers the owner banner, both windows, source and account, the full reset description, the unknown reset dash, and refresh `role="status"`.
- `keeps the reader-failure reason in a keyboard-reachable tooltip and shows no meter` and `speaks the reason for a missing reset and shows a muted dash for unknown usage` cover failure and partial data.
- `suppresses the rail and dock limit cue for stale 100%`, `suppresses the rail and dock limit cue for reset-invalidated 100%`, and the existing `shows owner-level exhaustion with zero windows` cover classifier precedence. `fills by classified state and leaves aged high usage neutral` covers the shared plan row styling.
- `uses the reported amount and limit on the plan row meter` and `uses an amount scale and preserves the used text in full details` cover amount ranges and labels. `shows an amount window on its reported scale in the dock` covers the full dock projection.
- Existing cases cover provider order and count, untracked and multi-owner lanes, mixed known and unknown owners, multi-scope lanes, stale data and cooldown, evidence retention, unresolved account, and summary disclosure.

## Checks

- Pass — 166 tests across six suites, including the read-only session summary.
  `npx jest --config libs/frontend/chat-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-limits-lanes.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tile.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-window-detail.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/provider-lane-limit-tile.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/stats-limit-view-model.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/session-stats-summary.component.spec.ts`
- Pass — Angular compiler and template type check. `npx ngc --noEmit --project libs/frontend/chat-ui/tsconfig.lib.json`
- Pass — ESLint found no errors and three pre-existing warnings. Two concern empty fixture callbacks in `plan-limit-tile.component.spec.ts` and one concerns the existing non-null assertion in `plan-limit-tiles.ts`. `npx eslint libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-limits-lanes.component.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tile.component.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-window-detail.component.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/provider-lane-limit-tile.component.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/stats-limit-view-model.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/stats-limit-view-model.types.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tiles.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/lane-tiles.ts libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-limits-lanes.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tile.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-window-detail.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/provider-lane-limit-tile.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/stats-limit-view-model.spec.ts`
- Scoped `ptah_get_diagnostics` timed out after 45 seconds with eight source files unchecked. The focused native Angular compiler command covers the templates and types.
- The initial Jest run failed on the expected view-model key list and the test's synthetic focus dispatch. The key list now includes the account metadata, and the tooltip spec focuses the actual element.

## Decisions

- The helper is `windowGroupOf(window: PlanLimitWindow): string | undefined` and uses a structural guard. The batch entry suggested a widened-type assertion and a null result. The user chose an undefined return and a structural read. The inspector projection normalizes the missing value to null, and the base detail type keeps the field optional so standalone consumers can omit it. This is local and reversible.
- A grouped provider keeps reported ordering within each group. Without complete group data, the existing most-constrained-first ordering remains. The classifier controls tone independently of that ordering. This is local to the provider component.
- The account display uses the existing safe fingerprint suffix and a muted dash when unresolved. Source badges use the report source when available and fall back to the existing per-field chips. This follows the prototype and avoids deriving data from visible labels.

## Extra reads and limitations

- Read the requested batch and plan ranges, the S2 API report, decisions 17 and 25 referenced by the batch, and the limited prototype excerpt around `function limits`. Compared the reference screenshots at 300 px and 400 px for provider header, group caption, row alignment, state cues and reset placement.
- The workspace skill files read were `.claude/skills/angular-frontend-patterns/SKILL.md`, its `references/component-patterns.md`, and `.claude/skills/ui-ux-designer/SKILL.md`. No dedicated skill loader was listed.
- Source references outside the write set were `libs/shared/src/lib/types/plan-limit.types.ts`, `libs/shared/src/lib/types/rpc/rpc-providers.types.ts`, and the scoped definitions in `libs/shared/src/lib/utils/plan-limits/{lane-state,window-state,plan-limit-format,plan-limit-reason-labels,owner-display}.ts`. Shared primitive API lookups were `libs/frontend/ui/src/index.ts`, `libs/frontend/ui/src/lib/button/index.ts`, `libs/frontend/ui/src/lib/button/tooltip.directive.ts`, and `libs/frontend/ui/src/lib/charts/{meter.component,chart.types}.ts`. Ptah AST inspection was used before scoped source reads.
- Electron rendering and screenshot comparison of the implementation are reserved for the coordinator. No app or browser test target was started.
