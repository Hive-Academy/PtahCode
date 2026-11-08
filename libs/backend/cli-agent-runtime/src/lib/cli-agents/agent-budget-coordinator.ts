import {
  AgentBudgetPolicy,
  initialAgentBudgetSnapshot,
  findModelPricing,
  type AgentBudgetSettings,
  type AgentBudgetSnapshot,
  type AgentBudgetStopReason,
  type AgentTurnTelemetry,
  type AgentBudgetRecord,
} from '@ptah-extension/shared';

/** Lifetime accounting for one CLI session, including resumed turns. */
export class AgentBudgetCoordinator {
  private snapshot: AgentBudgetSnapshot;
  private readonly policy: AgentBudgetPolicy;
  private _startedAtMs: number;
  private _stopReason?: AgentBudgetStopReason;
  private _turnCount: number;

  constructor(
    readonly settings: AgentBudgetSettings,
    startedAtMs: number,
    snapshot: AgentBudgetSnapshot = initialAgentBudgetSnapshot,
    turnCount = snapshot.turnIds.length,
  ) {
    this.policy = new AgentBudgetPolicy(settings);
    this._startedAtMs = startedAtMs;
    this.snapshot = { ...snapshot, turnIds: snapshot.turnIds.slice(-256) };
    this._turnCount = turnCount;
  }

  get startedAtMs(): number { return this._startedAtMs; }
  get stopReason(): AgentBudgetStopReason | undefined { return this._stopReason; }
  get turnCount(): number { return this._turnCount; }
  get counters(): AgentBudgetSnapshot { return this.snapshot; }

  record(): AgentBudgetRecord {
    return {
      weightedTokens: this.snapshot.weightedTokens,
      rawTokens: this.snapshot.rawTokens,
      turnIds: this.snapshot.turnIds,
      turnCount: this.turnCount,
      startedAtMs: this.startedAtMs,
      stopWeightedTokens: this.settings.stopWeightedTokens,
      maxDurationMin: this.settings.maxDurationMin,
    };
  }

  rebindRecord(record: AgentBudgetRecord): void {
    const current = this.snapshot;
    const priorIds = new Set(record.turnIds);
    const novelIds = current.turnIds.filter((id) => !priorIds.has(id));
    // A late native ID may arrive after this lane charged its first turn.
    // Its provisional ledger and the resumed ledger must become one record.
    const sameLedger = current.turnIds.length > 0 && novelIds.length === 0;
    this.rebind(Math.min(this.startedAtMs, record.startedAtMs), {
      weightedTokens: record.weightedTokens + (sameLedger ? 0 : current.weightedTokens),
      rawTokens: record.rawTokens + (sameLedger ? 0 : current.rawTokens),
      turnIds: [...record.turnIds, ...novelIds],
      elapsedMs: 0, warned: current.warned, stopped: current.stopped,
    }, (record.turnCount ?? record.turnIds.length) + (sameLedger ? 0 : this.turnCount));
  }

  /** Bind a late native session ID before accepting its first completed turn. */
  private rebind(startedAtMs: number, snapshot: AgentBudgetSnapshot, turnCount = snapshot.turnIds.length): void {
    this._startedAtMs = startedAtMs;
    this.snapshot = { ...snapshot, turnIds: snapshot.turnIds.slice(-256) };
    this._turnCount = turnCount;
  }

  /** A completed turn is charged once by its normalized turn ID. */
  accept(telemetry: AgentTurnTelemetry, nowMs = Date.now()): {
    warning: boolean;
    stopReason?: AgentBudgetStopReason;
    costUnavailable: boolean;
  } {
    const pricing = telemetry.status === 'reported'
      ? findModelPricing(telemetry.usage.modelId) : null;
    const result = this.policy.evaluate(
      this.snapshot, telemetry, Math.max(0, nowMs - this.startedAtMs), pricing,
    );
    if (telemetry.status === 'reported' && !this.snapshot.turnIds.includes(telemetry.usage.turnId)) this._turnCount++;
    // Bound metadata and long-lived memory; an ancient duplicate is charged
    // again conservatively rather than allowing unbounded turn IDs.
    this.snapshot = { ...result.snapshot, turnIds: result.snapshot.turnIds.slice(-256) };
    this._stopReason ??= result.stopReason;
    return {
      warning: result.warning,
      ...(result.stopReason ? { stopReason: result.stopReason } : {}),
      costUnavailable: result.cost.status === 'unavailable',
    };
  }

  expired(nowMs = Date.now()): boolean {
    return nowMs - this.startedAtMs >= this.settings.maxDurationMin * 60_000;
  }

  remainingMs(nowMs = Date.now()): number {
    return Math.max(0, this.settings.maxDurationMin * 60_000 - (nowMs - this.startedAtMs));
  }

  /** A resume gets a fresh warning only after the old counters pass the gate. */
  resumeSnapshot(): AgentBudgetSnapshot {
    return { ...this.snapshot, warned: false };
  }
}
