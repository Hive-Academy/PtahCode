/**
 * SurfaceCardComponent - the one card owner (TASK_2026_1012_b1dc,
 * `family-card-look.md`).
 *
 * The look is the `.ptah-card` recipe in `card/ptah-card.css` (the same
 * recipe as the `ptahSurface` directive), so a token change applies to each
 * card. The behavior comes from `ptah-native-card`:
 *
 * - `interactive`, `clickable`, or `selectable` adds a native button overlay
 *   for keyboard, focus and assistive technology. One click listener on the
 *   card root emits `activated` for a click, Enter, or Space. A click inside a
 *   real nested control (button, link, input, label, interactive role,
 *   `[data-card-ignore]`, `[data-card-interactive]`) does not activate.
 * - Interactive cards require a non-blank accessible name: set `ariaLabel`,
 *   or set `ariaLabelledby` to the id of a visible heading.
 * - Plain text activates the card. Elements with their own click or hover
 *   behavior need a semantic hook (such as a button, link, `[title]`, or
 *   `[role]`) or `[data-card-interactive]` to sit above the overlay.
 *   Custom-element hosts are not raised automatically.
 * - `selectable` adds `aria-pressed` and a selected ring in the tone color.
 * - `disabled` stops activation and dims the card.
 *
 * Slots, all optional and free of wrappers: `[card-header]`, the default
 * body and `[card-footer]`.
 *
 * Old inputs stay compatible: `elevation` 2 shows the `raised` variant.
 *
 * @example
 * ```html
 * <ptah-surface-card
 *   tone="warning"
 *   [spine]="true"
 *   [interactive]="true"
 *   ariaLabel="Open details for deep-research"
 *   (activated)="openDetail()"
 * >
 *   <div card-header>Deep research</div>
 *   <p>Body content</p>
 *   <div card-footer><button (click)="enhance()">Enhance</button></div>
 * </ptah-surface-card>
 * ```
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type {
  PtahCardDensity,
  PtahCardPadding,
  PtahCardTone,
  PtahCardVariant,
} from '../card/card.types';

const NESTED_CONTROL_SELECTOR =
  'button, a[href], input, select, textarea, label, summary, [contenteditable], ' +
  '[data-card-ignore], [data-card-interactive]';

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'switch',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'option',
  'radio',
  'combobox',
  'textbox',
  'slider',
]);

function isNestedControl(el: Element): boolean {
  if (el.matches(NESTED_CONTROL_SELECTOR)) return true;
  const role = el.getAttribute('role');
  return role !== null && INTERACTIVE_ROLES.has(role.trim().toLowerCase());
}

@Component({
  selector: 'ptah-surface-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      [class.rounded-xl]="isLegacy()"
      [class.ptah-card]="!isLegacy()"
      [class.surface-2]="isLegacy()"
      [class.p-4]="isLegacy()"
      [class.elev-1]="isLegacy() && elevation() !== 2"
      [class.elev-3]="isLegacy() && elevation() === 2"
      data-testid="surface-card"
      [attr.data-variant]="effectiveVariant()"
      [attr.data-padding]="effectivePadding()"
      [attr.data-tone]="tone()"
      [attr.data-spine]="spine() ? '' : null"
      [attr.data-interactive]="isInteractive() ? '' : null"
      [attr.data-selected]="selectable() && selected() ? '' : null"
      [attr.data-disabled]="disabled() ? '' : null"
      (click)="onCardClick($event)"
    >
      @if (isInteractive()) {
        <button
          type="button"
          class="ptah-card-activator"
          data-testid="surface-card-activator"
          [attr.aria-label]="activationLabel()"
          [attr.aria-labelledby]="activationLabelledby()"
          [attr.aria-pressed]="selectable() ? selected() : null"
          [disabled]="disabled()"
        ></button>
      }
      @if (spine()) {
        <span class="ptah-card-spine" data-testid="surface-card-spine" aria-hidden="true"></span>
      }
      <div class="ptah-card-body" data-testid="surface-card-body">
        <ng-content select="[card-header]" />
        <ng-content />
        <ng-content select="[card-footer]" />
      </div>
    </div>
  `,
})
export class SurfaceCardComponent {
  /** Look of the card. @default 'card' */
  readonly variant = input<PtahCardVariant>('card');

  /** Inner padding. When not set, `density` decides (compact = sm, comfortable = md). */
  readonly padding = input<PtahCardPadding | null>(null);

  /** Padding scale of `ptah-native-card`. Used only when `padding` is not set. */
  readonly density = input<PtahCardDensity>('comfortable');

  /** Color of the status spine and of the selected ring. */
  readonly tone = input<PtahCardTone>('neutral');

  /** Show the colored spine at the start edge. */
  readonly spine = input<boolean>(false);

  /** The card responds to click, Enter and Space and emits `activated`. */
  readonly interactive = input<boolean>(false);

  /** Same as `interactive`. Kept for a move from `ptah-native-card`. */
  readonly clickable = input<boolean>(false);

  /** The card is a two-state toggle: `aria-pressed` and a selected ring. */
  readonly selectable = input<boolean>(false);

  /** Selection state. Used only when `selectable` is true. */
  readonly selected = input<boolean>(false);

  /** Stops activation and dims the card. */
  readonly disabled = input<boolean>(false);

  /** Non-blank accessible name of the activation button. Required when interactive unless `ariaLabelledby` is set. */
  readonly ariaLabel = input<string | null>(null);

  /** Id of a visible heading that names the activation button when `ariaLabel` is blank. */
  readonly ariaLabelledby = input<string | null>(null);

  /** Old input. 2 shows the `raised` variant when `variant` is `card`. */
  readonly elevation = input<1 | 2>(1);

  /**
   * Emitted when the activation button is clicked or triggered with Enter or
   * Space. Projected controls do not emit this output.
   */
  readonly activated = output<void>();

  protected readonly isInteractive = computed(
    () => this.interactive() || this.clickable() || this.selectable(),
  );

  protected readonly activationLabel = computed(() => this.ariaLabel()?.trim() || null);

  protected readonly activationLabelledby = computed(() =>
    this.activationLabel() ? null : this.ariaLabelledby()?.trim() || null,
  );

  /**
   * TEMPORARY NAMED EXCEPTION: `variant="legacy"` keeps the old look
   * (`surface-2 rounded-xl p-4 elev-1`, and the glass reading plane) for the
   * "Curator model" card in memory-curator-ui. Remove it after the user
   * approves the card look (`family-card-look.md`, question 7).
   */
  protected readonly isLegacy = computed(() => this.variant() === 'legacy');

  protected readonly effectiveVariant = computed<PtahCardVariant>(() =>
    this.elevation() === 2 && this.variant() === 'card'
      ? 'raised'
      : this.variant(),
  );

  protected readonly effectivePadding = computed<PtahCardPadding>(
    () => this.padding() ?? (this.density() === 'compact' ? 'sm' : 'md'),
  );

  /**
   * One click listener on the card root. The native activator keeps keyboard,
   * focus and assistive technology; its click bubbles here, so Enter and Space
   * emit once. A click on a real nested control does not activate the card.
   */
  protected onCardClick(event: Event): void {
    if (!this.isInteractive() || this.disabled()) return;
    const card = event.currentTarget as HTMLElement | null;
    const target = event.target;
    if (!card || !(target instanceof Element)) return;
    if (!target.classList.contains('ptah-card-activator')) {
      for (let el: Element | null = target; el && el !== card; el = el.parentElement) {
        if (isNestedControl(el)) return;
      }
    }
    this.activated.emit();
  }
}
