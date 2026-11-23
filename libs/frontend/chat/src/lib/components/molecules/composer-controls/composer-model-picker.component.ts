/**
 * ComposerModelPickerComponent - the composer's model pill and its menu.
 *
 * Presentational only: the owner passes the catalog, the selected id and the
 * loading / pending / gated state, and gets the chosen id back. It injects
 * nothing tab- or lane-bound, so main chat (`ModelSelectorComponent`) and the
 * lane composer render the same control without sharing selection state.
 *
 * Markup and classes are main chat's model selector. Pinned older versions
 * (group `other`) fold into a closed "Other versions" section behind a toggle
 * row. A gated picker (design-spec 5.1) keeps focus, shows the info glyph in
 * place of the chevron and never opens its menu.
 */

import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  Box,
  Check,
  ChevronDown,
  Info,
  LucideAngularModule,
} from 'lucide-angular';
import {
  KeyboardNavigationService,
  NativeDropdownComponent,
  NativeOptionComponent,
} from '@ptah-extension/ui';
import { ComposerGatedControlDirective } from './composer-gated-control.directive';

let nextModelPickerId = 0;

/** One catalog row. `SdkModelInfo` fits this shape. */
export interface ComposerModelOption {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** The provider's model behind a tier override, shown in accent mono. */
  readonly providerModelId?: string | null;
  /** `other` rows fold into "Other versions"; absent means `primary`. */
  readonly group?: 'primary' | 'other';
}

/** A catalog row with the picker's selection mark. */
export interface ComposerModelRow extends ComposerModelOption {
  readonly isSelected: boolean;
}

/**
 * Main chat's composer pill. Focus keeps main chat's current pill look (the
 * 1 px ring), not the outline of `COMPOSER_PILL_CLASS` (batch-4-report).
 */
const MODEL_PILL_CLASS =
  'inline-flex items-center gap-1.5 h-7 px-2 rounded-full text-xs font-normal w-full min-w-0 text-base-content-muted hover:text-base-content hover:bg-base-content/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-base-content/30 disabled:opacity-50 disabled:pointer-events-none';

