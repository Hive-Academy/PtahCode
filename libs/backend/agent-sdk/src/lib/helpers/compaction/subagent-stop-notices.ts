/** Notices for SDK tasks stopped by Ptah's subagent budget monitor. */
export class SubagentStopNotices {
  private readonly byTaskId = new Map<
    string,
    { readonly sessionId: string; readonly text: string }
  >();

  record(sessionId: string, taskId: string, text: string): void {
    this.byTaskId.set(taskId, { sessionId, text });
  }

  /**
   * Remove the notice of a failed stop attempt, so a later user stop of the
   * still-running task does not carry the budget-monitor label. A newer notice
   * of the same task stays.
   */
  discard(taskId: string, text: string): void {
    if (this.byTaskId.get(taskId)?.text === text) this.byTaskId.delete(taskId);
  }

  noticeFor(taskId: string): string | undefined {
    return this.byTaskId.get(taskId)?.text;
  }

  forgetSession(sessionId: string): void {
    for (const [taskId, notice] of this.byTaskId) {
      if (notice.sessionId === sessionId) this.byTaskId.delete(taskId);
    }
  }
}
