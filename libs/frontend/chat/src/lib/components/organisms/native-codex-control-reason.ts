import type { SubagentRecord } from '@ptah-extension/chat-streaming';

export const NATIVE_CODEX_CONTROL_REASON =
  'Native Codex subagents do not support send or stop from Ptah yet.';

export function isNativeCodexAgent(record: SubagentRecord | undefined): boolean {
  return record?.agentType === 'codex' && !record.taskId && record.nativeCycleId !== undefined;
}
