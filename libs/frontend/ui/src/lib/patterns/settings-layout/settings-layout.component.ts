import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { LucideAngularModule, type LucideIconData } from 'lucide-angular';
import { PtahBadgeDirective } from '../../badge/badge.directive';

let nextSettingsLayoutId = 0;

/** The `layout-split` break width (pattern-spec.md section 0.4). */
const LAYOUT_SPLIT_PX = 768;

/** One tab item of `ptah-settings-layout`. */
export interface PtahSettingsTab<TId extends string = string> {
  readonly id: TId;
  readonly label: string;
  readonly icon?: LucideIconData;
  readonly badge?: string | number | null;
  readonly disabled?: boolean;
  readonly disabledReason?: string | null;
  /** Parent navigation id. Used only in navigation mode. */
  readonly parent?: TId;
  /** Optional navigation status, shown as a dot and count. */
  readonly stateMark?: {
    readonly tone: 'neutral' | 'ok' | 'warn' | 'error';
    readonly label: string;
    readonly count?: string | number;
  };
}

export type PtahSettingsTitleLevel = 1 | 2;
export type PtahSettingsNavMode = 'tabs' | 'navigation';

const TITLE_CLASS =
  'text-[length:var(--ptah-text-page-title-size)] leading-[var(--ptah-text-page-title-leading)] font-[number:var(--ptah-text-page-title-weight)]';

const TAB_CLASS = [
  'inline-flex shrink-0 items-center gap-[var(--ptah-gap-inline)] whitespace-nowrap text-start',
  'h-[var(--ptah-settings-nav-item-h)] px-[var(--ptah-control-px)] rounded-[var(--ptah-radius-control)]',
  'text-[length:var(--ptah-text-body-size)] leading-[var(--ptah-text-body-leading)] font-medium',
  'hover:bg-[var(--ptah-btn-ghost-bg-hover)]',
  'focus-visible:outline focus-visible:outline-[length:var(--ptah-focus-ring-width)] focus-visible:outline-offset-[length:var(--ptah-focus-ring-offset)] focus-visible:outline-[color:var(--ptah-focus-ring-color)]',
  'transition-colors duration-[var(--ptah-duration-fast)] ease-[var(--ptah-ease-standard)] motion-reduce:transition-none',
  '[@container(min-width:768px)]:w-full',
  'aria-selected:font-semibold aria-selected:bg-[var(--ptah-settings-nav-active-bg)]',
  'aria-selected:shadow-[inset_0_-2px_0_var(--ptah-settings-nav-active-edge)]',
  '[@container(min-width:768px)]:aria-selected:shadow-[inset_2px_0_0_var(--ptah-settings-nav-active-edge)]',
  'aria-disabled:cursor-not-allowed aria-disabled:text-base-content-muted aria-disabled:hover:bg-transparent',
].join(' ');

const NAV_CLASS = [
  'inline-flex w-full min-w-0 items-center gap-[var(--ptah-gap-inline)] text-start',
  'h-[var(--ptah-settings-nav-item-h)] px-[var(--ptah-control-px)] rounded-[var(--ptah-radius-control)]',
  'text-[length:var(--ptah-text-body-size)] leading-[var(--ptah-text-body-leading)] font-medium',
  'hover:bg-[var(--ptah-btn-ghost-bg-hover)]',
  'focus-visible:outline focus-visible:outline-[length:var(--ptah-focus-ring-width)] focus-visible:outline-offset-[length:var(--ptah-focus-ring-offset)] focus-visible:outline-[color:var(--ptah-focus-ring-color)]',
  'aria-[current=page]:font-semibold aria-[current=page]:bg-[var(--ptah-settings-nav-active-bg)]',
  'aria-[current=page]:shadow-[inset_2px_0_0_var(--ptah-settings-nav-active-edge)]',
  'aria-disabled:cursor-not-allowed aria-disabled:text-base-content-muted aria-disabled:hover:bg-transparent',
].join(' ');

/**
 * Settings layout pattern (TASK_2026_1177_9109, `pattern-spec.md` section 5).
 * The settings page frame: a side nav of tabs, a page header and one tab
 * panel with a max width. Below the `layout-split` width (768px of its own
 * container) the nav becomes a horizontal strip above the header.
 *
 * Tabs use manual activation (decision D5): arrow keys, Home and End move
 * focus, Enter, Space or a click emits `selectedChange`. The parent owns the
 * selected id.
 *
 * Slots: `[nav-header]` and `[nav-footer]` around the tabs (wide only),
 * `[actions]` in the page header, the default slot for the panel content.
 *
 * @example
 * ```html
 * <ptah-settings-layout title="Settings" [tabs]="tabs" [selected]="tab()" (selectedChange)="tab.set($event)">
 *   <button ptahButton actions>Reset</button>
 *   <ptah-form-section heading="Profile">...</ptah-form-section>
 * </ptah-settings-layout>
 * ```
 */
