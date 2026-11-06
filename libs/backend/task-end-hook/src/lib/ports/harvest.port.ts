/**
 * What `HarvestPort.harvestTask` reports for one task (plan Component 6.2).
 *
 * Declared here rather than imported from skill-synthesis, so this library
 * does not depend on the engine. The Electron adapter returns the engine's
 * `TaskHarvestResult`, which has the same shape (plan Component 7a).
 *
 * `not-completed` is never recorded as a step outcome: the worker turns it
 * into a carrier re-read.
 */
export interface TaskEndHarvestPortResult {
  readonly outcome:
    | 'harvested'
    | 'already-harvested'
    | 'no-carrier'
    | 'harvest-failed'
    | 'not-completed';
  /** Skill candidates reconciled by this harvest; a count, never text. */
  readonly reconciled: number;
}

/**
 * Harvests one task's spec folder from the root it was seen in.
 * Electron binds it to `SpecHarvesterService.harvestTask`.
 */
export interface HarvestPort {
  harvestTask(
    workspaceRoot: string,
    taskId: string,
  ): Promise<TaskEndHarvestPortResult>;
}
