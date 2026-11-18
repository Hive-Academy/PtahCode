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
  PtahBadgeDirective,
  PtahStatusBadgeComponent,
  PtahStatCardComponent,
} from '@ptah-extension/ui';
import { ProviderQuotaWindowComponent } from './provider-quota-window.component';
import type { PlanTileView, PlanTileActionView } from './plan-tile-view.model';

@Component({
  selector: 'ptah-provider-account-feature',
  standalone: true,
  imports: [
    ProviderMarkComponent,
    PtahButtonDirective,
    PtahBadgeDirective,
    PtahStatusBadgeComponent,
    PtahStatCardComponent,
    ProviderQuotaWindowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './provider-account-feature.component.html',
  host: { class: 'block min-w-0' },
  styles: [
    `
      @container provider-accounts (max-width: 479px) {
        section {
          padding: var(--ptah-space-3);
        }
      }
      :host {
        min-width: 0;
      }
      .owner-layout {
        display: grid;
        gap: var(--ptah-gap-field);
        min-width: 0;
      }
      @container provider-accounts (min-width:800px) {
        .owner-layout {
          grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
          gap: var(--ptah-gap-group);
        }
      }
    `,
  ],
})
export class ProviderAccountFeatureComponent {
  readonly view = input.required<PlanTileView>();
  readonly actionClick = output<PlanTileActionView>();
  readonly expanded = input(false);
  readonly toggleExpanded = output<void>();
  protected readonly detailId = computed(
    () => 'provider-feature-' + encodeURIComponent(this.view().key),
  );
  toggleDetails(): void {
    this.toggleExpanded.emit();
  }
}
