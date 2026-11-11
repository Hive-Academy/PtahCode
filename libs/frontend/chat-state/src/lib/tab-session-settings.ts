import type { TabState } from '@ptah-extension/chat-types';
import type { EffortLevel } from '@ptah-extension/shared';

/**
 * Where the model or effort of a tab comes from.
 * - `override`: the user picked a value for this tab.
 * - `session`: the session itself carries the value (a child pinned by its
 *   parent, or a session restored from history).
 * - `global`: the tab has no value of its own, so the host default applies.
 */
export type TabSettingOrigin = 'override' | 'session' | 'global';

type TabModelFields = Pick<
  TabState,
  'overrideModel' | 'sessionModel' | 'agentOrigin'
>;
type TabEffortFields = Pick<TabState, 'overrideEffort' | 'agentOrigin'>;

export interface ResolvedTabModel {
  readonly model: string | null;
  readonly origin: TabSettingOrigin;
}

export interface ResolvedTabEffort {
  /** `null` is an explicit "default effort" choice. */
  readonly effort: EffortLevel | null;
  readonly origin: TabSettingOrigin;
}

/**
 * The model the next turn of a tab uses. One rule for the dropdown and for
 * every send path, so they cannot disagree:
 * tab override, then the model of the session, then the global selection.
 */
export function resolveTabModel(
  tab: TabModelFields | null | undefined,
  globalModel: string | null | undefined,
): ResolvedTabModel {
  if (tab?.overrideModel) {
    return { model: tab.overrideModel, origin: 'override' };
  }
  const sessionModel = tab?.agentOrigin?.model || tab?.sessionModel;
  if (sessionModel) {
    return { model: sessionModel, origin: 'session' };
  }
  return { model: globalModel ?? null, origin: 'global' };
}

/**
 * The effort the next turn of a tab uses. `overrideEffort` has three states:
 * `undefined` follows the session or the global value, `null` is an explicit
 * default choice, and a level is an explicit level.
 */
export function resolveTabEffort(
  tab: TabEffortFields | null | undefined,
  globalEffort: EffortLevel | null | undefined,
): ResolvedTabEffort {
  if (tab && tab.overrideEffort !== undefined) {
    return { effort: tab.overrideEffort, origin: 'override' };
  }
  if (tab?.agentOrigin?.effort) {
    return { effort: tab.agentOrigin.effort, origin: 'session' };
  }
  return { effort: globalEffort ?? null, origin: 'global' };
}
