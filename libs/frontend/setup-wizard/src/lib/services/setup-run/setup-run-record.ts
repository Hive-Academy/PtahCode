import { isSetupRunStepOf } from '../setup-run-persistence';
import type { SetupRunRecord } from '../setup-run.types';
import type { SetupRunReport } from './setup-run-host';

/** Apply a workflow report's fields before evaluating the terminal transition. */
export function applyReportFields(
  record: SetupRunRecord,
  update: SetupRunReport,
): SetupRunRecord {
  const next: SetupRunRecord = { ...record };
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
    next.backendRunId = update.backendRunId;
  }
  if (update.analysisRunId !== undefined) {
    next.analysisRunId = update.analysisRunId;
  }
  if (update.error === null) delete next.error;
  else if (update.error !== undefined) next.error = update.error;
  if (record.workflow === 'team-builder') {
    if (update.handoffTabId !== undefined) {
      next.handoffTabId = update.handoffTabId;
    }
    if (update.teamBuilder !== undefined) {
      next.teamBuilder = {
        intent: update.teamBuilder.intent,
        installed: [...update.teamBuilder.installed],
      };
    }
  }
  return next;
}
