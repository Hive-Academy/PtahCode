/**
 * How a child session ended (TASK_2026_932).
 *
 * The one terminal status model for `ptah_session_start` children. The host
 * child registry derives it from its terminal status and end cause; the
 * `ptah_session_*` tool text and the UI read the same value, so the session
 * list and the open session cannot disagree.
 *
 * Plain types and constants only: NO Zod, NO I/O.
 */

/**
 * - `completed`: the child ended normally after its last turn was delivered.
 * - `handed-off`: a successor continues the work (see `successorId`).
 * - `stopped`: the parent or the user stopped it.
 * - `interrupted`: the host exited, the stream died or the provider failed
 *   while the child was not finished.
 * - `failed`: the child could not continue (a start or succession failure).
 * - `timed-out`: the runtime cap ended it.
 * - `unknown`: the record has no end cause (it was recorded before outcome
 *   tracking). Never guessed.
 */
export const SESSION_CHILD_OUTCOME_KINDS = [
  'completed',
  'handed-off',
  'stopped',
  'interrupted',
  'failed',
  'timed-out',
  'unknown',
] as const;
export type SessionChildOutcomeKind =
  (typeof SESSION_CHILD_OUTCOME_KINDS)[number];

/** The reason text of an outcome whose end cause was never recorded. */
export const SESSION_CHILD_OUTCOME_UNKNOWN_REASON =
  'unknown (recorded before outcome tracking)';

export interface SessionChildOutcome {
  readonly kind: SessionChildOutcomeKind;
  /**
   * Who or what ended the child, in plain words. For example "stopped by the
   * parent session <id> (ptah_session_stop)", "stopped by the user (stop
   * button or tab closed)", "host exit or restart", "provider error",
   * "runtime cap reached", "handed off to <id>".
   */
  readonly reason: string;
  /**
   * The machine end cause when one was recorded (`parent-stop`, `user-stop`,
   * `host-shutdown`, `stream-exit`, `provider-error`, `runtime-cap`,
   * `first-turn-not-started`, ...). Absent for `unknown`.
   */
  readonly cause?: string;
  /** ISO timestamp the child ended. */
  readonly endedAt: string;
  /** `handed-off` only: the latest successor in the chain. */
  readonly successorId?: string;
}

/** Short display label for each outcome kind. */
export const SESSION_CHILD_OUTCOME_LABELS: Readonly<
  Record<SessionChildOutcomeKind, string>
> = {
  completed: 'Completed',
  'handed-off': 'Handed off',
  stopped: 'Stopped',
  interrupted: 'Interrupted',
  failed: 'Failed',
  'timed-out': 'Timed out',
  unknown: 'Unknown',
};
