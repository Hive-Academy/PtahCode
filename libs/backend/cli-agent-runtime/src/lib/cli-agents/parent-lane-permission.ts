import type { LanePermissionMode } from '@ptah-extension/shared';

type Lifecycle = {
  find(id: string): { realSessionId?: string | null; permissionLevel?: string } | undefined;
};
type CodexPermissionSource = {
  getPermissionLevel(id: string): string | undefined;
  resolveLiveSessionId?(callerId: string): string | undefined;
};

/** Resolve a bound caller from trusted host state. Unknown bound sessions cap to plan. */
export function parentLanePermission(
  callerId: string | undefined,
  lifecycle: Lifecycle | null | undefined,
  codex: CodexPermissionSource | null | undefined,
): LanePermissionMode | undefined {
  if (!callerId?.trim()) return undefined;
  const record = lifecycle?.find(callerId);
  const codexId = codex?.resolveLiveSessionId?.(record?.realSessionId ?? callerId)
    ?? record?.realSessionId ?? callerId;
  const level = codex?.getPermissionLevel(codexId) ?? record?.permissionLevel;
  if (level === undefined) return 'plan';
  if (level === 'plan' || level === 'auto-edit' || level === 'yolo') return level;
  return undefined;
}
