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

@injectable()
export class RepositoryIdentityBackfillService {
  constructor(
    @inject(SessionStatsRepository) private readonly repository: SessionStatsRepository,
    @inject(REPOSITORY_IDENTITY_BACKFILL_TOKENS.resolver) private readonly resolver: UsageRepositoryIdentityResolver,
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'debug'>,
  ) {}

  async runOnce(): Promise<{ updated: number; unresolved: number }> {
    let updated = 0;
    let unresolved = 0;
    let cursor = 0;
    const cache = new Map<string, { repositoryId: string; worktreePath: string } | null>();
    while (true) {
      const page = await this.repository.getUnresolvedRepositoryUsagePage(cursor, PAGE_SIZE);
      if (page.length === 0) return { updated, unresolved };
      const resolved: { rowId: number; repositoryId: string; worktreePath: string }[] = [];
      for (const row of page) {
        cursor = row.rowId;
        if (!row.workspacePath) { unresolved++; continue; }
        if (!cache.has(row.workspacePath)) {
          try {
            const identity = await this.resolver.resolve(row.workspacePath);
            if (identity === null) this.logger.debug('[UsageBackfill] Repository identity unresolved');
            cache.set(row.workspacePath, identity);
          } catch (error: unknown) {
            this.logger.debug('[UsageBackfill] Repository identity unresolved', { reason: error instanceof Error ? error.name : 'unknown' });
            cache.set(row.workspacePath, null);
          }
        }
        const identity = cache.get(row.workspacePath);
        if (identity) resolved.push({ rowId: row.rowId, ...identity });
        else unresolved++;
      }
      updated += await this.repository.setRepositoryUsageIdentity(resolved);
      if (page.length < PAGE_SIZE) return { updated, unresolved };
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
}
