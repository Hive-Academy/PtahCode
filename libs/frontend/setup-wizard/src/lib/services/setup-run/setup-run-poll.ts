/** Matches the runner's `BACKEND_POLL_INTERVAL_MS`. */
export const SETUP_RUN_POLL_INTERVAL_MS = 2500;

/** A workspace switch invalidates any in-flight tick before scheduling the next. */
export class SetupRunPoll {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private revision = 0;

  public constructor(
    private readonly interval: number,
    private readonly needed: () => boolean,
    private readonly tick: () => Promise<unknown>,
  ) {}

  public ensure(): void {
    if (this.timer !== null) return;
    const revision = this.revision;
    this.timer = setTimeout(() => void this.poll(revision), this.interval);
  }

  public stop(): void {
    this.revision++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private async poll(revision: number): Promise<void> {
    if (revision !== this.revision) return;
    try {
      await this.tick();
    } finally {
      if (revision === this.revision) {
        this.timer = null;
        if (this.needed()) this.ensure();
      }
    }
  }
}
