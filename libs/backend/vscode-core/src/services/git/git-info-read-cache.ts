import type { GitInfoResult } from '@ptah-extension/shared';
import type { Logger } from '../../logging';

const TTL_MS = 2_500;
const MAX_ROOTS = 32;
const SUMMARY_MS = 60_000;

interface Flight {
  running: Promise<GitInfoResult>;
  generation: number;
  trailing?: {
    promise: Promise<GitInfoResult>;
    compute: () => Promise<GitInfoResult>;
    resolve: (value: GitInfoResult) => void;
    reject: (reason: unknown) => void;
  };
}

/** Success TTL and one running plus one trailing read per root. */
export class GitInfoReadCache {
  private readonly entries = new Map<string, { value: GitInfoResult; until: number }>();
  private readonly flights = new Map<string, Flight>();
  private readonly generations = new Map<string, number>();
  private generation = 0;
  private allGeneration = 0;
  private lastSummary = Date.now();
  private hits = 0;
  private joins = 0;
  private misses = 0;
  private invalidations = 0;
  private reads = 0;
  private durationMs = 0;

  constructor(private readonly logger: Pick<Logger, 'info'>) {}

  invalidate(root?: string): void {
    this.generation++;
    this.invalidations++;
    if (root) {
      this.entries.delete(root);
      if (this.flights.has(root)) this.generations.set(root, this.generation);
    } else {
      this.entries.clear();
      this.generations.clear();
      this.allGeneration = this.generation;
    }
    this.summarize();
  }

  read(root: string, compute: () => Promise<GitInfoResult>): Promise<GitInfoResult> {
    const entry = this.entries.get(root);
    if (entry && entry.until > Date.now()) {
      this.entries.delete(root);
      this.entries.set(root, entry);
      this.hits++;
      this.summarize();
      return Promise.resolve(entry.value);
    }
    return this.joinOrStart(root, compute);
  }

  /** Watcher reads bypass the TTL after their caller invalidates the root. */
  refresh(root: string, compute: () => Promise<GitInfoResult>): Promise<GitInfoResult> {
    return this.joinOrStart(root, compute);
  }

  private joinOrStart(root: string, compute: () => Promise<GitInfoResult>): Promise<GitInfoResult> {
    const flight = this.flights.get(root);
    if (!flight) {
      this.misses++;
      this.summarize();
      return this.start(root, compute);
    }
    this.joins++;
    this.summarize();
    if (flight.generation >= this.generationOf(root)) return flight.running;
    if (!flight.trailing) {
      let resolve!: (value: GitInfoResult) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<GitInfoResult>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      flight.trailing = { promise, compute, resolve, reject };
    }
    return flight.trailing.promise;
  }

  private start(root: string, compute: () => Promise<GitInfoResult>): Promise<GitInfoResult> {
    const generation = this.generation;
    const started = Date.now();
    // Promise executor catches synchronous throws while starting compute immediately.
    const running = new Promise<GitInfoResult>((resolve) => resolve(compute()));
    const flight: Flight = this.flights.get(root) ?? { running, generation };
    flight.running = running;
    flight.generation = generation;
    this.flights.set(root, flight);

    running.then(
      (value) => {
        if (generation >= this.generationOf(root) && !value.statusUnavailable) {
          this.entries.delete(root);
          this.entries.set(root, { value, until: Date.now() + TTL_MS });
          if (this.entries.size > MAX_ROOTS) {
            const oldest = this.entries.keys().next().value;
            if (oldest !== undefined) this.entries.delete(oldest);
          }
        }
        this.settle(root, flight, running);
      },
      () => this.settle(root, flight, running),
    ).finally(() => {
      this.reads++;
      this.durationMs += Date.now() - started;
      this.summarize();
    });
    return running;
  }

  private settle(root: string, flight: Flight, running: Promise<GitInfoResult>): void {
    if (this.flights.get(root) !== flight || flight.running !== running) return;
    const trailing = flight.trailing;
    if (!trailing) {
      this.flights.delete(root);
      this.generations.delete(root);
      return;
    }
    flight.trailing = undefined;
    this.start(root, trailing.compute).then(trailing.resolve, trailing.reject);
  }

  private generationOf(root: string): number {
    return Math.max(this.allGeneration, this.generations.get(root) ?? 0);
  }

  private summarize(): void {
    if (Date.now() - this.lastSummary < SUMMARY_MS) return;
    if (this.hits + this.joins + this.misses + this.invalidations === 0) return;
    this.logger.info('[GitInfoReadCache] reads', {
      hits: this.hits,
      joins: this.joins,
      misses: this.misses,
      invalidations: this.invalidations,
      reads: this.reads,
      durationMs: this.durationMs,
      roots: this.entries.size,
    });
    this.hits = this.joins = this.misses = this.invalidations = this.reads = this.durationMs = 0;
    this.lastSummary = Date.now();
  }
}
