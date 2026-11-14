import { phaseKindForRole, type CloneSummary } from '@ptah-extension/shared';

/**
 * True for an agent clone whose slug is one of the 14 legacy role slugs.
 * Framework-free, so both the clone views and the bulk rebase service use it.
 */
export function isRoleAgentClone(clone: CloneSummary): boolean {
  return clone.kind === 'agent' && phaseKindForRole(clone.slug) !== null;
}
