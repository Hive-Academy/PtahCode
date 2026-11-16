export type SpawnStep = 'detectionMs' | 'validationMs' | 'preflightMs' |
  'mcpPortMs' | 'resumeGateMs' | 'runSdkMs' | 'trackMs';

export class SpawnStepTiming {
  private readonly started = performance.now();
  private previous = this.started;
  private readonly elapsed: Record<SpawnStep, number | null> = {
    detectionMs: null, validationMs: null, preflightMs: null,
    mcpPortMs: null, resumeGateMs: null, runSdkMs: null, trackMs: null,
  };

  mark(step: SpawnStep): void {
    const now = performance.now();
    this.elapsed[step] = Math.round(now - this.previous);
    this.previous = now;
  }

  result(): Record<SpawnStep | 'totalMs', number | null> {
    return { ...this.elapsed, totalMs: Math.round(performance.now() - this.started) };
  }
}
