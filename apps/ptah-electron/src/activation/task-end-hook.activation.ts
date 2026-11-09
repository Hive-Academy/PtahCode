import {
  TASK_END_TOKENS,
  connectTaskEndHook,
  type TaskEndHookHandle,
  type TaskPrReconcilerService,
  type TaskPrReconcileTask,
  type ITaskCloseOutStore,
  TASK_END_HOOK_SECTION,
  TASK_END_HOOK_KEYS,
  TASK_END_HOOK_DEFAULTS,
} from '@ptah-extension/task-end-hook';
import { TASK_SPECS_TOKENS, type TaskIndexService } from '@ptah-extension/task-specs';
import { PLATFORM_TOKENS, type IWorkspaceProvider, type IDisposable } from '@ptah-extension/platform-core';
import { SESSION_ORGANIZATION_TOKENS, type SessionOrganizationStore } from '@ptah-extension/session-organization';
import type { Logger } from '@ptah-extension/vscode-core';
import type { DependencyContainer } from 'tsyringe';

/** What shutdown holds: stop the hook, then wait (bounded) for it to settle. */
export interface TaskEndHookActivationHandle {
  dispose(): void;
  awaitStopped(): Promise<void>;
}

/**
 * Starts the task-end hook (TASK_2026_886, plan Component 10): connects the
 * detector-to-worker wake, reconciles every open repository, starts the
 * worker and subscribes the detector to index, write-settle and workspace
 * folder events, in that order.
 *
 * Returns `null` when the hook is not registered (no SQLite, Batch 17), when
 * `signal` is already aborted or aborts during startup, and when any startup
 * step throws. A failure is logged with a fixed message only, so no raw error
 * text (paths, tokens) reaches the log; the hook is a report-only background
 * feature, and the rest of the boot continues without it.
 *
 * The hook deletes, moves and archives nothing and never fetches (C1, C3);
 * this activation only starts it.
 */
export async function startTaskEndHook(
  container: DependencyContainer,
  signal: AbortSignal,
  logger: Pick<Logger, 'error'>,
): Promise<TaskEndHookActivationHandle | null> {
  if (
    signal.aborted ||
    !container.isRegistered(TASK_END_TOKENS.DETECTOR) ||
    !container.isRegistered(TASK_END_TOKENS.WORKER)
  ) {
    return null;
  }

  let hook: TaskEndHookHandle;
  try {
    hook = connectTaskEndHook(container);
  } catch (_error: unknown) {
    logger.error(
      'Task-end hook connect failed',
      new Error('Task-end hook connect failed'),
    );
    return null;
  }

  let disposed = false;
  let reconcileSubscription: IDisposable | null = null;
  let reconciler: TaskPrReconcilerService | null = null;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    reconcileSubscription?.dispose();
    reconciler?.dispose();
    hook.dispose();
  };
  // An abort mid-reconcile disposes the detector, which aborts its in-flight
  // git calls, so startup does not hold the quit open.
  signal.addEventListener('abort', dispose, { once: true });

  try {
    await hook.detector.reconcileStartup();
    if (disposed) return null;
    hook.worker.start();
    hook.detector.subscribe();
    try {
    if (container.isRegistered(TASK_END_TOKENS.PR_RECONCILER) &&
        container.isRegistered(TASK_END_TOKENS.STORE) &&
        container.isRegistered(TASK_SPECS_TOKENS.TASK_INDEX_SERVICE) &&
        container.isRegistered(PLATFORM_TOKENS.WORKSPACE_PROVIDER) &&
        container.isRegistered(SESSION_ORGANIZATION_TOKENS.STORE)) {
      reconciler = container.resolve<TaskPrReconcilerService>(TASK_END_TOKENS.PR_RECONCILER);
      const store = container.resolve<ITaskCloseOutStore>(TASK_END_TOKENS.STORE);
      const index = container.resolve<TaskIndexService>(TASK_SPECS_TOKENS.TASK_INDEX_SERVICE);
      const workspace = container.resolve<IWorkspaceProvider>(PLATFORM_TOKENS.WORKSPACE_PROVIDER);
      const organization = container.resolve<SessionOrganizationStore>(SESSION_ORGANIZATION_TOKENS.STORE);
      const scan = async (root: string): Promise<void> => {
        const listing = await index.list(root);
        const repoId = hook.detector.cachedRepoId(root);
        if (!repoId || disposed) return;
        for (const row of listing.tasks) {
          if (!row.frontmatterValid || (row.status !== 'in_progress' && row.status !== 'in_review' && row.status !== 'done')) continue;
          const optedIn = workspace.getConfiguration<unknown>(
            TASK_END_HOOK_SECTION, TASK_END_HOOK_KEYS.autoRemoveMergedWorktreeAndBranch,
            TASK_END_HOOK_DEFAULTS.autoRemoveMergedWorktreeAndBranch) === true;
          if (row.status === 'done') {
            const previous = store.getCloseOutForTask(repoId, row.id);
            if (previous && previous.steps.every(step => step.state === 'ok' || step.state === 'skipped' ||
                (step.state === 'refused' && (step.reason !== 'pending-user-approval' || !optedIn)))) continue;
          }
          const sessionIds = organization.listTaskLinks(root, [row.id]).map((link) => link.sessionId);
          const candidate = sessionIds
            .map((id) => organization.getOrganization(root, id))
            .find((entry) => entry?.worktreePath && entry.branch);
          if (!candidate?.worktreePath || !candidate.branch) continue;
          const task: TaskPrReconcileTask = {
            repoId, taskId: row.id, mainRoot: root,
            worktreePath: candidate.worktreePath, branch: candidate.branch,
            status: row.status, sessionIds,
            autoRemoveMergedWorktreeAndBranch: optedIn,
          };
          if (disposed) return;
          await reconciler?.reconcile(task);
        }
      };
      const report = (error: unknown): void => {
        logger.error('Task PR reconcile failed', error instanceof Error ? error : new Error(String(error)));
      };
      const scans = new Map<string, { running: boolean; queued: boolean }>();
      const schedule = (root: string): void => {
        const state = scans.get(root) ?? { running: false, queued: false };
        if (state.running) { state.queued = true; return; }
        state.running = true;
        scans.set(root, state);
        void (async () => {
          do {
            state.queued = false;
            try { await scan(root); } catch (error: unknown) { report(error); }
          } while (state.queued && !disposed);
          state.running = false;
          scans.delete(root);
        })();
      };
      reconcileSubscription = index.onDidChangeIndex((event) => schedule(event.workspaceRoot));
      for (const root of workspace.getWorkspaceFolders()) schedule(root);
    }
    } catch (error: unknown) {
      reconcileSubscription?.dispose();
      reconciler?.dispose();
      reconcileSubscription = null;
      reconciler = null;
      logger.error('Task PR reconciler wiring failed', error instanceof Error ? error : new Error(String(error)));
    }
  } catch (_error: unknown) {
    dispose();
    logger.error(
      'Task-end hook start failed',
      new Error('Task-end hook start failed'),
    );
    return null;
  }

  return { dispose, awaitStopped: () => hook.awaitStopped() };
}
