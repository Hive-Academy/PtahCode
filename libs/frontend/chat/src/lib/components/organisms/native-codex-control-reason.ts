import type { SubagentRecord } from '@ptah-extension/chat-streaming';

export const NATIVE_CODEX_CONTROL_REASON =
  'Native Codex subagents do not support send or stop from Ptah yet.';

export function isNativeCodexAgent(record: SubagentRecord | undefined): boolean {
  return record?.agentType === 'codex' && !record.taskId && record.nativeCycleId !== undefined;
}

/**
 * Drop native Codex children from a resumable list. Ptah cannot resume them,
 * and a resume could start duplicate work. `lookup` maps a card tool call id
 * to its monitor record.
 */
export function withoutNativeCodexAgents<T extends { readonly toolCallId: string }>(
  records: readonly T[],
  lookup: (toolCallId: string) => SubagentRecord | undefined,
): T[] {
  return records.filter((record) => !isNativeCodexAgent(lookup(record.toolCallId)));
}
