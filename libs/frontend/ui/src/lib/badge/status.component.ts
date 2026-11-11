import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PtahStatus } from '../foundation/status-badge.component';
import { PtahBadgeSize, PtahStatusAppearance, PtahStatusInk } from './badge.types';

const INK: Readonly<Record<PtahStatus, PtahStatusInk>> = {
  running: 'run',
  queued: 'idle',
  pending: 'idle',
  'needs-review': 'need',
  warning: 'need',
  failed: 'err',
  offline: 'err',
  completed: 'done',
  online: 'done',
};

/**
 * Status owner (TASK_2026_957_fda3). A state glyph plus a word. Each ink has
 * its own glyph shape (ring, hollow circle, diamond, square, filled circle),
 * so the state is not conveyed by color alone. The `dot` appearance has no
 * visible text: it carries the word as the accessible name (`role="img"`).
 */
@Component({
  selector: 'ptah-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-ptah-status': '',
    '[attr.data-ink]': 'ink()',
    '[attr.data-appearance]': 'appearance()',
    '[attr.data-size]': 'size()',
    '[attr.role]': 'appearance() === "dot" ? "img" : null',
    '[attr.aria-label]': 'appearance() === "dot" ? text() : null',
    '[attr.title]': 'appearance() === "dot" ? text() : null',
  },
  template: `<span class="ptah-status-glyph" aria-hidden="true"></span>@if (
      appearance() !== 'dot'
    ) {<span class="ptah-status-text">{{ text() }}</span>}`,
})
export class PtahStatusComponent {
  readonly status = input.required<PtahStatus>();
  /** Visible word, or the accessible name of a dot. Defaults to the status name. */
  readonly label = input<string | null>(null);
  readonly appearance = input<PtahStatusAppearance>('pill');
  readonly size = input<PtahBadgeSize>('sm');

  readonly ink = computed(() => INK[this.status()]);
  readonly text = computed(
    () => this.label() ?? this.status().replace('-', ' '),
  );
}
