import type { NativeCodexAgentStatusEvent } from '@ptah-extension/shared';
import type { SubagentRecord } from './agent-monitor.store';

function isTerminal(status: SubagentRecord['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed' || status === 'stopped';
}

/** Reduce one native child status; null means it cannot change the card. */
export function reduceNativeCodexStatus(
  existing: SubagentRecord | undefined,
  event: NativeCodexAgentStatusEvent,
  sessionId: string | undefined,
): SubagentRecord | null {
  if (existing?.agentType && existing.agentType !== 'codex') return null;

  const { cycleId, cycleOrdinal } = event.native;
  const priorOrdinal = existing?.nativeCycleOrdinal;
  if (priorOrdinal !== undefined && cycleOrdinal < priorOrdinal) return null;
  const sameCycle = priorOrdinal === cycleOrdinal;
  if (sameCycle && existing?.nativeCycleId !== cycleId) return null;

  const terminal = isTerminal(event.status);
  // A history-settled card without an ordinal has no evidence that a live
  // nonterminal event belongs to a newer turn. Keep it settled until a cycle
  // can be distinguished from the one recorded in history.
  if (
    existing &&
    isTerminal(existing.status) &&
    priorOrdinal === undefined &&
    !terminal &&
    (existing.nativeCycleId === undefined || existing.nativeCycleId === cycleId)
  ) return null;

  const terminalKey = terminal ? `${cycleId}:${event.status}` : undefined;
  if (sameCycle) {
    if (!terminal && (existing?.status === event.status || (existing && isTerminal(existing.status)))) return null;
    if (terminal && existing?.nativeLastTerminalKey === terminalKey) return null;
    if (existing?.status === 'failed' && event.status === 'completed') return null;
  }

  return {
    ...existing,
    parentToolUseId: event.parentToolUseId,
    agentId: event.agentId,
    agentType: existing?.agentType ?? 'codex',
    description: event.description ?? existing?.description,
    status: event.status,
    startedAt: existing?.startedAt ?? event.timestamp,
    completedAt: terminal ? event.timestamp : undefined,
    errorMessage: event.errorMessage ?? (terminal ? existing?.errorMessage : undefined),
    parentSessionId: sessionId ?? existing?.parentSessionId,
    nativeCycleId: cycleId,
    nativeCycleOrdinal: cycleOrdinal,
    nativeLastTerminalKey: terminalKey,
    settledFromHistory: false,
  };
}
