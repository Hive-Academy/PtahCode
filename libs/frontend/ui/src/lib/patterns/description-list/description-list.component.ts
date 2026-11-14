import {
  afterEveryRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

/** One key/value row of the data API of `ptah-description-list`. */
export interface PtahDescriptionItem {
  /** Track key. Unique in one list. */
  readonly key: string;
  readonly term: string;
  readonly value: string | number | null | undefined;
  readonly mono?: boolean;
  readonly truncate?: boolean;
}

/** A value is empty when it is `null`, `undefined` or a string with only whitespace. `0` is not empty. */
export function isPtahDescriptionValueEmpty(value: string | number | null | undefined): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

const DIVIDER_CLASS = '[border-bottom:var(--ptah-border-width)_solid_var(--ptah-border-color)]';

/** Row grid: term above value below 640px, three columns from 640px (spec section 0.4 `form-split`). */
const ROW_CLASS = [
  'grid min-h-[var(--ptah-dl-row-min-h)] py-[var(--ptah-gap-controls)] gap-[var(--ptah-gap-label)]',
  '[@container(min-width:640px)]:grid-cols-[var(--ptah-dl-term-w)_minmax(0,1fr)_auto]',
  '[@container(min-width:640px)]:items-center [@container(min-width:640px)]:gap-x-[var(--ptah-gap-field)]',
].join(' ');

const TERM_CLASS =
  'min-w-0 text-[length:var(--ptah-text-label-size)] leading-[var(--ptah-text-label-leading)] font-[number:var(--ptah-text-label-weight)] text-base-content-muted';

const VALUE_CLASS =
  'min-w-0 break-words text-[length:var(--ptah-text-body-size)] leading-[var(--ptah-text-body-leading)] font-[number:var(--ptah-text-body-weight)] text-base-content';

const MONO_CLASS =
  'font-[family-name:var(--ptah-font-mono)] text-[length:var(--ptah-text-code-size)] leading-[var(--ptah-text-code-leading)]';

const PLACEHOLDER_CLASS = 'not-italic text-[color:var(--ptah-dl-empty-fg)]';

function valueClass(mono: boolean, truncate: boolean): string {
  return [VALUE_CLASS, mono ? MONO_CLASS : '', truncate ? 'truncate' : ''].filter(Boolean).join(' ');
}

function rowClass(divided: boolean): string {
  return divided ? `${ROW_CLASS} ${DIVIDER_CLASS}` : ROW_CLASS;
}

/**
 * Read-only key/value rows for view mode (TASK_2026_1177_9109, pattern spec
 * section 2). Give rows with the `items` input (plain text values) or with
 * child `div[ptahDescriptionItem]` rows (rich values and row actions).
 * Use one API per list. An empty value shows the `emptyText` placeholder.
 *
 * @example
 * ```html
 * <ptah-description-list [items]="rows()" ariaLabel="Account details" />
 *
 * <ptah-description-list>
 *   <div ptahDescriptionItem term="Status"><span ptahBadge tone="ok">Active</span></div>
 * </ptah-description-list>
 * ```
 */
@Component({
  selector: 'ptah-description-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-ptah-pattern': 'description-list', class: 'block [container-type:inline-size]' },
  template: `
    <dl [class]="listClass()" [attr.aria-label]="ariaLabel()">
      @if (items(); as rows) {
        @for (item of rows; track item.key) {
          <div data-ptah-description-row [class]="rowClass()">
            <dt [class]="termClass">{{ item.term }}</dt>
            @if (isEmpty(item.value)) {
              <dd [class]="valueClass(false, false)" data-ptah-description-empty>
                <span aria-hidden="true" [class]="placeholderClass">{{ emptyText() }}</span
                ><span class="sr-only">{{ item.term }} not set</span>
              </dd>
            } @else {
              <dd
                [class]="valueClass(item.mono === true, item.truncate === true)"
                [attr.title]="item.truncate ? item.value : null"
              >{{ item.value }}</dd>
            }
          </div>
        } @empty {
          <div data-ptah-description-row data-ptah-description-list-empty [class]="rowClass()">
            <!-- An empty dt keeps the dl content model valid (each row div needs a dt). -->
            <dt class="sr-only"></dt>
            <dd [class]="valueClass(false, false) + ' ' + placeholderClass">{{ emptyText() }}</dd>
          </div>
        }
      }
      <ng-content />
    </dl>
  `,
})
export class PtahDescriptionListComponent {
  readonly items = input<readonly PtahDescriptionItem[] | null>(null);
  readonly divided = input(true, { transform: booleanAttribute });
  readonly emptyText = input('Not set');
  readonly ariaLabel = input<string | null>(null);

