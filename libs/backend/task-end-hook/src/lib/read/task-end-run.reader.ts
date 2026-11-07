import { inject, injectable } from 'tsyringe';
import { normalizeWorkspaceRoot } from '@ptah-extension/platform-core';
import {
  TASK_END_STEP_KINDS,
  type TaskEndRunRecord,
  type TaskEndStepKind,
} from '@ptah-extension/shared';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { TASK_END_TOKENS } from '../di/tokens';
import type {
  ITaskEndStore,
  TaskEndRunLookup,
} from '../persistence/task-end-store.interface';
import type { TaskEndTransitionDetector } from '../trigger/task-end-transition-detector';

/**
 * Read path of the task-end hook (plan Component 11, AC 6.4): the latest run
 * of a task, for the `endHook` block of `ptah_task_get`.
 *
 * - The repository is selected by the identity the detector has cached for
 *   the workspace root; a root the detector has not resolved yet falls back
 *   to the runs first seen at that root. The read never runs git.
 * - A run is returned only when it carries an entry for every step kind. The
 *   store skips (and logs) a malformed step row, so a run with a step kind
 *   missing is logged here and omitted (`null`), never returned partially.
 * - Store failures throw; the `ptah_task_get` builder omits the field then.
 *
 * Structurally matches `TaskEndRunReaderLike` in vscode-lm-tools, which
 * resolves it through `Symbol.for('PtahTaskEndRunReader')`.
 */
@injectable()
export class TaskEndRunReader {
  constructor(
    @inject(TASK_END_TOKENS.STORE)
    private readonly store: Pick<ITaskEndStore, 'latestRun'>,
    @inject(TASK_END_TOKENS.DETECTOR)
    private readonly detector: Pick<TaskEndTransitionDetector, 'cachedRepoId'>,
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'warn'>,
  ) {}

  /** The most recently created complete run of `taskId`, or `null`. */
  latestForTask(workspaceRoot: string, taskId: string): TaskEndRunRecord | null {
    const root = normalizeWorkspaceRoot(workspaceRoot);
    const repoId = this.detector.cachedRepoId(root);
    const lookup: TaskEndRunLookup =
      repoId === null ? { seenRoot: root } : { repoId };
    const run = this.store.latestRun(lookup, taskId);
    if (run === null) return null;

    const missing = missingStepKinds(run);
    if (missing.length > 0) {
      this.logger.warn('[task-end-hook] run omitted: step kinds missing', {
        runId: run.runId,
        missing,
      });
      return null;
    }
    return run;
  }
}

function missingStepKinds(run: TaskEndRunRecord): TaskEndStepKind[] {
  const present = new Set(run.steps.map((entry) => entry.step));
  return TASK_END_STEP_KINDS.filter((kind) => !present.has(kind));
}
