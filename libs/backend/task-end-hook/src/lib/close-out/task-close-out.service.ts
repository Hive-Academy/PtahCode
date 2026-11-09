import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { TASK_END_TOKENS } from '../di/tokens';
import type {
  CloseOutIdentity,
  CloseOutRunRecord,
  CloseOutStep,
  ITaskCloseOutStore,
} from '../persistence/task-end-store.interface';
import type { CurationPort } from '../ports/curation.port';
import type { HarvestPort } from '../ports/harvest.port';
import type {
  GitCleanupPort,
  GitCleanupResult,
} from '../ports/git-cleanup.port';

const requestSchema = z.object({
  repoId: z.string().min(1),
  taskId: z.string().min(1),
  prNumber: z.number().int().positive(),
  prUrl: z.string().url(),
  mainRoot: z.string().min(1),
  worktreePath: z.string().min(1),
  branch: z.string().min(1),
  merged: z.literal(true),
  sessionIds: z.array(z.string().min(1)),
  autoRemoveMergedWorktreeAndBranch: z.boolean(),
});

export type TaskCloseOutRequest = z.infer<typeof requestSchema>;
type StepResult = {
  readonly state: 'ok' | 'failed' | 'refused' | 'skipped';
  readonly reason: string | null;
};

@injectable()
export class TaskCloseOutService {
  private readonly active = new Map<string, Promise<CloseOutRunRecord>>();
  private readonly conflictWarnings = new Set<string>();

  constructor(
    @inject(TASK_END_TOKENS.STORE) private readonly store: ITaskCloseOutStore,
    @inject(TASK_END_TOKENS.CURATION_PORT)
    private readonly curation: CurationPort,
    @inject(TASK_END_TOKENS.HARVEST_PORT) private readonly harvest: HarvestPort,
    @inject(TASK_END_TOKENS.GIT_CLEANUP_PORT)
    private readonly cleanup: GitCleanupPort,
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
  ) {}

  async run(input: TaskCloseOutRequest): Promise<CloseOutRunRecord> {
    const run = this.start(input);
    return this.active.get(run.runId) ?? run;
  }

