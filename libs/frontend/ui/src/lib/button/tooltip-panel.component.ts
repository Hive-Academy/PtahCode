import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The panel of `ptahTooltip`. The tooltip directive creates it in a CDK overlay. */
@Component({
  selector: 'ptah-tooltip-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'tooltip',
    '[id]': 'id()',
    class:
      'my-ptah-label block rounded-ptah-control bg-neutral px-ptah-control-x-xs py-ptah-label text-ptah-hint text-neutral-content shadow-ptah-2',
  },
  template: '{{ text() }}',
})
export class PtahTooltipPanelComponent {
  readonly id = input.required<string>();
  readonly text = input.required<string>();
}