@Component({
  selector: 'ptah-composer-model-picker',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    LucideAngularModule,
    NativeDropdownComponent,
    NativeOptionComponent,
    ComposerGatedControlDirective,
  ],
  providers: [KeyboardNavigationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Pill content, shared by the enabled and the gated trigger. -->
    <ng-template #pillContent>
      @if (loading()) {
        <span class="loading loading-spinner loading-xs shrink-0"></span>
      } @else {
        <!-- Accent on the icon only: a provider override is active -->
        <lucide-angular
          [img]="BoxIcon"
          class="w-3.5 h-3.5 flex-shrink-0"
          [class.text-accent]="!!providerHint()"
        />
      }
      @if (pending()) {
        <span
          class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"
          aria-hidden="true"
          data-testid="composer-model-pending-dot"
        ></span>
      }
      @if (providerHint()) {
        <!-- Provider override active: show provider model as primary -->
        <span
          class="min-w-0 truncate"
          [title]="displayName() + ' → ' + providerHint()"
          >{{ providerHint() }}</span
        >
      } @else {
        <span class="min-w-0 truncate" [title]="displayName()">{{
          displayName()
        }}</span>
      }
      @if (gated()) {
        <lucide-angular
          [img]="InfoIcon"
          class="w-3 h-3 flex-shrink-0 opacity-80"
          aria-hidden="true"
        />
      } @else {
        <lucide-angular
          [img]="ChevronDownIcon"
          class="w-3 h-3 flex-shrink-0 opacity-60"
        />
      }
    </ng-template>

    <ptah-native-dropdown
      [isOpen]="menuOpen()"
      [placement]="'bottom-end'"
      [closeOnBackdropClick]="true"
      (closed)="close()"
      (backdropClicked)="close()"
      (opened)="opened.emit()"
    >
      <!-- Composer toolbar pill (h-7). Shares its shape with the effort
           picker and the attach button. -->
      @if (gated()) {
        <!-- Gated: focusable, aria-disabled, the reason as description; a
             click only reveals the reason (ComposerGatedControlDirective). -->
        <button
          trigger
          type="button"
          class="${MODEL_PILL_CLASS}"
          [ptahComposerGated]="disabledReason()"
          (reasonRevealed)="reasonRevealed.emit($event)"
          (reasonCleared)="reasonCleared.emit()"
          aria-label="Select model"
          data-testid="composer-model-pill"
        >
          <ng-container [ngTemplateOutlet]="pillContent" />
        </button>
      } @else {
        <button
          trigger
          type="button"
          class="${MODEL_PILL_CLASS}"
          [class.bg-base-300]="isOpen()"
          [class.text-base-content]="isOpen()"
          (click)="toggle()"
          [disabled]="loading()"
          aria-label="Select model"
          aria-haspopup="listbox"
          [attr.aria-expanded]="isOpen()"
          data-testid="composer-model-pill"
        >
          <ng-container [ngTemplateOutlet]="pillContent" />
        </button>
      }

      <div content class="w-72 max-h-80 flex flex-col">
        <!-- Header -->
        <div class="px-2 py-1.5 border-b border-base-300">
          <span
            class="text-[11px] font-semibold text-base-content-muted uppercase tracking-wide"
          >
            Select Model
          </span>
        </div>

        <!-- Model List -->
        <div
          class="flex flex-col overflow-y-auto overflow-x-hidden max-h-64 p-1"
        >
          @if (loading() && rows().length === 0) {
            <div
              class="flex items-center gap-2 px-4 py-3 text-xs text-base-content-muted"
            >
              <span class="loading loading-spinner loading-xs"></span>
              Loading models...
            </div>
          } @else if (loaded() && rows().length === 0) {
            <div class="px-4 py-3 text-xs text-base-content-muted">
              No models available. Check your provider connection.
            </div>
          }
          <!-- One row markup shared by the primary and "Other versions" rows. -->
          <ng-template #modelRow let-model let-rowIndex="rowIndex">
            <ptah-native-option
              [optionId]="'model-' + instanceId + '-' + rowIndex"
              [value]="model"
              [isActive]="rowIndex === activeIndex()"
              (selected)="choose($event.id)"
              (hovered)="onHover(rowIndex)"
            >
              <div class="flex items-start gap-3 py-0.5">
                <!-- Checkmark for selected -->
                <div class="w-4 h-4 mt-0.5 flex-shrink-0">
                  @if (model.isSelected) {
                    <lucide-angular [img]="CheckIcon" class="w-4 h-4" />
                  }
                </div>

                <!-- Model Info -->
                <div class="flex flex-col items-start flex-1 min-w-0">
                  <span class="font-medium text-xs">{{ model.name }}</span>
                  @if (model.providerModelId) {
                    <span
                      class="text-[11px] mt-0.5 font-mono text-accent truncate max-w-full"
                    >
                      {{ model.providerModelId }}
                    </span>
                  }
                  <span class="text-[11px] mt-0.5 text-base-content-muted">
                    {{ model.description }}
                  </span>
                </div>
              </div>
            </ptah-native-option>
          </ng-template>

          @for (model of primaryModels(); track model.id; let i = $index) {
            <ng-container
              [ngTemplateOutlet]="modelRow"
              [ngTemplateOutletContext]="{ $implicit: model, rowIndex: i }"
            />
          }

          @if (otherModels().length > 0) {
            <!-- Toggle row for the pinned older versions. Opens the section
                 without selecting a model or closing the dropdown. -->
            <button
              [attr.id]="otherVersionsToggleId"
              type="button"
              class="block w-full text-left rounded-md px-3 py-2 transition-colors cursor-pointer hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))]"
              [attr.aria-expanded]="isOtherSectionOpen()"
              [attr.aria-controls]="otherVersionsSectionId"
              (click)="toggleOtherVersions()"
            >
              <div class="flex items-center gap-3 py-0.5">
                <div
                  class="w-4 h-4 flex-shrink-0 flex items-center justify-center"
                >
                  <lucide-angular
                    [img]="ChevronDownIcon"
                    class="w-3 h-3 transition-transform duration-200"
                    [class.rotate-180]="isOtherSectionOpen()"
                    aria-hidden="true"
                  />
                </div>
                <span class="font-medium text-xs">Other versions</span>
                <span class="text-[11px] text-base-content-muted">
                  ({{ otherModels().length }})
                </span>
              </div>
            </button>
            <!-- The container stays mounted so aria-controls always resolves;
                 the rows render only while the section is open. -->
            <div [attr.id]="otherVersionsSectionId">
              @if (isOtherSectionOpen()) {
                @for (model of otherModels(); track model.id; let i = $index) {
                  <ng-container
                    [ngTemplateOutlet]="modelRow"
                    [ngTemplateOutletContext]="{
                      $implicit: model,
                      rowIndex: primaryModels().length + i,
                    }"
                  />
                }
              }
            </div>
          }
        </div>

        @if (footer()) {
          <!-- When the choice applies (design-spec 5.4). -->
          <div
            class="border-t border-surface-border px-2 py-1.5 text-[11px] text-base-content-muted"
            data-testid="composer-model-footer"
          >
            {{ footer() }}
          </div>
        }
      </div>
    </ptah-native-dropdown>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    /* Carry the available flex width through both dropdown wrappers so the
       label truncates instead of painting over adjacent composer controls. */
    ptah-native-dropdown,
    :host ::ng-deep .dropdown-trigger {
      width: 100%;
      min-width: 0;
    }
  `,
})
export class ComposerModelPickerComponent {
  /** The catalog, in display order. */
  readonly options = input<readonly ComposerModelOption[]>([]);
  /**
   * The model the next turn uses. A listed id marks its row and names the
   * pill; an unlisted id is shown as it is.
   */
  readonly selectedId = input<string | null | undefined>(null);
  /** The catalog is being read: spinner in the pill, pill disabled. */
  readonly loading = input<boolean>(false);
  /** A read finished; an empty catalog then says so. */
  readonly loaded = input<boolean>(true);
  /** A change waits for the provider's confirmation: 6 px primary dot. */
  readonly pending = input<boolean>(false);
  /** One line at the foot of the menu that says when the choice applies. */
  readonly footer = input<string | null | undefined>(null);
  /** Why the owner cannot honour a change; set = gated (design-spec 5.1). */
  readonly disabledReason = input<string | null | undefined>(null);

  /** The chosen model id. */
  readonly selected = output<string>();
  /** The menu opened (main chat refreshes the catalog here). */
  readonly opened = output<void>();
  /** For the status line: the gated pill was clicked, focused or hovered. */
  readonly reasonRevealed = output<string>();
  /** Focus or the pointer left the gated pill. */
  readonly reasonCleared = output<void>();

  readonly instanceId = nextModelPickerId++;
  readonly otherVersionsToggleId = `model-other-versions-toggle-${this.instanceId}`;
  readonly otherVersionsSectionId = `model-other-versions-${this.instanceId}`;

  private readonly keyboardNav = inject(KeyboardNavigationService);
  readonly activeIndex = this.keyboardNav.activeIndex;

  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly CheckIcon = Check;
  protected readonly BoxIcon = Box;
  protected readonly InfoIcon = Info;

  private readonly _isOpen = signal(false);
  readonly isOpen = this._isOpen.asReadonly();

  readonly gated = computed(
    () => (this.disabledReason() ?? '').trim().length > 0,
  );

  /** A gated picker never shows its menu, even if it was open when gated. */
  protected readonly menuOpen = computed(() => this._isOpen() && !this.gated());

  /** The listed row of the selected id, if any. */
  private readonly selectedOption = computed(() => {
    const id = this.selectedId();
    return id ? this.options().find((option) => option.id === id) : undefined;
  });

  /** Pill label: the listed name, else the id as it is. */
  readonly displayName = computed(
    () => this.selectedOption()?.name ?? this.selectedId() ?? '',
  );

  /** The provider model behind a tier override, or `null`. */
  readonly providerHint = computed(
    () => this.selectedOption()?.providerModelId ?? null,
  );

  readonly rows = computed((): ComposerModelRow[] => {
    const id = this.selectedId();
    return this.options().map((option) => ({
      ...option,
      isSelected: option.id === id,
    }));
  });

  /** Rows shown directly: `group` absent or `'primary'`, in list order. */
  readonly primaryModels = computed(() =>
    this.rows().filter((row) => row.group !== 'other'),
  );

  /** Pinned older versions (`group === 'other'`), in list order. */
  readonly otherModels = computed(() =>
    this.rows().filter((row) => row.group === 'other'),
  );

  /**
   * Explicit user choice for the "Other versions" section. `null` follows
   * the default, so a reopened menu starts from it again.
   */
  private readonly _otherSectionOpen = signal<boolean | null>(null);

  /**
   * Whether the "Other versions" rows render. Default: open only when the
   * selected model sits in that group, so the selected row is visible
   * without a toggle click.
   */
  readonly isOtherSectionOpen = computed(() => {
    const explicit = this._otherSectionOpen();
    if (explicit !== null) {
      return explicit;
    }
    return this.otherModels().some((row) => row.isSelected);
  });

  toggle(): void {
    const opening = !this._isOpen();
    this._isOpen.set(opening);
    if (opening) {
      // Every open starts from the default section state.
      this._otherSectionOpen.set(null);
    }
  }

  close(): void {
    this._isOpen.set(false);
  }

  choose(modelId: string): void {
    this.close();
    this.selected.emit(modelId);
  }

  /**
   * Toggle the "Other versions" section. Never selects a model and never
   * closes the menu.
   */
  toggleOtherVersions(): void {
    this._otherSectionOpen.set(!this.isOtherSectionOpen());
  }

  onHover(index: number): void {
    this.keyboardNav.setActiveIndex(index);
  }
}
