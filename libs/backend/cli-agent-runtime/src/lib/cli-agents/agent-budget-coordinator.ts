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
  startedAtMs: number;
  stopReason?: AgentBudgetStopReason;
  turnCount: number;

  constructor(
    readonly settings: AgentBudgetSettings,
    startedAtMs: number,
    snapshot: AgentBudgetSnapshot = initialAgentBudgetSnapshot,
    turnCount = snapshot.turnIds.length,
  ) {
    this.policy = new AgentBudgetPolicy(settings);
    this.startedAtMs = startedAtMs;
    this.snapshot = { ...snapshot, turnIds: snapshot.turnIds.slice(-256) };
    this.turnCount = turnCount;
  }

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
    this.rebind(record.startedAtMs, {
      weightedTokens: record.weightedTokens, rawTokens: record.rawTokens,
      turnIds: record.turnIds, elapsedMs: 0, warned: false, stopped: false,
    }, record.turnCount ?? record.turnIds.length);
  }

  /** Bind a late native session ID before accepting its first completed turn. */
  rebind(startedAtMs: number, snapshot: AgentBudgetSnapshot, turnCount = snapshot.turnIds.length): void {
    this.startedAtMs = startedAtMs;
    this.snapshot = { ...snapshot, turnIds: snapshot.turnIds.slice(-256) };
    this.turnCount = turnCount;
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
    if (telemetry.status === 'reported' && !this.snapshot.turnIds.includes(telemetry.usage.turnId)) this.turnCount++;
    // Bound metadata and long-lived memory; an ancient duplicate is charged
    // again conservatively rather than allowing unbounded turn IDs.
    this.snapshot = { ...result.snapshot, turnIds: result.snapshot.turnIds.slice(-256) };
    this.stopReason ??= result.stopReason;
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
