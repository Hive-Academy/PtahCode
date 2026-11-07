import { z } from 'zod';
import {
  normalizeWorkspaceRoot,
  type AgentProcessInfo,
  type CliOutputSegment,
  type CliSessionReference,
} from '@ptah-extension/shared';
import type { AgentSpawnEnvironment } from './agent-spawn-environment.service';
import type { AgentOutputCheckpoint } from './agent-output-journal.service';

const persistedActivitySchema = z.iso.datetime({ offset: true });
const RESTORE_CLOCK_SKEW_MS = 60_000;

/** Clamp a future checkpoint to the restore instant after a small skew allowance. */
function boundedActivityAt(
  value: string | undefined,
  restoredAt: string,
): string | undefined {
  const parsed = persistedActivitySchema.safeParse(value);
  if (!parsed.success) return undefined;
  return Date.parse(parsed.data) > Date.parse(restoredAt) + RESTORE_CLOCK_SKEW_MS
    ? restoredAt
    : parsed.data;
}

/**
 * Lifecycle fields rebuilt from a persisted lane reference. `restoreAgents`
 * excludes live `running` references before calling this helper. The store has
 * already normalized an interrupted lane to `stopped` / `host-restart`.
 */
export function restoreLaneLifecycle(
  ref: CliSessionReference,
  restoredAt: string,
): Pick<
  AgentProcessInfo,
  'status' | 'completedAt' | 'lastActivityAt' | 'stopReason' | 'stopResetAt'
> {
  const lastActivityAt = boundedActivityAt(ref.lastActivityAt, restoredAt);

  return {
    status: ref.status,
    ...(ref.completedAt !== undefined
      ? { completedAt: ref.completedAt }
      : {}),
    ...(lastActivityAt !== undefined ? { lastActivityAt } : {}),
    ...(ref.stopReason !== undefined ? { stopReason: ref.stopReason } : {}),
    ...(typeof ref.stopResetAt === 'number' &&
    Number.isFinite(ref.stopResetAt) &&
    ref.stopResetAt > 0
      ? { stopResetAt: ref.stopResetAt }
      : {}),
  };
}

/** Identity restored beside, never instead of, the lifecycle projection. */
export function restoreLaneIdentity(
  ref: CliSessionReference,
  parentSessionId?: string,
): Pick<
  AgentProcessInfo,
  'parentSessionId' | 'potentialCapabilities' | 'ptahCliId' | 'workspaceKey'
> {
  return {
    ...(parentSessionId ? { parentSessionId } : {}),
    ...(ref.potentialCapabilities !== undefined
      ? { potentialCapabilities: ref.potentialCapabilities }
      : {}),
    ...(ref.ptahCliId ? { ptahCliId: ref.ptahCliId } : {}),
    ...(ref.workspaceKey ? { workspaceKey: ref.workspaceKey } : {}),
  };
}

/** Stamp the caller workspace, or preserve the original lane's key on resume. */
export function stampWorkspaceKey(
  info: AgentProcessInfo,
  spawnEnvironment: Pick<AgentSpawnEnvironment, 'scopedWorkspaceRoot'>,
  resumedFrom?: AgentProcessInfo,
): AgentProcessInfo {
  if (resumedFrom) {
    return resumedFrom.workspaceKey
      ? { ...info, workspaceKey: resumedFrom.workspaceKey }
      : info;
  }
  const scope = spawnEnvironment.scopedWorkspaceRoot();
  return scope === undefined
    ? info
    : { ...info, workspaceKey: normalizeWorkspaceRoot(scope) };
}

/** The resume clock starts at activity, then completion, then spawn. */
export function laneLastActivityAt(
  info: Pick<
    AgentProcessInfo,
    'lastActivityAt' | 'completedAt' | 'startedAt'
  >,
): number {
  return Date.parse(
    info.lastActivityAt ?? info.completedAt ?? info.startedAt,
  );
}

/** Output fields of a restored lane. Lifecycle fields stay with `restoreLaneLifecycle`. */
export interface RestoredLaneOutput {
  readonly stdout: string;
  readonly segments: readonly CliOutputSegment[];
  /** ISO time of the checkpoint the output ends at; later output was lost. */
  readonly outputLostAfter?: string;
  /** The checkpoint is newer than anything the reference persisted. */
  readonly recovered?: true;
}

/**
 * How a running-output checkpoint compares with a lane's saved output, whose
 * end is marked by `outputLostAfter`. No valid marker means the lane saved no
 * checkpoint-derived output, so any checkpoint is `newer`. A checkpoint whose
 * time does not parse is `older`: it never displaces output.
 */
export function checkpointFreshness(
  checkpoint: Pick<AgentOutputCheckpoint, 'at'>,
  outputLostAfter: string | undefined,
): 'newer' | 'same' | 'older' {
  const checkpointMs = Date.parse(checkpoint.at);
  if (Number.isNaN(checkpointMs)) return 'older';
  const marker = persistedActivitySchema.safeParse(outputLostAfter);
  if (!marker.success) return 'newer';
  const markerMs = Date.parse(marker.data);
  if (checkpointMs > markerMs) return 'newer';
  return checkpointMs === markerMs ? 'same' : 'older';
}

