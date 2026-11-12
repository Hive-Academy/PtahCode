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
  template: `<div class="mt-1 flex min-h-6 flex-wrap items-center gap-1 text-xs" data-testid="cli-capability-summary">
    @for (badge of view().badges; track badge.label) {
      <span ptahBadge [tone]="badge.state === 'unverified' ? 'warn' : 'neutral'"
        class="h-auto min-h-5 gap-1 whitespace-normal py-0.5 text-left leading-snug border text-base-content"
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
