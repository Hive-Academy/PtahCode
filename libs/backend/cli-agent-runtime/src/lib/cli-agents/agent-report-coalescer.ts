import { injectable } from 'tsyringe';

export const AGENT_REPORT_COALESCE_WINDOW_MS = 120_000;

export interface HeldReport {
  readonly message: string;
  readonly summary?: string;
  readonly envelopeBody: string;
  readonly heldAt: number;
  readonly deliverStandalone: () => Promise<void>;
  readonly markEnqueued: () => void;
}

interface Slot {
  readonly report: HeldReport;
  readonly onExpire: (report: HeldReport) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

@injectable()
export class AgentReportCoalescer {
  private readonly slots = new Map<string, Slot>();

  /** Read the held report without taking ownership of it. */
  peek(agentId: string): HeldReport | undefined {
    return this.slots.get(agentId)?.report;
  }

  /** Synchronous take gives either timer or completion sole ownership; the other sees no slot. */
  take(agentId: string): HeldReport | undefined {
    const slot = this.slots.get(agentId);
    if (!slot) return undefined;
    this.slots.delete(agentId);
    clearTimeout(slot.timer);
    return slot.report;
  }

  hold(agentId: string, report: HeldReport, onExpire: (report: HeldReport) => void): void {
    const old = this.slots.get(agentId);
    if (old) {
      this.take(agentId);
      old.onExpire(old.report);
    }
    const timer = setTimeout(() => {
      const taken = this.take(agentId);
      if (taken) onExpire(taken);
    }, AGENT_REPORT_COALESCE_WINDOW_MS);
    timer.unref();
    this.slots.set(agentId, { report, onExpire, timer });
  }

  dispose(): void {
    for (const agentId of this.slots.keys()) {
      const slot = this.slots.get(agentId);
      if (!slot) continue;
      this.take(agentId);
      slot.onExpire(slot.report);
    }
  }
}

/** The body cap applies to the exact final completion body. */
export function attachFinalReport(completion: string, report: string): string {
  const closing = '</agent-lane-completed>';
  if (!completion.endsWith(closing)) throw new Error('Invalid completion envelope');
  return completion.slice(0, -closing.length) +
    `\nClosing report:\n${report}\n` + closing;
}