@Component({
  selector: 'ptah-settings-layout',
  standalone: true,
  imports: [LucideAngularModule, PtahBadgeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-ptah-pattern': 'settings-layout',
    class: 'block [container-type:inline-size]',
  },
  template: `
    <div
      class="grid grid-cols-1 gap-[var(--ptah-gap-group)] p-[var(--ptah-page-gutter)]"
      [class]="frameToggles()"
      data-testid="settings-layout"
    >
      @if (hasTabs()) {
        <nav
          class="flex min-w-0 flex-col gap-[var(--ptah-gap-label)]"
          [class]="navToggles()"
          [attr.aria-label]="navLabel()"
          [attr.data-testid]="navTestId()"
        >
          <div [class]="navSlotClass()"><ng-content select="[nav-header]" /></div>
          <div
            [attr.role]="navMode() === 'tabs' ? 'tablist' : null"
            [class]="navListClass()"
            [attr.aria-orientation]="navMode() === 'tabs' ? orientation() : null"
            data-testid="settings-layout-tablist"
          >
            @for (tab of tabs(); track tab.id; let i = $index) {
              <div [class]="navMode() === 'navigation' && tab.parent ? 'relative ml-[var(--ptah-gap-section)] before:pointer-events-none before:absolute before:left-0 before:top-0 before:h-1/2 before:w-[var(--ptah-gap-inline)] before:rounded-bl-[var(--ptah-radius-control)] before:border-b before:border-l before:border-[var(--ptah-border-color)]' : ''">
              <button
                #tabButton
                type="button"
                [attr.role]="navMode() === 'tabs' ? 'tab' : null"
                [id]="tabId(tab.id)"
                [class]="navMode() === 'tabs' ? tabClass : navClass"
                [class.tab-active]="navMode() === 'navigation' && tab.id === selected()"
                [class.text-base-content]="navMode() === 'navigation' && inSection(tab.id)"
                [class.shadow-[inset_2px_0_0_var(--ptah-border-color)]]="navMode() === 'navigation' && inSection(tab.id)"
                [attr.data-active]="navMode() === 'navigation' && tab.id === selected() ? 'true' : null"
                [attr.data-in-section]="navMode() === 'navigation' && inSection(tab.id) ? 'true' : null"
                [attr.aria-current]="navMode() === 'navigation' && tab.id === selected() ? 'page' : null"
                [attr.aria-selected]="navMode() === 'tabs' ? tab.id === selected() : null"
                [attr.aria-controls]="navMode() === 'tabs' ? panelId : null"
                [attr.aria-disabled]="tab.disabled ? 'true' : null"
                [attr.aria-describedby]="tab.disabled && tab.disabledReason ? reasonId(tab.id) : null"
                [attr.title]="tab.disabled && tab.disabledReason ? tab.disabledReason : null"
                [tabIndex]="navMode() === 'tabs' ? (i === focusIndex() ? 0 : -1) : 0"
                (click)="activate(tab)"
                (keydown)="navMode() === 'tabs' && onKeydown($event)"
                (focus)="navMode() === 'tabs' && focusIndex.set(i)"
              >
                @if (tab.icon; as icon) {
                  <lucide-angular
                    [img]="icon"
                    class="size-[var(--ptah-icon-md)] shrink-0"
                    aria-hidden="true"
                  />
                }
                <span class="min-w-0 flex-1 truncate">{{ tab.label }}</span>
                @if (hasBadge(tab.badge)) {
                  <span ptahBadge size="xs" data-testid="settings-layout-badge">{{ tab.badge }}</span>
                }
                @if (navMode() === 'navigation' && tab.stateMark; as mark) {
                  <span role="img" class="inline-flex shrink-0 items-center gap-[var(--ptah-gap-label)] text-[length:var(--ptah-text-caption-size)]" [class]="markToneClass(mark.tone)" [attr.aria-label]="mark.label" data-testid="settings-layout-state-mark">
                    <span class="size-[var(--ptah-icon-xs)] rounded-full bg-current" aria-hidden="true"></span>
                    @if (mark.count !== undefined) { <span aria-hidden="true">{{ mark.count }}</span> }
                  </span>
                }
              </button>
              </div>
            }
          </div>
          @for (tab of tabs(); track tab.id) {
            @if (tab.disabled && tab.disabledReason) {
              <span class="sr-only" [id]="reasonId(tab.id)">{{ tab.disabledReason }}</span>
            }
          }
          <div [class]="navSlotClass()"><ng-content select="[nav-footer]" /></div>
        </nav>
      }
      <div class="flex min-w-0 flex-col" data-testid="settings-layout-main">
        <header
          class="mb-[var(--ptah-gap-group)] flex flex-wrap items-start justify-between gap-[var(--ptah-gap-controls)]"
          data-testid="settings-layout-header"
        >
          <div class="flex min-w-0 flex-col gap-[var(--ptah-gap-label)]">
            @if (titleLevel() === 1) {
              <h1 [id]="titleId" [class]="titleClass">{{ title() }}</h1>
            } @else {
              <h2 [id]="titleId" [class]="titleClass">{{ title() }}</h2>
            }
            @if (description(); as descriptionText) {
              <p
                class="text-base-content-muted text-[length:var(--ptah-text-body-size)] leading-[var(--ptah-text-body-leading)]"
                data-testid="settings-layout-description"
              >
                {{ descriptionText }}
              </p>
            }
          </div>
          <div class="flex flex-wrap items-center justify-end gap-[var(--ptah-gap-controls)] empty:hidden">
            <ng-content select="[actions]" />
          </div>
        </header>
        <div class="empty:hidden" data-testid="settings-layout-header-band"><ng-content select="[header-band]" /></div>
        <div
          class="flex w-full min-w-0 max-w-[var(--ptah-settings-content-max-w)] flex-col gap-[var(--ptah-gap-section)] scroll-pb-[calc(var(--ptah-control-h-md)+2*var(--ptah-surface-pad))]"
          [id]="panelId"
          [attr.role]="hasTabs() && navMode() === 'tabs' ? 'tabpanel' : null"
          [attr.aria-labelledby]="hasTabs() && navMode() === 'tabs' ? panelLabelledBy() : null"
          [attr.tabindex]="hasTabs() && navMode() === 'tabs' ? 0 : null"
          data-testid="settings-layout-panel"
        >
          <ng-content />
        </div>
      </div>
    </div>
  `,
})
export class PtahSettingsLayoutComponent<TId extends string = string> {
  /** The tab items. With no items the nav is not rendered. */
  readonly tabs = input.required<readonly PtahSettingsTab<TId>[]>();
  /** The id of the active tab. The parent owns it. */
  readonly selected = input.required<TId>();
  /** The page title. */
  readonly title = input.required<string>();
  /** Muted text below the title. */
  readonly description = input<string | null>(null);
  /** The title tag (h1 or h2). Default 2: the app shell already has an h1. */
  readonly titleLevel = input<PtahSettingsTitleLevel>(2);
  /** Accessible name of the nav and the tab list. */
  readonly navLabel = input('Settings sections');
  /** Navigation uses native buttons and aria-current. Tabs remain the default. */
  readonly navMode = input<PtahSettingsNavMode>('tabs');
  /** Test hook for the nav; defaults to the existing layout hook. */
  readonly navTestId = input('settings-layout-nav');

