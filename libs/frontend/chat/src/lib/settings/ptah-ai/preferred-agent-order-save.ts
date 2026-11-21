import { ProvidersSettingsStateService } from '@ptah-extension/core';
import {
  SettingsSaveFeedbackService,
  type SettingsSaveResult,
} from '../feedback/settings-save-feedback.service';
import { applyDisplayedAgentOrder } from './move-preferred-agent-order';

/**
 * The saved preferred order, only from a ready and complete `agent:getConfig` read. A failed read, a read still
 * running, or a response that omits or malforms `preferredAgentOrder` gives `null`: a move on that base would
 * replace the saved order with a partial list and drop saved ids (system, strip or deleted-instance ids).
 */
export function verifiedPreferredAgentOrder(
  state: ProvidersSettingsStateService,
): readonly string[] | null {
  const read = state.orchestration();
  if (read.status !== 'ready' || !read.data) return null;
  if ((read.data.missingFields ?? []).includes('preferredAgentOrder'))
    return null;
  const saved = read.data.preferredAgentOrder;
  return Array.isArray(saved) ? saved : null;
}

/**
 * One Reorder move: `displayed` holds the displayed numbered ids in their new order. The whole saved order is
 * written, with every undisplayed saved id kept in its slot. The write boundary checks the read again, so no
 * caller can write on an unverified base, and Undo restores the same verified base.
 * `'unchanged'` = nothing to write; `'refused'` = no write context, or no verified base.
 */
export async function savePreferredAgentOrder(
  state: ProvidersSettingsStateService,
  feedback: SettingsSaveFeedbackService,
  displayed: readonly string[],
): Promise<SettingsSaveResult | 'unchanged'> {
  const context = state.reviewContext();
  const base = verifiedPreferredAgentOrder(state);
  if (!context || !base) return 'refused';
  const order = applyDisplayedAgentOrder(base, displayed);
  if (!order) return 'unchanged';
  const previous = [...base];
  return feedback.save({
    label: 'preferred agent order',
    scope: 'global',
    write: () =>
      state.saveSettings(
        { orchestration: { preferredAgentOrder: [...order] } },
        context,
      ),
    undo: () =>
      state.saveSettings(
        { orchestration: { preferredAgentOrder: previous } },
        context,
      ),
  });
}
