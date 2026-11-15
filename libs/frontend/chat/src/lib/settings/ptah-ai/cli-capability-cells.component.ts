import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CliAdapterManifest } from '@ptah-extension/shared';
import { CircleHelp, CircleSlash, LucideAngularModule } from 'lucide-angular';
import { PtahBadgeDirective } from '@ptah-extension/ui';
import { cliCapabilityView } from './cli-capability-view';

@Component({
  selector: 'ptah-cli-capability-cells',
  standalone: true,
  imports: [LucideAngularModule, PtahBadgeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The badge look sets a fixed height, nowrap and overflow: hidden. A capability
  // value can be long, so these pills wrap to more lines and grow in height.
  styles: `
    .capability-summary { margin-top: var(--ptah-space-1); gap: var(--ptah-space-1); }
    .capability-pill {
      height: auto;
      min-height: var(--ptah-badge-h-sm);
      gap: var(--ptah-space-1);
      padding-block: calc(var(--ptah-space-1) / 2);
      white-space: normal;
      overflow: visible;
      overflow-wrap: anywhere;
    }
  `,
  template: `<div class="capability-summary flex min-h-6 flex-wrap items-center text-xs" data-testid="cli-capability-summary">
    @for (badge of view().badges; track badge.label) {
      <span ptahBadge [tone]="badge.state === 'unverified' ? 'warn' : 'neutral'"
        class="capability-pill text-left leading-snug border text-base-content"
        [attr.aria-label]="badge.label + ': ' + badge.value.replaceAll(' · ', ', ')">
        @if (badge.state === 'unverified') { <lucide-angular [img]="HelpIcon" class="h-3 w-3" aria-hidden="true" /> }
        @else if (badge.state === 'unsupported') { <lucide-angular [img]="SlashIcon" class="h-3 w-3" aria-hidden="true" /> }
        <span class="font-semibold">{{ badge.label }}:</span> {{ badge.value }}
      </span>
    }
  </div>`,
})
export class CliCapabilityCellsComponent {
  protected readonly HelpIcon = CircleHelp;
  protected readonly SlashIcon = CircleSlash;
  readonly manifest = input<CliAdapterManifest>();
  protected readonly view = computed(() => cliCapabilityView(this.manifest()));
}