  protected readonly listClass = computed(() =>
    this.divided()
      ? 'flex flex-col [&>:last-child]:[border-bottom:0]'
      : 'flex flex-col gap-[var(--ptah-gap-controls)]',
  );
  protected readonly rowClass = computed(() => rowClass(this.divided()));
  protected readonly termClass = TERM_CLASS;
  protected readonly placeholderClass = PLACEHOLDER_CLASS;
  protected readonly isEmpty = isPtahDescriptionValueEmpty;
  protected readonly valueClass = valueClass;
}

/**
 * One rich row of `ptah-description-list`. The host `div` is the row, so the
 * `dl` holds only `div` rows with `dt` and `dd` (valid `dl` content). The
 * default slot is the value
 * (text, `ptahBadge`, a status dot and a word, a chip list). The `[actions]`
 * slot is a row action, for example a copy `ptahIconButton`.
 *
 * The placeholder shows when the `value` input holds an empty value, or when
 * `value` is `undefined` and the default slot has no content. A bound
 * non-empty `value` renders as text before the projected content.
 */
@Component({
  // A native div row keeps the dl content model valid (dl > div > dt + dd) without a wrapper node.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'div[ptahDescriptionItem]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The host is the row with dt and dd. The parent dl gives the list layout.
  host: {
    'data-ptah-pattern': 'description-item',
    'data-ptah-description-row': '',
    '[class]': 'rowClass()',
  },
  template: `
    <dt [class]="termClass">{{ term() }}</dt>
    <dd
      [class]="valueClass()"
      [attr.title]="truncate() && hasTextValue() ? value() : null"
      [attr.data-ptah-description-empty]="showPlaceholder() ? '' : null"
    >
      @if (showPlaceholder()) {
        <span aria-hidden="true" [class]="placeholderClass">{{ emptyText() }}</span
        ><span class="sr-only">{{ term() }} not set</span>
      } @else if (hasTextValue()) {
        {{ value() }}
      }
      <span
        #valueSlot
        data-ptah-description-slot
        class="inline-flex min-w-0 flex-wrap items-center gap-[var(--ptah-gap-inline)] empty:hidden"
        [class.hidden]="showPlaceholder()"
        ><ng-content
      /></span>
    </dd>
    <div
      data-ptah-description-actions
      class="flex items-center gap-[var(--ptah-gap-controls)] justify-self-start empty:hidden [@container(min-width:640px)]:justify-self-end"
      ><ng-content select="[actions]"
    /></div>
  `,
})
export class PtahDescriptionItemComponent {
  readonly term = input.required<string>();
  /** When set and empty, the placeholder shows instead of the projected value. */
  readonly value = input<string | number | null | undefined>(undefined);
  readonly mono = input(false, { transform: booleanAttribute });
  readonly truncate = input(false, { transform: booleanAttribute });

  private readonly list = inject(PtahDescriptionListComponent, { optional: true });
  private readonly valueSlot = viewChild.required<ElementRef<HTMLElement>>('valueSlot');
  private readonly slotHasContent = signal(false);

  protected readonly termClass = TERM_CLASS;
  protected readonly placeholderClass = PLACEHOLDER_CLASS;
  protected readonly emptyText = computed(() => this.list?.emptyText() ?? 'Not set');
  protected readonly rowClass = computed(() => rowClass(this.list?.divided() ?? true));
  protected readonly valueClass = computed(() => valueClass(this.mono(), this.truncate()));
  protected readonly hasTextValue = computed(() => !isPtahDescriptionValueEmpty(this.value()));
  protected readonly showPlaceholder = computed(() => {
    const value = this.value();
    return value === undefined ? !this.slotHasContent() : isPtahDescriptionValueEmpty(value);
  });

  constructor() {
    // No observer per row: a list can grow without limit. After each render the
    // slot is read only while `value` is unbound, so projected content that
    // changes later (for example an @if) updates the placeholder. The cost is
    // one walk of the slot's direct child nodes per unbound row per render.
    afterEveryRender({
      read: () => {
        if (this.value() !== undefined) return;
        const hasContent = hasRenderedContent(this.valueSlot().nativeElement);
        if (hasContent !== this.slotHasContent()) this.slotHasContent.set(hasContent);
      },
    });
  }
}

function hasRenderedContent(slot: HTMLElement): boolean {
  return Array.from(slot.childNodes).some(
    (node) =>
      node.nodeType === Node.ELEMENT_NODE ||
      (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== ''),
  );
}
