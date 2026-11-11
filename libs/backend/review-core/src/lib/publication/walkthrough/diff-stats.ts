export interface DiffStats {
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
  /** True when the diff was cut before the end. The counts are then a lower bound. */
  readonly truncated?: boolean;
  /** Paths of the changed files. Absent when the caller has only counts. */
  readonly paths?: ReadonlySet<string>;
}

/** Counts files and changed lines of a unified diff. Lines outside a hunk (headers, "+++") are not counted. */
export function diffStats(diff: string, truncated = false): DiffStats {
  let files = 0;
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  const paths = new Set<string>();
  for (const row of diff.split('\n')) {
    if (row.startsWith('diff --git ')) {
      files++;
      inHunk = false;
      const named = /^diff --git a\/(.+) b\/(.+)$/.exec(row.replace(/\r$/, ''));
      if (named) { paths.add(named[1]); paths.add(named[2]); }
      continue;
    }
    if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(row)) { inHunk = true; continue; }
    if (!inHunk) continue;
    if (row.startsWith('+')) additions++;
    else if (row.startsWith('-')) deletions++;
  }
  return { files, additions, deletions, truncated, paths };
}
