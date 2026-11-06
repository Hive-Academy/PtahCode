/**
 * DI Token Registry — Task-End Hook Tokens (TASK_2026_886).
 *
 * Convention (mirrors `session-organization/src/lib/di/tokens.ts`):
 *  - always `Symbol.for('Name')` (globally interned across bundles);
 *  - every key is prefixed `PtahTaskEnd` so it is globally unique;
 *  - frozen `as const`.
 *
 * Port tokens are bound by the host composition root before
 * `registerTaskEndHook` runs; the remaining tokens are the library's own
 * classes, registered by `registerTaskEndHook`.
 *
 * `RUN_READER` is duplicated as a `Symbol.for('PtahTaskEndRunReader')` literal
 * in vscode-lm-tools `ptah-api-builder.service.ts`, so that library does not
 * import this one. The two strings must stay identical.
 */
export const TASK_END_TOKENS = {
  // Host ports (bound by the composition root)
  /** CurationPort — curates one ended session. */
  CURATION_PORT: Symbol.for('PtahTaskEndCurationPort'),
  /** HarvestPort — harvests one task's spec folder. */
  HARVEST_PORT: Symbol.for('PtahTaskEndHarvestPort'),
  /** CensusPort — symbol-index census of a main root. */
  CENSUS_PORT: Symbol.for('PtahTaskEndCensusPort'),
  /** SessionLinkPort — session links and worktree naming. */
  SESSION_LINK_PORT: Symbol.for('PtahTaskEndSessionLinkPort'),
  /** ActivityPort — live sessions, lanes and workspace roots. */
  ACTIVITY_PORT: Symbol.for('PtahTaskEndActivityPort'),
  /** PrStatusPort — open pull request lookup. */
  PR_STATUS_PORT: Symbol.for('PtahTaskEndPrStatusPort'),
  /** GitReadRunner — raw git argument-vector runner, wrapped by ReadOnlyGit. */
  GIT_READ_RUNNER: Symbol.for('PtahTaskEndGitReadRunner'),

  // Library classes (registered by registerTaskEndHook)
  /** ITaskEndStore — the only writer of the migration 0072 tables. */
  STORE: Symbol.for('PtahTaskEndStore'),
  /** TaskEndTransitionDetector — index events to journal observations. */
  DETECTOR: Symbol.for('PtahTaskEndTransitionDetector'),
  /** TaskEndRunWorker — runs hook runs one at a time in FIFO order. */
  WORKER: Symbol.for('PtahTaskEndRunWorker'),
  /** CloseCurateStep. */
  CLOSE_CURATE_STEP: Symbol.for('PtahTaskEndCloseCurateStep'),
  /** HarvestStep. */
  HARVEST_STEP: Symbol.for('PtahTaskEndHarvestStep'),
  /** DisposeEvaluateStep — report-only disposal evaluation. */
  DISPOSE_EVALUATE_STEP: Symbol.for('PtahTaskEndDisposeEvaluateStep'),
  /** IndexRequestStep. */
  INDEX_REQUEST_STEP: Symbol.for('PtahTaskEndIndexRequestStep'),
  /** CensusCoordinator — one pending census per main root, with cooldown. */
  CENSUS_COORDINATOR: Symbol.for('PtahTaskEndCensusCoordinator'),
  /** TaskEndRunReader — latest run of a task, for `ptah_task_get`. */
  RUN_READER: Symbol.for('PtahTaskEndRunReader'),
  /** TaskEndHookSettingsReader — typed `ptah.taskEndHook.*` snapshot. */
  SETTINGS_READER: Symbol.for('PtahTaskEndSettingsReader'),
} as const;

export type TaskEndDIToken = keyof typeof TASK_END_TOKENS;
