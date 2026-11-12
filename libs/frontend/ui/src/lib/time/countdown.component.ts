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
import { DurationStyle, formatDuration } from './format-duration';
import { formatAbsolute } from './format-relative';
import { PtahTimeInput, toEpochMs, toIsoString } from './time-input';
import { PTAH_COUNTDOWN_STYLES, PTAH_TIME_STYLES } from './time.styles';

export type PtahCountdownState = 'running' | 'urgent' | 'expired';

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
  styles: [PTAH_TIME_STYLES, PTAH_COUNTDOWN_STYLES],
  host: {
    role: 'timer',
    'aria-live': 'off',
    '[attr.aria-label]': 'label()',
    '[attr.data-state]': 'state()',
  },
  template: `<time [attr.datetime]="datetime()" [title]="title()">{{ text() }}</time
    ><span class="ptah-time-live" aria-live="polite">{{ liveText() }}</span>`,
})
export class PtahCountdownComponent {
  readonly deadline = input.required<PtahTimeInput>();
  readonly urgentBelowMs = input<number>(60_000);
  readonly format = input<DurationStyle>('clock');
  readonly label = input<string>('Time left');

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
