import { Directive, inject, input } from '@angular/core';
import { CANVAS_RAIL_ACTION_LOOK } from './rail-icon-action.look';

@Directive({
  selector: 'button[ptahRailIconAction]',
  standalone: true,
  host: {
    '[class]': 'look.classes',
    '[attr.aria-label]': 'label()',
    '[attr.aria-pressed]': 'active() == null ? null : active()',
    '[disabled]': 'disabled()',
  },
})
export class RailIconActionDirective {
  protected readonly look = inject(CANVAS_RAIL_ACTION_LOOK);
  readonly label = input.required<string>();
  readonly active = input<boolean | undefined>(undefined);
  readonly disabled = input(false);
}
