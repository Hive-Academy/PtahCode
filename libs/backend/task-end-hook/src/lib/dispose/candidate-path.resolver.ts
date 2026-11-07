/**
 * P5 path resolution for one disposal candidate (read-only: `realpath` and
 * `lstat`, never following a symlink at the resolved path).
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DisposalPathResolution } from './disposal-input';
import { isMissing } from './fs-probe';

/** Whether the directory exists, and how its path resolved. */
export type ResolvedCandidate = {
  readonly dirExists: boolean;
  readonly resolution: DisposalPathResolution;
};

/**
 * P5 inputs: the real path when the candidate exists, otherwise the real
 * path of the nearest existing parent plus the raw lexical segments below it
 * (AC 4.10). Segments are not normalised, so `..` reaches the decision.
 */
export async function resolveCandidatePath(
  worktreePath: string,
): Promise<ResolvedCandidate> {
  if (!path.isAbsolute(worktreePath))
    return { dirExists: false, resolution: { kind: 'error' } };
  try {
    const realPath = await fs.realpath(worktreePath);
    const info = await fs.lstat(realPath);
    return {
      dirExists: info.isDirectory(),
      resolution: { kind: 'resolved', realPath },
    };
  } catch (error: unknown) {
    if (!isMissing(error))
      return { dirExists: false, resolution: { kind: 'error' } };
  }

  const root = path.parse(worktreePath).root;
  const rest = worktreePath.slice(root.length);
  const trimmed = rest.endsWith(path.sep) ? rest.slice(0, -1) : rest;
  const segments = trimmed.length === 0 ? [] : trimmed.split(path.sep);
  for (let i = segments.length - 1; i >= 0; i--) {
    const prefix = root + segments.slice(0, i).join(path.sep);
    try {
      const parentRealPath = await fs.realpath(prefix);
      return {
        dirExists: false,
        resolution: {
          kind: 'missing',
          nearestParentRealPath: parentRealPath,
          remainingSegments: segments.slice(i),
        },
      };
    } catch (error: unknown) {
      if (!isMissing(error))
        return { dirExists: false, resolution: { kind: 'error' } };
    }
  }
  return { dirExists: false, resolution: { kind: 'error' } };
}
