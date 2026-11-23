import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import {
  AgentAvatarComponent,
  agentRunDurationMs,
  formatUsageCost,
  formatUsageTokens,
  isRunningAgentWord,
  usageDetailsText,
  type UsageAmount,
  type UsageTotal,
} from '@ptah-extension/chat-ui';
import { WallClockService } from '@ptah-extension/core';
import {
  PtahMeterComponent,
  PtahRingComponent,
  PtahTimerComponent,
  formatDuration,
} from '@ptah-extension/ui';
import {
  NOT_REPORTED_TITLE,
  NOT_REPORTED_VALUE,
  UNKNOWN_AGENT_DURATION,
  type AgentListRow,
} from './inspector-agent-list';

/** Column template shared by the AGENTS header and rows. */
export const AGENT_ROW_COLUMNS =
  'grid-cols-[minmax(0,1fr)_3rem_3.5rem_3rem] gap-x-1.5';

interface AgentRowContext {
  readonly percent: number | null;
  readonly text: string;
  readonly description: string;
  readonly warning: string | null;
}

interface AgentRowCache {
  readonly time: string;
  readonly description: string;
  readonly warning: string | null;
}

@Component({
  selector: 'ptah-inspector-agent-row',
  standalone: true,
  imports: [AgentAvatarComponent, PtahMeterComponent, PtahRingComponent, PtahTimerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: [`@container (max-width: 340px) { .agent-row-wide { display: none; } }`],
  template: `
    @let r = row();
    @let detail = metrics();
    @let currentContext = context();
    @let currentCache = cache();
    <button
      type="button"
      class="grid w-full {{ columns }} items-center px-3 py-1.5 text-left hover:bg-base-content/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-base-content"
      [attr.data-agent-key]="r.key"
      [attr.aria-label]="r.ariaLabel"
      [attr.aria-describedby]="detailId() + '-metrics'"
      [attr.aria-expanded]="expanded()"
      [attr.aria-controls]="detailId()"
      [attr.aria-current]="current() ? 'true' : null"
      [attr.title]="rowTitle()"
      (click)="selected.emit()"
    >
      <span class="flex min-w-0 items-center gap-2" aria-hidden="true">
        <ptah-agent-avatar
          [kind]="r.agent.kind"
          [status]="r.agent.status"
          [cliId]="r.agent.cliId"
          [providerId]="r.agent.providerId ?? null"
          [agentType]="r.agent.agentType"
          [size]="24"
        />
        <span class="min-w-0">
          <span class="block truncate text-[11.5px] font-semibold" [attr.title]="r.name">{{ r.agent.name }}</span>
          <span class="flex min-w-0 items-center gap-1 text-[10.5px] leading-tight text-base-content-muted">
            <span class="truncate" data-testid="agent-row-model" [attr.title]="r.secondaryTitle">{{ r.secondary }}</span>
            @if (role(); as laneRole) {
              <span class="agent-row-wide shrink truncate" [title]="laneRole">· {{ laneRole }}</span>
            }
            @if (currentContext) {
              <span class="inline-flex shrink-0 items-center gap-0.5" [title]="currentContext.description">
                @if (currentContext.percent !== null) {
                  <ptah-ring size="inline" [value]="currentContext.percent" [max]="100"
                    [bare]="true" [thresholds]="contextThresholds" label="Main request context" />
                }
                {{ currentContext.text }}
                @if (currentContext.warning) {
                  <span class="text-warning" [title]="currentContext.warning">⚠</span>
                }
              </span>
            }
            @if (currentCache) {
              <span class="agent-row-wide shrink-0 tabular-nums" [title]="currentCache.description">
                {{ currentCache.time }}
                @if (currentCache.warning) {
                  <span class="text-warning" [title]="currentCache.warning">⚠</span>
                }
              </span>
            }
          </span>
        </span>
      </span>
      <span class="flex min-w-0 flex-col text-right text-[10.5px] tabular-nums" aria-hidden="true">
        <span class="truncate" data-testid="agent-row-tokens"
          [class.text-base-content-muted]="detail.tokens === dash"
          [attr.title]="tokensTitle()">{{ detail.tokens }}</span>
        @if (share(); as tokenShare) {
          <ptah-meter class="block [&_[data-meter-row]]:hidden" data-testid="agent-share"
            [label]="tokenShare.label" [value]="tokenShare.value" [max]="tokenShare.max"
            [tone]="r.agent.kind === 'cli' ? 'accent' : 'gold'" track="2px"
            [hideLabel]="true" [showValue]="false" [animate]="false" />
        } @else {
          <span data-testid="agent-share-space" class="block h-[2px]"></span>
        }
      </span>
      <span class="truncate text-right text-[10.5px] tabular-nums" aria-hidden="true"
        data-testid="agent-row-cost"
        [class.text-base-content-muted]="detail.cost === dash || r.usage.costNotPriced === true"
        [attr.title]="detail.cost === dash ? notReported : detail.cost">
        {{ detail.cost }}
      </span>
      <span class="text-right text-[10.5px] tabular-nums" data-testid="agent-row-time"
        [class.text-base-content-muted]="r.time === unknownDuration">
        @if (r.time === unknownDuration) {
          <span [title]="unavailableDuration" [attr.aria-label]="unavailableDuration">{{ unknownDuration }}</span>
        } @else if (durationMs() !== null) {
          <ptah-timer
            [startedAt]="durationMs() === 0 ? 0 : null"
            [endedAt]="durationMs() === 0 ? 0 : null"
            [durationMs]="durationMs()"
            [format]="longDuration() ? 'compact' : 'clock'"
            [label]="detail.time"
            [description]="detail.time"
          />
        } @else {
          {{ r.time }}
        }
      </span>
      <span class="sr-only {{ r.statusInk }}">{{ r.statusText }}</span>
    </button>
    <span [id]="detailId() + '-metrics'" class="sr-only">{{ description() }}</span>
  `,
})
export class InspectorAgentRowComponent {
  readonly row = input.required<AgentListRow>();
  readonly detailId = input.required<string>();
  readonly current = input(false);
  readonly expanded = input(false);
  readonly tokenTotal = input<UsageTotal | null>(null);
  readonly usageAmounts = input<Readonly<{ tokens: UsageAmount; cost: UsageAmount }> | null>(null);
  readonly orchestratorDurationMs = input<number | null>(null);
  readonly role = input<string | null>(null);
  readonly context = input<AgentRowContext | null>(null);
  readonly cache = input<AgentRowCache | null>(null);
  readonly selected = output<void>();

  protected readonly columns = AGENT_ROW_COLUMNS;
  protected readonly dash = NOT_REPORTED_VALUE;
  protected readonly notReported = NOT_REPORTED_TITLE;
  protected readonly unknownDuration = UNKNOWN_AGENT_DURATION;
  protected readonly unavailableDuration = 'Duration not available';
  protected readonly contextThresholds = { warn: 80, danger: 95 };

  // The S3 roster owns the shared clock subscription for live rows.
  private readonly now = inject(WallClockService).now('second');
  protected readonly durationMs = computed(() => {
    const row = this.row();
    if (row.time === UNKNOWN_AGENT_DURATION) return null;
    if (row.agent.kind === 'orchestrator') return this.orchestratorDurationMs();
    const running = isRunningAgentWord(row.agent.status);
    return agentRunDurationMs({
      running,
      startedAt: row.agent.startedAt,
      endedAt: row.agent.endedAt,
      reportedMs: row.tray?.entry.durationMs,
    }, running ? this.now() : 0);
  });

  protected readonly longDuration = computed(() => (this.durationMs() ?? 0) >= 3_600_000);

  protected readonly tokensTitle = computed(() =>
    this.metrics().tokens === NOT_REPORTED_VALUE ? NOT_REPORTED_TITLE : this.row().tokensTitle,
  );

  protected readonly share = computed(() => {
    const total = this.tokenTotal();
    const row = this.row();
    const amount = this.usageAmounts()?.tokens;
    const value = amount ? amount.value : row.usage.tokens;
    if (
      !total || (total.state !== 'exact' && total.state !== 'estimate') ||
      total.value === null || total.value <= 0 || value === null || value < 0 || !Number.isFinite(value)
    ) return null;

    const percent = Math.min(100, value / total.value * 100);
    const approximate = total.state === 'estimate' || amount?.estimated;
    const percentText = percent > 0 && percent < 1 ? 'under 1' : String(Math.round(percent));
    return { value, max: total.value, label: `${approximate ? 'About ' : ''}${percentText}% of session tokens` };
  });

  readonly metrics = computed(() => {
    const row = this.row();
    const amounts = this.usageAmounts();
    const duration = this.durationMs();
    const time = row.time === UNKNOWN_AGENT_DURATION
      ? this.unavailableDuration
      : `Duration ${duration === null ? row.time : formatDuration(duration, 'clock')}`;
    const tokens = amounts ? formatUsageTokens(amounts.tokens) : row.tokens;
    const cost = amounts && amounts.cost.value !== null ? formatUsageCost(amounts.cost) : row.cost;
    return {
      tokens,
      cost,
      time,
      tokenDetails: usageDetailsText(amounts?.tokens ?? {
        value: row.usage.tokens, estimated: false, lowerBound: row.usage.tokensPartial,
        comparable: true, causes: [],
      }, 'tokens', 'Tokens'),
      costDetails: row.usage.costNotPriced && row.usage.cost === null
        ? 'Cost not priced'
        : usageDetailsText(amounts?.cost ?? {
            value: row.usage.cost, estimated: row.usage.costEstimated, lowerBound: row.usage.costPartial,
            comparable: true, causes: [],
          }, 'cost', 'Cost'),
    };
  });

  protected readonly description = computed(() => {
    const row = this.row();
    const metrics = this.metrics();
    return [
      metrics.tokenDetails, metrics.costDetails, metrics.time,
      row.statusText === NOT_REPORTED_VALUE ? 'Status not reported' : `Status ${row.statusText}`,
      row.tokensTitle === NOT_REPORTED_TITLE ? null : row.tokensTitle,
      row.requests.length > 0 ? 'Needs your answer' : null,
      this.share()?.label, this.context()?.description, this.cache()?.description,
    ].filter(Boolean).join('. ');
  });

  protected readonly rowTitle = computed(() => [
    this.row().startedAtTitle, this.role(), this.context()?.description, this.cache()?.description,
  ].filter(Boolean).join(' · ') || null);
}
