/**
 * Parser for `git status --porcelain=v1 -z --untracked-files=all
 * --ignored=matching` (disposal command table row 3, dispose P7).
 *
 * Format (git-status(1), "Porcelain Format Version 1" with `-z`): each entry
 * is `XY<space><path>` terminated by NUL. Paths are not quoted. For a rename
 * or copy (`R` or `C` in either column) the next NUL-terminated field is the
 * origin path. `??` is an untracked file and `!!` an ignored path; with
 * `--ignored=matching` an ignored directory is one `!! dir/` entry and is not
 * expanded (observed with git 2.56.0, pinned in the spec fixture).
 *
 * Git output is untrusted input: any entry that does not match the format,
 * or a path that is absolute or has a `.`/`..`/empty segment, makes the whole
 * result `error`, which dispose records as `precondition-unverifiable`.
 */

/** One ignored path reported by git, relative to the worktree root. */
export interface GitIgnoredEntry {
  /** `/`-separated relative path, without the trailing `/` of a directory. */
  readonly relPath: string;
  /** Git reported the path with a trailing `/`: an ignored directory. */
  readonly isDirectory: boolean;
}

export type GitPorcelainParseError =
  | 'truncated-output'
  | 'malformed-entry'
  | 'missing-origin-path'
  | 'unsafe-path';

export type GitPorcelainStatus =
  | {
      readonly kind: 'ok';
      /** Staged or unstaged changes to tracked files, conflicts included. */
      readonly trackedChanges: number;
      /** `??` entries: untracked files that are not ignored. */
      readonly untrackedNonIgnored: number;
      readonly ignored: readonly GitIgnoredEntry[];
    }
  | { readonly kind: 'error'; readonly reason: GitPorcelainParseError };

/** Status letters git uses in either column of a v1 entry. */
const STATUS_LETTERS = new Set([' ', 'M', 'T', 'A', 'D', 'R', 'C', 'U']);

export function parseGitStatusPorcelainZ(output: string): GitPorcelainStatus {
  if (output.length === 0) {
    return {
      kind: 'ok',
      trackedChanges: 0,
      untrackedNonIgnored: 0,
      ignored: [],
    };
  }
  // Every entry ends with NUL; output cut by the size cap does not.
  if (!output.endsWith('\0')) return parseError('truncated-output');

  const fields = output.slice(0, -1).split('\0');
  let trackedChanges = 0;
  let untrackedNonIgnored = 0;
  const ignored: GitIgnoredEntry[] = [];

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.length < 4 || field[2] !== ' ') {
      return parseError('malformed-entry');
    }
    const x = field[0];
    const y = field[1];
    const rawPath = field.slice(3);

    if (x === '?' && y === '?') {
      // An untracked nested repository is one `?? dir/` entry.
      if (!isSafeRelativePath(stripTrailingSlash(rawPath))) {
        return parseError('unsafe-path');
      }
      untrackedNonIgnored += 1;
      continue;
    }
    if (x === '!' && y === '!') {
      const isDirectory = rawPath.endsWith('/');
      const relPath = stripTrailingSlash(rawPath);
      if (!isSafeRelativePath(relPath)) return parseError('unsafe-path');
      ignored.push({ relPath, isDirectory });
      continue;
    }
    if (
      !STATUS_LETTERS.has(x) ||
      !STATUS_LETTERS.has(y) ||
      (x === ' ' && y === ' ')
    ) {
      return parseError('malformed-entry');
    }
    if (!isSafeRelativePath(rawPath)) return parseError('unsafe-path');
    if (isRenameOrCopy(x) || isRenameOrCopy(y)) {
      i += 1;
      const origin = fields[i];
      if (origin === undefined || origin.length === 0) {
        return parseError('missing-origin-path');
      }
      if (!isSafeRelativePath(origin)) return parseError('unsafe-path');
    }
    trackedChanges += 1;
  }

  return { kind: 'ok', trackedChanges, untrackedNonIgnored, ignored };
}

function stripTrailingSlash(rawPath: string): string {
  return rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
}

function isRenameOrCopy(letter: string): boolean {
  return letter === 'R' || letter === 'C';
}

/** Relative, `/`-separated, and no empty, `.` or `..` segment. */
function isSafeRelativePath(relPath: string): boolean {
  if (relPath.length === 0) return false;
  if (relPath.startsWith('/') || relPath.includes('\\')) return false;
  if (/^[A-Za-z]:/.test(relPath)) return false;
  return relPath
    .split('/')
    .every(
      (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
    );
}

function parseError(reason: GitPorcelainParseError): GitPorcelainStatus {
  return { kind: 'error', reason };
}
