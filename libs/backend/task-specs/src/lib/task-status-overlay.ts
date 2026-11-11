import type { TaskStatus } from '@ptah-extension/shared';

/** A host's durable knowledge of merged task PRs. */
export interface TaskStatusOverlay {
  mergedTaskIds(workspaceRoot: string): ReadonlySet<string>;
}

export function effectiveTaskStatus(carrierStatus: TaskStatus, mergedKnown: boolean): TaskStatus {
  return mergedKnown && (carrierStatus === 'in_progress' || carrierStatus === 'in_review')
    ? 'done'
    : carrierStatus;
}
