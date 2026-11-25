/**
 * EffortSelectorComponent - main chat's reasoning-effort pill.
 *
 * The tab container for `ComposerEffortPickerComponent`: it resolves the
 * effective effort of the tab (canvas tile or active main-panel tab) from
 * `EffortStateService` and `TabManagerService`, renders the shared picker and
 * stores a pick as the tab's override.
 */

import {
  Component,
  computed,
  output,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { type EffortLevel } from '@ptah-extension/shared';
import { EffortStateService } from '@ptah-extension/core';
import {
  TabManagerService,
  resolveTabEffort,
} from '@ptah-extension/chat-state';
import { SESSION_CONTEXT } from '../../../tokens/session-context.token';
import {
  ComposerEffortPickerComponent,
  type ComposerEffortOption,
} from '../composer-controls/composer-effort-picker.component';

@Component({
  selector: 'ptah-effort-selector',
  imports: [ComposerEffortPickerComponent],
  template: `
    <ptah-composer-effort-picker
      [selectedId]="effectiveEffort()"
      (selected)="selectEffort($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EffortSelectorComponent {
  private readonly effortState = inject(EffortStateService);
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
      ? this.tabManager.tabs().find((t) => t.id === contextTabId)
      : this.tabManager.activeTab();
  });

  /**
   * Effective effort for this context. It follows the same rule as the send
   * path (`resolveTabEffort`): tab override, then the effort of the session,
   * then the global selection.
   * Three-state semantics on TabState:
   *   undefined = not set (follow session or global), null = explicitly SDK default, EffortLevel = override
   */
  readonly effectiveEffort = computed((): EffortLevel | '' => {
    return (
      resolveTabEffort(this.contextTab(), this.effortState.currentEffort())
        .effort ?? ''
    );
  });

  readonly effortChanged = output<EffortLevel | undefined>();

  /**
   * Select effort level for the session of this tab only. The choice is stored
   * on the tab. The send path applies it to the next turn of that session, so
   * other tabs and the global selection stay as they are.
   */
  selectEffort(option: Pick<ComposerEffortOption, 'value'>): void {
    const effortValue = option.value === '' ? undefined : option.value;

    this.effortChanged.emit(effortValue);

    const tabId = this.contextTab()?.id;
    if (tabId) {
      this.tabManager.setOverrideEffort(tabId, effortValue ?? null);
    }
  }
}
