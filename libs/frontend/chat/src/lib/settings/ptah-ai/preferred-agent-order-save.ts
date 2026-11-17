import { ProvidersSettingsStateService } from '@ptah-extension/core';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';

/** Both order editors use the same write and Undo behavior. */
export async function savePreferredAgentOrder(
  state: ProvidersSettingsStateService,
  feedback: SettingsSaveFeedbackService,
  order: readonly string[],
): Promise<void> {
  const context = state.reviewContext();
  if (!context) return;
  const saved = state.orchestration().data?.preferredAgentOrder;
  const previous = Array.isArray(saved) ? [...saved] : [];
  await feedback.save({
    label: 'preferred agent order',
    scope: 'global',
    write: () => state.saveSettings({ orchestration: { preferredAgentOrder: [...order] } }, context),
    undo: () => state.saveSettings({ orchestration: { preferredAgentOrder: previous } }, context),
  });
}
