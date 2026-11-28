import { isSetupRunStepOf } from '../setup-run-persistence';
import type { SetupRunRecord } from '../setup-run.types';
import type { SetupRunReport } from './setup-run-host';

/** Apply a workflow report's fields before evaluating the terminal transition. */
export function applyReportFields<T extends SetupRunRecord>(
  record: T,
  update: SetupRunReport,
): T {
  const next: T = { ...record };
  if (update.status !== undefined) next.status = update.status;
  if (update.step !== undefined) {
    if (isSetupRunStepOf(record.workflow, update.step)) {
      next.step = update.step;
    } else {
      console.warn(
        `[SetupRunStore] Ignored step "${update.step}" for ${record.workflow}.`,
      );
    }
  }
  if (update.backendRunId !== undefined) {
    if (update.backendRunId !== record.backendRunId) delete next.agentsWritten;
    next.backendRunId = update.backendRunId;
  }
  if (update.analysisRunId !== undefined) {
    if (update.analysisRunId !== record.analysisRunId)
      delete next.analysisFreshness;
    next.analysisRunId = update.analysisRunId;
  }
  if (update.error === null) delete next.error;
  else if (update.error !== undefined) next.error = update.error;
  if (record.workflow === 'team-builder') {
    if (update.handoffTabId !== undefined) {
      next.handoffTabId = update.handoffTabId;
    }
    if (update.teamBuilder !== undefined) {
      const selectedIds =
        update.teamBuilder.selectedIds ?? record.teamBuilder?.selectedIds;
      next.teamBuilder = {
        ...record.teamBuilder,
        ...update.teamBuilder,
        installed: [...update.teamBuilder.installed],
        ...(selectedIds ? { selectedIds: [...selectedIds] } : {}),
      };
    }
  }
  return next;
}
