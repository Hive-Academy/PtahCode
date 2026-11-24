import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { injectPtahClock } from './clock.token';
import { DurationStyle, formatDuration, toIsoDuration } from './format-duration';
import { formatAbsolute } from './format-relative';
import { PtahTimeInput, toEpochMs } from './time-input';
import { PTAH_TIME_STYLES } from './time.styles';

export type PtahTimerState = 'running' | 'frozen' | 'unknown';

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
    '[attr.aria-label]': 'ariaLabel()',
    '[attr.data-state]': 'state()',
  },
  template: `<time [attr.datetime]="datetime()" [title]="title()" [class.text-base-content-muted]="state() === 'unknown'">{{ text() }}</time
    ><span class="ptah-time-live" aria-live="polite">{{ liveText() }}</span>`,
})
export class PtahTimerComponent {
  readonly startedAt = input.required<PtahTimeInput | null>();
  /** A non-null value freezes the timer at that time. */
  readonly endedAt = input<PtahTimeInput | null>(null);
  readonly format = input<DurationStyle>('clock');
  readonly label = input<string>('Elapsed time');

  /** A positive finite duration takes precedence over timestamp arithmetic. */
  readonly durationMs = input<number | null>(null);
  readonly unknownReason = input<string | undefined>(undefined);
  readonly description = input<string | undefined>(undefined);

  private readonly knownDuration = computed(() => {
    const duration = this.durationMs();
    return duration !== null && Number.isFinite(duration) && duration > 0 ? duration : null;
  });
  private readonly startMs = computed(() => {
    const startedAt = this.startedAt();
    return startedAt === null ? NaN : toEpochMs(startedAt);
  });

  readonly state = computed<PtahTimerState>(() => {
    if (this.knownDuration() !== null) return 'frozen';
    if (this.startedAt() === null) return 'unknown';
    return this.endedAt() === null ? 'running' : 'frozen';
  });
  readonly ariaLabel = computed(() => {
    const reason = this.unknownReason();
    return this.state() === 'unknown' && reason ? `${this.label()}: ${reason}` : this.label();
  });

  /** Holds the clock only while running with a valid start: an invalid start cannot change on a tick. */
  private readonly now = injectPtahClock(
    () => this.state() === 'running' && Number.isFinite(this.startMs()),
  );

  readonly elapsedMs = computed(() => {
    const duration = this.knownDuration();
    if (duration !== null) return duration;
    if (this.state() === 'unknown') return NaN;
    const ended = this.endedAt();
    const end = ended === null ? this.now() : toEpochMs(ended);
    return end - this.startMs();
  });

  readonly text = computed(() =>
    this.state() === 'unknown' ? '--:--' : formatDuration(this.elapsedMs(), this.format()),
  );
  readonly datetime = computed(() => toIsoDuration(this.elapsedMs()));
  readonly title = computed(() => {
    const description = this.description();
    if (description !== undefined) return description;
    const startedAt = this.startedAt();
    const started = startedAt === null ? '' : formatAbsolute(startedAt);
    return started ? `Started ${started}` : '';
  });
  /** "Stopped" only on a running-to-frozen change, never at first render. */
  readonly liveText = linkedSignal<PtahTimerState, string>({
    source: this.state,
    computation: (state, previous) =>
      previous?.source === 'running' && state === 'frozen' && this.knownDuration() === null ? 'Stopped' : '',
  });
}
