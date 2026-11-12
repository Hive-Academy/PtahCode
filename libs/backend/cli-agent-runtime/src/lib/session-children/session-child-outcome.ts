/**
 * Pure mapper from a terminal child record to its `SessionChildOutcome`
 * (TASK_2026_932).
 *
 * The registry records five terminal statuses (`handed-off`, `stopped`,
 * `timed-out`, `failed`, `ended`) plus an explicit machine `endCause`. This
 * mapper derives the single outcome model shared by the `ptah_session_*` tool
 * text and the UI. The cause is never parsed from free text: a record without
 * a cause maps to the `unknown` kind (for `ended`) or to the status's own
 * kind with its recorded reason.
 */
import {
  SESSION_CHILD_OUTCOME_UNKNOWN_REASON,
  type SessionChildOutcome,
  type SessionChildOutcomeKind,
  type SessionEndCause,
} from '@ptah-extension/shared';
import type {
  SessionChildLastCompletion,
  SessionChildTerminalStatus,
} from './session-spawner.port';

/** Machine causes the spawner records on a terminal child. */
export type SessionChildEndCause =
  | SessionEndCause
  | 'runtime-cap'
  | 'handed-off'
  | 'first-turn-not-started';

export interface SessionChildOutcomeInput {
  readonly parentSessionId?: string;
  readonly terminalStatus?: SessionChildTerminalStatus;
  readonly endReason?: string;
  readonly endedAt?: string;
  readonly succeededBy?: string;
  readonly lastCompletion?: Pick<SessionChildLastCompletion, 'delivered'>;
  readonly endCause?: SessionChildEndCause;
}

const CAUSE_WORDS: Readonly<
  Record<Exclude<SessionChildEndCause, 'parent-stop' | 'handed-off'>, string>
> = {
  'user-stop': 'stopped by the user (stop button or tab closed)',
  'host-shutdown': 'host exit or restart',
  'workspace-close': 'workspace closed',
  'stream-exit': 'the agent stream exited',
  'provider-error': 'provider error',
  'compaction-abort': 'context compaction did not finish',
  'no-activity-timeout':
    'no stream activity for 180 s (no-activity watchdog); the session can be resumed from its tab',
  'config-reinit': 'configuration reloaded',
  'runtime-cap': 'runtime cap reached',
  'first-turn-not-started': 'first turn did not start',
  unknown: 'the session ended for an unknown reason',
};

/** Outcome of a terminal record; `undefined` while the child is live. */
export function childOutcomeOf(
  record: SessionChildOutcomeInput,
  latestSuccessorId?: string,
): SessionChildOutcome | undefined {
  const status = record.terminalStatus;
  if (!status) return undefined;
  const endedAt = record.endedAt ?? '';
  const cause = record.endCause;
  if (status === 'handed-off') {
    const successorId = latestSuccessorId ?? record.succeededBy;
    return {
      kind: 'handed-off',
      reason: successorId ? `handed off to ${successorId}` : 'handed off',
      ...(cause ? { cause } : {}),
      endedAt,
      ...(successorId ? { successorId } : {}),
    };
  }
  if (!cause) {
    return status === 'ended'
      ? { kind: 'unknown', reason: SESSION_CHILD_OUTCOME_UNKNOWN_REASON, endedAt }
      : {
          kind: status,
          reason: record.endReason || SESSION_CHILD_OUTCOME_UNKNOWN_REASON,
          endedAt,
        };
  }
  return {
    kind: kindOf(status, cause, record.lastCompletion?.delivered === true),
    reason: reasonOf(cause, record.parentSessionId),
    cause,
    endedAt,
  };
}

function kindOf(
  status: Exclude<SessionChildTerminalStatus, 'handed-off'>,
  cause: SessionChildEndCause,
  delivered: boolean,
): SessionChildOutcomeKind {
  // A host exit or a closed workspace interrupts the child, whatever status
  // the shutdown path recorded (TASK_2026_932 review m1).
  if (cause === 'host-shutdown' || cause === 'workspace-close') {
    return 'interrupted';
  }
  if (status !== 'ended') return status;
  if (cause === 'user-stop' || cause === 'parent-stop') {
    return delivered ? 'completed' : 'stopped';
  }
  return 'interrupted';
}

function reasonOf(
  cause: SessionChildEndCause,
  parentSessionId: string | undefined,
): string {
  if (cause === 'parent-stop') {
    return parentSessionId
      ? `stopped by the parent session ${parentSessionId} (ptah_session_stop)`
      : 'stopped by the parent session (ptah_session_stop)';
  }
  if (cause === 'handed-off') return 'handed off';
  return CAUSE_WORDS[cause];
}
