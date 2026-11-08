import type { SpawnAgentRequest } from '@ptah-extension/shared';

type Level = SpawnAgentRequest['parentLevel'];
type LiveLevel = string;

/** Resolve a bound caller from trusted host state. Unknown bound sessions cap to plan. */
export function parentLanePermission(
  callerId: string,
  lifecycle: { find(id: string): { realSessionId?: string | null; permissionLevel?: LiveLevel } | undefined } | undefined,
  codex: { getPermissionLevel(id: string): LiveLevel | undefined } | undefined,
): Level {
  const record = lifecycle?.find(callerId);
  const level = codex?.getPermissionLevel(record?.realSessionId ?? callerId)
    ?? record?.permissionLevel;
  if (level === undefined) return 'plan';
  if (level === 'plan' || level === 'auto-edit' || level === 'yolo') return level;
  return undefined;
}
