import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  untracked,
} from '@angular/core';
import { injectPtahClock } from './clock.token';
import { DurationStyle, formatDuration, splitDuration } from './format-duration';
import { formatAbsolute } from './format-relative';
import { PtahTimeInput, toEpochMs, toIsoString } from './time-input';
import {
  PTAH_COUNTDOWN_BOXED_STYLES,
  PTAH_COUNTDOWN_STYLES,
  PTAH_TIME_STYLES,
} from './time.styles';

export type PtahCountdownState = 'running' | 'urgent' | 'expired';
export type PtahCountdownLayout = 'inline' | 'boxed';
export type PtahCountdownSize = 'sm' | 'md' | 'lg';

export interface PtahCountdownBox {
  readonly unit: 'days' | 'hours' | 'min' | 'sec';
  readonly label: string;
  readonly value: string;
}

/**
 * Countdown owner (TASK_2026_975_b61e). The remaining time is
 * `deadline - now`, derived from the timestamp. It holds the shared clock only
 * while it is not expired.
 *
 * `expired` fires once per deadline value. It also fires when the expiry
 * happened while the window was hidden (the clock sets now again on return),
 * and it fires once when the deadline is already past at first render.
 */
@Component({
  selector: 'ptah-countdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [PTAH_TIME_STYLES, PTAH_COUNTDOWN_STYLES, PTAH_COUNTDOWN_BOXED_STYLES],
  host: {
    role: 'timer',
    'aria-live': 'off',
    '[attr.aria-label]': 'label()',
    '[attr.data-state]': 'state()',
    '[attr.data-layout]': 'layout()',
    '[attr.data-size]': 'size()',
  },
  template: `<time [attr.datetime]="datetime()" [title]="title()">
      @if (layout() === 'boxed') {
        <span class="ptah-time-sr">{{ text() }}</span>
        <span class="ptah-cd-boxes" aria-hidden="true">
          @for (box of boxes(); track box.unit) {
            <span class="ptah-cd-box" [attr.data-unit]="box.unit">
              <span class="ptah-cd-value">{{ box.value }}</span>
              <span class="ptah-cd-unit">{{ box.label }}</span>
            </span>
          }
        </span>
      } @else {
        <ng-container>{{ text() }}</ng-container>
      }</time
    ><span class="ptah-time-live" aria-live="polite">{{ liveText() }}</span>`,
})
export class PtahCountdownComponent {
  readonly deadline = input.required<PtahTimeInput>();
  readonly urgentBelowMs = input<number>(60_000);
  readonly format = input<DurationStyle>('clock');
  readonly label = input<string>('Time left');
  /** 'inline' is the plain text look (default). 'boxed' shows one box for each unit. */
  readonly layout = input<PtahCountdownLayout>('inline');
  /** Box size. Only the boxed layout uses it. */
  readonly size = input<PtahCountdownSize>('md');

  readonly expired = output<void>();

  private readonly deadlineMs = computed(() => toEpochMs(this.deadline()));
  private readonly now = injectPtahClock(
    () => Number.isFinite(this.deadlineMs()) && this.state() !== 'expired',
  );

  readonly remainingMs = computed(() => this.deadlineMs() - this.now());

  readonly state = computed<PtahCountdownState>(() => {
    const remaining = this.remainingMs();
    if (Number.isNaN(remaining)) return 'running';
    if (remaining <= 0) return 'expired';
    return remaining < this.urgentBelowMs() ? 'urgent' : 'running';
  });

  /** Rounds up, so the last second shows "0:01" and "0:00" means expired. */
  readonly text = computed(() => {
    const remaining = this.remainingMs();
    const shown = Number.isNaN(remaining) ? remaining : Math.ceil(remaining / 1000) * 1000;
    return formatDuration(shown, this.format());
  });
  /**
   * Boxes for the boxed layout, from the same rounded value as `text`. They start
   * at the largest non-zero unit and always end with minutes and seconds.
   * An invalid deadline gives "--" in the minute and second boxes.
   */
  readonly boxes = computed<readonly PtahCountdownBox[]>(() => {
    const remaining = this.remainingMs();
    const shown = Number.isNaN(remaining) ? remaining : Math.ceil(remaining / 1000) * 1000;
    const parts = splitDuration(shown);
    const pad = (n: number | null): string => (n === null ? '--' : String(n).padStart(2, '0'));
    const boxes: PtahCountdownBox[] = [];
    if (parts && parts.days > 0) {
      boxes.push({ unit: 'days', label: 'days', value: pad(parts.days) });
    }
    if (parts && (parts.days > 0 || parts.hours > 0)) {
      boxes.push({ unit: 'hours', label: 'hours', value: pad(parts.hours) });
    }
    boxes.push({ unit: 'min', label: 'min', value: pad(parts ? parts.minutes : null) });
    boxes.push({ unit: 'sec', label: 'sec', value: pad(parts ? parts.seconds : null) });
    return boxes;
  });
  readonly datetime = computed(() => toIsoString(this.deadline()));
  readonly title = computed(() => {
    const ends = formatAbsolute(this.deadline());
    return ends ? `Ends ${ends}` : '';
  });

  /**
   * Changes only on a state change, never on a plain tick. The urgent text is
   * captured when the state enters `urgent` (`urgentBelowMs` is read untracked),
   * so a threshold change while already urgent does not change the announcement.
   */
  readonly liveText = computed(() => {
    switch (this.state()) {
      case 'urgent':
        return untracked(
          () => `Less than ${formatDuration(this.urgentBelowMs(), 'compact')} left`,
        );
      case 'expired':
        return 'Expired';
      default:
        return '';
    }
  });

  private emittedFor: number | null = null;

  constructor() {
    effect(() => {
      if (this.state() !== 'expired') return;
      const deadline = this.deadlineMs();
      if (deadline === this.emittedFor) return;
      this.emittedFor = deadline;
      untracked(() => this.expired.emit());
    });
  }
}
