import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { ModelStateService } from '@ptah-extension/core';
import {
  PtahDisclosureComponent,
  PtahMeterComponent,
  PtahStatComponent,
  PtahTimerComponent,
  SurfaceSectionComponent,
  formatAbsolute,
  type PtahMeterSegment,
  type PtahTimeInput,
} from '@ptah-extension/ui';
import { resolveModelDisplayName } from '@ptah-extension/shared';
import { formatExpandedUsageCost, inspectorBudgetDisplay, SDK_BUDGET_SCOPE } from '../session-budget-format';
import { SessionModelBreakdownComponent } from '../session-model-breakdown.component';
import { StatsTileExpansionState } from '../plan-limits/stats-tile-expansion.state';
import { formatUsageTokens, usageDetailsText } from '../session-usage-format';
import { sdkContribution, sessionTotal, usageState, type UsageContribution, type UsageMetric, type UsageTotal } from '../session-usage-totals';
import {
  DURATION_NOT_RECORDED,
  durationMsOf,
  sessionDurationText,
  USAGE_ACCURACY,
  type SessionStatsInputs,
  type SessionUsageTotals,
} from '../session-stats-view';

let nextSessionId = 0;

@Component({
  selector: 'ptah-inspector-session-stats',
  standalone: true,
  imports: [
    PtahDisclosureComponent,
    PtahMeterComponent,
    PtahStatComponent,
    PtahTimerComponent,
    SessionModelBreakdownComponent,
    SurfaceSectionComponent,
  ],
  template: `
    <ptah-surface-section
      class="session-section block"
      padding="md"
      role="region"
      [attr.aria-labelledby]="headingId"
      data-inspector-section="session"
      data-testid="inspector-session-stats"
    >
      <div section-header class="flex items-baseline justify-between gap-2">
        <h3 [id]="headingId" tabindex="-1" class="text-xs font-semibold uppercase tracking-wide">Session</h3>
        @if (hasCli()) {
          <span class="text-xs text-base-content-muted">SDK + CLI</span>
        }
      </div>
      <div class="grid grid-cols-3 gap-y-0" data-testid="inspector-stats-grid">
        @for (metric of metrics(); track metric.id) {
          <ptah-stat
            class="metric border-b border-surface-border pb-2"
            [class.border-l]="metric.id === 'cost'"
            [class.pl-2]="metric.id === 'cost'"
            [label]="metric.label"
            [value]="metric.value"
            [accuracy]="accuracy[metric.total.state]"
            [valueTone]="metric.total.value === null ? 'muted' : undefined"
            [accessibleValue]="metric.detail"
            [detail]="metric.detail"
            [attr.aria-label]="metric.detail"
            [attr.data-testid]="'session-' + metric.id"
            role="group"
            appearance="plain"
            size="sm"
          >
            @if (hasCli()) {
              <ptah-meter
                class="mt-0.5"
                [value]="metric.total.value ?? 0"
                [max]="metric.total.value || 1"
                [label]="metric.label + ' by source'"
                [segments]="metric.segments"
                [unreported]="metric.unreported"
                [valueText]="metric.sourceText"
                [hideLabel]="true"
                [showValue]="false"
                [animate]="false"
                size="xs"
                track="thin"
              />
            }
          </ptah-stat>
        }
        <ptah-stat
          class="metric border-b border-l border-surface-border pb-2 pl-2"
          label="Time"
          value=""
          placeholder=""
          [detail]="timeDetail()"
          [accessibleValue]="timeDetail()"
          [attr.aria-label]="timeDetail()"
          [hint]="turnText()"
          appearance="plain"
          size="sm"
          role="group"
          data-testid="session-time"
        >
          <ptah-timer
            ptahStatMedia
            class="text-lg font-semibold tabular-nums"
            aria-hidden="true"
            [startedAt]="duration() === null ? null : startedAt()"
            [durationMs]="duration()"
            [description]="timeDetail()"
            [unknownReason]="durationUnknownReason()"
          />
        </ptah-stat>

        <ptah-stat
          class="metric pt-2"
          label="Agents"
          [value]="agentCount() ?? '—'"
          [valueTone]="agentCount() === null ? 'muted' : undefined"
          [hint]="liveAgentText()"
          [detail]="agentDetail()"
          [attr.aria-label]="agentDetail()"
          role="group"
          appearance="plain"
          size="sm"
        />

        <ptah-disclosure
          class="models contents"
          [class.models-wide]="!budget()"
          label="Models"
          size="sm"
          [region]="true"
          [open]="modelsOpen()"
          (openChange)="setModelsOpen($event)"
          (keydown.escape)="closeModels($event, modelsHost)"
        >
          <span ptahDisclosureSummary class="col-span-2 grid min-w-0">
            <span class="text-lg font-semibold tabular-nums" [class.text-base-content-muted]="!modelNames().length">
              {{ modelNames().length || '—' }}
            </span>
            @if (modelSummary(); as summary) {
              <span class="truncate text-xs font-normal text-base-content-muted">{{ summary }}</span>
            }
          </span>
          <div #modelsHost>
            @if (modelsOpen()) {
              <ptah-session-model-breakdown
                class="block pt-2"
                [snapshot]="stats().snapshot"
                [sources]="metrics()"
              />
            }
          </div>
        </ptah-disclosure>

        @if (budget(); as view) {
          <ptah-stat
            class="metric col-start-3 row-start-2 border-l border-surface-border pl-2 pt-2"
            label="Budget"
            [value]="view.percentText"
            [accuracy]="view.lowerBound ? 'lower-bound' : 'exact'"
            [valueTone]="view.percentText === '—' ? 'muted' : undefined"
            [detail]="view.detail"
            [accessibleValue]="view.detail"
            [attr.aria-label]="view.detail"
            role="group"
            appearance="plain"
            size="sm"
            data-testid="session-budget"
          >
            @if (hasCli()) {
              <span ptahStatIcon class="source-swatch sdk-swatch" aria-hidden="true"></span>
            }
            @if (view.percent !== null) {
              <ptah-meter
                class="mt-0.5"
                [value]="view.percent"
                [max]="100"
                [label]="budgetScope"
                [valueText]="view.detail"
                [tone]="view.tone"
                [hideLabel]="true"
                [showValue]="false"
                [animate]="false"
                size="xs"
                track="thin"
              />
            }
            <span class="text-xs text-base-content-muted">{{ view.numerator }} / {{ view.limitText }}</span>
            @if (view.stage !== 'normal') {
              <span class="text-xs capitalize text-base-content-muted">{{ view.stage }}</span>
            }
            @if (stats().budget?.measure === 'weighted-fallback') {
              <span class="text-xs text-base-content-muted">{{ view.label }}</span>
            }
          </ptah-stat>
        }
      </div>
      @if (hasCli() || showEstimates() || showBounds()) {
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-base-content-muted"
          [attr.data-testid]="hasCli() ? 'session-source-legend' : null">
          @if (hasCli()) {
            @let tokens = metrics()[0];
            <span class="whitespace-nowrap"><i class="source-swatch sdk-swatch" aria-hidden="true"></i> SDK {{ tokens.sdkLabel }}</span>
            <span class="whitespace-nowrap"><i class="source-swatch cli-swatch" aria-hidden="true"></i> CLI {{ tokens.cliLabel }}</span>
            @if (sharedUnreportedCount(); as count) {
              <span class="whitespace-nowrap" title="Unreported for both tokens and cost" data-testid="session-unreported">
                {{ count }} unreported<span class="sr-only"> for both tokens and cost</span>
              </span>
            }
            @for (metric of metrics(); track metric.id) {
              @if (!sharedUnreportedCount() && metric.unreportedCount) {
                <span class="whitespace-nowrap">{{ metric.unreportedCount }} unreported ({{ metric.id }})</span>
              }
              @if (metric.incomparableCount) {
                <span>{{ metric.incomparableCount }} on a different basis ({{ metric.id }})</span>
              }
            }
          }
          @if (showEstimates() || showBounds()) {
            <span class="inline-flex flex-wrap gap-x-2 gap-y-1" data-testid="session-accuracy-key">
              @if (showEstimates()) { <span class="whitespace-nowrap">~ = estimate</span> }
              @if (showBounds()) { <span class="whitespace-nowrap">≥ = lower bound</span> }
            </span>
          }
        </div>
      }
    </ptah-surface-section>
  `,
  styles: `
    .metric { min-width: 0; padding-inline-end: 0.5rem; }
    .session-section ::ng-deep > section { padding: 0.75rem; gap: 0.5rem; border-radius: 0; }
    .models { display: contents; }
    .models ::ng-deep > div:first-child {
      grid-area: 2 / 2 / 3 / 3;
      min-width: 0;
      border-inline-start: 1px solid var(--surface-border);
      padding: 0.5rem;
      align-items: start;
    }
    .models-wide ::ng-deep > div:first-child { grid-column-end: 4; }
    .models ::ng-deep > div:first-child > button {
      display: grid;
      grid-template-columns: auto auto;
      justify-content: start;
      column-gap: 0.25rem;
      row-gap: 0.125rem;
      font-weight: normal;
    }
    .models ::ng-deep > div:first-child > button > svg {
      grid-column: 2;
      grid-row: 1;
      width: 0.75rem;
      height: 0.75rem;
    }
    .models ::ng-deep > div:first-child > button > span:nth-child(2) {
      grid-column: 1;
      grid-row: 1;
    }
    .models ::ng-deep > div:last-child { grid-area: 3 / 1 / 4 / -1; min-width: 0; }
    .source-swatch { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 0.125rem; }
    .sdk-swatch { background: var(--ptah-gold, var(--ptah-accent-ink)); }
    .cli-swatch { background: var(--state-ink-run); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectorSessionStatsComponent {
  readonly stats = input.required<SessionStatsInputs>();
  readonly totals = input<SessionUsageTotals | null>(null);
  readonly cliContributions = input<readonly UsageContribution[]>([]);
  readonly turns = input<number | null>(null);
  readonly startedAt = input<PtahTimeInput | null>(null);
  readonly durationUnknownReason = input(DURATION_NOT_RECORDED);
  readonly agentCount = input<number | null>(null);
  readonly liveAgentCount = input<number | null>(null);

  private readonly modelState = inject(ModelStateService);
  private readonly expansion =
    inject(StatsTileExpansionState, { optional: true }) ?? new StatsTileExpansionState();
  private readonly sessionKey = computed(() => this.expansion.sessionKey(this, this.stats().sessionId));
  private readonly sdk = computed(() => sdkContribution(this.stats().snapshot));
  private readonly lanes = computed(() => this.cliContributions().filter(({ source }) => source === 'cli'));
  private readonly displayedTotals = computed(() => {
    const supplied = this.totals();
    if (supplied) return supplied;
    const contributions = [this.sdk(), ...this.lanes()];
    const coverage = { complete: true, causes: [] };
    return {
      tokens: sessionTotal(contributions, coverage, 'tokens'),
      cost: sessionTotal(contributions, coverage, 'cost'),
    };
  });

  protected readonly headingId = `ptah-session-heading-${++nextSessionId}`;
  protected readonly budgetScope = SDK_BUDGET_SCOPE;
  protected readonly accuracy = USAGE_ACCURACY;
  protected readonly hasCli = computed(() => this.lanes().length > 0);
  protected readonly metrics = computed(() => {
    const totals = this.displayedTotals();
    return [this.metric('tokens', totals.tokens), this.metric('cost', totals.cost)] as const;
  });
  protected readonly sharedUnreportedCount = computed(() => {
    // Combine only when the same lanes miss both metrics, not merely the same number of lanes.
    const sameLanes = this.lanes().every(({ tokens, cost }) => (tokens.value === null) === (cost.value === null));
    return sameLanes ? this.metrics()[0].unreportedCount : 0;
  });
  protected readonly budget = computed(() => {
    const budget = this.stats().budget;
    return budget ? inspectorBudgetDisplay(budget) : null;
  });
  protected readonly showEstimates = computed(() =>
    this.metrics().some(({ total }) => total.state === 'estimate' || total.state === 'both'),
  );
  protected readonly showBounds = computed(() =>
    this.budget()?.lowerBound || this.metrics().some(({ total }) => total.state === 'lower-bound' || total.state === 'both'),
  );

  protected readonly duration = computed(() => durationMsOf(this.stats().snapshot));
  protected readonly timeDetail = computed(() => {
    const startedAt = this.startedAt();
    const start = startedAt === null ? '' : formatAbsolute(startedAt);
    const turns = this.turnText();
    return [
      'Time',
      sessionDurationText(this.duration(), this.durationUnknownReason()),
      ...(start ? [`Started ${start}`] : []),
      ...(turns ? [turns] : []),
    ].join('. ');
  });
  protected readonly turnText = computed(() => {
    const turns = this.turns() ?? this.stats().snapshot?.turnCount;
    return turns == null ? undefined : `${turns} ${turns === 1 ? 'turn' : 'turns'}`;
  });
  protected readonly liveAgentText = computed(() => {
    const live = this.liveAgentCount();
    return live === null ? undefined : `${live} live`;
  });
  protected readonly agentDetail = computed(() => {
    const count = this.agentCount();
    const live = this.liveAgentText();
    return count === null ? 'Agents unavailable' : `Agents: ${count}${live ? `, ${live}` : ''}`;
  });

  protected readonly modelsOpen = computed(() => this.expansion.isOpen(this.sessionKey(), 'models'));
  protected readonly modelNames = computed(() => {
    const { snapshot, liveModelStats } = this.stats();
    const primary = liveModelStats?.model ?? snapshot?.model;
    const rows = snapshot?.modelUsageList;
    const ids = rows?.length ? rows.map(({ model }) => model) : primary ? [primary] : [];
    return ids.map((id) => resolveModelDisplayName(id, this.modelState.availableModels()));
  });
  protected readonly modelSummary = computed(() => {
    const [first, ...other] = this.modelNames();
    return other.length ? `${first} +${other.length}` : first;
  });

  protected setModelsOpen(open: boolean): void {
    this.expansion.setOpen(this.sessionKey(), 'models', open);
  }

  protected closeModels(event: Event, body: HTMLElement): void {
    if (!this.modelsOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    this.setModelsOpen(false);
    body.closest('ptah-disclosure')?.querySelector('button')?.focus();
  }

  private metric(id: UsageMetric, total: UsageTotal) {
    const label = id === 'tokens' ? 'Tokens' : 'Cost';
    const format = id === 'tokens' ? formatUsageTokens : formatExpandedUsageCost;
    const sdk = { ...this.sdk()[id], value: total.sdk };
    const laneAmounts = this.lanes().map((lane) => lane[id]);
    const reported = laneAmounts.filter(({ value, comparable }) => value !== null && comparable);
    const unreportedCount = laneAmounts.filter(({ value }) => value === null).length;
    const cli = {
      value: total.cli,
      state: usageState({
        estimated: reported.some(({ estimated }) => estimated),
        lowerBound: reported.length !== laneAmounts.length || reported.some(({ lowerBound }) => lowerBound),
      }),
      causes: [],
    };
    const sdkFigure = { value: sdk.value, state: usageState(sdk), causes: [] };
    const detail = usageDetailsText(total, id, `Whole-session ${id}`);
    const sourceText = [
      usageDetailsText(sdkFigure, id, 'SDK subtotal'),
      ...(laneAmounts.length ? [usageDetailsText(cli, id, 'CLI lanes')] : []),
      ...total.causes,
    ].join('. ');
    const segments: readonly PtahMeterSegment[] = [
      { value: total.sdk ?? 0, tone: 'gold', label: 'SDK' },
      { value: total.cli ?? 0, tone: 'info', label: 'CLI lanes' },
    ];
    // The hatch follows the total's own bound, so a "≥" value always shows it.
    const unreported = total.value === null ? 'missing' : total.coverage === 'full' ? 'none' : 'partial';
    return {
      id, label, total, detail, sourceText, segments, unreported,
      value: format(total).replace(/^[≥~ ]+/, ''),
      sdkLabel: format(sdkFigure),
      cliLabel: format(cli),
      reported: reported.length,
      unreportedCount,
      incomparableCount: laneAmounts.length - reported.length - unreportedCount,
      laneCount: laneAmounts.length,
    } as const;
  }
}
