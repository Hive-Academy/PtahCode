import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Shared inbox-style list/detail shell for the Machines and Reviews pages
 * (TASK_2026_913 context.md; approved TASK_2026_UX_REVIEWS_MACHINES option A,
 * prototype/machines-a.html and reviews-a.html; DESIGN.md section 8.6).
 *
 * Three `surface-1` panes with a 16 px gutter: an optional leading `aside`
 * (`inboxLeading` slot, fixed `leadingWidth` from 1200 px), the list
 * `section` (`inboxList` slot, fixed `listWidth` from 768 px) and the
 * fluid detail `section` (default slot). Each pane scrolls on its own.
 * Below 768 px exactly one pane stays visible; `detailOpen` picks it.
 *
 * The tailwindcss container-queries plugin is not installed
 * (apps/ptah-extension-webview/tailwind.config.js lists daisyui only, no
 * @tailwindcss/container-queries in package.json), so the named-container
 * variants `@[768px]/listdetail:` cannot generate CSS. The tiers therefore use
 * `min-[768px]:` / `min-[1200px]:` viewport media variants — the same
 * strategy as the approved prototype, whose own breakpoints are
 * `@media(max-width:767px)` and `@media(min-width:768px) and (max-width:1199px)`.
 */
@Component({
  selector: 'ptah-inbox-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-0 min-w-0 flex-1',
    'data-testid': 'inbox-layout',
  },
  template: `
    <div
      class="flex min-h-0 min-w-0 flex-1 gap-4"
      [style.--ptah-list-width]="listWidthStyle()"
      [style.--ptah-leading-width]="leadingWidthStyle()"
    >
      @if (hasLeading()) {
        <aside
          class="surface-1 rounded-2xl p-5 min-w-0 min-h-0 overflow-y-auto hidden min-[1200px]:block min-[1200px]:flex-none min-[1200px]:w-[var(--ptah-leading-width)]"
          [attr.aria-label]="leadingLabel() || null"
          data-glass-surface="content"
          data-testid="inbox-layout-leading"
        >
          <ng-content select="[inboxLeading]" />
        </aside>
      }
      <section
        class="surface-1 rounded-2xl p-5 min-w-0 min-h-0 overflow-y-auto flex-1 min-[768px]:block min-[768px]:flex-none min-[768px]:w-[var(--ptah-list-width)]"
        [class.hidden]="detailOpen()"
        [attr.aria-label]="listLabel()"
        data-glass-surface="content"
        data-testid="inbox-layout-list"
      >
        <ng-content select="[inboxList]" />
      </section>
      <section
        class="surface-1 rounded-2xl p-5 min-w-0 min-h-0 overflow-y-auto flex-1 min-[768px]:block"
        [class.hidden]="!detailOpen()"
        [attr.aria-label]="detailLabel()"
        data-glass-surface="content"
        data-testid="inbox-layout-detail"
      >
        <ng-content />
      </section>
    </div>
  `,
})
export class InboxLayoutComponent {
  /** Accessible name of the list pane. */
  readonly listLabel = input.required<string>();
  /** Accessible name of the detail pane. */
  readonly detailLabel = input.required<string>();
  /**
   * Accessible name of the optional leading pane. An empty label removes the
   * attribute: an empty `aria-label` would hide the pane's content from the
   * accessibility tree.
   */
  readonly leadingLabel = input<string>('');
  /** Render the leading pane at all (it stays hidden below 1200 px). */
  readonly hasLeading = input(false);
  /** List pane width in px, applied from 768 px viewport width. */
  readonly listWidth = input(320);
  /** Leading pane width in px, applied from 1200 px viewport width. */
  readonly leadingWidth = input(240);
  /** Below 768 px: true = show only the detail pane, false = show only the list pane. */
  readonly detailOpen = input(false);

  /** Tailwind cannot see runtime class names, so the pane widths come from CSS variables. */
  protected readonly listWidthStyle = computed(() => `${this.listWidth()}px`);
  protected readonly leadingWidthStyle = computed(() => `${this.leadingWidth()}px`);
}
