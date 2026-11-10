/**
 * Start the one-shot table size report once the database is migrated.
 *
 * Thin wiring only: the service itself waits for a quiet host through the
 * background-work governor, runs in the integrity worker and logs once. This
 * function never awaits it, so boot does not wait. A host without the service
 * (or without a worker factory) does nothing.
 */
import type { DependencyContainer } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { PERSISTENCE_TOKENS } from '@ptah-extension/persistence-sqlite';

/** The part of `SqliteTableSizeReportService` this step uses. */
interface TableSizeReporter {
  reportOnce(signal?: AbortSignal): Promise<void>;
}

export function startTableSizeReportAfterMigrations(
  container: DependencyContainer,
  signal?: AbortSignal,
): void {
  if (!container.isRegistered(PERSISTENCE_TOKENS.SQLITE_TABLE_SIZE_REPORT)) {
    return;
  }
  const logger = container.resolve<Logger>(TOKENS.LOGGER);
  try {
    const reporter = container.resolve<TableSizeReporter>(
      PERSISTENCE_TOKENS.SQLITE_TABLE_SIZE_REPORT,
    );
    // degradation-audit: reported - reportOnce never rejects; the guard logs
    // a future rejection at warn and the boot goes on.
    void reporter.reportOnce(signal).catch((error: unknown) => {
      logger.warn('[Ptah Electron] Table size report failed (non-fatal)', {
        errorClass: error instanceof Error ? 'Error' : 'UnknownError',
      });
    });
  } catch (error: unknown) {
    // degradation-audit: reported - logged at warn; the report is optional.
    logger.warn('[Ptah Electron] Table size report could not start (non-fatal)', {
      errorClass: error instanceof Error ? 'Error' : 'UnknownError',
    });
  }
}
