import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PtahStatComponent } from '../charts/stat.component';
import type { PtahChartSize } from '../charts/chart.types';

const SIZE: Readonly<Record<'default' | 'dense', PtahChartSize>> = { default: 'md', dense: 'sm' };

/** A stat tile for a page. The stat owner draws it. Actions go in the corner slot. */
@Component({
  selector: 'ptah-stat-card',
  standalone: true,
  imports: [PtahStatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-stat appearance="card" [label]="label()" [value]="value()" [hint]="trend() ?? undefined"
    [size]="statSize()">
    <span ptahStatIcon><ng-content select="[actions]" /></span>
    <ng-content />
  </ptah-stat>`,
})
export class PtahStatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly trend = input<string | null>(null);
  readonly size = input<'default' | 'dense'>('default');

  protected readonly statSize = computed(() => SIZE[this.size()]);
}
