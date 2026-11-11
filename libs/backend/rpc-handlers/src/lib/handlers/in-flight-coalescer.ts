/**
 * InFlightCoalescer — share one running promise between identical callers.
 *
 * A call with a key that is already running receives the running promise. The
 * entry is removed when the promise settles (success or failure), so nothing
 * is cached beyond the in-flight window and a failure is never sticky.
 */
export class InFlightCoalescer<T> {
  private readonly running = new Map<string, { promise: Promise<T>; startedAt: number }>();

  constructor(
    private readonly maxJoinAgeMs = 5_000,
    private readonly now: () => number = () => performance.now(),
  ) {}

  run(key: string, start: () => Promise<T>): Promise<T> {
    const existing = this.running.get(key);
    const startedAt = this.now();
    if (existing !== undefined && startedAt - existing.startedAt < this.maxJoinAgeMs) {
      return existing.promise;
    }
    const promise = start().finally(() => {
      if (this.running.get(key)?.promise === promise) this.running.delete(key);
    });
    this.running.set(key, { promise, startedAt });
    return promise;
  }
}
