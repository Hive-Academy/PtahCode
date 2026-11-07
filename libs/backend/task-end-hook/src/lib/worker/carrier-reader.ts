import * as path from 'node:path';
import {
  CARRIER_FILE,
  SPEC_ROOT_SEGMENTS,
  isSingleTaskPathSegment,
  type TaskStatus,
} from '@ptah-extension/shared';
import { readCarrierFile } from '../dispose/task-spec.reader';

/**
 * Carrier reader of the run worker (plan Component 5): re-reads a task's
 * `task.md` from disk before each step, so a task reopened while its run
 * waits or runs stops the run (AC 1.2).
 *
 * Read-only and bounded: the file is never followed through a symlink at its
 * own path and never read past `MAX_SPEC_FILE_BYTES` (`readCarrierFile`).
 * The task id comes from the index and is validated as one path segment
 * before any path join.
 */

/** What one carrier read found. */
export type TaskEndCarrierRead =
  | { readonly kind: 'terminal'; readonly status: TaskStatus }
  | { readonly kind: 'non-terminal'; readonly status: TaskStatus }
  /**
   * Absent, unreadable, unparseable, or a task id that is not one path
   * segment. The run continues; dispose records `precondition-unverifiable`
   * from its own carrier probe (finding 20).
   */
  | { readonly kind: 'unreadable' };

const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'done',
  'cancelled',
]);

const UNREADABLE: TaskEndCarrierRead = { kind: 'unreadable' };

/** One path segment, with no surrounding whitespace to trim away. */
function isSafeTaskId(taskId: string): boolean {
  return taskId.trim() === taskId && isSingleTaskPathSegment(taskId);
}

/**
 * Plain class built by the worker (same shape as `DisposalInputCollector`,
 * Decision D19): it has no collaborators, so it needs no DI token.
 */
export class CarrierReader {
  /** Reads `taskId`'s carrier in `seenRoot`, the root it was seen in. */
  async read(seenRoot: string, taskId: string): Promise<TaskEndCarrierRead> {
    if (!isSafeTaskId(taskId)) return UNREADABLE;
    const status = await readCarrierFile(
      path.join(seenRoot, ...SPEC_ROOT_SEGMENTS, taskId, CARRIER_FILE),
      taskId,
    );
    if (status === 'absent' || status === 'unparseable') return UNREADABLE;
    return TERMINAL_TASK_STATUSES.has(status)
      ? { kind: 'terminal', status }
      : { kind: 'non-terminal', status };
  }
}
