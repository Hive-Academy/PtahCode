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
   * live, so that the PID cannot be reused and no child starts before the job.
   */
  assignToNewJob(pid: number): WindowsJobHandle;
}
