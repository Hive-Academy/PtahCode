import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
} from '@angular/core';
import { Clock, LucideAngularModule } from 'lucide-angular';
import type { MonitoredAgent } from '@ptah-extension/chat-streaming';
import { PtahBadgeDirective } from '@ptah-extension/ui';
import {
  hasReportedCliCacheTokens,
  isValidTokenCount,
} from '@ptah-extension/shared';
import { resolveCliLaneUsage } from '../../../utils/lane-stats.adapters';
import {
  formatEstimatedCost,
  formatOptionalTokens,
  formatTokens,
} from './stats-bar.utils';

const PARTIAL_TITLE = 'From retained output, may be partial';
const UNKNOWN_TITLE = 'Usage is unknown until the lane reports again.';
const LIVE_TITLE = 'Tokens this run, updated as the provider reports them';
const TURN_END_TITLE = 'This CLI reports usage once, when the turn ends.';

/** Compact lane-usage card using the same value formatting as chat's subagent summary. */
@Component({
  selector: 'ptah-cli-lane-usage-summary',
  standalone: true,
  imports: [LucideAngularModule, PtahBadgeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .lane-usage-flash {
        opacity: 0;
        animation: lane-usage-flash 900ms ease-out;
      }
      @keyframes lane-usage-flash {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .lane-usage-flash {
          animation: none;
        }
      }
    `,
  ],
  template: `
    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 mb-1.5 rounded bg-base-200/50 border border-base-content/5 text-[10px] font-mono"
      role="group"
      aria-label="Lane usage"
      [attr.title]="partial() ? partialTitle : null"
    >
      <span class="inline-flex items-center gap-1" data-testid="lane-usage-figure">
        @if (turnEnd(); as reason) {
          <span
            class="inline-flex text-base-content-muted"
            role="img"
            data-testid="lane-usage-turn-end"
            [attr.aria-label]="reason"
            [title]="reason"
          >
            <lucide-angular [img]="ClockIcon" class="w-3 h-3" aria-hidden="true" />
          </span>
        }
        @if (partial()) {
          <span
            ptahBadge
            tone="warn"
            size="xs"
            data-testid="lane-usage-partial"
            [title]="partialTitle"
          >
            <span class="ptah-badge-text">partial</span>
          </span>
        }
        <span
          class="relative rounded px-0.5 tabular-nums text-base-content-muted"
          data-testid="lane-usage-total"
          [title]="totalTitle()"
        >
          {{ totalLabel() }}
          @if (figureChanges() > 0) {
            @for (change of [figureChanges()]; track change) {
              <span
                class="lane-usage-flash pointer-events-none absolute inset-0 rounded bg-primary/30"
                data-testid="lane-usage-flash"
                aria-hidden="true"
              ></span>
            }
          }
        </span>
      </span>
      <span class="text-base-content-muted" title="Reported request context">
        ctx {{ tokens(structured()?.contextTokens) }}
      </span>
      @if (usage()?.inputTokens !== undefined) {
        <span class="text-base-content-muted" title="Input tokens">
          in {{ tokens(usage()?.inputTokens, partial()) }}
        </span>
      }
      @if (usage()?.outputTokens !== undefined) {
        <span class="text-base-content-muted" title="Output tokens">
          out {{ tokens(usage()?.outputTokens, partial()) }}
        </span>
      }
      @if (cacheReported()) {
        @if (structured()?.cacheReadTokens !== undefined) {
          <span
            class="text-base-content-muted"
            title="Prompt-cache tokens read"
          >
            cache read {{ tokens(structured()?.cacheReadTokens) }}
          </span>
        }
        @if (structured()?.cacheWriteTokens !== undefined) {
          <span
            class="text-base-content-muted"
            title="Prompt-cache tokens written"
          >
            cache write {{ tokens(structured()?.cacheWriteTokens) }}
          </span>
        }
      }
      <span
        class="ml-auto text-base-content-muted"
        title="Reported or estimated cost"
      >
        {{ costLabel() }}
      </span>
    </div>
  `,
})
export class CliLaneUsageSummaryComponent {
  readonly agent = input.required<MonitoredAgent>();

  protected readonly partialTitle = PARTIAL_TITLE;
  protected readonly ClockIcon = Clock;

  protected readonly lane = computed(() => resolveCliLaneUsage(this.agent()));
  protected readonly structured = computed(() => this.lane().structured);
  protected readonly usage = computed(() => this.lane().usage);
  protected readonly partial = computed(() => this.lane().partial);
  protected readonly cacheReported = computed(() =>
    hasReportedCliCacheTokens(this.structured()),
  );
  protected readonly costLabel = computed(() =>
    this.partial() && this.usage()?.costUsd != null
      ? `≥ ${formatEstimatedCost(this.usage()?.costUsd)}`
      : formatEstimatedCost(this.usage()?.costUsd),
  );

  /** Tooltip of the turn-end clock, or null for a lane that reports usage live or has not said. */
  protected readonly turnEnd = computed(() => {
    const usage = this.agent().effectiveCapabilities?.usage;
    if (usage?.timing !== 'turn-end') return null;
    return usage.reason?.trim() || TURN_END_TITLE;
  });

  /** Total token figure: "18.2k tok", or "- tok" while usage is unknown. */
  protected readonly totalLabel = computed(() => {
    const tokens = this.lane().tokens;
    return tokens === null ? '- tok' : `${formatTokens(tokens)} tok`;
  });

  protected readonly totalTitle = computed(() => {
    if (this.lane().tokens === null) return UNKNOWN_TITLE;
    return this.turnEnd() ?? (this.partial() ? PARTIAL_TITLE : LIVE_TITLE);
  });

  /**
   * Number of times the total figure changed after the first render. Each change
   * re-creates the highlight overlay, which restarts its one-shot fade. A
   * different agent starts again from zero, so reusing the card for another
   * lane does not flash.
   */
  protected readonly figureChanges = linkedSignal<
    { agentId: string; tokens: number | null },
    number
  >({
    source: () => ({ agentId: this.agent().agentId, tokens: this.lane().tokens }),
    computation: (current, previous) =>
      previous === undefined || previous.source.agentId !== current.agentId
        ? 0
        : previous.source.tokens === current.tokens
          ? previous.value
          : previous.value + 1,
  });

  protected tokens(value: number | undefined, partial = false): string {
    return partial && isValidTokenCount(value)
      ? `≥ ${formatOptionalTokens(value)}`
      : formatOptionalTokens(value);
  }
}
