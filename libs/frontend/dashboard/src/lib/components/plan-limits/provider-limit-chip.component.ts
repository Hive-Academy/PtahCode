import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ProviderMarkComponent } from '@ptah-extension/ui';
import type { ProviderLimitChipVm } from './provider-limit-card.view-model';

/** Two-line row (name, then reason) for a provider without a plan-limit reading. */
@Component({
  selector: 'ptah-provider-limit-chip',
  standalone: true,
  imports: [ProviderMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-1 min-w-0 items-start gap-ptah-controls rounded-ptah-chip border border-[var(--surface-border)] px-3 py-2"
      data-testid="provider-limit-chip"
      [attr.data-provider]="chip().providerId"
    >
      <ptah-provider-mark [providerId]="chip().providerId" aria-hidden="true" />
      <div class="min-w-0 flex flex-col">
        <span class="text-xs font-semibold break-words">{{ chip().label }}</span>
        <span class="text-xs text-base-content-muted break-words">{{ chip().reason }}</span>
      </div>
    </div>
  `,
})
export class ProviderLimitChipComponent {
  readonly chip = input.required<ProviderLimitChipVm>();
}
