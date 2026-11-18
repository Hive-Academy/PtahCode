import { Component, ChangeDetectionStrategy, input } from '@angular/core';

/** Apply ngOption [value] on this same element inside ngListbox. Use selectionMode="explicit" with ptah-list-detail. */
@Component({
  // Attribute component selector is the approved API for sharing the ngOption host.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'div[ptahListRow]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'grid min-h-10 grid-cols-[auto_1fr_auto] items-center gap-ptah-controls border-l-2 pl-[calc(var(--ptah-surface-pad)-2px)] pr-ptah-surface py-2.5 hover:bg-[var(--surface-2)] aria-selected:bg-[var(--surface-2)] aria-selected:border-l-[var(--ptah-gold)] aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ptah-gold)]',
    '[attr.data-wrap-text]': 'wrapText()',
    '[class]':
      "current() ? 'bg-[var(--surface-2)] border-l-[var(--ptah-gold)]' : 'border-l-transparent'",
    '[attr.aria-current]': "current() ? 'page' : null",
  },
  styles: [
    `
      :host([data-wrap-text='true']:has([body])) .row-body {
        grid-column: 1 / -1;
      }
      @container (max-width: 479px) {
        :host([data-wrap-text='true']:has([body])) {
          grid-template-columns: minmax(0, 1fr);
        }
        :host([data-wrap-text='true']:has([body])) .row-body {
          grid-column: 1 / -1;
        }
      }
      @container (min-width: 800px) {
        :host([data-wrap-text='true']:has([body])) {
          grid-template-columns: auto minmax(0, 1fr) minmax(240px, 1fr) auto;
          column-gap: var(--ptah-gap-field);
        }
        :host([data-wrap-text='true']:has([body])) .row-body {
          grid-column: 3;
          grid-row: 1;
        }
      }
      @container (min-width: 1200px) {
        :host([data-wrap-text='true']:has([body])) {
          grid-template-columns: auto 248px minmax(0, 1fr) auto;
        }
      }
    `,
  ],
  template: `<ng-content select="[leading]" />
    <div class="min-w-0">
      <div
        class="text-sm font-medium"
        [class.truncate]="!wrapText()"
        [class.whitespace-normal]="wrapText()"
        [class.break-words]="wrapText()"
      >
        {{ title() }}
      </div>
      @if (meta()) {
        <div
          class="text-xs text-base-content-muted"
          [class.truncate]="!wrapText()"
          [class.whitespace-normal]="wrapText()"
          [class.break-words]="wrapText()"
        >
          {{ meta() }}
        </div>
      }
    </div>
    <ng-content select="[trailing]" />
    <div class="row-body col-start-2 col-end-4 min-w-0 empty:hidden">
      <ng-content select="[body]" />
    </div>`,
})
export class PtahListRowComponent {
  readonly title = input.required<string>();
  readonly meta = input<string | null>(null);
  readonly current = input(false);
  readonly wrapText = input(false);
}
