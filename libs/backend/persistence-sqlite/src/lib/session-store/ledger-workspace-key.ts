/**
 * The workspace key of the usage ledger in `sessions.sqlite`: the value stored
 * in `session_usage_turns`, `session_stats`, `session_usage_coverage` and
 * `sessions.ledger_workspace_key`, and compared against every ledger read.
 *
 * Producers and readers pass a raw (or platform-core normalized) workspace
 * path, and the store applies this function to every ledger input itself, so
 * a writer and a reader of one folder always agree.
 *
 * A Windows path is one on a Windows host, or one with a drive letter
 * (`C:`) or a UNC prefix (`\\server`) on any host. For it, trailing `\` and
 * `/` are stripped, `\` becomes `/`, and case folds. Any other path is POSIX:
 * only trailing `/` is stripped, a `\` stays a literal filename character, and
 * case folds only on a macOS host. So on Linux `/home/u/Proj`, `/home/u/proj`
 * and `/srv/a\b` versus `/srv/a/b` all stay distinct workspaces.
 *
 * Applying it twice returns the same key. It does not resolve the path:
 * resolving a key against this host would change it.
 *
 * The session list does not use this key. It matches `sessions.workspace_key`
 * (platform-core `normalizeWorkspaceRoot`) exactly.
 */
export function ledgerWorkspaceKey(
  root: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const windows = isWindowsPath(root, platform);
  const trimmed = windows
    ? root.replace(/[\\/]+$/, '').replace(/\\/g, '/')
    : root.replace(/\/+$/, '');
  const key = trimmed || '/';
  return ledgerKeyFoldsCase(root, platform) ? key.toLowerCase() : key;
}

/** True when the ledger key of `root` ignores case on this host. */
export function ledgerKeyFoldsCase(
  root: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === 'darwin' || isWindowsPath(root, platform);
}

function isWindowsPath(root: string, platform: NodeJS.Platform): boolean {
  return platform === 'win32' || /^[a-zA-Z]:/.test(root) || root.startsWith('\\\\');
}
