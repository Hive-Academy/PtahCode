/**
 * A succession replaces a live child with a new session in the same worktree,
 * branch and parent. The predecessor ends handed-off. The spawner owns the
 * state machine; these helpers only resolve paths and render text.
 */
import { isAbsolute, resolve } from 'node:path';
import type { SessionChildRecord } from './session-child.registry';
import type { SessionChildSettings } from './session-child-settings';
import type { SessionChildSuccessionCause } from './session-spawner.port';

export const SESSION_CHILD_HANDOFF_FILE = 'HANDOFF.md';

/** Where a child writes its handoff file: task folder or worktree root. */
export function sessionChildHandoffPath(
  child: Pick<SessionChildRecord, 'taskFolder' | 'worktreePath'>,
): string {
  const folder = child.taskFolder
    ? isAbsolute(child.taskFolder)
      ? child.taskFolder
      : resolve(child.worktreePath, child.taskFolder)
    : child.worktreePath;
  return resolve(folder, SESSION_CHILD_HANDOFF_FILE);
}

/** Delay from child start to its runtime warning, in milliseconds. */
export function runtimeWarnDelayMs(
  settings: Pick<SessionChildSettings, 'maxRuntimeMinutes' | 'runtimeWarnLeadMinutes'>,
): number {
  return Math.max(0, settings.maxRuntimeMinutes - settings.runtimeWarnLeadMinutes) * 60_000;
}

/** Peer message sent ahead of the runtime cap. */
export function renderRuntimeCapWarning(input: {
  readonly minutesLeft: number;
  readonly graceMinutes: number;
  readonly handoffPath: string;
}): string {
  return `This session reaches its runtime cap in ${input.minutesLeft} minutes. It is not interrupted now. ` +
    'Finish the current step; do not start a new one. Commit verified work if a commit is due; ' +
    'leave other work uncommitted in the worktree. ' +
    `Write ${input.handoffPath} with the current state, work done, remaining steps, running lanes ` +
    'and their agent ids, verification state, and open decisions. ' +
    'Call ptah_session_handoff with that path and a continuation prompt. ' +
    'A successor session continues in the same worktree and branch and receives the running lanes. ' +
    `Without a handoff, the host starts a successor by itself at the latest ${input.graceMinutes} minutes after the cap.`;
}

function causeWords(cause: SessionChildSuccessionCause): string {
  switch (cause) {
    case 'child-handoff': return 'child handoff';
    case 'runtime-cap': return 'runtime cap';
    case 'runtime-cap-interrupted': return 'runtime cap interrupted';
    case 'session-ended': return 'session ended';
  }
}

/** Task text placed after the child contract for a successor. */
export function renderSuccessorTask(input: {
  readonly predecessorId: string;
  readonly cause: SessionChildSuccessionCause;
  readonly originalTask: string;
  readonly handoffPath: string;
  readonly handoffExists: boolean;
  readonly adoptedLanes: readonly string[];
  readonly prompt?: string;
  readonly endCause?: string;
}): string {
  const lines = [
    `You continue the work of child session ${input.predecessorId} (${causeWords(input.cause)}).`,
    'The worktree and branch are the same. They may contain uncommitted work; keep it. Never revert, restore, stash or clean it.',
    input.handoffExists
      ? `Read ${input.handoffPath} first.`
      : 'No handoff file exists: inspect git status, git diff and the task folder to rebuild the state.',
  ];
  if (input.handoffExists && input.cause !== 'child-handoff') {
    lines.push('The host started this session, so that file can be older than the latest work: git status and git diff are the truth.');
  }
  if (input.cause !== 'child-handoff') {
    lines.push('If the work of the original task is already complete, say so in one short turn and stop.');
  }
  if (input.cause === 'runtime-cap-interrupted') {
    lines.push('The previous turn was interrupted mid-step; the last command may need to run again.');
  }
  if (input.cause === 'session-ended') {
    lines.push(`The previous session ended unexpectedly (${input.endCause ?? 'unknown'}). The last command may need to run again; no handoff file may exist.`);
  }
  lines.push(input.adoptedLanes.length > 0
    ? `Adopted lane ids: ${input.adoptedLanes.join(', ')}. Their completion signals now arrive in this session.`
    : 'There are no adopted lanes.');
  lines.push('Do not call ptah_session_handoff_ack.');
  if (input.prompt !== undefined) {
    lines.push('Continuation prompt from the previous session:', input.prompt);
  }
  lines.push('Original task:', input.originalTask);
  return lines.join('\n');
}

/**
 * Session ends caused by an explicit stop stay stopped. A no-activity
 * watchdog end also stays stopped (no automatic successor): the parent gets a
 * failed completion that names the cause and can resume the session.
 */
export function routeSessionEndCause(cause: string): 'stop' | 'succeed' {
  return cause === 'user-stop' || cause === 'parent-stop' ||
    cause === 'workspace-close' || cause === 'host-shutdown' ||
    cause === 'no-activity-timeout' ? 'stop' : 'succeed';
}

/** The predecessor's end reason. */
export function successionEndReason(
  successorId: string,
  cause: SessionChildSuccessionCause,
): string {
  return `handed off to child session ${successorId} (${causeWords(cause)}); work continues in the same worktree`;
}
