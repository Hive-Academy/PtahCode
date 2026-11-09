import { realpathSync } from 'node:fs';
import { normalize } from 'node:path';
import type { TaskSpecIndexLike } from './tasks-namespace.builder';

export interface CloseOutRunLike {
  readonly runId: string;
  readonly taskId: string;
  readonly mainRoot: string;
  readonly steps: readonly {
    readonly step: string;
    readonly state: string;
    readonly reason: string | null;
    readonly attempts: number;
  }[];
}

export interface TaskCloseOutServiceLike {
  start(input: {
    repoId: string;
    taskId: string;
    prNumber: number;
    prUrl: string;
    mainRoot: string;
    worktreePath: string;
    branch: string;
    merged: true;
    sessionIds: string[];
    autoRemoveMergedWorktreeAndBranch: boolean;
  }, manual?: boolean): CloseOutRunLike;
  status(runId: string): CloseOutRunLike | null;
  cleanupCompleted(
    runId: string,
    allowRemoval: boolean,
  ): Promise<CloseOutRunLike | null>;
}

export interface TaskCloseOutDeps {
  getCloseOutService?: () => TaskCloseOutServiceLike | undefined;
  getIndex: () => TaskSpecIndexLike | undefined;
  getWorkspaceRoot: () => string;
  getRepoId?: () => string | null;
  getLinks?: (
    root: string,
    taskId: string,
  ) => readonly { sessionId: string; worktreePath?: string; branch?: string }[];
  getPrStatus?: (
    root: string,
    branch: string,
  ) => Promise<{ kind: string; number?: number; url?: string }>;
  allowRemoval?: () => boolean;
  logger?: { error(message: string, error: Error): void };
}

export interface TaskCloseOutNamespace {
  closeOut(input: { taskId: string; workspaceRoot: string }): Promise<object>;
  closeOutStatus(input: { runId: string }): Promise<object>;
  cleanupCompleted(input: {
    runId: string;
    taskId: string;
    workspaceRoot: string;
  }): Promise<object>;
}

export function buildTaskCloseOutNamespace(
  deps: TaskCloseOutDeps,
): TaskCloseOutNamespace {
  const outcome = (run: CloseOutRunLike, stepName: string): object => {
    const step = run.steps.find((item) => item.step === stepName);
    const state =
      step?.state === 'ok'
        ? 'succeeded'
        : step?.state === 'refused'
          ? 'blocked'
          : (step?.state ?? 'pending');
    return {
      state,
      reason: step?.reason ?? null,
      retryable: state === 'failed' || state === 'blocked',
    };
  };
  const canonical = (path: string): string => {
    const value = normalize(realpathSync(path));
    return process.platform === 'win32' ? value.toLowerCase() : value;
  };
  const rootAllowed = (root: string): boolean => {
    try {
      return canonical(root) === canonical(deps.getWorkspaceRoot());
    } catch (error: unknown) {
      deps.logger?.error(
        '[task-close-out] workspace validation failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      return false;
    }
  };
  const unavailable = {
    status: 'unavailable',
    reason: 'Task close-out is unavailable on this host.',
  };
  const failed = {
    status: 'retryable-failure',
    reason: 'Task close-out is temporarily unavailable.',
  };
  return {
    async closeOut({ taskId, workspaceRoot }) {
      const service = deps.getCloseOutService?.();
      if (!service) return unavailable;
      if (!rootAllowed(workspaceRoot))
        return {
          status: 'refused',
          reason: 'workspaceRoot must be the open workspace root.',
        };
      try {
        const index = deps.getIndex();
        if (!index) return unavailable;
        await index.ensureStarted(workspaceRoot);
        const task = await index.getDetail(workspaceRoot, taskId);
        if (!task || task.status !== 'done' || !task.frontmatterValid)
          return { status: 'refused', reason: 'Task must be valid and done.' };
        const repoId = deps.getRepoId?.();
        if (!repoId)
          return {
            status: 'retryable-failure',
            reason: 'Repository identity is unavailable.',
          };
        const links = deps.getLinks?.(workspaceRoot, taskId) ?? [];
        const candidate = links.find(
          (link) => link.worktreePath && link.branch,
        );
        if (!candidate?.worktreePath || !candidate.branch)
          return {
            status: 'refused',
            reason: 'No linked task worktree and branch.',
          };
        const pr = await deps.getPrStatus?.(workspaceRoot, candidate.branch);
        if (pr?.kind !== 'merged' || !pr.number || !pr.url)
          return {
            status: 'refused',
            reason: 'A merged PR could not be confirmed.',
          };
        const run = service.start({
          repoId,
          taskId,
          prNumber: pr.number,
          prUrl: pr.url,
          mainRoot: workspaceRoot,
          worktreePath: candidate.worktreePath,
          branch: candidate.branch,
          merged: true,
          sessionIds: links.map((link) => link.sessionId),
          autoRemoveMergedWorktreeAndBranch: deps.allowRemoval?.() === true,
        }, true);
        return { status: 'accepted', runId: run.runId };
      } catch (error: unknown) {
        deps.logger?.error(
          '[task-close-out] start failed',
          error instanceof Error ? error : new Error(String(error)),
        );
        return failed;
      }
    },
    async closeOutStatus({ runId }) {
      const service = deps.getCloseOutService?.();
      if (!service) return unavailable;
      try {
        const run = service.status(runId);
        return run
          ? {
              status: 'found',
              runId: run.runId,
              outcomes: {
                memory: outcome(run, 'memory'),
                learning: outcome(run, 'learning'),
                worktree: outcome(run, 'worktree'),
                branch: outcome(run, 'branch'),
              },
            }
          : { status: 'not-found' };
      } catch (error: unknown) {
        deps.logger?.error(
          '[task-close-out] status failed',
          error instanceof Error ? error : new Error(String(error)),
        );
        return failed;
      }
    },
    async cleanupCompleted({ runId, taskId, workspaceRoot }) {
      const service = deps.getCloseOutService?.();
      if (!service) return unavailable;
      if (!rootAllowed(workspaceRoot))
        return {
          status: 'refused',
          reason: 'workspaceRoot must be the open workspace root.',
        };
      try {
        const run = service.status(runId);
        if (
          !run ||
          run.taskId !== taskId ||
          canonical(run.mainRoot) !== canonical(workspaceRoot)
        )
          return {
            status: 'refused',
            reason: 'Run does not belong to this task and workspace.',
          };
        const updated = await service.cleanupCompleted(
          runId,
          deps.allowRemoval?.() === true,
        );
        const worktree = updated?.steps.find(
          (step) => step.step === 'worktree',
        );
        const branch = updated?.steps.find((step) => step.step === 'branch');
        const pending = worktree?.reason === 'pending-user-approval' ||
          branch?.reason === 'pending-user-approval';
        const refusal = [worktree, branch].find((step) => step?.state === 'refused');
        return {
          status: pending
            ? 'pending-user-approval'
            : refusal
              ? 'refused'
              : worktree?.state === 'failed' || branch?.state === 'failed'
              ? 'retryable-failure'
              : 'completed',
          ...(refusal && !pending ? { reason: refusal.reason } : {}),
          run: updated,
        };
      } catch (error: unknown) {
        deps.logger?.error(
          '[task-close-out] cleanup failed',
          error instanceof Error ? error : new Error(String(error)),
        );
        return failed;
      }
    },
  };
}
