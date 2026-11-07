import {
  TASK_END_TOKENS,
  connectTaskEndHook,
  type TaskEndHookHandle,
} from '@ptah-extension/task-end-hook';
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
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
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