/**
 * Output for a restored lane. A lane interrupted by a host restart persisted
 * no output of its own, so its latest running-output checkpoint stands in and
 * names when output stopped. The checkpoint replaces, never appends, so no
 * stream is replayed twice, and only when it is strictly newer than the
 * reference's saved output: an equal or older checkpoint leaves the durable
 * reference output and marker as they are. Returns output fields only: the
 * `host-restart` stamp and the resume gate's idle-rule exception are untouched.
 */
export function applyOutputCheckpoint(
  ref: CliSessionReference,
  checkpoint: AgentOutputCheckpoint | undefined,
): RestoredLaneOutput {
  const persisted = persistedActivitySchema.safeParse(ref.outputLostAfter);
  const persistedLostAfter = persisted.success ? persisted.data : undefined;
  if (
    !checkpoint ||
    checkpoint.agentId !== String(ref.agentId) ||
    ref.stopReason !== 'host-restart' ||
    checkpointFreshness(checkpoint, persistedLostAfter) !== 'newer'
  ) {
    return {
      stdout: ref.stdout ?? '',
      segments: ref.segments ?? [],
      ...(persistedLostAfter ? { outputLostAfter: persistedLostAfter } : {}),
    };
  }
  return {
    stdout: checkpoint.stdoutTail,
    segments: checkpoint.segmentsTail,
    outputLostAfter: checkpoint.at,
    recovered: true,
  };
}

/**
 * Restore references as the renderer receives them: each carries the
 * `outputLostAfter` its restored record holds, for the lost-output notice.
 */
export function withRestoredOutputLoss(
  refs: readonly CliSessionReference[],
  findAgentInfo: (
    agentId: string,
  ) => Pick<AgentProcessInfo, 'startedAt' | 'outputLostAfter'> | undefined,
): CliSessionReference[] {
  return refs.map((ref) => {
    const info = findAgentInfo(String(ref.agentId));
    if (!info?.outputLostAfter || info.startedAt !== ref.startedAt) return ref;
    return info.outputLostAfter === ref.outputLostAfter
      ? ref
      : { ...ref, outputLostAfter: info.outputLostAfter };
  });
}

/** Receives the queued persist of one recovered lane's output (`agent:output-recovered`). */
export type RecoveredOutputTracker = (settled: Promise<void>) => void;

/** How long a restore waits for recovered output to persist before it returns anyway. */
export const RECOVERED_OUTPUT_WAIT_MS = 3_000;

/**
 * How long one shared observer of a recovered write lives. A write still
 * pending after this stays tracked; its expired observer is re-armed by the
 * next restore that waits on it, so a stuck write holds at most one live
 * observer per window, never one per session load. The write itself keeps
 * its place in the lane queue.
 */
export const RECOVERED_OUTPUT_MAX_AGE_MS = 120_000;

/** How a shared observer ended: the write settled, or its max age passed first. */
export type WriteObservation = 'settled' | 'expired';

/** A recovered write and its current shared observer. */
export interface TrackedRecoveredWrite {
  readonly write: Promise<void>;
  observer: Promise<WriteObservation>;
  /** Set once `observer` resolved `expired`; the next waiter re-arms it. */
  expired: boolean;
}

/**
 * The one shared observer of a tracked write. Resolves (never rejects)
 * `settled` when the write settles, or `expired` after `maxAgeMs` with
 * `onExpired` called first. Every waiter races this promise, so the reactions
 * it holds end by `maxAgeMs` at the latest instead of living as long as a
 * stuck write. A rejected write is `settled` too: its writer logs its own
 * failure. `expired` never means the write landed.
 */
export function observeTrackedWrite(
  write: Promise<void>,
  maxAgeMs: number,
  onExpired: () => void,
): Promise<WriteObservation> {
  return new Promise<WriteObservation>((resolve) => {
    const timer = setTimeout(() => {
      onExpired();
      resolve('expired');
    }, maxAgeMs);
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }
    const settle = (): void => {
      clearTimeout(timer);
      resolve('settled');
    };
    write.then(settle, settle);
  });
}

/**
 * Settles `true` once every observer resolved `settled`, `false` when
 * `timeoutMs` passed first or any observer `expired` (an expiry is never a
 * landed write). Takes {@link observeTrackedWrite} observers, which never
 * reject and resolve by their max age, so a timed-out waiter's reactions are
 * released then.
 */
export function settleWithin(
  observers: readonly Promise<WriteObservation>[],
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const settled = Promise.all(observers).then((results) =>
    results.every((result) => result === 'settled'),
  );
  return Promise.race([settled, timedOut]).finally(() => clearTimeout(timer));
}
