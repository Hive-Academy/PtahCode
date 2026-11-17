export type WindowsJobPolicy = 'job' | 'no-job';

/**
 * Idempotent close kills every process in the job. Keep a reference until you
 * call `close()`: a handle that is garbage collected also closes the job and
 * kills its processes.
 */
export interface WindowsJobHandle {
  close(): void;
}

export interface IWindowsJobAssigner {
  /**
   * Creates a private kill-on-close job and adds the process. Throws an Error on
   * failure. Call it in the same tick as the spawn, while the `ChildProcess` is
   * live, so that the PID cannot be reused. This makes the gap small but does
   * not remove it: a child that the process starts before the assignment is
   * not in the job. Keep the snapshot cleanup for such a child.
   */
  assignToNewJob(pid: number): WindowsJobHandle;
}
