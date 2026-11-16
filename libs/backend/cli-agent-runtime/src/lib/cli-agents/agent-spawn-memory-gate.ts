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
    if (force || (this.queue.length === 0 && this.canStart(tracked))) {
      return Promise.resolve();
    }
    tracked.info.waitingForMemory = true;
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

  wake(): void {
    while (this.queue.length > 0) {
      const head = this.queue[0];
      if (head.tracked.info.status !== 'starting') {
        this.queue.shift();
        clearTimeout(head.timeout);
        head.tracked.info.waitingForMemory = false;
        head.reject(new Error('Lane stopped while waiting for memory'));
        continue;
      }
      if (!this.canStart(head.tracked)) break;
      this.queue.shift();
      clearTimeout(head.timeout);
      head.tracked.info.waitingForMemory = false;
      head.resolve();
    }
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
    this.poll = setInterval(() => this.wake(), 1000);
    this.poll.unref?.();
  }
}
