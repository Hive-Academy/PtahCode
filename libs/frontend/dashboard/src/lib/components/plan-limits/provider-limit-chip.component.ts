import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ProviderMarkComponent } from '@ptah-extension/ui';
import type { ProviderLimitChipVm } from './provider-limit-card.view-model';

/** Compact chip for a provider that has no plan-limit reading. */
@Component({
  selector: 'ptah-provider-limit-chip',
  standalone: true,
  imports: [ProviderMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-ptah-label rounded-ptah-surface border border-[var(--surface-border)] px-2 py-0.5 text-xs text-base-content-muted"
      data-testid="provider-limit-chip"
      [attr.data-provider]="chip().providerId"
    >
      <ptah-provider-mark [providerId]="chip().providerId" aria-hidden="true" />
      <span class="font-semibold">{{ chip().label }}</span>
      <span>· {{ chip().reason }}</span>
    </span>
  `,
})
export class ProviderLimitChipComponent {
  readonly chip = input.required<ProviderLimitChipVm>();
}
