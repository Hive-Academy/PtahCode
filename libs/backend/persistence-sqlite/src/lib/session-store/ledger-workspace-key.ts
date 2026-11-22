import * as path from 'node:path';

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
 * (`C:`) or a UNC prefix (`\\server`) on any host. It is normalized with
 * `path.win32` (`.`, `..` and repeated separators collapse), trailing
 * separators are stripped, `\` becomes `/`, and case folds. Any other path is
 * POSIX: it is normalized with `path.posix`, only trailing `/` is stripped, a
 * `\` stays a literal filename character, and case folds only on a macOS host.
 * So on Linux `/home/u/./Proj/` and `/home/u/x/../Proj` are `/home/u/Proj`,
 * the folder the session list finds, while `/home/u/proj` and `/srv/a\b`
 * versus `/srv/a/b` stay distinct workspaces.
 *
 * It never resolves against this host's working directory or drive, so the
 * key of an absolute path is the same on every host, and applying it twice
 * returns the same key. A POSIX key that starts with exactly `//` keeps that
 * prefix: it is how a UNC key reads after the first pass.
 *
 * The session list does not use this key. It matches `sessions.workspace_key`
 * (platform-core `normalizeWorkspaceRoot`) exactly.
 */
export function ledgerWorkspaceKey(
  root: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const key = isWindowsPath(root, platform) ? windowsKey(root) : posixKey(root);
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

function windowsKey(root: string): string {
  // `C:` alone normalizes to the drive-relative `C:.`.
  const normalized = path.win32.normalize(root).replace(/^([a-zA-Z]:)\.$/, '$1');
  return normalized.replace(/[\\/]+$/, '').replace(/\\/g, '/') || '/';
}

function posixKey(root: string): string {
  const unc = /^\/\/[^/]/.test(root);
  const normalized = path.posix.normalize(root).replace(/\/+$/, '') || '/';
  return unc ? `/${normalized}` : normalized;
}
