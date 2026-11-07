import type { RemoteMachineSessionState } from '@ptah-extension/shared';
import { WORKER_REMOTE_COMMAND } from '@ptah-extension/worker-protocol';

/**
 * Copy of the remote session screens (design 4.6-4.9) and the worker facts it
 * restates. Every argument is display-safe text already (see `displayText`).
 */

/**
 * Seconds a worker waits for an answer to a remote permission request before
 * it denies it (decision 27). Restated from `REMOTE_PERMISSION_TIMEOUT_MS` in
 * `libs/backend/worker-runtime/src/lib/pending-permissions.ts`, which a
 * webview lib may not import; the spec pins the value.
 */
export const REMOTE_PERMISSION_TIMEOUT_SEC = 60;

/**
 * `by` of the `worker:permission.answered` record the worker writes when the
 * timeout denies a request. Restated from `REMOTE_PERMISSION_TIMEOUT_BY`.
 */
export const REMOTE_PERMISSION_TIMEOUT_BY = 'Worker timeout';

/** Shown once the worker's deadline passed or its timeout record arrived. */
export const PERMISSION_TIMED_OUT_COPY = `No answer within ${REMOTE_PERMISSION_TIMEOUT_SEC} s — the worker denied this request.`;

/** Countdown line of a pending, answerable request. */
export function permissionCountdownCopy(secondsLeft: number): string {
  return `Denied automatically in ${Math.max(0, Math.ceil(secondsLeft))} s`;
}

/** The worker command that lists what a paired machine may use. */
export const GRANTS_COMMAND = `${WORKER_REMOTE_COMMAND} grants`;

/** The worker command that frees a lock whose holder has no live session (W10). */
export function locksReleaseCommand(sessionId: string): string {
  return `${WORKER_REMOTE_COMMAND} locks release ${sessionId}`;
}

/**
 * 7c: an answer refused as "not found or not permitted". Neutral on purpose:
 * it never says whether the session or the workspace exists (2.9).
 */
export function permissionNotPermittedCopy(machine: string): string {
  return (
    `This request could not be answered from this app. The session was not found, ` +
    `or this machine's access on ${machine} does not include it. ` +
    `Check the access list on ${machine} (${GRANTS_COMMAND}), or answer at ${machine}.`
  );
}

/** Visible label of a remote session state; an unreachable machine shows "Unknown" (3.4). */
export function remoteSessionStateLabel(
  state: RemoteMachineSessionState,
  machineConnected: boolean,
): string {
  if (!machineConnected) return 'Unknown';
  switch (state) {
    case 'running':
      return 'Running';
    case 'idle':
      return 'Idle';
    case 'interrupted':
      return 'Interrupted';
  }
}

/** Kind of holder a watch-only session shows (design 4.9 9 / 9b / stranded). */
export type DriverHolderKind = 'responding' | 'not-responding' | 'stranded';

const NOT_RESPONDING_SUFFIX = '(not responding)';
const STRANDED_SUFFIX = '(release pending)';

/**
 * The holder kind from its label alone: the remote client receives only the
 * label (plan W8), and the lock composes these two suffixes
 * (`kernel-session-driver-lock.ts`).
 */
export function driverHolderKind(label: string): DriverHolderKind {
  const trimmed = label.trim();
  if (trimmed.endsWith(STRANDED_SUFFIX)) return 'stranded';
  if (trimmed.endsWith(NOT_RESPONDING_SUFFIX)) return 'not-responding';
  return 'responding';
}

/** One 4.9 banner. `role` follows the accessibility rules of 4.9. */
export interface WatchOnlyBanner {
  readonly role: 'status' | 'alert';
  readonly tone: 'run' | 'need' | 'err' | 'done';
  readonly label: string;
  readonly lines: readonly string[];
  /** A command shown in mono under the lines, or `null`. */
  readonly command: string | null;
  /** Small mono code under the lines (9c), or `null`. */
  readonly code: string | null;
  /** Announced once per change through the live region. */
  readonly announcement: string;
}

/** The 9b / stranded fix line that precedes the release command. */
function releaseLine(machine: string): string {
  return `If it has already ended its session, this command on ${machine} frees the lock; it refuses with in-use while that process still has a live session, and then the only fix is to close or recover that process.`;
}

/**
 * 9, 9b and stranded holders. `holder` and `machine` are display-safe;
 * `savedAt` is the local time of the last saved event, or `null`.
 */
export function drivenElsewhereBanner(
  holder: string,
  machine: string,
  sessionId: string,
  savedAt: string | null,
): WatchOnlyBanner {
  const kind = driverHolderKind(holder);
  const recheck = savedAt
    ? `Last saved ${savedAt}. Press Refresh to check again.`
    : 'Press Refresh to check again.';
  const announcement = `This session is driven by ${holder}. Watch only.`;
  if (kind === 'not-responding') {
    return {
      role: 'status',
      tone: 'need',
      label: 'Watch only',
      lines: [
        'Another Ptah process holds this session and is not answering. It may be busy or paused. The session stays locked until that process finishes or is closed.',
        `Close or stop that process on ${machine}.`,
        releaseLine(machine),
      ],
      command: locksReleaseCommand(sessionId),
      code: null,
      announcement,
    };
  }
  const driving = `${holder} is driving this session. You can read what was saved so far. Sending, stopping and answering requests are unavailable until they are done.`;
  if (kind === 'stranded') {
    return {
      role: 'status',
      tone: 'run',
      label: 'Watch only',
      lines: [
        `${driving} It is finishing up; try again in a moment.`,
        recheck,
        releaseLine(machine),
      ],
      command: locksReleaseCommand(sessionId),
      code: null,
      announcement,
    };
  }
  return {
    role: 'status',
    tone: 'run',
    label: 'Watch only',
    lines: [driving, recheck],
    command: null,
    code: null,
    announcement,
  };
}

/**
 * 9c for the Machines view, which is always the remote client: the wire
 * carries only the worker's fixed copy, so no cause, fix path or local code
 * is shown, and no owner is named.
 */
export function lockUnavailableBanner(machine: string): WatchOnlyBanner {
  return {
    role: 'alert',
    tone: 'err',
    label: 'Cannot check who has this session',
    lines: [
      `This machine could not confirm that no one else is using this session, so it will not start or send anything. Try again, and if it keeps happening check the Ptah log on ${machine}.`,
    ],
    command: null,
    code: 'DRIVER_LOCK_UNAVAILABLE',
    announcement: 'Cannot check who has this session.',
  };
}

/** 9d: a re-check found the session free. */
export function lockFreedBanner(holder: string | null): WatchOnlyBanner {
  const who = holder ?? 'The other process';
  return {
    role: 'status',
    tone: 'done',
    label: 'Available',
    lines: [`${who} finished. You can send messages again.`],
    command: null,
    code: null,
    announcement: `${who} finished. You can send messages again.`,
  };
}
