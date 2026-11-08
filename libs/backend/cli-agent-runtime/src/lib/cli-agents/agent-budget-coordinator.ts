import {
  AgentBudgetPolicy,
  initialAgentBudgetSnapshot,
  findModelPricing,
  type AgentBudgetSettings,
  type AgentBudgetSnapshot,
  type AgentBudgetStopReason,
  type AgentTurnTelemetry,
} from '@ptah-extension/shared';

/** Lifetime accounting for one CLI session, including resumed turns. */
export class AgentBudgetCoordinator {
  private snapshot: AgentBudgetSnapshot;
  private readonly policy: AgentBudgetPolicy;
  readonly startedAtMs: number;
  stopReason?: AgentBudgetStopReason;

  constructor(
    readonly settings: AgentBudgetSettings,
    startedAtMs: number,
    snapshot: AgentBudgetSnapshot = initialAgentBudgetSnapshot,
  ) {
    this.policy = new AgentBudgetPolicy(settings);
    this.startedAtMs = startedAtMs;
    this.snapshot = snapshot;
  }

  get counters(): AgentBudgetSnapshot { return this.snapshot; }

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
    // Bound metadata and long-lived memory; an ancient duplicate is charged
    // again conservatively rather than allowing unbounded turn IDs.
    this.snapshot = { ...result.snapshot, turnIds: result.snapshot.turnIds.slice(-128) };
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
