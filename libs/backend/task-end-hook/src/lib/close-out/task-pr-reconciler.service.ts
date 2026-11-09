import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { TASK_END_TOKENS } from '../di/tokens';
import type { CloseOutPrStatusPort, TaskCloseOutPrStatus } from '../ports/pr-status.port';
import { TaskEndTransitionDetector } from '../trigger/task-end-transition-detector';
import { TaskCloseOutService } from './task-close-out.service';

const taskSchema = z.object({
  repoId: z.string().min(1),
  taskId: z.string().regex(/^TASK_\d{4}_\d{3,4}(?:_[a-zA-Z0-9]+)?$/),
  mainRoot: z.string().min(1),
  worktreePath: z.string().min(1),
  branch: z.string().min(1),
  status: z.enum(['backlog', 'in_progress', 'in_review', 'done', 'cancelled']),
  sessionIds: z.array(z.string().min(1)),
  autoRemoveMergedWorktreeAndBranch: z.boolean(),
});
const prSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('open'), number: z.number().int().positive(), url: z.string().url() }),
  z.object({ kind: z.literal('merged'), number: z.number().int().positive(), url: z.string().url(), mergeCommit: z.string().optional() }),
  z.object({ kind: z.literal('closed-unmerged'), number: z.number().int().positive(), url: z.string().url() }),
  z.object({ kind: z.literal('unknown'), number: z.number().int().positive().optional(), url: z.string().url().optional() }),
]);

export type TaskPrReconcileTask = z.infer<typeof taskSchema>;
export type TaskPrReconcileResult =
  | { readonly kind: 'open' | 'merged' | 'closed-unmerged'; readonly number: number }
  | { readonly kind: 'unknown' };

const POLL_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const LOOKUP_TIMEOUT_MS = 15_000;

@injectable()
export class TaskPrReconcilerService {
  private readonly watched = new Map<string, { task: TaskPrReconcileTask; due: number; backoff: number }>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    @inject(TASK_END_TOKENS.PR_STATUS_PORT) private readonly prs: CloseOutPrStatusPort,
    @inject(TASK_END_TOKENS.DETECTOR) private readonly detector: TaskEndTransitionDetector,
    @inject(TaskCloseOutService) private readonly closeOut: TaskCloseOutService,
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
  ) {}

  /** Called on startup and task-index changes; one host timer serves all review tasks. */
  async reconcile(input: TaskPrReconcileTask): Promise<TaskPrReconcileResult> {
    const task = taskSchema.parse(input);
    if (this.disposed) return { kind: 'unknown' };
    const pr = await this.lookup(task);
    if (this.disposed) return { kind: 'unknown' };
    const key = `${task.repoId}\0${task.taskId}`;
    if (pr.kind === 'unknown') {
      if (task.status === 'in_review') this.watch(key, task, true);
      return { kind: 'unknown' };
    }
    if (pr.kind === 'closed-unmerged') {
      this.watched.delete(key);
      this.arm();
      return { kind: 'closed-unmerged', number: pr.number };
    }
    if (pr.kind === 'open') {
      if (task.status !== 'done' && task.status !== 'cancelled') {
        await this.detector.setCarrierStatus(task.mainRoot, task.taskId, 'in_review');
        this.watch(key, { ...task, status: 'in_review' }, false);
      }
      return { kind: 'open', number: pr.number };
    }
    this.watched.delete(key);
    this.arm();
    if (task.status !== 'done') await this.detector.setCarrierStatus(task.mainRoot, task.taskId, 'done');
    // Close-out is deliberately detached from the hook callback. Its store owns retry state.
    void this.closeOut.run({
      repoId: task.repoId, taskId: task.taskId, prNumber: pr.number,
      prUrl: pr.url, mainRoot: task.mainRoot, worktreePath: task.worktreePath,
      branch: task.branch, merged: true, sessionIds: task.sessionIds,
      autoRemoveMergedWorktreeAndBranch: task.autoRemoveMergedWorktreeAndBranch,
    }).catch((error: unknown) => {
      this.logger.error('[task-pr-reconciler] close-out failed', error instanceof Error ? error : new Error(String(error)));
    });
    return { kind: 'merged', number: pr.number };
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.watched.clear();
  }

  private async lookup(task: TaskPrReconcileTask): Promise<TaskCloseOutPrStatus> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        this.prs.prStatus(task.mainRoot, task.branch),
        new Promise<TaskCloseOutPrStatus>((resolve) => {
          timer = setTimeout(() => resolve({ kind: 'unknown' }), LOOKUP_TIMEOUT_MS);
          timer.unref();
        }),
      ]);
      const parsed = prSchema.safeParse(response);
      if (!parsed.success) {
        this.logger.warn('[task-pr-reconciler] invalid PR lookup result');
        return { kind: 'unknown' };
      }
      return parsed.data;
    } catch (error: unknown) {
      this.logger.error('[task-pr-reconciler] PR lookup failed', error instanceof Error ? error : new Error(String(error)));
      return { kind: 'unknown' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private watch(key: string, task: TaskPrReconcileTask, failed: boolean): void {
    const previous = this.watched.get(key);
    const backoff = failed ? Math.min((previous?.backoff ?? POLL_MS) * 2, MAX_BACKOFF_MS) : POLL_MS;
    this.watched.set(key, { task, due: Date.now() + backoff, backoff });
    this.arm();
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.disposed || this.watched.size === 0) return;
    const due = Math.min(...[...this.watched.values()].map((entry) => entry.due));
    this.timer = setTimeout(() => {
      this.timer = null;
      const ready = [...this.watched.entries()].filter(([, entry]) => entry.due <= Date.now());
      for (const [key, entry] of ready) {
        this.watched.delete(key);
        void this.reconcile(entry.task).catch((error: unknown) => {
          this.logger.error('[task-pr-reconciler] polling failed', error instanceof Error ? error : new Error(String(error)));
          this.watch(key, entry.task, true);
        });
      }
      this.arm();
    }, Math.max(1, due - Date.now()));
    this.timer.unref();
  }
}
