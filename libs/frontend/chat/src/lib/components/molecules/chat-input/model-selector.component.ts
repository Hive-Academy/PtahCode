/**
 * ModelSelectorComponent - main chat's model pill.
 *
 * The tab container for `ComposerModelPickerComponent`: it resolves the
 * effective model of the tab (canvas tile or active main-panel tab) from
 * `ModelStateService` and `TabManagerService`, renders the shared picker and
 * stores a pick as the tab's override. Pinned older versions fold into the
 * picker's "Other versions" section.
 *
 * Refresh: the picker's `opened` event triggers a fire-and-forget
 * refreshModels().
 */

import {
  Component,
  inject,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ModelStateService } from '@ptah-extension/core';
import { TabManagerService, resolveTabModel } from '@ptah-extension/chat-state';
import { SESSION_CONTEXT } from '../../../tokens/session-context.token';
import { ComposerModelPickerComponent } from '../composer-controls/composer-model-picker.component';

/** Tier names a parent session can send instead of a model id. */
const SESSION_MODEL_TIERS: readonly string[] = ['haiku', 'sonnet', 'opus'];

@Component({
  selector: 'ptah-model-selector',
  imports: [ComposerModelPickerComponent],
  template: `
    <ptah-composer-model-picker
      [options]="modelState.availableModels()"
      [selectedId]="selectedModelId()"
      [loading]="modelState.isPending()"
      [loaded]="modelState.isLoaded()"
      (selected)="selectModel($event)"
      (opened)="onDropdownOpened()"
    />
  `,
  styles: `
    :host {
      display: block;
      min-width: 3.5rem;
      max-width: 12rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelSelectorComponent {
  readonly modelState = inject(ModelStateService);
  private readonly tabManager = inject(TabManagerService);
  private readonly _sessionContext = inject(SESSION_CONTEXT, {
    optional: true,
  });

  /**
   * The tab this selector controls: the canvas tile's tab when present,
   * otherwise the active main-panel tab.
   */
  private readonly contextTab = computed(() => {
    const contextTabId = this._sessionContext?.();
    return contextTabId
      ? this.tabManager
          .tabs()
          .find((candidate) => candidate.id === contextTabId)
      : this.tabManager.activeTab();
  });

  /**
   * Effective model for this context. It follows the same rule as the send
   * path (`resolveTabModel`): tab override, then the model of the session,
   * then the global selection.
   */
  readonly effectiveModel = computed(() => {
    const { model, origin } = resolveTabModel(
      this.contextTab(),
      this.modelState.currentModel(),
    );
    // An override the loaded list does not offer was picked under a provider
    // the user switched away from. The send path drops it the same way
    // (`MessageSenderService.resolveValidModel`), so showing it would name
    // a model the next turn will not use. A model that belongs to the session
    // is sent as it is, so it is shown as it is.
    const models = this.modelState.availableModels();
    if (
      origin !== 'session' &&
      model &&
      models.length > 0 &&
      !models.some((m) => m.id === model)
    ) {
      // Same fallback order as `resolveValidModel`.
      const fallback =
        models.find((m) => m.isSelected) ??
        models.find((m) => m.id === 'default') ??
        models[0];
      return fallback.id;
    }
    return model;
  });

  /**
   * The listed model that matches the effective model. A tier name such as
   * `haiku` (sent by a parent session) matches the listed model of that tier.
   */
  private readonly effectiveListedModel = computed(() => {
    const modelId = this.effectiveModel();
    const models = this.modelState.availableModels();
    const exact = models.find((m) => m.id === modelId);
    if (exact || !modelId) {
      return exact;
    }
    const tier = modelId.toLowerCase();
    if (!SESSION_MODEL_TIERS.includes(tier)) {
      return undefined;
    }
    return models.find(
      (m) =>
        m.id.toLowerCase().includes(tier) ||
        m.name.toLowerCase().includes(tier),
    );
  });

  /**
   * Display name for the effective model (resolves API name to human-readable).
   */
  readonly effectiveModelDisplay = computed(
    () => this.effectiveListedModel()?.name ?? this.effectiveModel(),
  );

  /**
   * The id the picker marks as selected: the listed model that matches the
   * effective model, else the effective model as it is.
   */
  readonly selectedModelId = computed(
    () => this.effectiveListedModel()?.id ?? this.effectiveModel(),
  );

  /**
   * Select AI model for the session of this tab only. The choice is stored on
   * the tab. The send path applies it to the next turn of that session, so
   * other tabs and the global selection stay as they are.
   */
  selectModel(model: string): void {
    const tabId = this.contextTab()?.id;
    if (tabId) {
      this.tabManager.setOverrideModel(tabId, model);
    }
  }

  /**
   * Fire-and-forget catalog refresh each time the picker's menu opens. The service
   * merges concurrent calls and keeps the current list while the read runs;
   * failures only log.
   */
  onDropdownOpened(): void {
    this.modelState.refreshModels().catch((error) => {
      console.error(
        '[ModelSelectorComponent] Failed to refresh models:',
        error,
      );
    });
  }
}
