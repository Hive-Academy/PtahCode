import type { ExternalOwnerKey } from '@ptah-extension/shared';
import type { McpCallerBinding } from '@ptah-extension/platform-core';

export function httpSpawnOwnerScope(
  root: string,
  callerSessionId: string | undefined,
  callerAgentId: string | undefined,
  binding: McpCallerBinding | undefined,
  owner: ExternalOwnerKey | undefined,
): string {
  const identity = binding?.agentId ?? binding?.sessionId;
  return JSON.stringify([
    callerSessionId ?? root,
    callerAgentId ?? null,
    owner ?? null,
    !callerSessionId && !callerAgentId && identity ? [binding?.kind, identity] : null,
  ]);
}
