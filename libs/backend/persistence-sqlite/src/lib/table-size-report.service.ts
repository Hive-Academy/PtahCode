/**
 * SqliteTableSizeReportService — one non-destructive per-table size report.
 *
 * Asks the integrity worker (a separate process, database opened read-only) for
 * the largest b-trees from `dbstat`, then logs ONE line per process. Nothing
 * here deletes, vacuums or writes. The report waits for a quiet host through
 * the existing background-work governor, runs under a fixed time budget, and is
 * a silent no-op on a host that ships no integrity worker factory.
 */
import { inject, injectable } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import type { BackgroundWorkAdmission } from '@ptah-extension/vscode-core';
import { PERSISTENCE_TOKENS } from './di/tokens';
import { DbWorkerRunner } from './integrity/db-worker-runner';
import type { IIntegrityWorkerProcessFactory } from './integrity/worker-process.port';
import {
  asTableSizeResponse,
  TABLE_SIZE_TOP_N,
  type TableSizeRequest,
} from './integrity/table-size-protocol';

/** Hard time budget for the worker run; past it the worker is killed. */
export const TABLE_SIZE_BUDGET_MS = 60_000;

/** `whenClear` lane name; labels the governor's ceiling log line only. */
const GOVERNOR_LANE = 'sqlite-table-size-report';

@injectable()
export class SqliteTableSizeReportService {
  private started = false;

  constructor(
    @inject(PERSISTENCE_TOKENS.SQLITE_DB_PATH) private readonly dbPath: string,
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(DbWorkerRunner) private readonly runner: DbWorkerRunner,
    @inject(PERSISTENCE_TOKENS.INTEGRITY_WORKER_PROCESS_FACTORY, {
      isOptional: true,
    })
    private readonly factory: IIntegrityWorkerProcessFactory | null = null,
    @inject(TOKENS.BACKGROUND_WORK_GOVERNOR, { isOptional: true })
    private readonly governor: BackgroundWorkAdmission | null = null,
  ) {}

  /**
   * Report once per process. Never throws, never rejects. Returns after the
   * report is logged, skipped or abandoned.
   */
  async reportOnce(signal?: AbortSignal): Promise<void> {
    if (this.started || this.factory === null) return;
    this.started = true;
    try {
      if (!(await this.waitForQuietHost(signal))) return;
      await this.runReport(this.factory, signal);
    } catch (error: unknown) {
      this.logger.warn('[persistence-sqlite] table size report failed', {
        errorClass: error instanceof Error ? 'Error' : 'UnknownError',
      });
    }
  }

  /** `false` when the host is shutting down (the wait was aborted). */
  private async waitForQuietHost(signal?: AbortSignal): Promise<boolean> {
    if (this.governor === null) return true;
    try {
      await this.governor.whenClear({ lane: GOVERNOR_LANE, signal });
      return true;
    } catch (error: unknown) {
      // degradation-audit: reported - logged at warn; the report runs anyway (fail open).
      if (error instanceof Error && error.name === 'AbortError') return false;
      this.logger.warn(
        '[persistence-sqlite] table size report: background-work wait failed',
        { errorClass: error instanceof Error ? 'Error' : 'UnknownError' },
      );
      return true;
    }
  }

  private async runReport(
    factory: IIntegrityWorkerProcessFactory,
    signal?: AbortSignal,
  ): Promise<void> {
    const request: TableSizeRequest = {
      id: 1,
      type: 'table-size',
      dbPath: this.dbPath,
      topN: TABLE_SIZE_TOP_N,
    };
    const outcome = await this.runner.run(factory, {
      label: 'table-size',
      request,
      budgetMs: TABLE_SIZE_BUDGET_MS,
      narrow: asTableSizeResponse,
      signal,
    }).settled;
    if (outcome.aborted) return;
    const response = outcome.response;
    if (response === null) {
      this.logger.warn(
        '[persistence-sqlite] table size report abandoned — no reply within the budget',
        { budgetMs: TABLE_SIZE_BUDGET_MS },
      );
      return;
    }
    if (response.status === 'unavailable') {
      this.logger.info('[persistence-sqlite] table size report unavailable', {
        detail: response.detail,
      });
      return;
    }
    this.logger.info('[persistence-sqlite] table size report', {
      totalBytes: response.totalBytes,
      tables: response.tables.map((t) => ({
        name: t.name,
        bytes: t.bytes,
        pages: t.pages,
      })),
      durationMs: response.durationMs,
    });
  }
}
