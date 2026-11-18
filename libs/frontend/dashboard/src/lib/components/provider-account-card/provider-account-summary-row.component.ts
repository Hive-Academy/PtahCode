import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  ProviderMarkComponent,
  PtahButtonDirective,
  PtahStatusBadgeComponent,
  PtahListRowComponent,
} from '@ptah-extension/ui';
import { ProviderQuotaWindowComponent } from './provider-quota-window.component';
import type { PlanTileView, PlanTileActionView } from './plan-tile-view.model';

@Component({
  selector: 'ptah-provider-account-summary-row',
  standalone: true,
  imports: [
    ProviderMarkComponent,
    PtahButtonDirective,
    PtahStatusBadgeComponent,
    PtahListRowComponent,
    ProviderQuotaWindowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './provider-account-summary-row.component.html',
  host: { class: 'block min-w-0' },
})
export class ProviderAccountSummaryRowComponent {
  readonly view = input.required<PlanTileView>();
  readonly actionClick = output<PlanTileActionView>();
  readonly expanded = input(false);
  readonly toggleExpanded = output<void>();
  protected readonly detailId = computed(
    () => 'provider-summary-row-' + encodeURIComponent(this.view().key),
  );
  toggleDetails(): void {
    this.toggleExpanded.emit();
  }
}
