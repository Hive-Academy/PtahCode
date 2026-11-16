import type { TrackedAgent } from './tracked-agent';
import { MemoryAdmissionTicket, SharedMemoryGate } from './shared-memory-gate';

/** Lane-owned state changes used by the shared admission queue. */
export class LaneMemoryAdmissionTicket implements MemoryAdmissionTicket {
  constructor(
    readonly tracked: TrackedAgent,
    private readonly fail: (tracked: TrackedAgent, error: Error) => void,
  ) {}

  isPending(): boolean {
    return this.tracked.info.status === 'starting';
  }

  queued(): void {
    this.tracked.info.waitingForMemory = true;
    (this.tracked as any)._enteredQueue = true;
    clearTimeout(this.tracked.admissionTimer);
    this.tracked.admissionTimer = undefined;
  }

  dequeued(): void {
    this.tracked.info.waitingForMemory = false;
  }

  timedOut(error: Error): void {
    this.fail(this.tracked, error);
  }
}

/** Lane API and settings adapter for the shared FIFO admission gate. */
export class AgentSpawnMemoryGate {
  private readonly tickets = new WeakMap<TrackedAgent, LaneMemoryAdmissionTicket>();
  private readonly gate: SharedMemoryGate<LaneMemoryAdmissionTicket>;

  constructor(
    private readonly freeMemory: () => number,
    private readonly minFreeMemoryGb: () => number,
    timeoutMs: () => number,
    private readonly otherActiveLanes: (tracked: TrackedAgent) => boolean,
    private readonly fail: (tracked: TrackedAgent, error: Error) => void,
  ) {
    this.gate = new SharedMemoryGate({
      canStart: (ticket) => this.canStart(ticket.tracked),
      timeoutMs,
      stoppedBeforeAdmission: () => new Error('Lane stopped before memory admission'),
      stoppedWhileWaiting: () => new Error('Lane stopped while waiting for memory'),
      timeoutError: () => new Error('Lane waited for memory and timed out'),
    });
  }

  wait(tracked: TrackedAgent, force = false): Promise<void> {
    let ticket = this.tickets.get(tracked);
    if (!ticket) {
      ticket = new LaneMemoryAdmissionTicket(tracked, this.fail);
      this.tickets.set(tracked, ticket);
    }
    return this.gate.wait(ticket, force);
  }

  wake(fromPoll = false): void {
    this.gate.wake(fromPoll);
  }

  private canStart(tracked: TrackedAgent): boolean {
    const threshold = this.minFreeMemoryGb();
    return threshold === 0 || this.freeMemory() >= threshold * 1024 ** 3 ||
      !this.otherActiveLanes(tracked);
  }
}
