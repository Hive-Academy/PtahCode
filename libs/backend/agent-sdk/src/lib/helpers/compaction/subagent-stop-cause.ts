import type { AgentBudgetSettings, AgentBudgetSnapshot } from '@ptah-extension/shared';

export type SubagentStopCauseKind =
  | 'warning-notes-complete' | 'warning-turn-ended' | 'notes-timeout'
  | 'context-handoff' | 'context-ceiling' | 'weighted-budget' | 'raw-budget'
  | 'duration' | 'telemetry-unavailable';

/** Additive evidence; the legacy handoff/safety reason remains readable. */
export interface SubagentStopCause {
  readonly kind: SubagentStopCauseKind;
  readonly quantity: 'files' | 'context-tokens' | 'weighted-tokens' | 'raw-tokens' | 'milliseconds' | 'missing-usage';
  readonly measured: number;
  readonly limit: number;
  readonly forced: boolean;
  readonly notesTurnUnavailable?: boolean;
}

/** Context thresholds are cooperative; only independent safety overrides notes. */
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
  const description = cause.kind === 'warning-notes-complete' ? 'the notes phase completed'
    : cause.kind === 'warning-turn-ended' ? 'the subagent ended its turn during the notes phase'
    : cause.kind === 'notes-timeout' ? 'the notes phase reached its watchdog timeout'
    : cause.kind === 'telemetry-unavailable' ? 'usage telemetry was unavailable'
    : `${cause.kind} reached its limit`;
  return `${description} (${evidence}); cause: ${cause.kind}; ${cause.forced ? 'forced stop' : 'cooperative return'}` +
    (cause.notesTurnUnavailable ? '. Independent safety overrode the notes turn' : '');
}

export function unavailableUsageCause(): SubagentStopCause {
  return { kind: 'telemetry-unavailable', quantity: 'missing-usage', measured: 1, limit: 1,
    forced: true, notesTurnUnavailable: true };
}
