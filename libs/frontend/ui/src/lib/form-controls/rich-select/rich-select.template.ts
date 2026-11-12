/** Template of `ptah-select` (kept apart so that the component file stays small). */
export const RICH_SELECT_TEMPLATE = `<button
    #trigger
    type="button"
    class="ptah-select__trigger"
    role="combobox"
    data-ptah-control="rich-select"
    aria-haspopup="listbox"
    [id]="controlId"
    [attr.aria-expanded]="open()"
    [attr.aria-controls]="open() ? listboxId : null"
    [attr.aria-activedescendant]="open() && !isSearchable() ? activeId() : null"
    [attr.aria-label]="label() ?? null"
    [attr.aria-invalid]="ariaInvalid()"
    [disabled]="isDisabled()"
    (click)="toggle()"
    (keydown)="onTriggerKey($event)"
    (keyup.space)="$event.preventDefault()"
    (blur)="onTouched()"
  >
    @if (selected(); as option) {
      <ng-container
        [ngTemplateOutlet]="iconSlot"
        [ngTemplateOutletContext]="{ $implicit: option, place: 'trigger' }"
      />
      <span class="ptah-select__value">{{ option.label }}</span>
    } @else {
      <span class="ptah-select__placeholder">{{ placeholder() }}</span>
    }
  </button>
  <!-- One action group at the inline end, in a fixed order: clear, then chevron.
       It is not in the trigger (a button cannot contain a button), so the
       open state, the value and the clear action do not move it. -->
  <span class="ptah-select__actions">
    @if (clearable() && selected() && !isDisabled()) {
      <button
        type="button"
        class="ptah-select__clear"
        [attr.aria-label]="'Clear ' + (label() ?? 'selection')"
        (click)="clear()"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    }
    <svg class="ptah-select__chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  </span>
  @if (open()) {
    <div #panel class="ptah-select__panel" (keydown)="onPanelKey($event)">
      @if (isSearchable()) {
        <div class="ptah-select__search-row">
          <svg class="ptah-select__search-icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" />
          </svg>
          <input
            #search
            class="ptah-select__search"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            autocomplete="off"
            spellcheck="false"
            [attr.aria-controls]="listboxId"
            [attr.aria-activedescendant]="activeId()"
            [attr.aria-label]="searchLabel()"
            [placeholder]="searchPlaceholder()"
            [value]="query()"
            (input)="onQuery($event)"
          />
        </div>
      }
      <ul
        class="ptah-select__list"
        role="listbox"
        tabindex="-1"
        [id]="listboxId"
        [attr.aria-label]="label() ?? null"
        [attr.aria-labelledby]="label() ? null : fieldLabelId()"
      >
        @for (group of groups(); track group.headerId) {
          @if (group.name) {
            <li role="presentation">
              <ul role="group" class="ptah-select__group" [attr.aria-labelledby]="group.headerId">
                <li role="presentation" class="ptah-select__group-header" [id]="group.headerId">
                  {{ group.name }}
                </li>
                @for (item of group.items; track item.id) {
                  <ng-container [ngTemplateOutlet]="optionRow" [ngTemplateOutletContext]="{ $implicit: item }" />
                }
              </ul>
            </li>
          } @else {
            @for (item of group.items; track item.id) {
              <ng-container [ngTemplateOutlet]="optionRow" [ngTemplateOutletContext]="{ $implicit: item }" />
            }
          }
        }
        @if (!items().length) {
          <li role="presentation" class="ptah-select__empty">{{ emptyText() }}</li>
        }
      </ul>
      <span class="sr-only" role="status">{{ statusText() }}</span>
    </div>
  }
  <ng-template #optionRow let-item>
    <li
      role="option"
      class="ptah-select__option"
      [id]="item.id"
      [attr.aria-selected]="isSelected(item.option)"
      [attr.aria-disabled]="item.option.disabled ? 'true' : null"
      [attr.data-active]="item.index === activeIndex() ? 'true' : null"
      (pointerdown)="$event.preventDefault()"
      (pointermove)="hover(item.index)"
      (click)="choose(item.option)"
    >
      <ng-container
        [ngTemplateOutlet]="iconSlot"
        [ngTemplateOutletContext]="{ $implicit: item.option, place: 'option' }"
      />
      <span class="ptah-select__text">
        <span class="ptah-select__label">{{ item.option.label }}</span>
        @if (item.option.description) {
          <span class="ptah-select__description">{{ item.option.description }}</span>
        }
      </span>
      <svg class="ptah-select__check" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
    </li>
  </ng-template>
  <ng-template #iconSlot let-option let-place="place">
    @if (iconTemplate(); as icon) {
      <span class="ptah-select__icon" aria-hidden="true">
        <ng-container
          [ngTemplateOutlet]="icon.template"
          [ngTemplateOutletContext]="{ $implicit: option, place: place }"
        />
      </span>
    }
  </ng-template>`;
