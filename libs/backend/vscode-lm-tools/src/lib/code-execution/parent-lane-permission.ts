import { parentLanePermission as resolveParentLanePermission } from '@ptah-extension/cli-agent-runtime';
import type { SpawnAgentRequest } from '@ptah-extension/shared';

type Level = SpawnAgentRequest['parentLevel'];
type LiveLevel = string;
type NativePermissionSource = {
  getPermissionLevel(id: string): LiveLevel | undefined;
  resolveLiveSessionId?(callerId: string): string | undefined;
};

/** Resolve a bound caller from trusted host state. Unknown bound sessions cap to plan. */
export function parentLanePermission(
  callerId: string,
  lifecycle:
    | {
        find(
          id: string,
        ):
          | { realSessionId?: string | null; permissionLevel?: LiveLevel }
          | undefined;
      }
    | undefined,
  codex: NativePermissionSource | undefined,
  providerSessions?: NativePermissionSource | null,
): Level {
  return resolveParentLanePermission(callerId, lifecycle, codex, {
    providerSessions,
  });
}
