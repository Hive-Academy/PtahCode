import type { AgentBudgetSettings, AgentBudgetSnapshot } from '@ptah-extension/shared';

/**
 * Legacy: every kind except `handoff-complete` came from the retired forced-stop
 * budget monitor (`forced: true` records). They stay so historical handoff
 * records and messages still decode. New flows never stop a subagent; they ask
 * for a handoff, pause new work tools at the ceiling, and let the agent return.
 */
export type SubagentStopCauseKind =
  | 'handoff-complete'
  | 'warning-notes-complete' | 'warning-turn-ended' | 'notes-timeout'
  | 'context-handoff' | 'context-ceiling' | 'weighted-budget' | 'raw-budget'
  | 'duration' | 'telemetry-unavailable';

/** Additive evidence; the legacy handoff/safety reason remains readable. `forced: false` is a cooperative return. */
export interface SubagentStopCause {
  readonly kind: SubagentStopCauseKind;
  readonly quantity: 'files' | 'context-tokens' | 'weighted-tokens' | 'raw-tokens' | 'milliseconds' | 'missing-usage';
  readonly measured: number;
  readonly limit: number;
  readonly forced: boolean;
  readonly notesTurnUnavailable?: boolean;
}

/** Legacy forced-stop evidence for historical records; the cooperative flow does not stop agents. */
export function independentSafetyCause(snapshot: AgentBudgetSnapshot, elapsedMs: number,
  settings: AgentBudgetSettings): SubagentStopCause | undefined {
  if (elapsedMs >= settings.maxDurationMin * 60_000) return {
    kind: 'duration', quantity: 'milliseconds', measured: elapsedMs,
    limit: settings.maxDurationMin * 60_000, forced: true, notesTurnUnavailable: true,
  };
  const kind = snapshot.weightedTokens >= settings.stopWeightedTokens ? 'weighted-budget'
    : snapshot.rawTokens >= settings.stopWeightedTokens ? 'raw-budget' : undefined;
  return kind ? { kind, quantity: kind === 'weighted-budget' ? 'weighted-tokens' : 'raw-tokens',
    measured: kind === 'weighted-budget' ? snapshot.weightedTokens : snapshot.rawTokens,
    limit: settings.stopWeightedTokens, forced: true, notesTurnUnavailable: true } : undefined;
}

export function describeStopCause(cause: SubagentStopCause): string {
  const evidence = `${cause.measured} of ${cause.limit} ${cause.quantity}`;
  const description = cause.kind === 'handoff-complete' ? 'the subagent returned normally after the handoff request'
    : cause.kind === 'warning-notes-complete' ? 'the notes phase completed'
    : cause.kind === 'warning-turn-ended' ? 'the subagent ended its turn during the notes phase'
    : cause.kind === 'notes-timeout' ? 'the notes phase reached its watchdog timeout'
    : cause.kind === 'telemetry-unavailable' ? 'usage telemetry was unavailable'
    : `${cause.kind} reached its limit`;
  return `${description} (${evidence}); cause: ${cause.kind}; ${cause.forced ? 'forced stop (legacy)' : 'cooperative return'}` +
    (cause.notesTurnUnavailable ? '. Independent safety overrode the notes turn' : '');
}

/** Legacy forced cause for historical records. */
export function unavailableUsageCause(): SubagentStopCause {
  return { kind: 'telemetry-unavailable', quantity: 'missing-usage', measured: 1, limit: 1,
    forced: true, notesTurnUnavailable: true };
}
