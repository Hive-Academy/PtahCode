import {
  booleanAttribute,
  computed,
  Directive,
  ErrorHandler,
  effect,
  inject,
  input,
  isDevMode,
} from '@angular/core';
import {
  blockBusyActivation,
  BUTTON_HOST,
  buttonHostType,
  syncBusyAria,
  syncSelectedAria,
} from './button-host';
import {
  PtahButtonDensity,
  PtahButtonSelectedAs,
  PtahButtonSize,
  PtahButtonTone,
  PtahButtonVariant,
} from './button.types';
import { PtahTooltipDirective } from './tooltip.directive';
@Directive({
  selector: 'button[ptahIconButton], a[ptahIconButton]',
  standalone: true,
  host: {
    ...BUTTON_HOST,
    '[class.btn-square]': 'true',
    '[attr.aria-label]': 'accessibleName()',
    '[attr.data-density]': "density() === 'compact' ? 'compact' : null",
  },
  hostDirectives: [
    { directive: PtahTooltipDirective, inputs: ['ptahTooltip: label'] },
  ],
})
export class PtahIconButtonDirective {
  /**
   * Accessible name and visible tooltip text. It must contain visible characters.
   * The `aria-label` comes only from the trimmed label, never from `title` or text.
   */
  readonly label = input.required<string>();
  /** DaisyUI color recipe. */
  readonly variant = input<Exclude<PtahButtonVariant, 'link'>>('ghost');
  /** DaisyUI control size. */
  readonly size = input<PtahButtonSize>('sm');
  /** Footprint density: compact keeps the raw xs and sm footprints. */
  readonly density = input<PtahButtonDensity>('default');
  /** Ghost variant ink only; other variants ignore tone. */
  readonly tone = input<PtahButtonTone>('default');
  /**
   * Selected state. Undefined: not a toggle, the owner writes no aria-pressed or aria-current.
   * Do not bind `aria-pressed` by hand together with `selected`.
   */
  readonly selected = input<boolean | undefined>(undefined);
  readonly selectedAs = input<PtahButtonSelectedAs>('pressed');
  /** Native `type`. A `button` element defaults to `button`, also after a binding removes it. */
  readonly type = input<string>();
  /** Blocks activation while keeping the control focusable. */
  readonly busy = input(false, { transform: booleanAttribute });
  protected readonly hostType = buttonHostType(this.type);
  protected readonly accessibleName = computed(
    () => this.label().trim() || null,
  );
  constructor() {
    const errorHandler = inject(ErrorHandler);
    blockBusyActivation(this.busy);
    syncBusyAria(this.busy);
    syncSelectedAria(this.selected, this.selectedAs);
    effect(() => {
      if (!this.accessibleName() && isDevMode()) {
        errorHandler.handleError(
          new Error(
            'ptahIconButton requires a non-empty label for its accessible name and tooltip.',
          ),
        );
      }
    });
  }
}
