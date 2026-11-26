import { CdkConnectedOverlay } from '@angular/cdk/overlay';
import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  ElementRef,
  forwardRef,
  inject,
  Injector,
  input,
  model,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  registerOwnedOverlay,
  watchAncestorScroll,
  type OwnedOverlayRegistration,
} from '../../overlays/shared/connected-overlay-watch';
import {
  claimOverlayDismissal,
  connectedPopoverPositions,
  CONNECTED_OVERLAY_POLICY,
  registerConnectedChild,
} from '../../overlays/shared/overlay-positions';
import { PtahFieldControlRef } from '../../surfaces/field-control-ref';
import { PtahSelectIconDirective } from './rich-select-icon.directive';
import {
  type ActiveMove,
  buildGroups,
  flatItems,
  moveActive,
  typeAheadIndex,
} from './rich-select-list';
import { RICH_SELECT_TEMPLATE } from './rich-select.template';
import type { PtahControlSize } from '../form-control.types';
import type { PtahSelectOption } from './rich-select.types';

let selectId = 0;
const TYPE_AHEAD_RESET_MS = 500;
/** With `searchable` unset, the panel shows the search input from this number of options. */
export const PTAH_SELECT_SEARCH_MIN_OPTIONS = 8;
const OPEN_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End']);
const PANEL_MOVES = new Map<string, ActiveMove>([
  ['ArrowDown', 'next'],
  ['ArrowUp', 'previous'],
  ['Home', 'first'],
  ['End', 'last'],
]);

/**
 * Rich select of the form controls family: groups, search, icons, a
 * description line, disabled options and a clear action. The trigger is a
 * `role="combobox"` button with a `listbox` popup and `aria-activedescendant`
 * (the search input takes the combobox role while the panel is open). It
 * positions the panel in a CDK connected overlay. It works with `ngModel` and
 * with `[(value)]`. Inside `ptah-field` it gets the floating label.
 */
