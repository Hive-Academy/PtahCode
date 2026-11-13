import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PtahStatComponent } from '../charts/stat.component';
import type { PtahChartSize, PtahStatTrend } from '../charts/chart.types';

const SIZE: Readonly<Record<'default' | 'dense', PtahChartSize>> = { default: 'md', dense: 'sm' };

/** A stat tile for a page. The stat owner draws it. Actions go in the corner slot. */
@Component({
  selector: 'ptah-stat-card',
  standalone: true,
  imports: [PtahStatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-stat appearance="card" [label]="label()" [value]="value()" [hint]="effectiveHint()"
    [trend]="direction()" [size]="statSize()">
    <span ptahStatIcon><ng-content select="[actions]" /></span>
    <ng-content />
  </ptah-stat>`,
})
export class PtahStatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  /** Supporting text under the value. */
  readonly hint = input<string | null>(null);
  /**
   * @deprecated Use `hint`. This input is only an alias and forwards to the
   * hint. It does not set the trend direction: use `direction` for that.
   */
  readonly trend = input<string | null>(null);
  /** Direction of the change. The inner stat shows it as a glyph and a hidden word. */
  readonly direction = input<PtahStatTrend | undefined>(undefined);
  readonly size = input<'default' | 'dense'>('default');

  protected readonly effectiveHint = computed(() => this.hint() ?? this.trend() ?? undefined);
  protected readonly statSize = computed(() => SIZE[this.size()]);
}
