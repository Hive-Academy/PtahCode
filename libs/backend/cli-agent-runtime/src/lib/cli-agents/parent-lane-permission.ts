import type { LanePermissionMode } from '@ptah-extension/shared';

type Lifecycle = {
  find(id: string): { realSessionId?: string | null; permissionLevel?: string } | undefined;
};
type CodexPermissionSource = {
  getPermissionLevel(id: string): string | undefined;
  resolveLiveSessionId?(callerId: string): string | undefined;
};

/**
 * Resolve a bound caller from trusted host state.
 *
 * `unknownParent: 'plan'` (the default, used at spawn) caps an unknown bound caller to plan: a
 * spawning caller is always live, so an unknown one is not trusted. `'uncapped'` (used on lane
 * resume) applies no cap: after an app restart the parent chat is no longer live, its level is
 * unknown rather than plan, and the lane keeps the policy it was spawned with.
 */
export function parentLanePermission(
  callerId: string | undefined,
  lifecycle: Lifecycle | null | undefined,
  codex: CodexPermissionSource | null | undefined,
  options: { unknownParent?: 'plan' | 'uncapped' } = {},
): LanePermissionMode | undefined {
  if (!callerId?.trim()) return undefined;
  const record = lifecycle?.find(callerId);
  const codexId = codex?.resolveLiveSessionId?.(record?.realSessionId ?? callerId)
    ?? record?.realSessionId ?? callerId;
  const level = codex?.getPermissionLevel(codexId) ?? record?.permissionLevel;
  if (level === undefined) return options.unknownParent === 'uncapped' ? undefined : 'plan';
  if (level === 'plan' || level === 'auto-edit' || level === 'yolo') return level;
  return undefined;
}
