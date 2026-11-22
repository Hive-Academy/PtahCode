import { normalizeWorkspaceRoot as foldWorkspaceRoot } from '@ptah-extension/shared';

/**
 * The workspace key of the usage ledger in `sessions.sqlite`: the value stored
 * in `session_usage_turns`, `session_stats`, `session_usage_coverage` and
 * `sessions.ledger_workspace_key`, and compared against every ledger read.
 *
 * Writers and readers reach the store with two spellings of one folder: the
 * session record carries the real path (`C:\Users\Dev\Proj`), while the usage
 * producers and the Analytics / sidebar readers pass the folded
 * `@ptah-extension/shared` key (`c:/users/dev/proj`). The store applies this
 * function to every ledger input itself, so the two can never disagree.
 *
 * It is the shared fold (no trailing separator, `/` separators, lower case)
 * because that is what every producer already writes. A pure string function
 * gives the same key on every OS, and folding a folded key returns it
 * unchanged. It does not resolve the path: resolving a folded or foreign-OS
 * key against this host would change it.
 *
 * The session list does not use this key. It matches `sessions.workspace_key`
 * (platform-core `normalizeWorkspaceRoot`) exactly, so two folders that differ
 * only by case stay two lists on a case-sensitive file system.
 */
export function ledgerWorkspaceKey(root: string): string {
  const key = foldWorkspaceRoot(root);
  // The fold strips every trailing separator, which empties the POSIX root.
  return key === '' ? '/' : key;
}