  /** Emits the id of a tab the user activates. Not for a disabled tab. */
  readonly selectedChange = output<TId>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  private readonly baseId = `ptah-settings-layout-${nextSettingsLayoutId++}`;
  protected readonly titleId = `${this.baseId}-title`;
  protected readonly panelId = `${this.baseId}-panel`;
  protected readonly titleClass = TITLE_CLASS;
  protected readonly tabClass = TAB_CLASS;
  protected readonly navClass = NAV_CLASS;

  /** True below `layout-split`. Set from a ResizeObserver on the host. */
  protected readonly narrow = signal(false);
  protected readonly orientation = computed(() => (this.narrow() ? 'horizontal' : 'vertical'));
  protected readonly hasTabs = computed(() => this.tabs().length > 0);

  private readonly selectedIndex = computed(() =>
    this.tabs().findIndex((tab) => tab.id === this.selected()),
  );
  /** The roving tabindex target. It follows the selected tab. */
  protected readonly focusIndex = linkedSignal(() => Math.max(0, this.selectedIndex()));

  protected readonly frameToggles = computed(() => ({
    '[@container(min-width:768px)]:grid-cols-[var(--ptah-settings-nav-w)_minmax(0,1fr)]': this.hasTabs() && this.navMode() === 'tabs',
    '[@container(min-width:768px)]:gap-x-[var(--ptah-gap-section)]': this.hasTabs() && this.navMode() === 'tabs',
    '[@container(min-width:640px)]:grid-cols-[14.5rem_minmax(0,1fr)]': this.hasTabs() && this.navMode() === 'navigation',
    '[@container(min-width:640px)]:gap-x-[var(--ptah-gap-section)]': this.hasTabs() && this.navMode() === 'navigation',
  }));

