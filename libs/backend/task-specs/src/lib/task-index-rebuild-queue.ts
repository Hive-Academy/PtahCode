export interface RebuildResult {
  indexedCount: number;
  excludedCount: number;
  indexWritten: boolean;
}

interface Job {
  root: string;
  queuedAt: number;
  folders: Set<string>;
  forceFull: boolean;
  run: (folders: string[], forceFull: boolean) => Promise<RebuildResult>;
  resolve: (value: RebuildResult) => void;
  reject: (error: Error) => void;
}

/** Fair, bounded scheduler for full workspace scans. */
export class TaskIndexRebuildQueue {
  private readonly waiting = new Map<string, Job>();
  private readonly active = new Set<string>();
  private readonly trailing = new Map<string, Job>();
  private disposed = false;

  constructor(private readonly onStart?: (waitedMs: number, depth: number) => void) {}

  enqueue(root: string, run: (folders: string[], forceFull: boolean) => Promise<RebuildResult>, folders: string[] = [], forceFull = false): Promise<RebuildResult> {
    if (this.disposed) return Promise.reject(new Error('Task index rebuild queue disposed'));
    return new Promise<RebuildResult>((resolve, reject) => {
      const job: Job = { root, queuedAt: performance.now(), folders: new Set(folders), forceFull, run, resolve, reject };
      if (this.active.has(root)) {
        const previous = this.trailing.get(root);
        if (previous) this.mergeSuperseded(previous, job);
        this.trailing.set(root, job);
      } else {
        const previous = this.waiting.get(root);
        if (previous) this.mergeSuperseded(previous, job);
        else if (this.waiting.size >= 64) {
          reject(new Error('Task index rebuild queue full'));
          return;
        }
        this.waiting.set(root, job);
      }
      this.drain();
    });
  }

  private mergeSuperseded(previous: Job, replacement: Job): void {
    for (const folder of previous.folders) replacement.folders.add(folder);
    replacement.forceFull ||= previous.forceFull;
    const resolve = replacement.resolve;
    const reject = replacement.reject;
    replacement.resolve = (value) => { resolve(value); previous.resolve(value); };
    replacement.reject = (error) => { reject(error); previous.reject(error); };
  }

  private drain(): void {
    while (!this.disposed && this.active.size < 2 && this.waiting.size > 0) {
      const [root, job] = this.waiting.entries().next().value as [string, Job];
      this.waiting.delete(root);
      this.active.add(root);
      this.onStart?.(performance.now() - job.queuedAt, this.waiting.size);
      void job.run([...job.folders], job.forceFull).then(job.resolve, (error: unknown) => job.reject(
        error instanceof Error ? error : new Error(String(error)),
      )).finally(() => {
        this.active.delete(root);
        const next = this.trailing.get(root);
        if (next && !this.disposed) {
          this.trailing.delete(root);
          this.waiting.set(root, next);
        }
        this.drain();
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    const error = new Error('Task index rebuild queue disposed');
    for (const job of this.waiting.values()) job.reject(error);
    for (const job of this.trailing.values()) job.reject(error);
    this.waiting.clear();
    this.trailing.clear();
  }
}
