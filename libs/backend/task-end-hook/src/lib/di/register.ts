import { instanceCachingFactory, type DependencyContainer } from 'tsyringe';
import {
  PERSISTENCE_TOKENS,
  type SqliteConnectionService,
} from '@ptah-extension/persistence-sqlite';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { TASK_SPECS_TOKENS, type TaskIndexService, type TaskStatusOverlay } from '@ptah-extension/task-specs';
import { TaskEndHookSettingsReader } from '../config/task-end-hook-config';
import { TaskCloseOutService } from '../close-out/task-close-out.service';
import { TaskPrReconcilerService } from '../close-out/task-pr-reconciler.service';
import type { ITaskEndStore } from '../persistence/task-end-store.interface';
import { SqliteTaskEndStore } from '../persistence/sqlite-task-end.store';
import { TaskEndRunReader } from '../read/task-end-run.reader';
import { CensusCoordinator } from '../steps/census-coordinator';
import { CloseCurateStep } from '../steps/close-curate.step';
import { DisposeEvaluateStep } from '../steps/dispose-evaluate.step';
import { HarvestStep } from '../steps/harvest.step';
import { IndexRequestStep } from '../steps/index-request.step';
import { TaskEndTransitionDetector } from '../trigger/task-end-transition-detector';
import { TaskEndRunWorker } from '../worker/task-end-run-worker';
import { TASK_END_TOKENS } from './tokens';

/**
 * Registers the task-end hook's own classes (plan Component 8): the store,
 * settings reader, census coordinator, the four step runners, the detector,
 * the worker and the run reader, each a singleton.
 *
 * Host-bound ports: the host composition root binds these seven tokens
 * before it resolves anything registered here (Electron: Batch 17,
 * `apps/ptah-electron/src/di/task-end-hook-composition.ts`). This library
 * never binds them, because only the host owns the engines behind them:
 * `CURATION_PORT`, `HARVEST_PORT`, `CENSUS_PORT`, `SESSION_LINK_PORT`,
 * `ACTIVITY_PORT`, `PR_STATUS_PORT`, `GIT_READ_RUNNER`. The host also
 * provides `PERSISTENCE_TOKENS.SQLITE_CONNECTION`, `TOKENS.LOGGER`,
 * `PLATFORM_TOKENS.WORKSPACE_PROVIDER` and the task-specs index and writer.
 *
 * Registration resolves nothing; {@link connectTaskEndHook} does.
 */
export function registerTaskEndHook(container: DependencyContainer): void {
  // Factory, not class registration: the store's third constructor
  // parameter (test-only options) carries no @inject, and tsyringe would
  // fail to resolve it (D30).
  container.register<ITaskEndStore>(TASK_END_TOKENS.STORE, {
    useFactory: instanceCachingFactory(
      (c) =>
        new SqliteTaskEndStore(
          c.resolve<SqliteConnectionService>(
            PERSISTENCE_TOKENS.SQLITE_CONNECTION,
          ),
          c.resolve<Logger>(TOKENS.LOGGER),
        ),
    ),
  });
  container.register<TaskStatusOverlay>(TASK_SPECS_TOKENS.TASK_STATUS_OVERLAY, {
    useFactory: (c) => {
      const store = c.resolve<SqliteTaskEndStore>(TASK_END_TOKENS.STORE);
      const resolving = new Set<string>();
      return {
        mergedTaskIds: (root) => {
          const detector = c.resolve<TaskEndTransitionDetector>(TASK_END_TOKENS.DETECTOR);
          const repoId = detector.cachedRepoId(root);
          if (repoId) return store.mergedTaskIds(repoId);
          // A root the detector has not seen (for example an explicit
          // worktreePath): resolve its identity once, then tell the index so
          // readers recompute with the overlay.
          if (!resolving.has(root)) {
            resolving.add(root);
            void detector
              .resolveRepoId(root)
              .then((id) => {
                if (id) {
                  c.resolve<TaskIndexService>(TASK_SPECS_TOKENS.TASK_INDEX_SERVICE).notifyStatusOverlayChanged(root);
                }
              })
              // degradation-audit: reported - the next overlay read retries the probe
              .catch(() => undefined)
              .finally(() => resolving.delete(root));
          }
          return new Set<string>();
        },
      };
    },
  });
  container.registerSingleton(
    TASK_END_TOKENS.SETTINGS_READER,
    TaskEndHookSettingsReader,
  );
  container.registerSingleton(
    TASK_END_TOKENS.CENSUS_COORDINATOR,
    CensusCoordinator,
  );
  container.registerSingleton(TASK_END_TOKENS.CLOSE_CURATE_STEP, CloseCurateStep);
  container.registerSingleton(TASK_END_TOKENS.HARVEST_STEP, HarvestStep);
  container.registerSingleton(
    TASK_END_TOKENS.DISPOSE_EVALUATE_STEP,
    DisposeEvaluateStep,
  );
  container.registerSingleton(
    TASK_END_TOKENS.INDEX_REQUEST_STEP,
    IndexRequestStep,
  );
  container.registerSingleton(
    TASK_END_TOKENS.DETECTOR,
    TaskEndTransitionDetector,
  );
  container.registerSingleton(TASK_END_TOKENS.WORKER, TaskEndRunWorker);
  container.registerSingleton(TASK_END_TOKENS.RUN_READER, TaskEndRunReader);
  container.registerSingleton(TASK_END_TOKENS.CLOSE_OUT_SERVICE, TaskCloseOutService);
  container.registerSingleton(TASK_END_TOKENS.PR_RECONCILER, TaskPrReconcilerService);
}

/**
 * The connected runtime of the hook. The host activation runs
 * `detector.reconcileStartup()`, `worker.start()` and `detector.subscribe()`
 * on it, and at shutdown calls {@link dispose} and then races
 * {@link awaitStopped} against its budget.
 */
export interface TaskEndHookHandle {
  readonly detector: TaskEndTransitionDetector;
  readonly worker: TaskEndRunWorker;
  /**
   * Drops the detector-to-worker wake subscription, then disposes the
   * detector and the worker. Idempotent.
   */
  dispose(): void;
  /** Resolves when the running flush, tick and hook censuses have ended. */
  awaitStopped(): Promise<void>;
}

/**
 * Resolves the detector and the worker and wakes the worker whenever the
 * detector creates or cancels runs (D33(1)). Call after
 * {@link registerTaskEndHook} and after the host ports are bound.
 */
export function connectTaskEndHook(
  container: DependencyContainer,
): TaskEndHookHandle {
  const detector = container.resolve<TaskEndTransitionDetector>(
    TASK_END_TOKENS.DETECTOR,
  );
  const worker = container.resolve<TaskEndRunWorker>(TASK_END_TOKENS.WORKER);
  const wakeSubscription = detector.onDidChangeRuns(() => worker.wake());
  let disposed = false;
  return {
    detector,
    worker,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      wakeSubscription.dispose();
      detector.dispose();
      worker.dispose();
    },
    awaitStopped: async () => {
      await detector.whenIdle();
      await worker.awaitStopped();
    },
  };
}
