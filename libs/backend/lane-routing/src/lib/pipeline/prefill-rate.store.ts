const PREFILL_EWMA_ALPHA = 0.3;

/** In-memory System One throughput and in-flight state per decision target. */
export class PrefillRateStore {
  private readonly rates = new Map<string, number>();
  private readonly inFlight = new Set<string>();

  rate(target: string): number | undefined {
    return this.rates.get(target);
  }

  tryStart(target: string): boolean {
    if (this.inFlight.has(target)) return false;
    this.inFlight.add(target);
    return true;
  }

  finish(target: string): void {
    this.inFlight.delete(target);
  }

  recordCompleted(target: string, inputTokens: number, elapsedMs: number): void {
    const measured = inputTokens * 1000 / elapsedMs;
    if (!Number.isFinite(measured) || measured <= 0) return;
    const current = this.rates.get(target);
    this.rates.set(target, current === undefined
      ? measured
      : current + PREFILL_EWMA_ALPHA * (measured - current));
  }

  recordAbort(target: string, promptTokens: number, elapsedMs: number): void {
    const upperBound = promptTokens * 1000 / elapsedMs;
    if (!Number.isFinite(upperBound) || upperBound <= 0) return;
    this.rates.set(target, Math.min(this.rates.get(target) ?? upperBound, upperBound));
  }
}
