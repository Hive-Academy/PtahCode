import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

/** The elements that count as a projected button. */
const BUTTON_SELECTOR =
  'button, input[type="submit"], input[type="button"], a[ptahButton], [role="button"]';

const INLINE_CLASS = 'pt-[var(--ptah-gap-group)]';
const STICKY_CLASS = [
  'sticky bottom-0 z-[var(--ptah-z-raised)]',
  'p-[var(--ptah-surface-pad)]',
  '[background:var(--ptah-form-actions-bg)]',
  '[box-shadow:var(--ptah-form-actions-shadow)]',
  '[border-top:var(--ptah-border-width)_solid_var(--ptah-border-color)]',
  'rounded-b-[var(--ptah-radius-surface)]',
].join(' ');

/**
 * Form action bar (TASK_2026_1177_9109, pattern spec section 3). It lays out
 * projected Save and Cancel buttons at the end, an optional `[start]` slot and
 * a dirty indicator in a polite live region. It can stick to the bottom of the
 * scroll area. With no projected button, the host is hidden.
 *
 * @example
 * ```html
 * <ptah-form-actions [dirty]="dirty()" [saving]="saving()" sticky>
 *   <button ptahButton variant="ghost" type="button">Cancel</button>
 *   <button ptahButton variant="primary" type="submit" [busy]="saving()">Save</button>
 * </ptah-form-actions>
 * ```
 */
@Component({
  selector: 'ptah-form-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-ptah-pattern': 'form-actions',
    '[class]': 'hostClass()',
    '[attr.hidden]': 'hasButton() ? null : ""',
    '[attr.data-sticky]': 'sticky() ? "" : null',
  },
  template: `
    <div
      role="group"
      data-ptah-form-actions-bar
      class="flex flex-wrap items-center justify-end gap-[var(--ptah-gap-controls)]"
      [attr.aria-label]="label()"
      [attr.aria-disabled]="disabled() ? 'true' : null"
      [attr.aria-busy]="saving() ? 'true' : null"
    >
      <div
        data-ptah-form-actions-start
        class="flex min-w-0 flex-wrap items-center gap-[var(--ptah-gap-controls)] [margin-inline-end:auto]"
      >
        <span
          role="status"
          aria-live="polite"
          data-ptah-form-actions-status
          class="inline-flex items-center gap-[var(--ptah-gap-label)] text-[length:var(--ptah-text-hint-size)] leading-[var(--ptah-text-hint-leading)] font-[number:var(--ptah-text-hint-weight)] text-[color:var(--ptah-dirty-fg)]"
          >@if (dirty()) {<span
              aria-hidden="true"
              data-ptah-dirty-dot
              class="inline-block size-[var(--ptah-status-glyph)] shrink-0 rounded-full [background:var(--ptah-dirty-fg)]"
            ></span
            ><span>{{ dirtyText() }}</span>}</span
        >
        <ng-content select="[start]" />
      </div>
      <div
        #buttons
        data-ptah-form-actions-buttons
        class="flex flex-wrap items-center gap-[var(--ptah-gap-controls)] [@container(max-width:319.98px)]:w-full [@container(max-width:319.98px)]:flex-col-reverse [@container(max-width:319.98px)]:items-stretch [@container(max-width:319.98px)]:[&>*]:w-full"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class PtahFormActionsComponent {
  readonly sticky = input(false, { transform: booleanAttribute });
  readonly dirty = input(false, { transform: booleanAttribute });
  readonly saving = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly label = input('Form actions');
  readonly dirtyText = input('Unsaved changes');

  /** True when the default slot holds at least one button. */
  protected readonly hasButton = signal(false);

  /**
   * The one class source of the host. `block` is left out while the host is
   * hidden, because a `display` utility would override the `hidden` attribute.
   */
  protected readonly hostClass = computed(() =>
    [
      this.hasButton() ? 'block' : '',
      '[container-type:inline-size]',
      this.sticky() ? STICKY_CLASS : INLINE_CLASS,
    ]
      .filter(Boolean)
      .join(' '),
  );

  private readonly buttons = viewChild.required<ElementRef<HTMLElement>>('buttons');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const slot = this.buttons().nativeElement;
      const update = (): void => this.hasButton.set(slot.querySelector(BUTTON_SELECTOR) !== null);
      update();
      // One observer per bar. A form has one bar, so the cost does not grow with a list.
      if (typeof MutationObserver === 'undefined') return;
      const observer = new MutationObserver(update);
      observer.observe(slot, { childList: true, subtree: true });
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
