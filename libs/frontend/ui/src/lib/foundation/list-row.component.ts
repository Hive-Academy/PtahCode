import { Component, ChangeDetectionStrategy, input } from '@angular/core';

/** Apply ngOption [value] on this same element inside ngListbox. Use selectionMode="explicit" with ptah-list-detail. */
@Component({
  // Attribute component selector is the approved API for sharing the ngOption host.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'div[ptahListRow]', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid min-h-10 grid-cols-[auto_1fr_auto] items-center gap-ptah-controls border-l-2 border-l-transparent pl-[calc(var(--ptah-surface-pad)-2px)] pr-ptah-surface py-2.5 hover:bg-[var(--surface-2)] aria-selected:bg-[var(--surface-2)] aria-selected:border-l-[var(--ptah-gold)] aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ptah-gold)]',
    '[class]': "current() ? 'bg-[var(--surface-2)] border-l-[var(--ptah-gold)]' : ''", '[attr.aria-current]': "current() ? 'page' : null" },
  template: `<ng-content select="[leading]" /><div class="min-w-0"><div class="truncate text-sm font-medium">{{ title() }}</div>@if (meta()) { <div class="truncate text-xs text-base-content-muted">{{ meta() }}</div> }</div><ng-content select="[trailing]" />`,
})
export class PtahListRowComponent {
  readonly title = input.required<string>();
  readonly meta = input<string | null>(null);
  readonly current = input(false);
}
