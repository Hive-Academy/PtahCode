import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CliAdapterManifest } from '@ptah-extension/shared';
import { PtahDescriptionListComponent, type PtahDescriptionItem } from '@ptah-extension/ui';
import { cliCapabilityView } from './cli-capability-view';

/**
 * Capability summary of a CLI card: one full row per summary item, with values
 * that wrap. The "All capabilities" popover keeps the detail lines and reasons.
 */
@Component({
  selector: 'ptah-cli-capability-cells',
  standalone: true,
  imports: [PtahDescriptionListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<ptah-description-list [items]="items()" ariaLabel="Capabilities" data-testid="cli-capability-summary" />`,
})
export class CliCapabilityCellsComponent {
  readonly manifest = input<CliAdapterManifest>();
  protected readonly items = computed<readonly PtahDescriptionItem[]>(() =>
    cliCapabilityView(this.manifest()).badges.map((badge) => ({
      key: badge.label,
      term: badge.label,
      value: sentenceCase(badge.value.replaceAll(' · ', ', ')),
    })),
  );
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
