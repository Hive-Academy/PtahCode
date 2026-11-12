import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { injectPtahClock } from './clock.token';
import { formatAbsolute, formatRelative } from './format-relative';
import { PtahTimeInput, toEpochMs, toIsoString } from './time-input';

/**
 * Relative-time owner (TASK_2026_975_b61e). Static text: no role timer and no
 * live region. It reads the shared 1 s clock, but the text is a computed, so
 * the DOM changes only when the text changes.
 */
@Component({
  selector: 'ptah-relative-time',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { font-variant-numeric: tabular-nums; white-space: nowrap; }'],
  template: `<time [attr.datetime]="datetime()" [title]="title()">{{ text() }}</time>`,
})
export class PtahRelativeTimeComponent {
  readonly value = input.required<PtahTimeInput>();

  /** Holds the clock only while the value is valid: invalid text cannot change on a tick. */
  private readonly now = injectPtahClock(() => Number.isFinite(toEpochMs(this.value())));

  readonly text = computed(() => formatRelative(this.value(), this.now()));
  readonly datetime = computed(() => toIsoString(this.value()));
  readonly title = computed(() => formatAbsolute(this.value()));
}
