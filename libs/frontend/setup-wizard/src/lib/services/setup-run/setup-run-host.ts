import type { SetupGenerationTabBinding } from '@ptah-extension/shared';
import type {
  GuidanceHandoffState,
  StoredSetupRunRecord,
} from '../setup-run-persistence';
import type {
  SetupRunRecord,
  SetupRunStatus,
  SetupRunStep,
} from '../setup-run.types';
import { SETUP_RUN_POLL_INTERVAL_MS } from './setup-run-poll';

/** A state change reported by a workflow owner (event adapter, stores, pages). */
export interface SetupRunReport {
  status?: SetupRunStatus;
  step?: SetupRunStep;
  backendRunId?: string;
  analysisRunId?: string;
  /** User-facing text only; `null` clears it. */
  error?: string | null;
  handoffTabId?: string;
  teamBuilder?: { intent: string; installed: string[] };
}

/** Record operations shared by the workflow coordinators. */
export interface SetupRunRecordHost {
  get(id: string): StoredSetupRunRecord | null;
  runsFor(workspacePath: string | null | undefined): StoredSetupRunRecord[];
  workspacePath(): string | null;
  isCancelling(id: string): boolean;
  setCancelling(id: string, on: boolean): void;
  insert(record: SetupRunRecord): void;
  apply(
    id: string,
    update: SetupRunReport,
    correction?: boolean,
    finalizationRunId?: string,
  ): void;
  patch(
    id: string,
    change: (record: StoredSetupRunRecord) => StoredSetupRunRecord,
  ): void;
  adopt(binding: SetupGenerationTabBinding): SetupRunRecord | null;
  markLiveThisSession(id: string): void;
  isLiveThisSession(id: string): boolean;
  setGuidanceHandoff(id: string, state: GuidanceHandoffState): void;
}

const LIVE_STATUSES: ReadonlySet<SetupRunStatus> = new Set([
  'running',
  'needs-input',
]);

/** Fixed user copy; raw backend text never reaches a record. */
export const FAILURE_COPY = {
  analysis: 'The analysis did not finish.',
  'skill-review': 'Could not load skill recommendations.',
};

export const ORPHAN_GRACE_MS = 2 * SETUP_RUN_POLL_INTERVAL_MS;

export function isLive(record: SetupRunRecord): boolean {
  return LIVE_STATUSES.has(record.status);
}

export function newRunId(): string {
  return `setup-${crypto.randomUUID()}`;
}
