import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { CliAdapterManifest } from '@ptah-extension/shared';
import {
  PtahBadgeDirective,
  PtahDescriptionListComponent,
  type PtahDescriptionItem,
} from '@ptah-extension/ui';
import { cliCapabilityView } from './cli-capability-view';

/**
 * Capability summary of a CLI card: one full row per summary item, with values
 * that wrap. The "All capabilities" popover keeps the detail lines and reasons.
 */
@Component({
  selector: 'ptah-cli-capability-cells',
  standalone: true,
  imports: [PtahDescriptionListComponent, PtahBadgeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `@if (compact()) {
      <span
        data-testid="cli-capability-summary"
        [title]="summary()"
        class="flex min-w-0 flex-wrap gap-ptah-inline"
      >
        @for (chip of chips(); track chip.label) {
          <span ptahBadge appearance="outline" tone="neutral">{{
            chip.text
          }}</span>
        }
      </span>
    } @else {
      <ptah-description-list
        [items]="items()"
        ariaLabel="Capabilities"
        data-testid="cli-capability-summary"
      />
    }`,
})
export class CliCapabilityCellsComponent {
  readonly manifest = input<CliAdapterManifest>();
  readonly compact = input(false);
  protected readonly chips = computed(() =>
    cliCapabilityView(this.manifest()).badges.map((badge) => ({
      label: badge.label,
      text:
        badge.label === 'MCP' && badge.state === 'supported'
          ? 'MCP'
          : `${badge.label}: ${badge.value.split(' ? ')[0]}`,
    })),
  );
  protected readonly summary = computed(() =>
    cliCapabilityView(this.manifest()).summary.join(', '),
  );
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
