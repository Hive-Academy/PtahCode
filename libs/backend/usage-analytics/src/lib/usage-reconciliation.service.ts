import { setImmediate as yieldImmediate } from 'node:timers/promises';
import { inject, injectable } from 'tsyringe';
import { ZodError } from 'zod';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import type { SessionUsageContribution, UsageReconciliationTrigger } from '@ptah-extension/platform-core';

export interface ReconciliationCursor {
  sourceId: string;
  sourcePath: string;
  fingerprint: string;
  mtimeMs: number;
  byteOffset: number;
  lastEventKey: string | null;
}

export interface ReconciliationCollector {
  readonly sourceId: 'claude-jsonl' | 'codex-rollout';
  collect(path: string, cursor: ReconciliationCursor | null, budgetBytes: number): Promise<{
    events: readonly SessionUsageContribution[];
    next: ReconciliationCursor;
    more: boolean;
  }>;
}

export interface ReconciliationCursorStore {
  load(sourceId: string, sourcePath: string): Promise<ReconciliationCursor | null>;
  commit(cursor: ReconciliationCursor, events: readonly SessionUsageContribution[]): Promise<void>;
}

export interface ReconciliationSources {
  listClaudeRoots(): Promise<readonly string[]>;
  listCodexRoots(): Promise<readonly string[]>;
  listClaudeFiles(root: string): AsyncIterable<string>;
  listCodexFiles(root: string): AsyncIterable<string>;
  realpath(path: string): Promise<string>;
}

export const USAGE_RECONCILIATION_TOKENS = {
  CLAUDE_COLLECTOR: Symbol.for('UsageReconciliationClaudeCollector'),
  CODEX_COLLECTOR: Symbol.for('UsageReconciliationCodexCollector'),
  SOURCES: Symbol.for('UsageReconciliationSources'),
  CURSOR_STORE: Symbol.for('UsageReconciliationCursorStore'),
} as const;

const BYTE_BUDGET = 1024 * 1024;
const DEBOUNCE_MS = 2_000;
const ACTIVE_IDLE_MS = 15 * 60_000;
const QUIET_IDLE_MS = 60 * 60_000;

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

function isFileChanged(error: unknown): boolean {
  return error instanceof Error && error.message === 'File changed';
}

@injectable()
export class UsageReconciliationService implements UsageReconciliationTrigger {
  private started = false;
  private running = false;
  private followUp = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private firstTimer: NodeJS.Timeout | null = null;
  private idleDelayMs = ACTIVE_IDLE_MS;
  private afterPass?: () => Promise<void>;
  private readonly collectors: readonly ReconciliationCollector[];

  constructor(
    @inject(USAGE_RECONCILIATION_TOKENS.CLAUDE_COLLECTOR) claude: ReconciliationCollector,
    @inject(USAGE_RECONCILIATION_TOKENS.CODEX_COLLECTOR) codex: ReconciliationCollector,
    @inject(USAGE_RECONCILIATION_TOKENS.SOURCES) private readonly sources: ReconciliationSources,
    @inject(USAGE_RECONCILIATION_TOKENS.CURSOR_STORE) private readonly cursors: ReconciliationCursorStore,
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'debug' | 'warn' | 'error'>,
  ) {
    this.collectors = [claude, codex];
  }

  setAfterPass(fn: () => Promise<void>): void {
    this.afterPass = fn;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.idleDelayMs = ACTIVE_IDLE_MS;
    this.firstTimer = setTimeout(() => {
      this.firstTimer = null;
      this.requestPass();
    }, 0);
    this.firstTimer.unref();
  }

