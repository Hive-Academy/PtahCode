import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { injectPtahClock } from './clock.token';
import { DurationStyle, formatDuration, toIsoDuration } from './format-duration';
import { formatAbsolute } from './format-relative';
import { PtahTimeInput, toEpochMs } from './time-input';
import { PTAH_TIME_STYLES } from './time.styles';

export type PtahTimerState = 'running' | 'frozen';

/**
 * Elapsed-time owner (TASK_2026_975_b61e). The value is
 * `(endedAt ?? now) - startedAt`, always derived from the timestamps, never
 * from a tick count. It holds the shared clock only while it is not frozen.
 * `role="timer"` is silent. The polite live region says "Stopped" once, when it freezes.
 */
@Component({
  selector: 'ptah-timer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [PTAH_TIME_STYLES],
  host: {
    role: 'timer',
    'aria-live': 'off',
    '[attr.aria-label]': 'label()',
    '[attr.data-state]': 'state()',
  },
  template: `<time [attr.datetime]="datetime()" [title]="title()">{{ text() }}</time
    ><span class="ptah-time-live" aria-live="polite">{{ liveText() }}</span>`,
})
export class PtahTimerComponent {
  readonly startedAt = input.required<PtahTimeInput>();
  /** A non-null value freezes the timer at that time. */
  readonly endedAt = input<PtahTimeInput | null>(null);
  readonly format = input<DurationStyle>('clock');
  readonly label = input<string>('Elapsed time');

  readonly state = computed<PtahTimerState>(() =>
    this.endedAt() === null ? 'running' : 'frozen',
  );

  /** Holds the clock only while running with a valid start: an invalid start cannot change on a tick. */
  private readonly now = injectPtahClock(
    () => this.state() === 'running' && Number.isFinite(toEpochMs(this.startedAt())),
  );

  readonly elapsedMs = computed(() => {
    const ended = this.endedAt();
    const end = ended === null ? this.now() : toEpochMs(ended);
    return end - toEpochMs(this.startedAt());
  });

  readonly text = computed(() => formatDuration(this.elapsedMs(), this.format()));
  readonly datetime = computed(() => toIsoDuration(this.elapsedMs()));
  readonly title = computed(() => {
    const started = formatAbsolute(this.startedAt());
    return started ? `Started ${started}` : '';
  });
  /** "Stopped" only on a running-to-frozen change, never at first render. */
  readonly liveText = linkedSignal<PtahTimerState, string>({
    source: this.state,
    computation: (state, previous) =>
      previous?.source === 'running' && state === 'frozen' ? 'Stopped' : '',
  });
}
