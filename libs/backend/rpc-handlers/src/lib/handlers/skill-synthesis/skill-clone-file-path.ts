/**
 * Path checks for the `file` argument of the skill learning RPCs (U-D13 (1)).
 *
 * The Zod schema is the first gate: it accepts only the fixed
 * `SKILL_CLONE_FILES` values. These helpers are the second gate: the resolved
 * path, and its real path when it exists, must stay inside the clone folder.
 */
import * as fs from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  PHASE_KINDS,
  skillClonePhaseFile,
  type SkillCloneFile,
  type SkillClonePhaseFile,
} from '@ptah-extension/shared';

/** `true` when `candidate` is `root` or a path below it. */
export function isInsideRoot(candidate: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * The absolute path of `file` inside `cloneDir`, or `null` when the path, or
 * the real path of an existing file (a symbolic link), leaves the folder.
 */
export function resolveSkillCloneFilePath(
  cloneDir: string,
  file: SkillCloneFile,
): string | null {
  const target = join(cloneDir, ...file.split('/'));
  if (!isInsideRoot(target, cloneDir)) return null;
  if (!fs.existsSync(target)) return target;
  const realRoot = fs.realpathSync(cloneDir);
  const realTarget = fs.realpathSync(target);
  return isInsideRoot(realTarget, realRoot) ? target : null;
}

/**
 * The phase files that exist in `<cloneDir>/phases/`, in `PHASE_KINDS` order.
 * A file whose real path leaves the folder is not listed.
 */
export function listSkillClonePhaseFiles(
  cloneDir: string,
): SkillClonePhaseFile[] {
  if (!fs.existsSync(join(cloneDir, 'phases'))) return [];
  const files: SkillClonePhaseFile[] = [];
  for (const kind of PHASE_KINDS) {
    const file = skillClonePhaseFile(kind);
    const target = resolveSkillCloneFilePath(cloneDir, file);
    if (target !== null && fs.existsSync(target)) files.push(file);
  }
  return files;
}
