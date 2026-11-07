/**
 * @ptah-extension/task-end-hook — journals task-end transitions and runs the
 * report-only end-of-task steps (TASK_2026_886).
 */

// DI tokens
export { TASK_END_TOKENS, type TaskEndDIToken } from './lib/di/tokens';

// Host ports
export type { CurationPort } from './lib/ports/curation.port';
export type {
  HarvestPort,
  TaskEndHarvestPortResult,
} from './lib/ports/harvest.port';
export type { CensusPort } from './lib/ports/census.port';
export type { SessionLinkPort } from './lib/ports/session-link.port';
export type {
  ActivityPort,
  TaskEndProbeResult,
} from './lib/ports/activity.port';
export type {
  PrStatusPort,
  TaskEndPrStatus,
} from './lib/ports/pr-status.port';
export type {
  GitReadResult,
  GitReadRunner,
  GitReadRunOptions,
} from './lib/ports/git-read-runner.port';

// Persistence contract
export type {
  ITaskEndStore,
  TaskEndBaselineEntry,
  TaskEndDedupeKey,
  TaskEndDeferredCensusStep,
  TaskEndEntryResult,
  TaskEndExpandableStep,
  TaskEndObservation,
  TaskEndObservationClass,
  TaskEndPendingCensus,
  TaskEndRunLookup,
  TaskEndRunPolicy,
} from './lib/persistence/task-end-store.interface';

// Registration and runtime (host composition roots)
export {
  registerTaskEndHook,
  connectTaskEndHook,
  type TaskEndHookHandle,
} from './lib/di/register';
export type { TaskEndTransitionDetector } from './lib/trigger/task-end-transition-detector';
export type { TaskEndRunWorker } from './lib/worker/task-end-run-worker';
export type { TaskEndRunReader } from './lib/read/task-end-run.reader';
