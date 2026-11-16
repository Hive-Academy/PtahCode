import type { TrackedAgent } from './tracked-agent';

interface WaitingLane {
  readonly tracked: TrackedAgent;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
}

/** FIFO admission gate. The manager owns records and terminal signals. */
export class AgentSpawnMemoryGate {
  private readonly queue: WaitingLane[] = [];
  private poll?: NodeJS.Timeout;
  private released?: TrackedAgent;

  constructor(
    private readonly freeMemory: () => number,
    private readonly minFreeMemoryGb: () => number,
    private readonly timeoutMs: () => number,
    private readonly otherActiveLanes: (tracked: TrackedAgent) => boolean,
    private readonly fail: (tracked: TrackedAgent, error: Error) => void,
  ) {}

  wait(tracked: TrackedAgent, force = false): Promise<void> {
    if (tracked.info.status !== 'starting') {
      return Promise.reject(new Error('Lane stopped before memory admission'));
    }
    if (force || (this.queue.length === 0 &&
        this.released?.info.status !== 'starting' && this.canStart(tracked))) {
      return Promise.resolve();
    }
    tracked.info.waitingForMemory = true;
    clearTimeout(tracked.admissionTimer);
    tracked.admissionTimer = undefined;
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.queue.findIndex((entry) => entry.tracked === tracked);
        if (index < 0) return;
        this.queue.splice(index, 1);
        const error = new Error('Lane waited for memory and timed out');
        tracked.info.waitingForMemory = false;
        this.fail(tracked, error);
        reject(error);
        this.wake();
      }, this.timeoutMs());
      timeout.unref?.();
      this.queue.push({ tracked, resolve, reject, timeout });
      this.ensurePoll();
      this.wake();
    });
  }

  wake(fromPoll = false): void {
    for (let index = this.queue.length - 1; index >= 0; index--) {
      const entry = this.queue[index];
      if (entry.tracked.info.status === 'starting') continue;
      this.queue.splice(index, 1);
      clearTimeout(entry.timeout);
      entry.tracked.info.waitingForMemory = false;
      entry.reject(new Error('Lane stopped while waiting for memory'));
    }
    if (this.released && (this.released.info.status === 'starting' || !fromPoll)) {
      this.stopPollIfEmpty();
      return;
    }
    this.released = undefined;
    const head = this.queue[0];
    if (head && this.canStart(head.tracked)) {
      this.queue.shift();
      clearTimeout(head.timeout);
      head.tracked.info.waitingForMemory = false;
      this.released = head.tracked;
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

  private canStart(tracked: TrackedAgent): boolean {
    const threshold = this.minFreeMemoryGb();
    return threshold === 0 || this.freeMemory() >= threshold * 1024 ** 3 ||
      !this.otherActiveLanes(tracked);
  }

  private ensurePoll(): void {
    if (this.poll) return;
    this.poll = setInterval(() => this.wake(true), 1000);
    this.poll.unref?.();
  }
}
