import { freemem } from 'node:os';
import { SharedMemoryGate, type MemoryAdmissionTicket } from '../cli-agents/shared-memory-gate';
import type { SessionChildSettings } from './session-child-settings';

/** One admission owns only its queue state. The spawner owns the reservation and record. */
export class SessionMemoryTicket implements MemoryAdmissionTicket {
  pending = true;
  waiting = false;
  constructor(readonly id: string) {}
  isPending(): boolean { return this.pending; }
  queued(): void { this.waiting = true; }
  dequeued(): void { this.waiting = false; }
  admitted(): void { this.pending = false; }
  timedOut(): void { this.pending = false; }
  cancel(): void { this.pending = false; }
}

/** Session adapter for the same FIFO and timer implementation used by lanes. */
export class SessionMemoryAdmission {
  private readonly gate: SharedMemoryGate<SessionMemoryTicket>;

  constructor(private readonly settings: () => Pick<SessionChildSettings, 'minFreeMemoryGb' | 'spawnQueueTimeoutMs'>,
    private readonly freeMemory: () => number = freemem) {
    this.gate = new SharedMemoryGate({
      canStart: () => {
        const threshold = this.settings().minFreeMemoryGb;
        return threshold === 0 || this.freeMemory() >= threshold * 1024 ** 3;
      },
      timeoutMs: () => this.settings().spawnQueueTimeoutMs,
      stoppedBeforeAdmission: () => new Error('Session cancelled before memory admission'),
      stoppedWhileWaiting: () => new Error('Session cancelled while waiting for memory'),
      timeoutError: () => new Error('Session waited for memory and timed out'),
    });
  }

  wait(ticket: SessionMemoryTicket): Promise<void> { return this.gate.wait(ticket); }
  cancel(ticket: SessionMemoryTicket): void { ticket.cancel(); this.gate.wake(); }
  wake(): void { this.gate.wake(); }
}
