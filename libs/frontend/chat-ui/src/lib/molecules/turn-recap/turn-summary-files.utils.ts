import type { TurnChangeSetFile } from '@ptah-extension/shared';

/** Rows rendered per group before a "Show more" step. */
export const ROW_PAGE_SIZE = 50;

/**
 * Per-file counts as the row shows them. A binary file reads `binary` (git
 * has no line counts for it); unknown counts (the set's or the file's) read
 * `?`; a zero side is omitted unless both sides are zero.
 */
export function formatFileCounts(
  file: TurnChangeSetFile,
  countsUnavailable: boolean,
): string {
  if (file.binary === true) return 'binary';
  const { additions, deletions } = file;
  if (countsUnavailable || additions === null || deletions === null) {
    return '?';
  }
  if (additions === 0 && deletions === 0) return '+0 −0';
  const parts: string[] = [];
  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`−${deletions}`);
  return parts.join(' ');
}

