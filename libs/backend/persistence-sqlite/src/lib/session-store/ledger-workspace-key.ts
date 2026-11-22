/**
 * The workspace key of the usage ledger in `sessions.sqlite`: the value stored
 * in `session_usage_turns`, `session_stats`, `session_usage_coverage` and
 * `sessions.ledger_workspace_key`, and compared against every ledger read.
 *
 * Producers and readers pass a raw (or platform-core normalized) workspace
 * path, and the store applies this function to every ledger input itself, so
 * a writer and a reader of one folder always agree.
 *
 * Trailing separators are stripped and `\` becomes `/`. Case is folded only
 * where the file system ignores it: for a Windows-style path (drive letter or
 * backslash) on any host, and for every path on a Windows or macOS host. A
 * POSIX path on a case-sensitive host (Linux) keeps its case, so `/home/u/Proj`
 * and `/home/u/proj` stay two workspaces. Applying it twice returns the same
 * key. It does not resolve the path: resolving a key against this host would
 * change it.
 *
 * The session list does not use this key. It matches `sessions.workspace_key`
 * (platform-core `normalizeWorkspaceRoot`) exactly.
 */
export function ledgerWorkspaceKey(
  root: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const key = root.replace(/[\\/]+$/, '').replace(/\\/g, '/') || '/';
  return ledgerKeyFoldsCase(root, platform) ? key.toLowerCase() : key;
}

/** True when the ledger key of `root` ignores case on this host. */
export function ledgerKeyFoldsCase(
  root: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === 'win32' || platform === 'darwin' || isWindowsStylePath(root);
}

function isWindowsStylePath(root: string): boolean {
  return /^[a-zA-Z]:/.test(root) || root.includes('\\');
}