  stop(): void {
    this.started = false;
    this.followUp = false;
    if (this.firstTimer) clearTimeout(this.firstTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.firstTimer = this.debounceTimer = this.idleTimer = null;
  }

  enqueue(_event: Parameters<UsageReconciliationTrigger['enqueue']>[0]): void {
    if (!this.started) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.idleDelayMs = ACTIVE_IDLE_MS;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.requestPass();
    }, DEBOUNCE_MS);
    this.debounceTimer.unref();
  }

  private requestPass(): void {
    if (!this.started) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.running) {
      this.followUp = true;
      return;
    }
    void this.runPass();
  }

  private async runPass(): Promise<void> {
    this.running = true;
    let changed = false;
    try {
      changed = await this.scan();
    } catch (error: unknown) {
      this.logger.error('Usage reconciliation pass failed', error instanceof Error ? error : new Error('Unknown reconciliation failure'));
    } finally {
      if (this.afterPass) {
        try {
          await this.afterPass();
        } catch (error: unknown) {
          this.logger.error('Usage reconciliation after-pass hook failed', error instanceof Error ? error : new Error('Unknown after-pass failure'));
        }
      }
      this.running = false;
      if (this.started) {
        if (this.followUp) {
          this.followUp = false;
          this.requestPass();
        } else {
          const delay = changed ? ACTIVE_IDLE_MS : this.idleDelayMs;
          this.idleDelayMs = changed ? ACTIVE_IDLE_MS : QUIET_IDLE_MS;
          this.idleTimer = setTimeout(() => this.requestPass(), delay);
          this.idleTimer.unref();
        }
      }
    }
  }

  private async scan(): Promise<boolean> {
    const roots = await Promise.all([this.sources.listClaudeRoots(), this.sources.listCodexRoots()]);
    const seen = new Set<string>();
    let changed = false;
    for (let index = 0; index < this.collectors.length; index++) {
      for (const root of roots[index]) {
        try {
          const files = index === 0 ? this.sources.listClaudeFiles(root) : this.sources.listCodexFiles(root);
          for await (const file of files) {
            if (!this.started) return changed;
            let canonical: string;
            try {
              canonical = await this.sources.realpath(file);
            } catch (error: unknown) {
              if (isMissing(error)) continue;
              throw error;
            }
            if (seen.has(canonical)) continue;
            seen.add(canonical);
            changed = await this.scanFile(this.collectors[index], canonical) || changed;
            await yieldImmediate();
          }
        } catch (error: unknown) {
          if (isMissing(error)) continue;
          this.logger.warn('Usage reconciliation root scan failed', error);
        }
      }
    }
    return changed;
  }

  private async scanFile(collector: ReconciliationCollector, file: string): Promise<boolean> {
    let cursor = await this.cursors.load(collector.sourceId, file);
    let changed = false;
    while (this.started) {
      try {
        const chunk = await collector.collect(file, cursor, BYTE_BUDGET);
        await this.commitChunk(chunk.next, chunk.events, cursor);
        changed = changed || chunk.events.length > 0;
        if (!chunk.more || chunk.next.byteOffset === cursor?.byteOffset) break;
        cursor = chunk.next;
        await yieldImmediate();
      } catch (error: unknown) {
        if (isFileChanged(error)) this.logger.debug('Usage source changed during read; retrying later');
        else if (isMissing(error)) this.logger.debug('Usage source disappeared during read');
        else this.logger.warn('Usage reconciliation file scan failed', error);
        break;
      }
    }
    return changed;
  }

  private async commitChunk(next: ReconciliationCursor, events: readonly SessionUsageContribution[], previous: ReconciliationCursor | null): Promise<void> {
    try {
      await this.cursors.commit(next, events);
    } catch (error: unknown) {
      if (!(error instanceof ZodError)) throw error;
      let dropped = 0;
      const stationary = previous ?? { ...next, byteOffset: 0, lastEventKey: null };
      for (const event of events) {
        try {
          await this.cursors.commit(stationary, [event]);
        } catch (individualError: unknown) {
          if (!(individualError instanceof ZodError)) throw individualError;
          dropped++;
        }
      }
      await this.cursors.commit(next, []);
      this.logger.warn(`Usage reconciliation dropped ${dropped} invalid events`);
    }
  }
}
