/**
 * Public barrel for `@ptah-extension/cron-scheduler`.
 *
 * Anything not re-exported here is internal to the library and may change
 * without notice.
 */
export { CronScheduler } from './lib/cron-scheduler';
export {
  CronJobService,
  CRON_PREVIEW_MAX_COUNT,
  CRON_JOB_NAME_MAX,
  CRON_JOB_PROMPT_MAX,
  type CronJobCreateInput,
  type CronJobListFilter,
  type CronJobRunsOptions,
  type CronJobUpdatePatch,
} from './lib/cron-job.service';
export { JobRunner } from './lib/job-runner';
export { CatchupCoordinator } from './lib/catchup-coordinator';
export { JobStore, type IJobStore } from './lib/job.store';
export {
  RunStore,
  type IRunStore,
  SlotAlreadyClaimedError,
} from './lib/run.store';
// `isUniqueConstraintError` moved to `@ptah-extension/persistence-sqlite` — it
// is a driver concern, and re-exporting it here would leave a second import
// path for one function. Import it from there.
export { HandlerRegistry } from './lib/handler-registry';
export { normalizeWorkspaceRoot } from './lib/normalize-workspace-root';
export {
  CronSchedulerError,
  JobNotFoundError,
  CronConfigError,
  CronJobValidationError,
  type CronJobValidationField,
} from './lib/errors';

export type { IPowerMonitor } from './lib/power-monitor.interface';
export { NoopPowerMonitor } from './lib/power-monitor.interface';

export { CRON_TOKENS, type CronDIToken } from './lib/di/tokens';
export { registerCronSchedulerServices } from './lib/di/register';

export type {
  ScheduledJob,
  JobRun,
  JobRunStatus,
  CreateJobInput,
  UpdateJobPatch,
  UpsertJobInput,
  CronSchedulerOptions,
  CatchupPolicy,
  CronJobCreator,
  IHandlerRegistry,
  JobHandler,
  JobHandlerContext,
  JobHandlerResult,
} from './lib/types';
export { CATCHUP_WINDOW_MAX_MS } from './lib/types';
