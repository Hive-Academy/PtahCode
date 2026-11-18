import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
const missingFile = z.object({ code: z.literal('ENOENT') });

/** Resolve symlinks in existing ancestors while allowing a new target file. */
function resolvedAncestor(value: string): string {
  const missing: string[] = [];
  let current = path.resolve(value);
  for (;;) {
    try { return path.resolve(fs.realpathSync(current), ...missing.reverse()); }
    catch (error: unknown) {
      if (!missingFile.safeParse(error).success) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      // A missing file/directory is expected before Write; continue at its parent.
      const parent = path.dirname(current);
      if (parent === current) throw error instanceof Error ? error : new Error(String(error));
      missing.push(path.basename(current)); current = parent;
    }
  }
}

export function insideNotesWorkspace(workspace: string, candidate: string): boolean {
  const contains = (root: string, file: string): boolean => {
    const relative = path.relative(root, file);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  return contains(workspace, candidate) && contains(resolvedAncestor(workspace), resolvedAncestor(candidate));
}
