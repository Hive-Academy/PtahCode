/**
 * ModelSelectorComponent - Elegant AI Model Selection Dropdown
 *
 * A standalone dropdown component for selecting Claude AI models.
 * Features rich model metadata display with title and description. Pinned
 * older versions (group `other`) fold into a closed "Other versions" section
 * behind a toggle row.
 *
 * Pattern: Signal-based state from ModelStateService
 * UI: NativeDropdownComponent from @ptah-extension/ui with Floating UI positioning
 * Keyboard Navigation: Parent manages activeIndex signal for NativeOptionComponent
 * Refresh: The dropdown's `opened` event triggers a fire-and-forget refreshModels()
 */

import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { LucideAngularModule, ChevronDown, Check, Box } from 'lucide-angular';
import { ModelStateService } from '@ptah-extension/core';
import {
  NativeDropdownComponent,
  NativeOptionComponent,
  KeyboardNavigationService,
} from '@ptah-extension/ui';
import { ChatStore } from '../../../services/chat.store';
import { TabManagerService } from '@ptah-extension/chat-state';
import { SESSION_CONTEXT } from '../../../tokens/session-context.token';
import { SessionId } from '@ptah-extension/shared';

let nextModelSelectorId = 0;

@Component({
  selector: 'ptah-model-selector',
  imports: [
    NgTemplateOutlet,
    LucideAngularModule,
    NativeDropdownComponent,
    NativeOptionComponent,
  ],
  providers: [KeyboardNavigationService],
  template: `
    <ptah-native-dropdown
      [isOpen]="isOpen()"
      [placement]="'bottom-end'"
      [closeOnBackdropClick]="true"
      (closed)="closeDropdown()"
      (backdropClicked)="closeDropdown()"
      (opened)="onDropdownOpened()"
    >
      <!-- Composer toolbar pill (h-7). Shares its shape with the effort
           selector and the attach button in chat-input. -->
      <button
        trigger
        class="inline-flex items-center gap-1.5 h-7 px-2 rounded-full text-xs font-normal w-full min-w-0 text-base-content-muted hover:text-base-content hover:bg-base-content/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-base-content/30 disabled:opacity-50 disabled:pointer-events-none"
        [class.bg-base-300]="isOpen()"
        [class.text-base-content]="isOpen()"
        type="button"
        (click)="toggleDropdown()"
        [disabled]="modelState.isPending()"
        aria-label="Select model"
        [attr.aria-expanded]="isOpen()"
      >
        @if (modelState.isPending()) {
          <span class="loading loading-spinner loading-xs shrink-0"></span>
        } @else {
          <!-- Accent on the icon only: a provider override is active -->
          <lucide-angular
            [img]="BoxIcon"
            class="w-3.5 h-3.5 flex-shrink-0"
            [class.text-accent]="!!effectiveModelProviderHint()"
          />
        }
        @if (effectiveModelProviderHint()) {
          <!-- Provider override active: show provider model as primary -->
          <span
            class="min-w-0 truncate"
            [title]="
              effectiveModelDisplay() + ' → ' + effectiveModelProviderHint()
            "
            >{{ effectiveModelProviderHint() }}</span
          >
        } @else {
          <!-- No provider override: show standard display name -->
          <span class="min-w-0 truncate" [title]="effectiveModelDisplay()">{{
            effectiveModelDisplay()
          }}</span>
        }
        <lucide-angular
          [img]="ChevronDownIcon"
          class="w-3 h-3 flex-shrink-0 opacity-60"
        />
      </button>

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
          @if (
            modelState.isPending() && effectiveAvailableModels().length === 0
          ) {
            <div
              class="flex items-center gap-2 px-4 py-3 text-xs text-base-content-muted"
            >
              <span class="loading loading-spinner loading-xs"></span>
              Loading models...
            </div>
          } @else if (
            modelState.isLoaded() && effectiveAvailableModels().length === 0
          ) {
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
              (selected)="selectModel($event.id)"
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
      </div>
    </ptah-native-dropdown>
  `,
  styles: `
    :host {
      display: block;
      min-width: 3.5rem;
      max-width: 12rem;
    }

    /* Carry the available flex width through both dropdown wrappers so the
       label truncates instead of painting over adjacent composer controls. */
    ptah-native-dropdown,
    :host ::ng-deep .dropdown-trigger {
      width: 100%;
      min-width: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelSelectorComponent {
  readonly instanceId = nextModelSelectorId++;
  readonly otherVersionsToggleId = `model-other-versions-toggle-${this.instanceId}`;
  readonly otherVersionsSectionId = `model-other-versions-${this.instanceId}`;
  readonly modelState = inject(ModelStateService);
  private readonly chatStore = inject(ChatStore);
  private readonly keyboardNav = inject(KeyboardNavigationService);
  private readonly tabManager = inject(TabManagerService);
  private readonly _sessionContext = inject(SESSION_CONTEXT, {
    optional: true,
  });
  readonly ChevronDownIcon = ChevronDown;
  readonly CheckIcon = Check;
  readonly BoxIcon = Box;
  private readonly _isOpen = signal(false);
  readonly isOpen = this._isOpen.asReadonly();
  readonly activeIndex = this.keyboardNav.activeIndex;

  /**
   * Effective model for this context: the canvas tile's tab when present,
   * otherwise the active main-panel tab. Intentional overrides take priority
   * over the model restored with session history, then global state is the
   * fallback for fresh tabs.
   */
  readonly effectiveModel = computed(() => {
    const contextTabId = this._sessionContext?.();
    const tab = contextTabId
      ? this.tabManager
          .tabs()
          .find((candidate) => candidate.id === contextTabId)
      : this.tabManager.activeTab();

    // An override the loaded list does not offer was picked under a provider
    // the user switched away from. The send path drops it the same way
    // (`MessageSenderService.resolveValidModel`), so showing it would name a
    // model the next turn will not use.
    const override = tab?.overrideModel;
    const models = this.modelState.availableModels();
    if (
      override &&
      models.length > 0 &&
      !models.some((m) => m.id === override)
    ) {
      // Same fallback order as `resolveValidModel`.
      const fallback =
        models.find((m) => m.isSelected) ??
        models.find((m) => m.id === 'default') ??
        models[0];
      return fallback.id;
    }
    return override ?? tab?.sessionModel ?? this.modelState.currentModel();
  });

  /**
   * Display name for the effective model (resolves API name to human-readable).
   */
  readonly effectiveModelDisplay = computed(() => {
    const modelId = this.effectiveModel();
    const models = this.modelState.availableModels();
    const model = models.find((m) => m.id === modelId);
    return model?.name ?? modelId;
  });

  /**
   * Provider hint for the effective model.
   */
  readonly effectiveModelProviderHint = computed(() => {
    const modelId = this.effectiveModel();
    const models = this.modelState.availableModels();
    const model = models.find((m) => m.id === modelId);
    return model?.providerModelId ?? null;
  });

  /**
   * Available models with selection state reflecting the effective model.
   */
  readonly effectiveAvailableModels = computed(() => {
    const effective = this.effectiveModel();
    return this.modelState.availableModels().map((m) => ({
      ...m,
      isSelected: m.id === effective,
    }));
  });

  /**
   * Rows shown directly: `group` absent or `'primary'`, in list order.
   */
  readonly primaryModels = computed(() =>
    this.effectiveAvailableModels().filter((model) => model.group !== 'other'),
  );

  /**
   * Pinned older versions (`group === 'other'`), in list order. Rendered
   * behind the "Other versions" toggle.
   */
  readonly otherModels = computed(() =>
    this.effectiveAvailableModels().filter((model) => model.group === 'other'),
  );

  /**
   * Explicit user choice for the "Other versions" section. `null` follows
   * the default, so a reopened dropdown starts from it again.
   */
  private readonly _otherSectionOpen = signal<boolean | null>(null);

  /**
   * Whether the "Other versions" rows render. Default: open only when the
   * effective selected model sits in that group, so the selected row is
   * visible without a toggle click.
   */
  readonly isOtherSectionOpen = computed(() => {
    const explicit = this._otherSectionOpen();
    if (explicit !== null) {
      return explicit;
    }
    return this.otherModels().some((model) => model.isSelected);
  });

  toggleDropdown(): void {
    const opening = !this._isOpen();
    this._isOpen.set(opening);
    if (opening) {
      // Every open starts from the default section state.
      this._otherSectionOpen.set(null);
    }
  }

  closeDropdown(): void {
    this._isOpen.set(false);
  }

  /**
   * Select AI model. When in canvas tile context, stores override per-tab.
   * Otherwise updates the global ModelStateService.
   */
  selectModel(model: string): void {
    this.closeDropdown();

    const ctx = this._sessionContext;
    if (ctx) {
      const tabId = ctx();
      if (tabId) {
        this.tabManager.setOverrideModel(tabId, model);
        return;
      }
    }

    const sessionId = this.chatStore.currentSessionId() as SessionId | null;
    this.modelState.switchModel(model, sessionId).catch((error) => {
      console.error('[ModelSelectorComponent] Failed to switch model:', error);
    });
  }

  /**
   * Toggle the "Other versions" section. Never selects a model and never
   * closes the dropdown.
   */
  toggleOtherVersions(): void {
    this._otherSectionOpen.set(!this.isOtherSectionOpen());
  }

  /**
   * Fire-and-forget catalog refresh each time the dropdown opens. The service
   * merges concurrent calls and keeps the current list while the read runs;
   * failures only log, like `switchModel` above.
   */
  onDropdownOpened(): void {
    this.modelState.refreshModels().catch((error) => {
      console.error(
        '[ModelSelectorComponent] Failed to refresh models:',
        error,
      );
    });
  }

  onHover(index: number): void {
    this.keyboardNav.setActiveIndex(index);
  }
}
