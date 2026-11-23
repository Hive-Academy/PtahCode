import {
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  output,
  Renderer2,
  effect,
} from '@angular/core';
import { COMPOSER_DISABLED_CONTROL_CLASS } from '@ptah-extension/chat-ui';

let nextGatedReasonId = 0;

/**
 * A composer control the current lane cannot honour (design-spec 5.1, Req
 * 1.10). Bind the backend's reason; `null` or an empty string leaves the
 * control untouched.
 *
 * While a reason is bound the control:
 * - stays in the tab order: `aria-disabled="true"`, never the native `disabled`;
 * - gets the dashed `surface-border-strong` edge and loses its hover fill
 *   (`COMPOSER_DISABLED_CONTROL_CLASS`), so the state is not colour-only;
 * - carries the reason in `title` and in `aria-describedby`, which points at
 *   a visually hidden node inside the control. That node is `aria-hidden`, so
 *   it never joins the control's accessible name, but a description reference
 *   still reads hidden content (accname 1.2);
 * - swallows clicks before the control's own handlers run, so a menu never
 *   opens; the click, a focus or a hover emits `reasonRevealed` instead, and
 *   blur or pointer leave emits `reasonCleared` (the status line shows the
 *   reason of the hovered or focused control). A reason that clears while it
 *   is shown also emits `reasonCleared`.
 *
 * A host that swaps the gated control out when the reason clears destroys
 * the directive with it; Angular drops output listeners before destroy
 * hooks, so that host sends its own `reasonCleared` (the pickers do).
 *
 * The host template shows the info glyph in place of its chevron by reading
 * `gated()` through `exportAs: 'ptahComposerGated'`.
 *
 * Send is the exception (decisions.md 10): it keeps the native `disabled`.
 */
@Directive({
  selector: '[ptahComposerGated]',
  standalone: true,
  exportAs: 'ptahComposerGated',
  host: {
    '[attr.aria-disabled]': 'gated() ? "true" : null',
    '[attr.aria-describedby]': 'gated() ? reasonId : null',
    '[attr.title]': 'gated() ? reason() : null',
    '[class]': 'gated() ? gatedClass : ""',
    '(focus)': 'reveal()',
    '(mouseenter)': 'reveal()',
    '(blur)': 'clear()',
    '(mouseleave)': 'clear()',
  },
})
export class ComposerGatedControlDirective {
  /** Why the lane cannot honour this control; empty or `null` = enabled. */
  readonly ptahComposerGated = input<string | null | undefined>(null);

  /** The reason, for the status line: emitted on click, focus and hover. */
  readonly reasonRevealed = output<string>();
  /** Focus or the pointer left the gated control. */
  readonly reasonCleared = output<void>();

  readonly reason = computed(() => (this.ptahComposerGated() ?? '').trim());
  readonly gated = computed(() => this.reason().length > 0);

  /** Id of the visually hidden reason node. */
  readonly reasonId = `ptah-composer-gated-reason-${nextGatedReasonId++}`;
  protected readonly gatedClass = COMPOSER_DISABLED_CONTROL_CLASS;

  private readonly element =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** The status line shows this control's reason. */
  private revealed = false;

  constructor() {
    const renderer = inject(Renderer2);
    const reasonNode: HTMLElement = renderer.createElement('span');
    renderer.setAttribute(reasonNode, 'id', this.reasonId);
    renderer.setAttribute(reasonNode, 'aria-hidden', 'true');
    renderer.addClass(reasonNode, 'sr-only');
    renderer.appendChild(this.element, reasonNode);
    effect(() => {
      renderer.setProperty(reasonNode, 'textContent', this.reason());
    });
    // Ungated while focused or hovered: blur / leave will no longer clear it.
    effect(() => {
      if (!this.gated() && this.revealed) {
        this.revealed = false;
        this.reasonCleared.emit();
      }
    });

    // Capture phase on the control itself runs before its own (bubble-phase)
    // template handlers, so a gated pill never opens its menu.
    const onClick = (event: Event): void => {
      if (!this.gated()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.revealed = true;
      this.reasonRevealed.emit(this.reason());
    };
    this.element.addEventListener('click', onClick, true);
    inject(DestroyRef).onDestroy(() => {
      this.element.removeEventListener('click', onClick, true);
    });
  }

  protected reveal(): void {
    if (!this.gated()) return;
    this.revealed = true;
    this.reasonRevealed.emit(this.reason());
  }

  protected clear(): void {
    if (!this.gated()) return;
    this.revealed = false;
    this.reasonCleared.emit();
  }
}
