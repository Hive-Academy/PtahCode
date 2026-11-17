import { inject, injectable } from 'tsyringe';
import { SessionStatsRepository } from '@ptah-extension/persistence-sqlite';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';

export interface UsageRepositoryIdentityResolver {
  resolve(worktreePath: string): Promise<{ repositoryId: string; worktreePath: string } | null>;
}

export const REPOSITORY_IDENTITY_BACKFILL_TOKENS = {
  resolver: Symbol.for('ptah.usage-analytics.repository-identity-resolver'),
} as const;

const PAGE_SIZE = 200;
const TRANSIENT_FAILURE = Symbol('transient-repository-identity-failure');

@injectable()
export class RepositoryIdentityBackfillService {
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private generation = 0;
  private inFlight: Promise<{ updated: number; unresolved: number }> | null = null;

  /** Enrich reactive ledger rows independently of transcript reconciliation. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.schedule(0, ++this.generation);
  }

  stop(): void {
    this.started = false;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private isCurrent(generation: number): boolean {
    return this.started && generation === this.generation;
  }

  private schedule(delayMs: number, generation: number): void {
    if (!this.isCurrent(generation)) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.isCurrent(generation)) return;
      this.timer = null;
      void this.runScheduled(generation);
    }, delayMs);
    this.timer.unref();
  }

  private async runScheduled(generation: number): Promise<void> {
    try {
      // TASK_2026_2254_b94b: a restarted lifecycle waits for cancelled work.
      if (this.inFlight) {
        try {
          await this.inFlight;
        } catch (error: unknown) {
          this.logger.debug('[UsageBackfill] Previous pass failed', {
            reason: error instanceof Error ? error.message : 'unknown',
          });
        }
      }
      if (!this.isCurrent(generation)) return;
      await this.runOnce();
    } catch (error: unknown) {
      this.logger.debug('[UsageBackfill] Scheduled pass failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
    } finally {
      if (this.isCurrent(generation)) this.schedule(60 * 60_000, generation);
    }
  }

  constructor(
    @inject(SessionStatsRepository) private readonly repository: SessionStatsRepository,
    @inject(REPOSITORY_IDENTITY_BACKFILL_TOKENS.resolver) private readonly resolver: UsageRepositoryIdentityResolver,
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'debug'>,
  ) {}

  runOnce(): Promise<{ updated: number; unresolved: number }> {
    if (this.inFlight) return this.inFlight;
    const pass = this.runPass(this.generation).finally(() => {
      if (this.inFlight === pass) this.inFlight = null;
    });
    this.inFlight = pass;
    return pass;
  }

  private async runPass(generation: number): Promise<{ updated: number; unresolved: number }> {
    let updated = 0;
    let unresolved = 0;
    let cursor = 0;
    const cache = new Map<string, { repositoryId: string; worktreePath: string } | null | typeof TRANSIENT_FAILURE>();
    while (generation === this.generation) {
      const page = await this.repository.getUnresolvedRepositoryUsagePage(cursor, PAGE_SIZE);
      if (generation !== this.generation) return { updated, unresolved };
      if (page.length === 0) return { updated, unresolved };
      const resolved: { rowId: number; repositoryId: string; worktreePath: string }[] = [];
      const failed: number[] = [];
      for (const row of page) {
        if (generation !== this.generation) return { updated, unresolved };
        cursor = row.rowId;
        if (!row.workspacePath) { unresolved++; continue; }
        if (!cache.has(row.workspacePath)) {
          try {
            const identity = await this.resolver.resolve(row.workspacePath);
            if (identity === null) this.logger.debug('[UsageBackfill] Repository identity unresolved');
            cache.set(row.workspacePath, identity);
          } catch (error: unknown) {
            this.logger.debug('[UsageBackfill] Repository identity probe failed', { reason: error instanceof Error ? error.name : 'unknown' });
            cache.set(row.workspacePath, TRANSIENT_FAILURE);
          }
        }
        const identity = cache.get(row.workspacePath);
        if (identity === TRANSIENT_FAILURE) { unresolved++; continue; }
        if (identity) resolved.push({ rowId: row.rowId, ...identity });
        else { unresolved++; failed.push(row.rowId); }
      }
      if (generation !== this.generation) return { updated, unresolved };
      updated += await this.repository.setRepositoryUsageIdentity(resolved);
      if (generation !== this.generation) return { updated, unresolved };
      await this.repository.markRepositoryUsageUnresolved(failed);
      if (page.length < PAGE_SIZE) return { updated, unresolved };
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return { updated, unresolved };
  }
}