  /** Accept a task-keyed run immediately; status is persisted before execution. */
  start(input: TaskCloseOutRequest): CloseOutRunRecord {
    const request = requestSchema.parse(input);
    const identity: CloseOutIdentity = request;
    let run: CloseOutRunRecord;
    try {
      run = this.store.getOrCreateCloseOut(identity);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'close-out identity conflict') {
        const key = `${request.repoId}\0${request.taskId}`;
        if (!this.conflictWarnings.has(key)) {
          this.conflictWarnings.add(key);
          this.logger.warn('[task-close-out] identity conflict');
        }
      }
      throw error;
    }
    const existing = this.active.get(run.runId);
    if (existing) return run;
    const work = Promise.resolve().then(() => this.execute(run.runId, request));
    this.track(run.runId, work);
    void work.catch((error: unknown) => {
      this.logger.error(
        '[task-close-out] run failed',
        error instanceof Error ? error : new Error(String(error)),
      );
    });
    return run;
  }

  status(runId: string): CloseOutRunRecord | null {
    return this.store.getCloseOut(z.string().min(1).parse(runId));
  }

  /** Manual retry of the same journalled cleanup steps, with a fresh opt-in snapshot. */
  async cleanupCompleted(
    runId: string,
    allowRemoval: boolean,
  ): Promise<CloseOutRunRecord | null> {
    const run = this.status(runId);
    if (!run) return null;
    const previous = this.active.get(runId);
    const work = (previous ?? Promise.resolve(run)).catch(() => run).then(async () => {
      await this.cleanupSteps(runId, {
      ...run,
      merged: true,
      sessionIds: [],
      autoRemoveMergedWorktreeAndBranch: allowRemoval,
      }, true);
      const result = this.status(runId);
      if (!result) throw new Error('close-out run disappeared');
      return result;
    });
    this.track(runId, work);
    return work;
  }

  private track(runId: string, work: Promise<CloseOutRunRecord>): void {
    this.active.set(runId, work);
    void work.finally(() => {
      if (this.active.get(runId) === work) this.active.delete(runId);
    }).catch(() => { /* The caller observes the original promise. */ });
  }

  private async execute(
    runId: string,
    request: TaskCloseOutRequest,
  ): Promise<CloseOutRunRecord> {
    await this.step(runId, 'memory', async () => {
      if (request.sessionIds.length === 0)
        return { state: 'skipped', reason: 'no-linked-sessions' };
      let failed = false;
      let gated = 0;
      for (const sessionId of new Set(request.sessionIds)) {
        const result = await this.curation.curateEndedSession(
          sessionId,
          request.mainRoot,
          new AbortController().signal,
        );
        if (
          result.kind === 'failed' ||
          result.kind === 'threw' ||
          result.kind === 'stalled'
        ) {
          failed = true;
        }
        if (result.kind === 'gated') gated++;
      }
      if (failed) return { state: 'failed', reason: 'curation-failed' };
      if (gated === new Set(request.sessionIds).size)
        return { state: 'skipped', reason: 'all-sessions-gated' };
      return { state: 'ok', reason: null };
    });
    await this.step(runId, 'learning', async () => {
      const result = await this.harvest.harvestTask(
        request.mainRoot,
        request.taskId,
      );
      if (
        result.outcome === 'harvested' ||
        result.outcome === 'already-harvested'
      )
        return { state: 'ok', reason: null };
      if (result.outcome === 'not-completed')
        return { state: 'refused', reason: 'task-not-completed' };
      return { state: 'failed', reason: result.outcome };
    });
    await this.cleanupSteps(runId, request);
    const final = this.store.getCloseOut(runId);
    if (final === null) throw new Error('close-out run disappeared');
    return final;
  }

  private async cleanupSteps(
    runId: string,
    request: TaskCloseOutRequest,
    manual = false,
  ): Promise<void> {
    await this.step(runId, 'worktree', async () => {
      if (!request.autoRemoveMergedWorktreeAndBranch)
        return { state: 'refused', reason: 'pending-user-approval' };
      const first = await this.cleanup.inspectTaskWorktree(
        request.mainRoot,
        request.worktreePath,
        request.branch,
      );
      const guard = this.inspectionResult(first, request);
      if (guard) return guard;
      const second = await this.cleanup.inspectTaskWorktree(
        request.mainRoot,
        request.worktreePath,
        request.branch,
      );
      const recheck = this.inspectionResult(second, request);
      if (recheck) return recheck;
      if (second.kind !== 'ok')
        return { state: 'failed', reason: 'inspection-failed' };
      return this.cleanupResult(
        await this.cleanup.removeWorktree(
          request.mainRoot,
          second.value.canonicalPath,
        ),
      );
    }, request.autoRemoveMergedWorktreeAndBranch, manual);
    await this.step(runId, 'branch', async () => {
      const current = this.store.getCloseOut(runId);
      const worktree = current?.steps.find((step) => step.step === 'worktree');
      if (worktree?.state !== 'ok')
        return { state: 'refused', reason: 'worktree-removal-pending' };
      if (!request.autoRemoveMergedWorktreeAndBranch)
        return { state: 'refused', reason: 'pending-user-approval' };
      return this.cleanupResult(
        await this.cleanup.deleteBranch(request.mainRoot, request.branch),
      );
    }, request.autoRemoveMergedWorktreeAndBranch, manual);
  }

  private async step(
    runId: string,
    name: CloseOutStep,
    action: () => Promise<StepResult>,
    optedIn = false,
    manual = false,
  ): Promise<void> {
    const current = this.store
      .getCloseOut(runId)
      ?.steps.find((step) => step.step === name);
    if (!current || current.state === 'ok' || current.state === 'skipped')
      return;
    if (!manual && current.state === 'failed' && current.attempts >= 5) return;
    if (!manual && current.state === 'refused' &&
        !((current.reason === 'pending-user-approval' ||
            current.reason === 'worktree-removal-pending') && optedIn)) return;
    this.store.startCloseOutStep(runId, name);
    let result: StepResult;
    try {
      result = await action();
    } catch (error: unknown) {
      this.logger.error(
        '[task-close-out] step failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      result = { state: 'failed', reason: 'dependency-failed' };
    }
    this.store.finishCloseOutStep(runId, name, result.state, result.reason);
  }

  private inspectionResult(
    result: Awaited<ReturnType<GitCleanupPort['inspectTaskWorktree']>>,
    request: TaskCloseOutRequest,
  ): StepResult | null {
    if (result.kind === 'already-removed') return { state: 'ok', reason: 'already-removed' };
    if (result.kind !== 'ok') return this.cleanupResult(result);
    if (
      result.value.canonicalPath !== request.worktreePath ||
      result.value.branch !== request.branch ||
      !result.value.clean ||
      !result.value.branchMergedIntoMain
    ) {
      return { state: 'refused', reason: 'worktree-not-clean-and-merged' };
    }
    return null;
  }

  private cleanupResult(result: GitCleanupResult<unknown>): StepResult {
    return result.kind === 'ok' || result.kind === 'already-removed'
      ? { state: 'ok', reason: result.kind === 'already-removed' ? 'already-removed' : null }
      : {
          state: result.kind,
          reason: result.kind === 'refused' ? 'git-refused' : 'git-failed',
        };
  }
}
