/** A caller-owned admission record. The gate only owns queue order and timers. */
export interface MemoryAdmissionTicket {
  isPending(): boolean;
  queued(): void;
  dequeued(): void;
  timedOut(error: Error): void;
}

interface WaitingTicket<T extends MemoryAdmissionTicket> {
  readonly ticket: T;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
}

export interface MemoryGatePorts<T extends MemoryAdmissionTicket> {
  canStart(ticket: T): boolean;
  timeoutMs(): number;
  stoppedBeforeAdmission(): Error;
  stoppedWhileWaiting(): Error;
  timeoutError(): Error;
}

/** FIFO admission gate shared by lane and session admission. */
export class SharedMemoryGate<T extends MemoryAdmissionTicket> {
  private readonly queue: WaitingTicket<T>[] = [];
  private poll?: NodeJS.Timeout;
  private released?: T;

  constructor(private readonly ports: MemoryGatePorts<T>) {}

  wait(ticket: T, force = false): Promise<void> {
    if (!ticket.isPending()) {
      return Promise.reject(this.ports.stoppedBeforeAdmission());
    }
    if (force || (this.queue.length === 0 &&
        !this.released?.isPending() && this.ports.canStart(ticket))) {
      return Promise.resolve();
    }
    ticket.queued();
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.queue.findIndex((entry) => entry.ticket === ticket);
        if (index < 0) return;
        this.queue.splice(index, 1);
        const error = this.ports.timeoutError();
        ticket.dequeued();
        ticket.timedOut(error);
        reject(error);
        this.wake();
      }, this.ports.timeoutMs());
      timeout.unref?.();
      this.queue.push({ ticket, resolve, reject, timeout });
      this.ensurePoll();
      this.wake();
    });
  }

  wake(fromPoll = false): void {
    for (let index = this.queue.length - 1; index >= 0; index--) {
      const entry = this.queue[index];
      if (entry.ticket.isPending()) continue;
      this.queue.splice(index, 1);
      clearTimeout(entry.timeout);
      entry.ticket.dequeued();
      entry.reject(this.ports.stoppedWhileWaiting());
    }
    if (this.released && (this.released.isPending() || !fromPoll)) {
      this.stopPollIfEmpty();
      return;
    }
    this.released = undefined;
    const head = this.queue[0];
    if (head && this.ports.canStart(head.ticket)) {
      this.queue.shift();
      clearTimeout(head.timeout);
      head.ticket.dequeued();
      this.released = head.ticket;
      head.resolve();
    }
    this.stopPollIfEmpty();
  }

  private stopPollIfEmpty(): void {
    if (this.queue.length === 0 && this.poll) {
      clearInterval(this.poll);
      this.poll = undefined;
    }
  }

  private ensurePoll(): void {
    if (this.poll) return;
    this.poll = setInterval(() => this.wake(true), 1000);
    this.poll.unref?.();
  }
}
