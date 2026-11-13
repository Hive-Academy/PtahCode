import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { Gauge, LucideAngularModule } from 'lucide-angular';
import type {
  SessionBudgetStage,
  SessionBudgetState,
} from '@ptah-extension/shared';
import { budgetAmount, formatPercent } from './session-budget-format';

import { PtahButtonDirective } from '@ptah-extension/ui';
/** Stages that show a banner. */
type BannerStage = 'handoff' | 'limit';

interface BudgetMeter {
  /** Bar value, clamped to 0–100. */
  readonly value: number;
  readonly label: string;
}

const BODY =
  'Ask the agent to finish its running work, write a handoff document and give you a prompt for a new session.';

const PLATE = 'relative block overflow-hidden px-4 border-t text-xs';
const FILL =
  'pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-500';
const ICON = 'w-3.5 h-3.5 flex-shrink-0';

/** Per-instance suffix for the advice text id (one banner per chat view). */
let nextBannerId = 0;

/**
 * SessionBudgetBannerComponent - the session budget notice.
 *
 * Dumb component: shown at the `handoff` and `limit` display stages unless the
 * user dismissed that stage. A dismissed `handoff` comes back at `limit`. "Wrap up & hand off" asks the
 * parent to send the wrap-up message; the agent does the rest. While an automatic hand-off is queued the
 * notice stays up (even if dismissed) with "Auto hand-off queued" and a Cancel button.
 *
 * Layout: one compact row in the same glass plate and button style as the queued follow-ups. The
 * usage meter is the row's background fill. The advice text is the banner tooltip and the
 * accessible description of the banner and its actions. In a narrow pane the actions wrap.
 */
@Component({
  selector: 'ptah-session-budget-banner',
  standalone: true,
  imports: [LucideAngularModule, PtahButtonDirective],
  template: `
    @if (stage(); as current) {
      <!-- One compact row in the same plate as the queued follow-ups: the
           meter is the row's background fill, the advice is the tooltip.
           In a narrow pane the actions wrap under the text. -->
      <section
        [class]="tone().plate"
        data-glass-surface="plate"
        [attr.role]="current === 'limit' ? 'alert' : 'status'"
        [attr.aria-live]="current === 'limit' ? 'assertive' : 'polite'"
        [attr.aria-describedby]="bodyId"
        [title]="body"
        data-testid="session-budget-banner"
      >
        @if (meter(); as meter) {
          <div
            [class]="tone().fill"
            [style.width.%]="meter.value"
            role="meter"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-valuenow]="meter.value"
            [attr.aria-label]="meter.label"
            data-testid="session-budget-meter"
          ></div>
        }
        <div class="relative flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
          <lucide-angular
            [img]="GaugeIcon"
            [class]="tone().icon"
            aria-hidden="true"
          />
          <p class="min-w-32 flex-1 truncate text-base-content">
            <span data-testid="session-budget-title">{{ title() }}</span>
            @if (percentLabel(); as percent) {
              <span class="text-base-content-muted"> · {{ percent }}</span>
            }
            @if (autoHandoffQueued()) {
              <span
                class="text-base-content-muted"
                data-testid="session-budget-auto-queued"
                >&nbsp;· Auto hand-off queued, runs after this turn</span
              >
            }
          </p>
          <span
            class="sr-only"
            [id]="bodyId"
            data-testid="session-budget-body"
            >{{ body }}</span
          >
          <div class="ml-auto flex flex-shrink-0 items-center gap-1">
            @if (autoHandoffQueued()) {
              <button
                type="button"
                ptahButton variant="ghost" size="xs"
                aria-label="Cancel the automatic hand-off"
                (click)="cancelAutoHandoff.emit()"
                data-testid="session-budget-auto-cancel"
              >
                Cancel
              </button>
            }
            <button
              type="button"
              ptahButton variant="ghost" size="xs"
              [attr.aria-describedby]="bodyId"
              [disabled]="wrapUpSent()"
              (click)="wrapUp.emit()"
              data-testid="session-budget-wrap-up"
            >
              {{ wrapUpSent() ? 'Wrap-up requested' : 'Wrap up & hand off' }}
            </button>
            <button
              type="button"
              ptahButton variant="ghost" size="xs"
              [attr.aria-describedby]="bodyId"
              (click)="dismiss.emit()"
              data-testid="session-budget-dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionBudgetBannerComponent {
  /** The tab's budget state, for the figures. */
  readonly budget = input<SessionBudgetState | null>(null);

  /** The stage to display (authoritative or live, whichever is higher). */
  readonly displayStage = input<SessionBudgetStage | null>(null);

  /** The stage the user dismissed in this session, or `null`. */
  readonly dismissedStage = input<SessionBudgetStage | null>(null);

  /** True once the wrap-up message was sent for this session. */
  readonly wrapUpSent = input(false);

  /** True while the automatic hand-off is queued and can still be cancelled. */
  readonly autoHandoffQueued = input(false);

  /** "Wrap up & hand off". */
  readonly wrapUp = output<void>();
  /** "Dismiss": hide the notice until the stage rises. */
  readonly dismiss = output<void>();
  /** "Cancel" on a queued automatic hand-off. */
  readonly cancelAutoHandoff = output<void>();

  protected readonly body = BODY;
  protected readonly GaugeIcon = Gauge;
  /** Id of the screen-reader advice text that the banner and its actions point to. */
  protected readonly bodyId = `session-budget-body-${nextBannerId++}`;

  /** Tone classes per stage: a faint plate, a stronger meter fill, the icon. */
  protected readonly tone = computed(() => {
    const limit = this.stage() === 'limit';
    return {
      plate: `${PLATE} ${limit ? 'border-error/40 bg-error/5' : 'border-warning/30 bg-warning/5'}`,
      fill: `${FILL} ${limit ? 'bg-error/15' : 'bg-warning/15'}`,
      icon: `${ICON} ${limit ? 'text-error' : 'text-warning'}`,
    };
  });

  /** "82%" next to the title, or `null` with no figure. */
  protected readonly percentLabel = computed(() => {
    const percent = this.budget()?.percent;
    return percent === null || percent === undefined
      ? null
      : formatPercent(percent);
  });

  /** The stage to show, or `null` for none. */
  protected readonly stage = computed<BannerStage | null>(() => {
    const display = this.displayStage();
    if (!this.budget() || (display !== 'handoff' && display !== 'limit')) {
      return null;
    }
    return this.dismissedStage() === display && !this.autoHandoffQueued()
      ? null
      : display;
  });

  /** "Session used 41.2M of 50.0M tokens". */
  protected readonly title = computed(() => {
    const budget = this.budget();
    return budget ? `Session used ${budgetAmount(budget)}` : '';
  });

  /** Linear meter of `percent`, clamped for the bar. Hidden with no figure. */
  protected readonly meter = computed<BudgetMeter | null>(() => {
    const budget = this.budget();
    if (!budget || !this.stage() || budget.percent === null) return null;
    const shown = formatPercent(budget.percent);
    return {
      value: Math.max(0, Math.min(100, budget.percent)),
      label:
        budget.percent > 100
          ? `${shown} of session budget, over the limit`
          : `${shown} of session budget`,
    };
  });
}