@Component({
  selector: 'ptah-select',
  standalone: true,
  imports: [NgTemplateOutlet, CdkConnectedOverlay],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: PtahFieldControlRef, useExisting: forwardRef(() => PtahRichSelectComponent) },
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PtahRichSelectComponent), multi: true },
  ],
  host: {
    class: 'ptah-select',
    '[attr.data-ptah-filled]': "selected() || open() ? 'true' : null",
    '[attr.data-open]': "open() ? 'true' : null",
    '[attr.data-size]': 'size()',
    '[attr.data-clearable]': "clearable() ? 'true' : null",
  },
  template: RICH_SELECT_TEMPLATE,
})
export class PtahRichSelectComponent<T = unknown>
  implements ControlValueAccessor, PtahFieldControlRef, OnDestroy
{
  readonly options = input<readonly PtahSelectOption<T>[]>([]);
  readonly value = model<T | null>(null);
  /** The accessible name when the select is not inside `ptah-field`. */
  readonly label = input<string | undefined>(undefined);
  /**
   * Compact variant (no floating label, for `ptah-setting-row` and table
   * cells): the id (or ids) of the visible element that names the select, for
   * example the row title or the column header. It wins over `label`. Use
   * `label` when no visible element has an id. One of the two is required
   * outside `ptah-field`.
   */
  readonly labelledBy = input<string | undefined>(undefined);
  readonly placeholder = input('Select');
  /**
   * Shows the search input in the panel. Unset (default): automatic, on from
   * `PTAH_SELECT_SEARCH_MIN_OPTIONS` (8) options, off for a short list.
   */
  readonly searchable = input<boolean | undefined, unknown>(undefined, {
    transform: (v: unknown) => (v === undefined ? undefined : booleanAttribute(v)),
  });
  readonly searchPlaceholder = input('Search');
  readonly emptyText = input('No match. Change the search text.');
  readonly clearable = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly invalid = input(false, { transform: booleanAttribute });
  /**
   * Height of the standalone trigger: xs 24 px, sm 32 px (default), md 40 px,
   * the same heights as `select[ptahSelect]`. Inside `ptah-field` the field box
   * sets the height.
   */
  readonly size = input<PtahControlSize>('sm');
  readonly compareWith = input<(a: T | null, b: T | null) => boolean>(Object.is);

  /** Id of the combobox trigger. Default: a generated id. Not the host `id`. */
  readonly triggerId = input<string | undefined>(undefined);
  private readonly generatedId = `ptah-select-${++selectId}`;
  /** The id of the trigger: `triggerId` when set, else the generated id. */
  get controlId(): string {
    return this.triggerId() || this.generatedId;
  }
  readonly listboxId = `${this.generatedId}-listbox`;
  readonly iconTemplate = contentChild(PtahSelectIconDirective);
  private readonly triggerRef = viewChild.required<ElementRef<HTMLElement>>('trigger');
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly searchRef = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly overlay = viewChild.required(CdkConnectedOverlay);
  protected readonly overlayPolicy = CONNECTED_OVERLAY_POLICY;
  protected readonly overlayPositions = connectedPopoverPositions('bottom-start', 6);
  private originResize?: ResizeObserver;
  private unregisterChild?: () => void;
  private owned?: OwnedOverlayRegistration;
  private stopScroll?: () => void;

  readonly open = signal(false);
  readonly query = signal('');
  readonly activeIndex = signal(-1);
  private readonly fieldInvalid = signal(false);
  private readonly formDisabled = signal(false);
  private onChange: (value: T | null) => void = () => undefined;
  private touched: () => void = () => undefined;
  private typeBuffer = '';
  private typeTimer: ReturnType<typeof setTimeout> | undefined;

  readonly isSearchable = computed(
    () => this.searchable() ?? this.options().length >= PTAH_SELECT_SEARCH_MIN_OPTIONS,
  );
  readonly groups = computed(() =>
    buildGroups(this.options(), this.isSearchable() ? this.query() : '', this.generatedId),
  );
  readonly items = computed(() => flatItems(this.groups()));
  readonly activeId = computed(() => this.items()[this.activeIndex()]?.id ?? null);
  readonly selected = computed(() => {
    const value = this.value();
    if (value === null) return null;
    return this.options().find((o) => this.compareWith()(o.value, value)) ?? null;
  });
  readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  readonly ariaInvalid = computed(() => (this.invalid() || this.fieldInvalid() ? 'true' : null));
  readonly searchLabel = computed(() => `Search ${this.label() ?? 'options'}`);
  /** `aria-label` of the trigger: `label`, unless `labelledBy` names the select. */
  readonly triggerAriaLabel = computed(() => (this.labelledBy() ? null : (this.label() ?? null)));
  /** `aria-labelledby` of the listbox: `labelledBy`, else the field label when no `label`. */
  readonly listboxLabelledBy = computed(
    () => this.labelledBy() ?? (this.label() ? null : this.fieldLabelId()),
  );
  readonly statusText = computed(() => {
    const n = this.items().length;
    return n === 1 ? '1 option' : `${n} options`;
  });
  readonly fieldLabelId = signal<string | null>(null);

  get element(): ElementRef<HTMLElement> {
    return this.triggerRef();
  }

  isSelected(option: PtahSelectOption<T>): boolean {
    const value = this.value();
    return value !== null && this.compareWith()(option.value, value);
  }

  toggle(): void {
    if (this.open()) this.close(true);
    else this.openPanel('selected');
  }

  openPanel(start: ActiveMove | 'selected'): void {
    if (this.isDisabled() || this.open()) return;
    this.query.set('');
    this.open.set(true);
    const current = this.items().find((item) => this.isSelected(item.option));
    this.activeIndex.set(
      start === 'selected' && current && !current.option.disabled
        ? current.index
        : moveActive(this.items(), -1, start === 'selected' ? 'first' : start),
    );
  }

  close(focusTrigger: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    clearTimeout(this.typeTimer);
    this.typeBuffer = '';
    if (focusTrigger) this.triggerRef().nativeElement.focus();
  }

  choose(option: PtahSelectOption<T>): void {
    if (option.disabled) return;
    this.value.set(option.value);
    this.onChange(option.value);
    this.close(true);
  }

  clear(): void {
    this.value.set(null);
    this.onChange(null);
    this.triggerRef().nativeElement.focus();
  }

  hover(index: number): void {
    if (!this.items()[index]?.option.disabled) this.activeIndex.set(index);
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(moveActive(this.items(), -1, 'first'));
    afterNextRender(() => {
      if (this.open()) this.overlay().overlayRef?.updatePosition();
    }, { injector: this.injector });
  }

  onTriggerKey(event: KeyboardEvent): void {
    if (this.open()) {
      this.onPanelKey(event);
      return;
    }
    if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey) {
      this.openPanel('selected');
      this.typeAhead(event.key);
      return;
    }
    if (!OPEN_KEYS.has(event.key)) return;
    event.preventDefault();
    const start = event.key === 'End' || event.key === 'ArrowUp' ? 'last' : event.key === 'Home' ? 'first' : 'selected';
    this.openPanel(start);
  }

  onPanelKey(event: KeyboardEvent): void {
    const move = PANEL_MOVES.get(event.key);
    if (move) {
      event.preventDefault();
      event.stopPropagation();
      this.activeIndex.set(moveActive(this.items(), this.activeIndex(), move));
      this.scrollActive();
    } else if (event.key === 'Enter' || (event.key === ' ' && !this.isSearchable())) {
      event.preventDefault();
      event.stopPropagation();
      const item = this.items()[this.activeIndex()];
      if (item) this.choose(item.option);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    } else if (event.key === 'Tab') {
      // The search is portaled. Continue Tab from the trigger in the caller's
      // tab order, including the parent dialog's focus trap.
      this.close(true);
    } else if (!this.isSearchable() && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      this.typeAhead(event.key);
    }
  }

  protected onOutsideClick(event: MouseEvent): void {
    // One click dismisses one layer. Chromium focuses the clicked control on
    // pointerdown, before this click. Restoring the trigger then steals that
    // control. Put focus back only when it is still in the panel about to
    // detach, or it would otherwise be left on the body or nowhere.
    if (!this.open() || !claimOverlayDismissal(event)) return;
    const active = this.triggerRef().nativeElement.ownerDocument.activeElement;
    this.close(this.focusWouldBeStranded(active));
  }

  private focusWouldBeStranded(active: Element | null): boolean {
    const doc = this.triggerRef().nativeElement.ownerDocument;
    if (
      active === null ||
      !active.isConnected ||
      active === doc.body ||
      active === doc.documentElement
    ) {
      return true;
    }
    const pane =
      this.overlay().overlayRef?.overlayElement ?? this.panelRef()?.nativeElement;
    return !!pane?.contains(active);
  }

  protected onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !event.defaultPrevented && this.open()) {
      event.preventDefault();
      this.close(true);
    }
  }

  onTouched(): void {
    if (!this.open()) this.touched();
  }

  setFieldInvalid(invalid: boolean): void {
    this.fieldInvalid.set(invalid);
  }

  setFieldLabel(labelId: string): void {
    this.fieldLabelId.set(labelId);
  }

  writeValue(value: T | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: T | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.touched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  protected overlayOrigin(): HTMLElement {
    const host = this.host.nativeElement;
    return host.closest<HTMLElement>('.ptah-field__box') ?? host;
  }

  protected onOverlayAttach(): void {
    const ref = this.overlay().overlayRef;
    const anchor = this.overlayOrigin();
    ref.updateSize({ maxWidth: 'calc(100vw - 16px)' });
    this.releaseOverlayWatch();
    this.owned = registerOwnedOverlay(anchor);
    this.stopScroll = watchAncestorScroll(anchor, () => ref.updatePosition());
    this.unregisterChild = registerConnectedChild(anchor, () => ref.detach());
    if (typeof ResizeObserver !== 'undefined') {
      this.originResize = new ResizeObserver(() => {
        ref.updateSize({ width: anchor.getBoundingClientRect().width });
        ref.updatePosition();
      });
      this.originResize.observe(anchor);
    }
    afterNextRender(() => {
      if (!this.open()) return;
      this.owned?.attachPanel(this.panelRef()?.nativeElement ?? null);
      this.searchRef()?.nativeElement.focus();
      this.scrollActive();
    }, { injector: this.injector });
  }

  protected onOverlayDetach(): void {
    this.releaseOverlayWatch();
    this.unregisterChild?.();
    this.unregisterChild = undefined;
    this.originResize?.disconnect();
    this.originResize = undefined;
    this.close(false);
  }

  ngOnDestroy(): void {
    clearTimeout(this.typeTimer);
    this.originResize?.disconnect();
    this.releaseOverlayWatch();
    this.unregisterChild?.();
  }

  private releaseOverlayWatch(): void {
    this.stopScroll?.();
    this.stopScroll = undefined;
    this.owned?.unregister();
    this.owned = undefined;
  }

  private typeAhead(key: string): void {
    clearTimeout(this.typeTimer);
    this.typeBuffer += key;
    this.typeTimer = setTimeout(() => (this.typeBuffer = ''), TYPE_AHEAD_RESET_MS);
    const from = this.typeBuffer.length > 1 ? this.activeIndex() - 1 : this.activeIndex();
    const hit = typeAheadIndex(this.items(), this.typeBuffer, from);
    if (hit >= 0) {
      this.activeIndex.set(hit);
      this.scrollActive();
    }
  }

  private scrollActive(): void {
    const id = this.activeId();
    if (!id) return;
    const el = this.panelRef()?.nativeElement.querySelector<HTMLElement>(`#${id}`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }
}
