import type { AgentProcessInfo } from '@ptah-extension/shared';

const HISTORY_SIZE = 256;
const acknowledged = new Set<string>();
const pendingCancellation = new Map<string, () => Promise<void>>();

export function terminalCompletionKey(info: AgentProcessInfo): string | undefined {
  if (info.status === 'running' || !info.completedAt) return undefined;
  return `${info.agentId}:${info.completedAt}`;
}

/** A parent read consumes only the terminal transition it actually observed. */
export async function acknowledgeTerminalRead(
  info: AgentProcessInfo,
  readerSessionId: string | undefined,
): Promise<void> {
  if (!readerSessionId || info.parentSessionId !== readerSessionId) return;
  const key = terminalCompletionKey(info);
  if (!key) return;
  acknowledged.delete(key);
  acknowledged.add(key);
  if (acknowledged.size > HISTORY_SIZE) {
    const oldest = acknowledged.values().next().value;
    if (oldest !== undefined) acknowledged.delete(oldest);
  }
  const cancel = pendingCancellation.get(key);
  pendingCancellation.delete(key);
  await cancel?.();
}

/** Registers a bounded cancellation for a notice already queued before a read. */
export async function reconcilePendingCompletionRead(
  key: string,
  cancel: () => Promise<void>,
): Promise<void> {
  pendingCancellation.delete(key);
  pendingCancellation.set(key, cancel);
  if (pendingCancellation.size > HISTORY_SIZE) {
    const oldest = pendingCancellation.keys().next().value;
    if (oldest !== undefined) pendingCancellation.delete(oldest);
  }
  if (acknowledged.has(key)) {
    pendingCancellation.delete(key);
    await cancel();
  }
}

export function wasTerminalReadAcknowledged(key: string): boolean {
  return acknowledged.has(key);
}
