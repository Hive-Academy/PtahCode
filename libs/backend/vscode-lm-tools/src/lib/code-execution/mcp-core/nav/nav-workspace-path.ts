/**
 * Workspace path resolution for the navigation tools (`ptah_read_symbol`,
 * `ptah_grep`). A path argument may be relative to the workspace root or
 * absolute; either way its real path must stay inside the real workspace
 * root, so a `..` segment or a symlink cannot read outside it.
 */
import { realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { canonicalPathInsideRoot } from '../../namespace-builders/browser-file-url';

/** A path the navigation tools may read. */
export interface NavWorkspacePath {
  /** Real path of the workspace root. */
  readonly rootReal: string;
  /** Real absolute path of the target. */
  readonly absolutePath: string;
  /** Target relative to the root, `/`-separated (`.` for the root itself). */
  readonly relativePath: string;
  readonly isDirectory: boolean;
  readonly sizeBytes: number;
}

export type NavPathResolution =
  | { readonly ok: true; readonly value: NavWorkspacePath }
  | { readonly ok: false; readonly error: string };

/** `/`-separated path of `target` relative to `root` (`.` when equal). */
export function toPosixRelative(rootReal: string, target: string): string {
  const relative = path.relative(rootReal, target);
  return relative === '' ? '.' : relative.split(path.sep).join('/');
}

function isMissingPathError(error: unknown): boolean {
  // A shape check, not `instanceof Error`: fs errors can come from another
  // realm (Jest's sandbox), where the Error constructor differs.
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = error.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Resolve `target` against `workspaceRoot` and confirm containment.
 * A missing path or an escape comes back as `{ ok: false }` with a message
 * fit for the tool result; any other file-system failure is thrown.
 */
export async function resolveNavWorkspacePath(
  target: string,
  workspaceRoot: string,
): Promise<NavPathResolution> {
  if (!path.isAbsolute(workspaceRoot)) {
    return {
      ok: false,
      error: `Error: "workspaceRoot" must be an absolute path (got "${workspaceRoot}").`,
    };
  }
  let rootReal: string;
  try {
    rootReal = await realpath(workspaceRoot);
  } catch (error: unknown) {
    if (isMissingPathError(error)) {
      return {
        ok: false,
        error: `Error: workspace root not found: ${workspaceRoot}`,
      };
    }
    throw error;
  }

  const candidate = path.isAbsolute(target)
    ? target
    : path.resolve(rootReal, target);
  let absolutePath: string;
  try {
    absolutePath = await realpath(candidate);
  } catch (error: unknown) {
    if (isMissingPathError(error)) {
      return { ok: false, error: `Error: path not found: ${target}` };
    }
    throw error;
  }

  if (!canonicalPathInsideRoot(absolutePath, rootReal)) {
    return {
      ok: false,
      error: `Error: "${target}" resolves outside the workspace root; only paths inside ${rootReal} can be read.`,
    };
  }

  const info = await stat(absolutePath);
  // A FIFO or a device would block the read until a writer appears.
  if (!info.isDirectory() && !info.isFile()) {
    return {
      ok: false,
      error: `Error: "${target}" is not a regular file or a directory.`,
    };
  }
  return {
    ok: true,
    value: {
      rootReal,
      absolutePath,
      relativePath: toPosixRelative(rootReal, absolutePath),
      isDirectory: info.isDirectory(),
      sizeBytes: info.size,
    },
  };
}
