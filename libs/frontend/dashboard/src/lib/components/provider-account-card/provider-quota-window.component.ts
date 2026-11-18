import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { NEAR_LIMIT_PERCENT } from '@ptah-extension/shared';
import {
  PtahMeterComponent,
  PtahBadgeDirective,
  PtahStatusBadgeComponent,
  type PtahMeterTone,
} from '@ptah-extension/ui';
import type { PlanQuotaWindowView } from './plan-tile-view.model';

@Component({
  selector: 'ptah-provider-quota-window',
  standalone: true,
  imports: [PtahMeterComponent, PtahBadgeDirective, PtahStatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './provider-quota-window.component.html',
  host: { class: 'block min-w-0' },
})
export class ProviderQuotaWindowComponent {
  readonly window = input.required<PlanQuotaWindowView>();
  readonly featured = input(false);
  protected readonly marker = NEAR_LIMIT_PERCENT;
  protected readonly meterTone = computed<PtahMeterTone>(() => {
    switch (this.window().tone) {
      case 'error':
        return 'err';
      case 'warning':
      case 'success':
        return 'auto';
      default:
        return 'neutral';
    }
  });
}
