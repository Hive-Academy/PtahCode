import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  viewChild,
  viewChildren,
} from '@angular/core';
import { Info, LucideAngularModule } from 'lucide-angular';
import {
  FloatingUIService,
  KeyboardNavigationService,
} from '@ptah-extension/ui';
import {
  SuggestionOptionComponent,
  type SuggestionItem,
} from './suggestion-option.component';
export type { SuggestionItem } from './suggestion-option.component';

/**
 * A titled group of suggestions (lane `/`: Commands, Skills). A group with
 * no items and a `notice` renders one non-selectable row with that reason;
 * a group with neither is left out.
 */
export interface SuggestionGroup {
  readonly label: string;
  readonly items: readonly SuggestionItem[];
  readonly notice?: string;
}

/** One rendered row: a group header, a notice, or a selectable option. */
type SuggestionRow =
  | { readonly kind: 'header'; readonly key: string; readonly label: string }
  | { readonly kind: 'notice'; readonly key: string; readonly text: string }
  | {
      readonly kind: 'option';
      readonly key: string;
      readonly item: SuggestionItem;
      /** Position among the selectable rows (keyboard index, option id). */
      readonly index: number;
    };

function optionKey(item: SuggestionItem): string {
  if (item.type === 'file') return `file-${item.path}`;
  if (item.type === 'prompt') return `prompt-${item.text}`;
  return `${item.type}-${item.name}`;
}

/**
 * UnifiedSuggestionsDropdownComponent - Autocomplete UI with Native Floating UI
 *
 * ARCHITECTURE:
 * - Uses Floating UI for positioning (replaces CDK Overlay)
 * - Uses KeyboardNavigationService for signal-based navigation (replaces ActiveDescendantKeyManager)
 * - Options receive isActive as INPUT (not via Highlightable interface)
 * - Filter input INSIDE dropdown - focus stays on filter input
 * - Supports file and command types via discriminated union
 * - Optional titled groups and a non-selectable notice row
 *   (`role=option aria-disabled`); the main chat composer passes neither
 * - Agents are not offered here: the model picks its own sub-agents
 *
 * KEYBOARD NAVIGATION:
 * - KeyboardNavigationService manages activeIndex signal
 * - Active state passed to options via [isActive]="i === activeIndex()"
 * - ArrowUp/ArrowDown/Home/End navigates the list
 * - Enter selects focused suggestion, Escape closes dropdown
 *
 * ACCESSIBILITY:
 * - role="listbox" on container
 * - role="option" on each item (via SuggestionOptionComponent)
 * - aria-activedescendant points to currently focused option
 *
 * MIGRATION NOTE:
 * - Replaced CDK Overlay with Floating UI
 * - Replaced ActiveDescendantKeyManager with KeyboardNavigationService
 * - Options now receive isActive as input signal, not via setActiveStyles()
 * - This fixes the signal dependency loop causing VS Code webview hang
 */
