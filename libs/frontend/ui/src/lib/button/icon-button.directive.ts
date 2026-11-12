import {
  booleanAttribute,
  computed,
  Directive,
  effect,
  input,
  isDevMode,
} from '@angular/core';
import {
  blockBusyActivation,
  BUTTON_HOST,
  buttonHostType,
  syncSelectedAria,
} from './button-host';
import { PtahButtonSelectedAs, PtahButtonSize, PtahButtonTone, PtahButtonVariant } from './button.types';
import { PtahTooltipDirective } from './tooltip.directive';
@Directive({
  selector: 'button[ptahIconButton], a[ptahIconButton]',
  standalone: true,
  host: {
    ...BUTTON_HOST,
    '[class.btn-square]': 'true',
    '[attr.aria-label]': 'accessibleName()',
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
    blockBusyActivation(this.busy);
    syncSelectedAria(this.selected, this.selectedAs);
    // Same pattern as ptah-native-modal: report the missing accessible name in
    // dev mode. A thrown error would stop change detection of the parent view.
    // The directive must not hide its host or invent a name from title or text.
    effect(() => {
      if (!this.accessibleName() && isDevMode()) {
        console.error(
          'ptahIconButton requires a non-empty label: it is the accessible name and the tooltip text.',
        );
      }
    });
  }
}
