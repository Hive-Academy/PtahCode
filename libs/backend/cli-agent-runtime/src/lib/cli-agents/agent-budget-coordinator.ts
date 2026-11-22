import {
  AgentBudgetPolicy,
  agentBudgetAdmissionLimits,
  initialAgentBudgetSnapshot,
  findModelPricing,
  type AgentAdmissionAssessment,
  type AgentBudgetSettings,
  type AgentBudgetSnapshot,
  type AgentTurnTelemetry,
  type AgentBudgetRecord,
} from '@ptah-extension/shared';

export function turnCountOf(record: AgentBudgetRecord): number {
  return record.turnCount ?? record.turnIds.length;
}

/** Longest delay `setTimeout` accepts. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Lifetime accounting for one CLI session, including resumed turns. It never stops a lane:
 * each change returns the admission assessment (ask at the threshold, pause at twice it) and
 * the caller decides what to send. The stored snapshot keeps `stopped: false` so accounting
 * continues after a pause.
 */
export class AgentBudgetCoordinator {
  private snapshot: AgentBudgetSnapshot;
  private policy: AgentBudgetPolicy;
  private _startedAtMs: number;
  private _turnCount: number;

  constructor(
    public settings: AgentBudgetSettings,
    startedAtMs: number,
    snapshot: AgentBudgetSnapshot = initialAgentBudgetSnapshot,
    turnCount = snapshot.turnIds.length,
  ) {
    this.policy = new AgentBudgetPolicy(settings, { laneAccounting: true });
    this._startedAtMs = startedAtMs;
    this.snapshot = { ...snapshot, stopped: false, turnIds: snapshot.turnIds.slice(-256) };
    this._turnCount = turnCount;
  }

  get startedAtMs(): number { return this._startedAtMs; }
  get turnCount(): number { return this._turnCount; }
  get counters(): AgentBudgetSnapshot { return this.snapshot; }

  /** Current ask/pause phase of the lifetime ledger and the elapsed runtime. */
  admission(nowMs = Date.now()): AgentAdmissionAssessment {
    return this.policy.assessAdmission(this.snapshot, Math.max(0, nowMs - this.startedAtMs));
  }

  /**
   * Milliseconds until the next duration ask or pause point, or undefined once the runtime is
   * past the pause point. Bounded to the longest delay a timer accepts.
   */
  nextAdmissionDeadlineMs(nowMs = Date.now()): number | undefined {
    const { askAt, pauseAt } = agentBudgetAdmissionLimits(this.settings).duration;
    const elapsed = Math.max(0, nowMs - this.startedAtMs);
    const next = elapsed < askAt ? askAt : elapsed < pauseAt ? pauseAt : undefined;
    return next === undefined ? undefined : Math.min(next - elapsed, MAX_TIMER_MS);
  }

  updateSettings(settings: AgentBudgetSettings, nowMs = Date.now()): AgentAdmissionAssessment {
    this.settings = settings;
    this.policy = new AgentBudgetPolicy(settings, { laneAccounting: true });
    return this.admission(nowMs);
  }

  record(): AgentBudgetRecord {
    return {
      weightedTokens: this.snapshot.weightedTokens,
      rawTokens: this.snapshot.rawTokens,
      largestTurnTokens: this.snapshot.largestTurnTokens,
      unavailableTurns: this.snapshot.unavailableTurns,
      turnIds: this.snapshot.turnIds,
      turnCount: this.turnCount,
      startedAtMs: this.startedAtMs,
      stopWeightedTokens: this.settings.stopWeightedTokens,
      maxDurationMin: this.settings.maxDurationMin,
    };
  }

  rebindRecord(record: AgentBudgetRecord, nowMs = Date.now()): AgentAdmissionAssessment {
    const current = this.snapshot;
    const priorIds = new Set(record.turnIds);
    const novelIds = current.turnIds.filter((id) => !priorIds.has(id));
    // A late native ID may arrive after this lane charged its first turn.
    // Its provisional ledger and the resumed ledger must become one record.
    const sameLedger = current.turnIds.length > 0 && novelIds.length === 0;
    this.rebind(Math.min(this.startedAtMs, record.startedAtMs), {
      weightedTokens: record.weightedTokens + (sameLedger ? 0 : current.weightedTokens),
      rawTokens: record.rawTokens + (sameLedger ? 0 : current.rawTokens),
      largestTurnTokens: Math.max(record.largestTurnTokens ?? 0, current.largestTurnTokens ?? 0),
      unavailableTurns: sameLedger ? current.unavailableTurns ?? record.unavailableTurns
        : current.rawTokens > 0 ? current.unavailableTurns ?? 0
        : (record.unavailableTurns ?? 0) + (current.unavailableTurns ?? 0),
      turnIds: [...record.turnIds, ...novelIds],
      elapsedMs: 0, warned: current.warned, stopped: false,
    }, turnCountOf(record) + (sameLedger ? 0 : this.turnCount));
    return this.admission(nowMs);
  }

  /** Bind a late native session ID, including turns charged before it arrived. */
  private rebind(startedAtMs: number, snapshot: AgentBudgetSnapshot, turnCount = snapshot.turnIds.length): void {
    this._startedAtMs = startedAtMs;
    this.snapshot = { ...snapshot, stopped: false, turnIds: snapshot.turnIds.slice(-256) };
    this._turnCount = turnCount;
  }

  /** A completed turn is charged once by its normalized turn ID. */
  accept(telemetry: AgentTurnTelemetry, nowMs = Date.now()): {
    admission: AgentAdmissionAssessment;
    costUnavailable: boolean;
    costAuthority: 'provider' | 'catalog' | 'unavailable';
  } {
    const pricing = telemetry.status === 'reported' && !telemetry.usage.models?.length
      ? findModelPricing(telemetry.usage.modelId) : null;
    const result = this.policy.evaluate(
      this.snapshot, telemetry, Math.max(0, nowMs - this.startedAtMs), pricing,
    );
    const turnId = telemetry.status === 'reported' ? telemetry.usage.turnId : telemetry.turnId;
    if (!this.snapshot.turnIds.includes(turnId)) this._turnCount++;
    // Bound metadata and long-lived memory; an ancient duplicate is charged
    // again conservatively rather than allowing unbounded turn IDs. `stopped` stays false:
    // a stopped snapshot would stop counting unavailable turns.
    this.snapshot = { ...result.snapshot, stopped: false, turnIds: result.snapshot.turnIds.slice(-256) };
    return {
      admission: this.admission(nowMs),
      costUnavailable: result.cost.status === 'unavailable',
      costAuthority: result.cost.status === 'reported' ? result.cost.source : 'unavailable',
    };
  }

}
