import { z } from 'zod';
import {
  normalizeWorkspaceRoot,
  type AgentProcessInfo,
  type CliOutputSegment,
  type CliSessionReference,
} from '@ptah-extension/shared';
import type { AgentSpawnEnvironment } from './agent-spawn-environment.service';
import type { AgentOutputCheckpoint } from './agent-output-journal.service';
import type { CliType } from '@ptah-extension/shared';
import type { TrackedAgent } from './tracked-agent';

export function laneRecordsForSession(agents: Iterable<TrackedAgent>, cliSessionId: string): TrackedAgent[] {
  return Array.from(agents)
    .filter((tracked) => tracked.info.cliSessionId === cliSessionId)
    .sort((a, b) => a.info.startedAt.localeCompare(b.info.startedAt));
}

/** Find the newest record for this CLI and native session, if one exists. */
export function previousResumeRecord(agents: Iterable<TrackedAgent>, cli: CliType, cliSessionId: string | undefined): AgentProcessInfo | undefined {
  if (!cliSessionId) return undefined;
  let latest: AgentProcessInfo | undefined;
  for (const tracked of agents) {
    const info = tracked.info;
    if (info.cli !== cli || info.cliSessionId !== cliSessionId) continue;
    if (!latest || info.startedAt >= latest.startedAt) latest = info;
  }
  return latest;
}

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
 * A recovered write that has not settled yet. It holds exactly one reaction
 * on the write (attached by {@link trackRecoveredWrite}); waiters are plain
 * callbacks that each waiter removes on timeout, so a stuck write never
 * gathers reactions or closures per session load.
 */
export interface TrackedRecoveredWrite {
  readonly waiters: Set<() => void>;
}

/**
 * Track `write` with its one reaction. When it settles (resolved or
 * rejected: its writer logs its own failure), `onSettled` runs first, then
 * every current waiter is released.
 */
export function trackRecoveredWrite(
  write: Promise<void>,
  onSettled: () => void,
): TrackedRecoveredWrite {
  const tracked: TrackedRecoveredWrite = { waiters: new Set() };
  const settle = (): void => {
    onSettled();
    const waiters = [...tracked.waiters];
    tracked.waiters.clear();
    for (const release of waiters) release();
  };
  write.then(settle, settle);
  return tracked;
}

/**
 * Settles `true` once every tracked write settled, `false` when `timeoutMs`
 * passed first. On either outcome this waiter's callbacks are removed from
 * every write, so a timed-out wait leaves nothing behind.
 */
export function waitForRecoveredWrites(
  writes: readonly TrackedRecoveredWrite[],
  timeoutMs: number,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const registered = new Map<TrackedRecoveredWrite, () => void>();
    let done = false;
    const finish = (landed: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const [write, release] of registered) write.waiters.delete(release);
      resolve(landed);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    // One callback per distinct write: a repeated agent id must not add a
    // second callback that the cleanup below could not remove.
    for (const write of new Set(writes)) {
      const release = (): void => {
        registered.delete(write);
        if (registered.size === 0) finish(true);
      };
      registered.set(write, release);
      write.waiters.add(release);
    }
  });
}
