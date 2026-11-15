import { setImmediate as yieldImmediate } from 'node:timers/promises';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
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
  loadDiscoveryKey?(): Promise<string | null>;
  saveDiscoveryKey?(key: string | null): Promise<void>;
}

export interface ReconciliationSources {
  listClaudeRoots(): Promise<readonly string[]>;
  listCodexRoots(): Promise<readonly string[]>;
  listClaudeFiles(root: string, startAfter?: string): AsyncIterable<string>;
  listCodexFiles(root: string, startAfter?: string): AsyncIterable<string>;
  realpath(path: string): Promise<string>;
}

export const USAGE_RECONCILIATION_TOKENS = {
  CLAUDE_COLLECTOR: Symbol.for('UsageReconciliationClaudeCollector'),
  CODEX_COLLECTOR: Symbol.for('UsageReconciliationCodexCollector'),
  SOURCES: Symbol.for('UsageReconciliationSources'),
  CURSOR_STORE: Symbol.for('UsageReconciliationCursorStore'),
} as const;

const BYTE_BUDGET = 1024 * 1024;
const PASS_FILE_BUDGET = 16;
const PASS_DISCOVERY_BUDGET = 64;
const PASS_BYTE_BUDGET = 4 * BYTE_BUDGET;
const MAX_PENDING_PASSES = 4;
const DEBOUNCE_MS = 2_000;
const CONTINUATION_MS = 2_001;
const ACTIVE_IDLE_MS = 15 * 60_000;
const QUIET_IDLE_MS = 60 * 60_000;
const discoveryKeySchema = z.object({ source: z.number().int().min(0).max(1), root: z.string().min(1), file: z.string().min(1), pending: z.boolean().optional(), pendingPasses: z.number().int().min(0).optional() });

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
  private discoveryKey: z.infer<typeof discoveryKeySchema> | null = null;
  private discoveryLoaded = false;
  private running = false;
  private followUp = false;
  private passIncomplete = false;
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
    this.passIncomplete = false;
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
          const delay = this.passIncomplete ? CONTINUATION_MS : changed ? ACTIVE_IDLE_MS : this.idleDelayMs;
          this.idleDelayMs = changed ? ACTIVE_IDLE_MS : QUIET_IDLE_MS;
          this.idleTimer = setTimeout(() => this.requestPass(), delay);
          this.idleTimer.unref();
        }
      }
    }
  }

  private async scan(): Promise<boolean> {
    if (!this.discoveryLoaded) {
      const saved = await this.cursors.loadDiscoveryKey?.();
      if (saved) {
        this.discoveryKey = discoveryKeySchema.parse(JSON.parse(saved));
      }
      this.discoveryLoaded = true;
    }
    const roots = await Promise.all([this.sources.listClaudeRoots(), this.sources.listCodexRoots()]);
    const seen = new Set<string>();
    let changed = false;
    if (this.discoveryKey?.pending) {
      const { source, root, file } = this.discoveryKey;
      try {
        const canonical = await this.sources.realpath(file);
        const result = await this.scanFile(this.collectors[source], canonical, PASS_BYTE_BUDGET);
        changed = result.changed;
        if (!result.complete && result.bytes >= PASS_BYTE_BUDGET) {
          const pendingPasses = (this.discoveryKey.pendingPasses ?? 0) + 1;
          this.discoveryKey = pendingPasses >= MAX_PENDING_PASSES
            ? { source, root, file }
            : { source, root, file, pending: true, pendingPasses };
          await this.cursors.saveDiscoveryKey?.(JSON.stringify(this.discoveryKey));
          this.passIncomplete = true;
          return changed;
        }
      } catch (error: unknown) {
        if (!isMissing(error)) throw error;
      }
      this.discoveryKey = { source, root, file };
      await this.cursors.saveDiscoveryKey?.(JSON.stringify(this.discoveryKey));
      // Discovery resumes after this file, so continue without the idle wait.
      this.passIncomplete = true;
      return changed;
    }
    let visited = 0;
    let spentBytes = 0;
    let enumerated = 0;
    for (let index = 0; index < this.collectors.length; index++) {
      for (const root of [...roots[index]].sort().reverse()) {
        if (this.discoveryKey && (index < this.discoveryKey.source ||
          (index === this.discoveryKey.source && root > this.discoveryKey.root))) continue;
        try {
          const startAfter = this.discoveryKey?.source === index && this.discoveryKey.root === root
            ? this.discoveryKey.file : undefined;
          const files = index === 0 ? this.sources.listClaudeFiles(root, startAfter) : this.sources.listCodexFiles(root, startAfter);
          for await (const file of files) {
            if (!this.started) return changed;
            if (visited >= PASS_FILE_BUDGET || spentBytes >= PASS_BYTE_BUDGET || enumerated >= PASS_DISCOVERY_BUDGET) {
              await this.cursors.saveDiscoveryKey?.(JSON.stringify(this.discoveryKey));
              this.passIncomplete = true;
              return changed;
            }
            enumerated++;
            let canonical: string;
            try {
              canonical = await this.sources.realpath(file);
            } catch (error: unknown) {
              if (isMissing(error)) {
                this.discoveryKey = { source: index, root, file };
                continue;
              }
              throw error;
            }
            this.discoveryKey = { source: index, root, file };
            if (seen.has(canonical)) continue;
            seen.add(canonical);
            visited++;
            const result = await this.scanFile(this.collectors[index], canonical, PASS_BYTE_BUDGET - spentBytes);
            spentBytes += result.bytes;
            changed = result.changed || changed;
            if (!result.complete && spentBytes >= PASS_BYTE_BUDGET) {
              this.discoveryKey = { source: index, root, file, pending: true, pendingPasses: 1 };
              await this.cursors.saveDiscoveryKey?.(JSON.stringify(this.discoveryKey));
              this.passIncomplete = true;
              return changed;
            }
            await yieldImmediate();
          }
        } catch (error: unknown) {
          if (isMissing(error)) continue;
          this.logger.warn('Usage reconciliation root scan failed', error);
        }
      }
    }
    this.discoveryKey = null;
    await this.cursors.saveDiscoveryKey?.(null);
    return changed;
  }

  private async scanFile(collector: ReconciliationCollector, file: string, remainingBytes: number): Promise<{ changed: boolean; bytes: number; complete: boolean }> {
    let cursor = await this.cursors.load(collector.sourceId, file);
    let changed = false;
    let bytes = 0;
    let complete = false;
    while (this.started && bytes < remainingBytes) {
      try {
        const chunk = await collector.collect(file, cursor, Math.min(BYTE_BUDGET, remainingBytes - bytes));
        await this.cursors.commit(chunk.next, chunk.events);
        changed = changed || chunk.events.length > 0;
        bytes += Math.max(0, chunk.next.byteOffset - (cursor?.byteOffset ?? 0));
        if (!chunk.more || chunk.next.byteOffset === cursor?.byteOffset) {
          complete = true;
          break;
        }
        cursor = chunk.next;
        await yieldImmediate();
      } catch (error: unknown) {
        if (isFileChanged(error)) this.logger.debug('Usage source changed during read; retrying later');
        else if (isMissing(error)) this.logger.debug('Usage source disappeared during read');
        else this.logger.warn(`Usage reconciliation file scan failed at ${file}:${cursor?.byteOffset ?? 0}`, error);
        break;
      }
    }
    return { changed, bytes, complete };
  }
}
