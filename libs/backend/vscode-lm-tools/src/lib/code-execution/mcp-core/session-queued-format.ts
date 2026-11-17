import type { SessionChildSnapshot } from '@ptah-extension/cli-agent-runtime';

/** A child admitted to the memory queue has no tab or worktree yet. */
export function formatQueuedChild(child: SessionChildSnapshot): string {
  return `- ${child.label} (${child.childSessionId}): queued for memory; branch ${child.branch}; no worktree or tab yet`;
}

export function queuedStartText(child: SessionChildSnapshot): string {
  return [
    `Queued child session "${child.label}" (sessionId ${child.childSessionId}) for memory admission.`,
    formatQueuedChild(child),
    'Check ptah_session_status for its outcome or cancel with ptah_session_stop. It will start when memory is available.',
  ].join('\n\n');
}

/** A child being provisioned may already have its planned worktree path. */
export function formatStartingChild(child: SessionChildSnapshot): string {
  const lines = [
    `- ${child.label} (${child.childSessionId}): starting`,
    `  branch ${child.branch}; started ${child.startedAt}`,
  ];
  if (child.worktreePath) lines.push(`  worktree ${child.worktreePath}`);
  if (child.taskId) lines.push(`  task ${child.taskId}`);
  return lines.join('\n');
}
