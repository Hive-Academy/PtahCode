import { parentLanePermission as resolveParentLanePermission } from '@ptah-extension/cli-agent-runtime';
import type { SpawnAgentRequest } from '@ptah-extension/shared';

type Level = SpawnAgentRequest['parentLevel'];
type LiveLevel = string;

/** Resolve a bound caller from trusted host state. Unknown bound sessions cap to plan. */
export function parentLanePermission(
  callerId: string,
  lifecycle: { find(id: string): { realSessionId?: string | null; permissionLevel?: LiveLevel } | undefined } | undefined,
  codex: { getPermissionLevel(id: string): LiveLevel | undefined; resolveLiveSessionId?(callerId: string): string | undefined } | undefined,
): Level {
  return resolveParentLanePermission(callerId, lifecycle, codex);
}
