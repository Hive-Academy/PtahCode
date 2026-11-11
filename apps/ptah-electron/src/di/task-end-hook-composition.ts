/**
 * Electron composition of the task-end hook (TASK_2026_886, plan Component 10).
 *
 * Binds the seven host ports of `@ptah-extension/task-end-hook` to the engines
 * this host owns, then registers the library's own classes. Phase 2 calls it
 * only when the SQLite block registered `PERSISTENCE_TOKENS.SQLITE_CONNECTION`,
 * and before phase 3 registers `PtahAPIBuilder`, whose optional run-reader
 * slot builds the detector with every port below (batches.md D39).
 *
 * Every adapter resolves its engine lazily, inside each call. An engine that
 * is not registered on this host makes the call reject (or report
 * `unavailable` for the activity probes); it never throws at registration,
 * and the library maps the rejection to the step's fallback outcome
 * (`failed/curator-failed`, `failed/harvest-failed`, `failed/census-failed`,
 * `blocked/precondition-unverifiable`).
 *
 * Starting the hook (connect, reconcile, worker start) is the activation's
 * job, not this file's.
 */

import type { DependencyContainer, InjectionToken } from 'tsyringe';
import {
  SDK_TOKENS,
  type SessionLifecycleManager,
} from '@ptah-extension/agent-sdk';
import type { AgentProcessManager } from '@ptah-extension/cli-agent-runtime';
import {
  MEMORY_TOKENS,
  type CuratorRunReason,
  type IndexingControlService,
  type IndexingRunDeps,
  type MemoryTriggerService,
  type TaskEndCurateOutcome,
} from '@ptah-extension/memory-curator';
import {
  PLATFORM_TOKENS,
  type IProcessSpawner,
  type IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import {
  SESSION_ORGANIZATION_TOKENS,
  taskIdsInWorktreeName,
  type SessionOrganizationStore,
} from '@ptah-extension/session-organization';
import type {
  GitPrStatusResult,
  TaskEndCurationResult,
  TaskEndCuratorReason,
} from '@ptah-extension/shared';
import {
  SKILL_SYNTHESIS_TOKENS,
  type SpecHarvesterService,
} from '@ptah-extension/skill-synthesis';
import {
  TASK_END_TOKENS,
  registerTaskEndHook,
  type ActivityPort,
  type CensusPort,
  type CurationPort,
  type GitReadRunner,
  type HarvestPort,
  type PrStatusPort,
  type CloseOutPrStatusPort,
  type TaskCloseOutPrStatus,
  type SessionLinkPort,
  type TaskEndPrStatus,
  type TaskEndProbeResult,
} from '@ptah-extension/task-end-hook';
import {
  TOKENS,
  execGit,
  type GitInfoService,
  type Logger,
} from '@ptah-extension/vscode-core';
import {
  CODE_SYMBOL_INDEXER,
  type CodeSymbolIndexer,
} from '@ptah-extension/workspace-intelligence';

// ---------------------------------------------------------------------------
// Curator reason vocabulary
// ---------------------------------------------------------------------------

/**
 * Identity map from memory-curator's `CuratorRunReason` to the shared
 * `TaskEndCuratorReason`. `satisfies` fails the Electron typecheck when the
 * engine gains a code the shared union lacks.
 */
export const CURATOR_REASON_TO_TASK_END = {
  'provider-cooling-down': 'provider-cooling-down',
  'provider-unreachable': 'provider-unreachable',
  'provider-unsupported': 'provider-unsupported',
  'concurrency-slot-timeout': 'concurrency-slot-timeout',
  'curator-queue-wait-timeout': 'curator-queue-wait-timeout',
  'caller-aborted': 'caller-aborted',
  'network-backoff': 'network-backoff',
  'host-shutdown': 'host-shutdown',
  'no-output': 'no-output',
  'curator-error': 'curator-error',
  'auth-required': 'auth-required',
} as const satisfies Record<CuratorRunReason, TaskEndCuratorReason>;

/**
 * The reverse direction: a shared code the engine never produces fails to
 * compile here, because the conditional type is then `false`.
 */
export const TASK_END_REASONS_ALL_FROM_CURATOR: [
  Exclude<TaskEndCuratorReason, CuratorRunReason>,
] extends [never]
  ? true
  : false = true;

function toTaskEndReason(
  reason: CuratorRunReason | null,
): TaskEndCuratorReason | null {
  return reason === null ? null : CURATOR_REASON_TO_TASK_END[reason];
}

/** Converts the engine's closed outcome into the port's closed result. */
export function toTaskEndCurationResult(
  outcome: TaskEndCurateOutcome,
): TaskEndCurationResult {
  switch (outcome.kind) {
    case 'ran':
      return {
        kind: 'ran',
        counts: {
          extracted: outcome.counts.extracted,
          merged: outcome.counts.merged,
          created: outcome.counts.created,
        },
        transcript: outcome.transcript,
      };
    case 'gated':
      return { kind: 'gated', gate: outcome.gate };
    case 'stalled':
      return {
        kind: 'stalled',
        reason: toTaskEndReason(outcome.reason),
        transcript: outcome.transcript,
      };
    case 'failed':
      return {
        kind: 'failed',
        reason: toTaskEndReason(outcome.reason),
        observations: outcome.observations,
        transcript: outcome.transcript,
      };
    case 'threw':
      return { kind: 'threw', stage: outcome.stage };
    default: {
      const unhandled: never = outcome;
      return unhandled;
    }
  }
}

// ---------------------------------------------------------------------------
// PR status vocabulary
// ---------------------------------------------------------------------------

const PR_OPEN: TaskEndPrStatus = { kind: 'open' };
const PR_NONE: TaskEndPrStatus = { kind: 'none' };
const PR_GH_UNAVAILABLE: TaskEndPrStatus = { kind: 'gh-unavailable' };
const PR_ERROR: TaskEndPrStatus = { kind: 'error' };

/** Maps `GitInfoService.readPrStatus` to the closed dispose P9 answer. */
export function toTaskEndPrStatus(result: GitPrStatusResult): TaskEndPrStatus {
  if (result.status === 'ok') {
    return result.pr.state === 'OPEN' ? PR_OPEN : PR_NONE;
  }
  switch (result.reason) {
    case 'no-pr':
      return PR_NONE;
    case 'gh-missing':
    case 'not-github':
      return PR_GH_UNAVAILABLE;
    case 'not-authenticated':
    case 'timeout':
    case 'failed':
      return PR_ERROR;
    default: {
      const unhandled: never = result.reason;
      return unhandled;
    }
  }
}

// ---------------------------------------------------------------------------
// Lazy engine resolution
// ---------------------------------------------------------------------------

/**
 * The engine behind a port is not registered (or not ready) on this host.
 * The message names the engine only: no path, id or engine text.
 */
export class TaskEndEngineUnavailableError extends Error {
  constructor(engine: string) {
    super(`${engine} is not available on this host`);
    this.name = 'TaskEndEngineUnavailableError';
  }
}

function requireEngine<T>(
  container: DependencyContainer,
  token: InjectionToken<T>,
  engine: string,
): T {
  if (!container.isRegistered(token, true)) {
    throw new TaskEndEngineUnavailableError(engine);
  }
  return container.resolve<T>(token);
}

const UNAVAILABLE = { kind: 'unavailable' } as const;

function uniqueInOrder(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

function createCurationPort(container: DependencyContainer): CurationPort {
  return {
    async curateEndedSession(sessionId, workspaceRoot, signal) {
      // The engine pass cannot be cancelled once started; an abort that
      // already happened is a rejection, which the step records as
      // failed/curator-failed.
      signal.throwIfAborted();
      const trigger = requireEngine<MemoryTriggerService>(
        container,
        MEMORY_TOKENS.MEMORY_TRIGGER_SERVICE,
        'memory trigger service',
      );
      return toTaskEndCurationResult(
        await trigger.curateSessionForTaskEnd(sessionId, workspaceRoot),
      );
    },
  };
}

function createHarvestPort(container: DependencyContainer): HarvestPort {
  return {
    async harvestTask(workspaceRoot, taskId) {
      const harvester = requireEngine<SpecHarvesterService>(
        container,
        SKILL_SYNTHESIS_TOKENS.SPEC_HARVESTER_SERVICE,
        'spec harvester',
      );
      return harvester.harvestTask(workspaceRoot, taskId);
    },
  };
}

function createCensusPort(container: DependencyContainer): CensusPort {
  const control = (): IndexingControlService =>
    requireEngine<IndexingControlService>(
      container,
      MEMORY_TOKENS.INDEXING_CONTROL,
      'indexing control',
    );
  const indexer = (): CodeSymbolIndexer =>
    requireEngine<CodeSymbolIndexer>(
      container,
      CODE_SYMBOL_INDEXER,
      'code symbol indexer',
    );
  return {
    async symbolsEnabled(root) {
      return (await control().getStatus(root)).symbolsEnabled;
    },
    isCensusActive(root) {
      return indexer().isIndexing(root);
    },
    async lastIndexedAt(root) {
      return (await control().getStatus(root)).lastIndexedAt;
    },
    async lastError(root) {
      return (await control().getStatus(root)).errorMessage;
    },
    async requestCensus(root, signal) {
      signal.throwIfAborted();
      const symbols = indexer();
      // The hook's own run deps, without `userInitiated`: a hook census is
      // background work and waits on the background-work governor.
      const deps: IndexingRunDeps = {
        runSymbols: (workspaceRoot, options) =>
          symbols.indexWorkspace(workspaceRoot, {
            signal: options?.signal
              ? AbortSignal.any([options.signal, signal])
              : signal,
            ...(options?.onProgress ? { onProgress: options.onProgress } : {}),
          }),
      };
      await control().start('symbols', root, deps);
    },
  };
}

function createSessionLinkPort(
  container: DependencyContainer,
): SessionLinkPort {
  const store = (): SessionOrganizationStore => {
    const resolved = requireEngine<SessionOrganizationStore>(
      container,
      SESSION_ORGANIZATION_TOKENS.STORE,
      'session organization store',
    );
    if (!resolved.isReady()) {
      throw new TaskEndEngineUnavailableError('session organization store');
    }
    return resolved;
  };
  return {
    linkedSessions(taskId, roots) {
      const organization = store();
      const ids: string[] = [];
      for (const root of roots) {
        for (const link of organization.listTaskLinks(root, [taskId])) {
          ids.push(link.sessionId);
        }
      }
      return uniqueInOrder(ids);
    },
    worktreePathForSession(sessionId, roots) {
      const organization = store();
      for (const root of roots) {
        const worktreePath = organization.getOrganization(
          root,
          sessionId,
        )?.worktreePath;
        if (worktreePath) return worktreePath;
      }
      return null;
    },
    // D2: the session-organization export itself, not a copy.
    taskIdsInWorktreeName: (worktreePath, branch) =>
      taskIdsInWorktreeName(worktreePath, branch),
  };
}

function createActivityPort(
  container: DependencyContainer,
  logger: Logger,
): ActivityPort {
  const lifecycle = (): SessionLifecycleManager =>
    requireEngine<SessionLifecycleManager>(
      container,
      SDK_TOKENS.SDK_SESSION_LIFECYCLE_MANAGER,
      'session lifecycle manager',
    );
  const probe = <T>(name: string, read: () => T): TaskEndProbeResult<T> => {
    try {
      return { kind: 'ok', value: read() };
    } catch (error: unknown) {
      // degradation-audit: reported - the port contract turns a probe that
      // cannot answer into `unavailable`, which every caller treats as "not
      // proved" (deferral or precondition-unverifiable), never as a pass. A
      // missing engine is expected on a partial host; anything else is logged.
      if (!(error instanceof TaskEndEngineUnavailableError)) {
        logger.warn('[Electron DI] task-end activity probe failed', {
          probe: name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return UNAVAILABLE;
    }
  };
  type LiveRecord = NonNullable<ReturnType<SessionLifecycleManager['find']>>;
  const liveRecords = (manager: SessionLifecycleManager): LiveRecord[] =>
    manager
      .getLiveSessionIds()
      .map((tabId) => manager.find(tabId))
      .filter((record): record is LiveRecord => record !== undefined);

  return {
    isSessionLive: (sessionId) =>
      probe('isSessionLive', () => lifecycle().find(sessionId) !== undefined),
    liveSessionRoots: () =>
      probe('liveSessionRoots', () => {
        const manager = lifecycle();
        const roots: string[] = [...manager.getLiveWorkspaceRoots()];
        for (const record of liveRecords(manager)) {
          if (record.config.projectPath) roots.push(record.config.projectPath);
        }
        return uniqueInOrder(roots);
      }),
    trackedLaneDirs: () =>
      probe('trackedLaneDirs', () =>
        uniqueInOrder(
          requireEngine<AgentProcessManager>(
            container,
            TOKENS.AGENT_PROCESS_MANAGER,
            'agent process manager',
          )
            .listTrackedAgents()
            .map((agent) => agent.workingDirectory),
        ),
      ),
    registeredWorkspaceRoots: () =>
      probe('registeredWorkspaceRoots', () =>
        requireEngine<IWorkspaceProvider>(
          container,
          PLATFORM_TOKENS.WORKSPACE_PROVIDER,
          'workspace provider',
        ).getWorkspaceFolders(),
      ),
    foregroundActive: (backoffMs) =>
      probe('foregroundActive', () => {
        const now = Date.now();
        return liveRecords(lifecycle()).some(
          (record) =>
            record.turnInFlight || now - record.lastActivityAt < backoffMs,
        );
      }),
  };
}

function createPrStatusPort(
  container: DependencyContainer,
  logger: Logger,
): PrStatusPort {
  return {
    async openPrStatus(mainRoot, branch) {
      try {
        const git = requireEngine<GitInfoService>(
          container,
          TOKENS.GIT_INFO_SERVICE,
          'git info service',
        );
        // The one `gh` read of the hook (plan command table row 7).
        return toTaskEndPrStatus(await git.readPrStatus(mainRoot, branch));
      } catch (error: unknown) {
        // degradation-audit: reported - the port contract never rejects: a
        // failed lookup is `error`, which dispose records as
        // blocked/precondition-unverifiable, so nothing is treated as safe.
        logger.debug('[Electron DI] task-end PR status read failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return PR_ERROR;
      }
    },
  };
}

function createCloseOutPrStatusPort(
  container: DependencyContainer,
  logger: Logger,
): CloseOutPrStatusPort {
  return {
    async prStatus(mainRoot, branch): Promise<TaskCloseOutPrStatus> {
      try {
        const git = requireEngine<GitInfoService>(
          container, TOKENS.GIT_INFO_SERVICE, 'git info service',
        );
        const result = await git.readPrStatus(mainRoot, branch);
        if (result.status !== 'ok') {
          return { kind: 'unknown', lookupFailed: result.reason !== 'no-pr' && result.reason !== 'not-github' };
        }
        if (result.pr.headRefName !== branch || !result.pr.url) {
          return { kind: 'unknown' };
        }
        const { number, url, state } = result.pr;
        if (state === 'OPEN') return { kind: 'open', number, url };
        if (state === 'MERGED') return result.pr.baseRefName === 'main'
          ? { kind: 'merged', number, url }
          : { kind: 'unknown' };
        if (state === 'CLOSED') return { kind: 'closed-unmerged', number, url };
        return { kind: 'unknown' };
      } catch (error: unknown) {
        return { kind: 'unknown', lookupFailed: true };
      }
    },
  };
}

/**
 * `execGit` at background priority, through the off-thread spawner when this
 * host bound one. The library wraps this runner in `ReadOnlyGit`, which
 * rejects any vector outside the read-only allow-list before it reaches here.
 */
function createGitReadRunner(container: DependencyContainer): GitReadRunner {
  return {
    run(args, cwd, options) {
      const spawner = container.isRegistered(SDK_TOKENS.SDK_PROCESS_SPAWNER, true)
        ? container.resolve<IProcessSpawner>(SDK_TOKENS.SDK_PROCESS_SPAWNER)
        : undefined;
      return execGit([...args], cwd, {
        timeoutMs: options.timeoutMs,
        maxOutputBytes: options.maxOutputBytes,
        priority: 'background',
        ...(options.signal ? { signal: options.signal } : {}),
        ...(spawner ? { spawner } : {}),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Binds the seven host ports, then registers the library. Resolves nothing.
 */
export function registerTaskEndHookComposition(
  container: DependencyContainer,
  logger: Logger,
): void {
  container.register<CurationPort>(TASK_END_TOKENS.CURATION_PORT, {
    useValue: createCurationPort(container),
  });
  container.register<HarvestPort>(TASK_END_TOKENS.HARVEST_PORT, {
    useValue: createHarvestPort(container),
  });
  container.register<CensusPort>(TASK_END_TOKENS.CENSUS_PORT, {
    useValue: createCensusPort(container),
  });
  container.register<SessionLinkPort>(TASK_END_TOKENS.SESSION_LINK_PORT, {
    useValue: createSessionLinkPort(container),
  });
  container.register<ActivityPort>(TASK_END_TOKENS.ACTIVITY_PORT, {
    useValue: createActivityPort(container, logger),
  });
  container.register<PrStatusPort>(TASK_END_TOKENS.PR_STATUS_PORT, {
    useValue: createPrStatusPort(container, logger),
  });
  container.register<CloseOutPrStatusPort>(TASK_END_TOKENS.CLOSE_OUT_PR_STATUS_PORT, {
    useValue: createCloseOutPrStatusPort(container, logger),
  });
  container.register<GitReadRunner>(TASK_END_TOKENS.GIT_READ_RUNNER, {
    useValue: createGitReadRunner(container),
  });
  registerTaskEndHook(container);
}
