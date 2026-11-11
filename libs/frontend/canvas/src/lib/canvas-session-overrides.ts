import { effect, inject, type Signal, untracked } from '@angular/core';
import {
  TabManagerService,
  resolveTabEffort,
  resolveTabModel,
} from '@ptah-extension/chat-state';
import { EffortStateService, ModelStateService } from '@ptah-extension/core';

/**
 * Freeze defaults on first load for the session hosted by a canvas view.
 *
 * A tab freezes the global value only when the session has no value of its
 * own. A child that a parent pinned to a model or effort keeps that pin: the
 * selectors and the send path read it from the tab.
 */
export function freezeSessionOverrides(tabId: Signal<string>): void {
  const effortState = inject(EffortStateService);
  const modelState = inject(ModelStateService);
  const tabManager = inject(TabManagerService);

  effect(() => {
    const id = tabId();
    if (!effortState.isLoaded()) return;
    untracked(() => {
      const tab = tabManager.tabs().find((t) => t.id === id);
      if (tab && tab.overrideEffort === undefined) {
        const { effort, origin } = resolveTabEffort(
          tab,
          effortState.currentEffort(),
        );
        if (origin === 'global') {
          tabManager.setOverrideEffort(id, effort);
        }
      }
    });
  });

  effect(() => {
    const id = tabId();
    if (!modelState.isLoaded()) return;
    untracked(() => {
      const tab = tabManager.tabs().find((t) => t.id === id);
      if (tab && tab.overrideModel === undefined) {
        const { model, origin } = resolveTabModel(
          tab,
          modelState.currentModel(),
        );
        if (model && origin === 'global') {
          tabManager.setOverrideModel(id, model);
        }
      }
    });
  });
}