  protected readonly navToggles = computed(() => this.navMode() === 'navigation'
    ? '[@container(min-width:640px)]:sticky [@container(min-width:640px)]:top-0 [@container(min-width:640px)]:self-start'
    : '[@container(min-width:768px)]:sticky [@container(min-width:768px)]:top-0 [@container(min-width:768px)]:self-start');
  protected readonly navSlotClass = computed(() => this.navMode() === 'navigation'
    ? 'hidden [@container(min-width:640px)]:[&:not(:empty)]:block'
    : 'hidden [@container(min-width:768px)]:[&:not(:empty)]:block');
  protected readonly navListClass = computed(() => this.navMode() === 'navigation'
    ? 'flex min-w-0 gap-[var(--ptah-gap-controls)] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [@container(min-width:640px)]:flex-col [@container(min-width:640px)]:overflow-visible'
    : 'flex min-w-0 gap-[var(--ptah-gap-controls)] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [border-bottom:var(--ptah-border-width)_solid_var(--ptah-border-color)] [@container(min-width:768px)]:flex-col [@container(min-width:768px)]:gap-[var(--ptah-gap-label)] [@container(min-width:768px)]:overflow-visible [@container(min-width:768px)]:[border-bottom:none]');

  protected inSection(id: TId): boolean {
    return this.tabs().some((tab) => tab.id === this.selected() && tab.parent === id);
  }

  protected markToneClass(tone: NonNullable<PtahSettingsTab<TId>['stateMark']>['tone']): string {
    switch (tone) {
      case 'ok': return 'text-state-done';
      case 'warn': return 'text-state-need';
      case 'error': return 'text-state-err';
      default: return 'text-state-idle';
    }
  }

  protected readonly panelLabelledBy = computed(() => {
    const index = this.selectedIndex();
    return index >= 0 ? this.tabId(this.tabs()[index].id) : this.titleId;
  });

  constructor() {
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(([entry]) => {
        if (entry) this.narrow.set(entry.contentRect.width < (this.navMode() === 'navigation' ? 640 : LAYOUT_SPLIT_PX));
      });
      observer.observe(this.host.nativeElement);
      inject(DestroyRef).onDestroy(() => observer.disconnect());
    }
    // In the narrow strip, keep the active tab in view.
    afterRenderEffect(() => {
      const index = this.selectedIndex();
      if (!this.narrow() || index < 0) return;
      this.tabButtons()[index]?.nativeElement.scrollIntoView?.({
        inline: 'nearest',
        block: 'nearest',
      });
    });
  }

  protected tabId(id: TId): string {
    return `${this.baseId}-tab-${id}`;
  }

  protected reasonId(id: TId): string {
    return `${this.baseId}-reason-${id}`;
  }

  protected hasBadge(badge: string | number | null | undefined): boolean {
    return badge !== null && badge !== undefined && String(badge).trim() !== '';
  }

  protected activate(tab: PtahSettingsTab<TId>): void {
    if (tab.disabled || tab.id === this.selected()) return;
    this.selectedChange.emit(tab.id);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const tabs = this.tabs();
    const count = tabs.length;
    if (count === 0) return;
    const current = this.focusIndex();
    const [prevKey, nextKey] = this.narrow()
      ? ['ArrowLeft', 'ArrowRight']
      : ['ArrowUp', 'ArrowDown'];
    let target: number;
    switch (event.key) {
      case prevKey:
        target = (current - 1 + count) % count;
        break;
      case nextKey:
        target = (current + 1) % count;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = count - 1;
        break;
      case 'Enter':
      case ' ':
        // Handled here, so the native click does not emit a second time.
        event.preventDefault();
        this.activate(tabs[current]);
        return;
      default:
        return;
    }
    event.preventDefault();
    this.focusIndex.set(target);
    this.tabButtons()[target]?.nativeElement.focus();
  }
}
