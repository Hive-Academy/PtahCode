import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideAngularModule, type LucideIconData } from 'lucide-angular';
import { PtahStatComponent } from '../charts/stat.component';
import type { PtahChartSize, PtahStatTrend } from '../charts/chart.types';

/** Colour of the corner icon. */
export type PtahStatCardTone = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error' | 'neutral';
const TONE_ICON: Readonly<Record<PtahStatCardTone, string>> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  neutral: 'text-base-content-muted',
};

const SIZE: Readonly<Record<'default' | 'dense', PtahChartSize>> = { default: 'md', dense: 'sm' };

/** A stat tile for a page. The stat owner draws it. Actions go in the corner slot. */
@Component({
  selector: 'ptah-stat-card',
  standalone: true,
  imports: [PtahStatComponent, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-stat appearance="card" [label]="label()" [value]="value()" [hint]="effectiveHint()"
    [trend]="direction()" [size]="statSize()"
    [loading]="loading()" [error]="error()" (retry)="retry.emit()">
    <span ptahStatIcon>
      @if (icon(); as glyph) {
        <span class="inline-flex shrink-0" [class]="toneClass()" aria-hidden="true" data-testid="stat-card-icon">
          <lucide-angular [img]="glyph" class="h-5 w-5" />
        </span>
      }
      <ng-content select="[actions]" />
    </span>
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

  /** Draws a skeleton in place of the value. */
  readonly loading = input<boolean>(false);
  /** Safe presentation copy only. Shows an alert and a Retry button. See `ptah-stat`. */
  readonly error = input<string | undefined>(undefined);
  /** Decorative icon in the corner. */
  readonly icon = input<LucideIconData | null>(null);
  /** Colour of the icon. */
  readonly tone = input<PtahStatCardTone>('neutral');
  /** The user pressed Retry in the error state. */
  readonly retry = output<void>();

  protected readonly toneClass = computed(() => TONE_ICON[this.tone()]);
  protected readonly effectiveHint = computed(() => this.hint() ?? this.trend() ?? undefined);
  protected readonly statSize = computed(() => SIZE[this.size()]);
}