@Component({
  selector: 'ptah-unified-suggestions-dropdown',
  standalone: true,
  imports: [SuggestionOptionComponent, LucideAngularModule],
  providers: [FloatingUIService, KeyboardNavigationService],
  template: `
    <!-- Panel positioned by Floating UI relative to overlayOrigin -->
    <div
      #floatingPanel
      data-glass-surface="overlay"
      data-composer-overlay
      [id]="listboxId"
      class="suggestions-panel flex flex-col max-h-96 shadow-lg bg-base-200 rounded-lg border border-base-300 z-50 overflow-hidden"
      style="visibility: hidden; position: absolute;"
      role="listbox"
      [attr.aria-label]="getHeaderTitle()"
    >
      <!-- Header -->
      <div class="px-2 py-1.5 border-b border-base-300">
        <span
          class="text-[11px] font-semibold text-base-content-muted uppercase tracking-wide"
        >
          {{ getHeaderTitle() }}
        </span>
      </div>

      <!-- Loading State -->
      @if (isLoading()) {
        <div class="flex items-center justify-center gap-2 p-3">
          <span class="loading loading-spinner loading-xs"></span>
          <span class="text-xs text-base-content-muted">Loading...</span>
        </div>
      }

      <!-- Error State -->
      @else if (errorMessage()) {
        <div class="flex items-center justify-center p-3">
          <span class="text-xs text-error">{{ errorMessage() }}</span>
        </div>
      }

      <!-- Empty State -->
      @else if (rows().length === 0) {
        <div class="flex items-center justify-center p-3">
          <span class="text-xs text-base-content-muted">No matches found</span>
        </div>
      }

      <!-- Suggestions List -->
      @else {
        <div
          class="flex flex-col overflow-y-auto overflow-x-hidden max-h-64 p-1"
        >
          @for (row of rows(); track row.key) {
            @if (row.kind === 'header') {
              <!-- Group header. Decorative: each option carries its own name
                   or badge, so screen readers get the grouping from the
                   options. -->
              <div
                class="px-2 pt-1.5 pb-0.5 text-[11px] font-semibold text-base-content-muted uppercase tracking-wide"
                role="presentation"
              >
                {{ row.label }}
              </div>
            } @else if (row.kind === 'notice') {
              <!-- Why nothing can be chosen here; never selectable. -->
              <div
                class="flex items-start gap-2 px-2 py-1.5 rounded-md text-xs text-base-content-muted cursor-default"
                role="option"
                aria-disabled="true"
                aria-selected="false"
                data-testid="suggestion-notice"
              >
                <lucide-angular
                  [img]="InfoIcon"
                  class="w-4 h-4 shrink-0 opacity-80"
                  aria-hidden="true"
                />
                <span class="min-w-0">{{ row.text }}</span>
              </div>
            } @else {
              <ptah-suggestion-option
                [suggestion]="row.item"
                [optionId]="'suggestion-' + row.index"
                [isActive]="row.index === activeIndex()"
                (selected)="handleSelection($event)"
                (hovered)="handleHover(row.index)"
              />
            }
          }
        </div>
      }

      <!-- How a chosen entry is sent (a lane composer's @ list). -->
      @if (footer(); as text) {
        <div
          class="px-2 py-1.5 border-t border-base-300 text-[11px] text-base-content-muted"
          data-testid="suggestions-footer"
        >
          {{ text }}
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnifiedSuggestionsDropdownComponent implements OnDestroy {
  private readonly floatingUI = inject(FloatingUIService);
  private readonly keyboardNav = inject(KeyboardNavigationService);
  readonly overlayOrigin = input.required<{ elementRef: ElementRef }>(); // Origin element (textarea) from parent
  readonly suggestions = input.required<SuggestionItem[]>();
  readonly isLoading = input(false);
  readonly errorMessage = input<string | null>(null);
  /** Titled groups; when set they replace `suggestions` for rendering. */
  readonly groups = input<readonly SuggestionGroup[] | null>(null);
  /** One non-selectable row instead of any suggestion (e.g. unsupported). */
  readonly notice = input<string | null>(null);
  /** One line at the foot of the panel, e.g. how chosen files are sent. */
  readonly footer = input<string | null>(null);
  readonly suggestionSelected = output<SuggestionItem>();
  readonly closed = output<void>();
  private readonly floatingPanel =
    viewChild<ElementRef<HTMLElement>>('floatingPanel');
  private readonly optionComponents = viewChildren(SuggestionOptionComponent);
  readonly activeIndex = this.keyboardNav.activeIndex;
  protected readonly InfoIcon = Info;

  /** Rendered rows: a notice, titled groups, or the flat list with dividers. */
  readonly rows = computed<readonly SuggestionRow[]>(() => {
    const notice = this.notice();
    if (notice) return [{ kind: 'notice', key: 'notice', text: notice }];
    const rows: SuggestionRow[] = [];
    let index = 0;
    const groups = this.groups();
    if (groups) {
      groups.forEach((group, g) => {
        if (group.items.length === 0) {
          if (!group.notice) return;
          rows.push({ kind: 'header', key: `header-${g}`, label: group.label });
          rows.push({ kind: 'notice', key: `notice-${g}`, text: group.notice });
          return;
        }
        rows.push({ kind: 'header', key: `header-${g}`, label: group.label });
        for (const item of group.items) {
          rows.push({
            kind: 'option',
            // The same command can sit in two groups (Commands and Skills).
            key: `${g}-${optionKey(item)}`,
            item,
            index: index++,
          });
        }
      });
      return rows;
    }
    this.suggestions().forEach((item, i) => {
      if (this.isGroupStart(i)) {
        rows.push({
          kind: 'header',
          key: `header-${i}`,
          label: this.groupHeaderTitle(item),
        });
      }
      rows.push({ kind: 'option', key: optionKey(item), item, index: index++ });
    });
    return rows;
  });

  /** The rows that can be chosen, in keyboard order. */
  private readonly selectable = computed(() =>
    this.rows().flatMap((row) => (row.kind === 'option' ? [row.item] : [])),
  );
  readonly listboxId = `suggestions-listbox-${Math.random()
    .toString(36)
    .substring(2, 9)}`;

  constructor() {
    effect(() => {
      const count = this.selectable().length;
      this.keyboardNav.configure({ itemCount: count, wrap: true });
    });
    effect(() => {
      const panel = this.floatingPanel()?.nativeElement;
      const origin = this.overlayOrigin()?.elementRef?.nativeElement;

      if (panel && origin) {
        queueMicrotask(() => this.positionPanel());
      }
    });
    effect(() => {
      const index = this.activeIndex();
      const options = this.optionComponents();
      if (index >= 0 && index < options.length) {
        options[index].scrollIntoView();
      }
    });
  }

  ngOnDestroy(): void {
    this.floatingUI.cleanup();
  }

  /**
   * Position the floating panel relative to the origin element
   */
  private async positionPanel(): Promise<void> {
    const panel = this.floatingPanel()?.nativeElement;
    const origin = this.overlayOrigin()?.elementRef?.nativeElement;

    if (panel && origin) {
      panel.style.width = `${origin.offsetWidth}px`;

      await this.floatingUI.position(origin, panel, {
        placement: 'top-start', // Above textarea (chat input at bottom of sidebar)
        offset: 4,
        flip: true,
        shift: true,
      });
    }
  }

  /**
   * Get the currently active option's ID for aria-activedescendant
   * Parent component should bind this to the input's aria-activedescendant
   */
  getActiveDescendantId(): string | null {
    const index = this.activeIndex();
    return index >= 0 ? `suggestion-${index}` : null;
  }

  /**
   * Get header title based on suggestion types
   */
  getHeaderTitle(): string {
    if (this.notice()) return 'Slash Commands';
    const groups = this.groups();
    if (groups) {
      return groups.map((group) => group.label).join(' & ') || 'Suggestions';
    }
    const suggestions = this.suggestions();
    if (suggestions.length === 0) return 'Suggestions';

    const firstType = suggestions[0]?.type;
    if (firstType === 'file') return 'Files & Folders';
    const hasCommands = suggestions.some(
      (suggestion) => suggestion.type === 'command',
    );
    const hasPrompts = suggestions.some(
      (suggestion) => suggestion.type === 'prompt',
    );
    if (hasCommands && hasPrompts) return 'Commands & Prompts';
    if (hasPrompts) return 'Prompts';
    return 'Slash Commands';
  }

  /**
   * Whether a visual group divider should precede the row at `index`.
   * The composer appends prompt suggestions after the command suggestions,
   * so the row where the type changes starts the "Prompts" group. File-only
   * lists never change type, so they render without dividers.
   */
  isGroupStart(index: number): boolean {
    if (index <= 0) return false;
    const suggestions = this.suggestions();
    return suggestions[index]?.type !== suggestions[index - 1]?.type;
  }

  /**
   * Header label for the group the row at `index` starts.
   */
  groupHeaderTitle(suggestion: SuggestionItem): string {
    return suggestion.type === 'prompt' ? 'Prompts' : 'Commands';
  }

  /**
   * Handle keyboard events from parent component
   *
   * CRITICAL: Must return FALSE when not ready to handle events.
   * This signals to the parent that the event was NOT handled, allowing
   * fallback behavior (e.g., normal textarea cursor movement).
   *
   * @param event KeyboardEvent from parent
   * @returns true if event was handled, false if not ready to handle
   */
  onKeyDown(event: KeyboardEvent): boolean {
    if (this.isLoading()) {
      return false;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
        return this.keyboardNav.handleKeyDown(event);

      case 'Enter':
        this.selectFocused();
        return true;

      case 'Escape':
        this.closed.emit();
        return true;

      default:
        return false;
    }
  }

  /**
   * Navigate to next item (ArrowDown)
   */
  navigateDown(): void {
    this.keyboardNav.setNext();
  }

  /**
   * Navigate to previous item (ArrowUp)
   */
  navigateUp(): void {
    this.keyboardNav.setPrevious();
  }

  /**
   * Select currently focused item (Enter)
   */
  selectFocused(): void {
    const index = this.activeIndex();
    const suggestions = this.selectable();
    if (index >= 0 && index < suggestions.length) {
      this.suggestionSelected.emit(suggestions[index]);
    }
  }

  /**
   * Reset to first item
   */
  resetFocus(): void {
    this.keyboardNav.setFirstItemActive();
  }

  /**
   * Handle mouse hover on option
   */
  handleHover(index: number): void {
    this.keyboardNav.setActiveIndex(index);
  }

  /**
   * Handle selection via click
   */
  handleSelection(suggestion: SuggestionItem): void {
    this.suggestionSelected.emit(suggestion);
  }
}
