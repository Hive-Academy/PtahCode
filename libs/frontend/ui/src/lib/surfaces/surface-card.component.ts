/**
 * SurfaceCardComponent - the one card owner (TASK_2026_1012_b1dc,
 * `family-card-look.md`).
 *
 * The look is the `.ptah-card` recipe in `card/ptah-card.css` (the same
 * recipe as the `ptahSurface` directive), so a token change applies to each
 * card. The behavior comes from `ptah-native-card`:
 *
 * - `interactive` (or `clickable`) makes the card a `role="button"` target
 *   (mouse, Enter and Space) that emits `activated`.
 * - A click inside a nested control (`button`, `a[href]`, `input`, ...) or
 *   inside `[data-card-ignore]` does not activate the card.
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
 *   <div card-header>...</div>
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

/**
 * Descendants that own their own click semantics. A click on (or inside) one
 * of them never activates the card.
 */
const NESTED_INTERACTIVE_SELECTOR =
  'button, a[href], input, select, textarea, label, summary, [data-card-ignore]';

@Component({
  selector: 'ptah-surface-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="rounded-xl"
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
      [attr.role]="isInteractive() ? 'button' : null"
      [attr.tabindex]="isInteractive() && !disabled() ? 0 : null"
      [attr.aria-pressed]="selectable() ? selected() : null"
      [attr.aria-disabled]="disabled() ? 'true' : null"
      [attr.aria-label]="ariaLabel()"
      (click)="onClick($event)"
      (keydown)="onKeydown($event)"
    >
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

  /** Accessible name of the activation target. Required when interactive. */
  readonly ariaLabel = input<string | null>(null);

  /** Old input. 2 shows the `raised` variant when `variant` is `card`. */
  readonly elevation = input<1 | 2>(1);

  /**
   * Emitted on a real activation: a click on the card surface, or Enter or
   * Space while the card itself has focus. Not emitted for a nested control.
   */
  readonly activated = output<void>();

  protected readonly isInteractive = computed(
    () => this.interactive() || this.clickable() || this.selectable(),
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

  protected onClick(event: MouseEvent): void {
    if (!this.isInteractive() || this.disabled()) return;
    if (this.isNestedInteractive(event)) return;
    this.activated.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.isInteractive() || this.disabled()) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // A key press inside a nested control belongs to that control.
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    this.activated.emit();
  }

  /**
   * True when the event started on a descendant with its own click
   * semantics. The search stops at the card root, so the root's own
   * `role="button"` never matches.
   */
  private isNestedInteractive(event: MouseEvent): boolean {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    if (target === event.currentTarget) return false;
    const match = target.closest(NESTED_INTERACTIVE_SELECTOR);
    if (match === null) return false;
    return (
      event.currentTarget instanceof Node && event.currentTarget.contains(match)
    );
  }
}
