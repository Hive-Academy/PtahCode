import type { TaskEndCurationResult } from '@ptah-extension/shared';

/**
 * Curates one ended session for the close-curate step (plan Component 6.1).
 *
 * The Electron host binds it to `MemoryTriggerService.curateSessionForTaskEnd`
 * and converts the engine's `CuratorRunReason` to `TaskEndCuratorReason`
 * through a typed identity map (plan Component 10).
 *
 * The result carries codes and counts only: no engine text, path or error
 * message crosses this port. A rejected promise (adapter fault, engine not
 * registered) is recorded by the step as `failed/curator-failed`; its error
 * text never reaches a stored row.
 */
export interface CurationPort {
  curateEndedSession(
    sessionId: string,
    workspaceRoot: string,
    signal: AbortSignal,
  ): Promise<TaskEndCurationResult>;
}
