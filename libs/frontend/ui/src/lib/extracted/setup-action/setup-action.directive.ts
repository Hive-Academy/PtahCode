import { Directive, computed, inject, input } from '@angular/core';
import { SETUP_ACTION_LOOK, type SetupActionLook } from './setup-action.look';

const LOOK_CLASSES: Record<SetupActionLook, string> = {
  primaryCompact: 'btn btn-primary btn-sm',
  primaryFull: 'btn btn-primary mt-4',
  ghost: 'btn btn-sm',
  glass: 'btn btn-primary btn-sm min-h-8',
};

/** Styles a native setup button; its owner retains type, disabled and click handling. */
@Directive({
  selector: 'button[ptahSetupAction]',
  standalone: true,
  host: {
    '[class]': 'classes()',
    '[attr.aria-busy]': "ptahSetupActionBusy() ? 'true' : null",
  },
})
export class SetupActionDirective {
  private readonly defaultLook = inject(SETUP_ACTION_LOOK);
  readonly ptahSetupAction = input<SetupActionLook | undefined>(undefined);
  readonly ptahSetupActionBusy = input(false);
  protected readonly classes = computed(() => LOOK_CLASSES[this.ptahSetupAction() ?? this.defaultLook]);
}
