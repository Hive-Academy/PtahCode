import { Directive, computed, inject, input } from '@angular/core';
import { SETUP_FIELD_LOOK, type SetupFieldLook } from './setup-field.look';

const LOOK_CLASSES: Record<SetupFieldLook, string> = {
  model: 'select select-bordered select-sm w-full',
  workspace: 'select select-bordered select-sm',
};

/** Keeps the source pages' native select, options, and selection behavior. */
@Directive({
  selector: 'select[ptahSetupField]',
  standalone: true,
  host: { '[class]': 'classes()' },
})
export class SetupFieldDirective {
  private readonly defaultLook = inject(SETUP_FIELD_LOOK);
  readonly ptahSetupField = input<SetupFieldLook | undefined>(undefined);
  protected readonly classes = computed(() => LOOK_CLASSES[this.ptahSetupField() ?? this.defaultLook]);
}
