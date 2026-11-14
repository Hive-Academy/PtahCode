import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Refusal for a skill path outside the active workspace. */
export class SkillPathRefusalError extends Error {
  constructor() {
    super('Skill path is outside the session workspace');
    this.name = 'SkillPathRefusalError';
  }
}

function isInsideRoot(candidate: string, root: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Return the canonical path, or undefined for an unavailable in-workspace file. */
export function resolveWorkspaceSkillPath(root: string, path: string): string | undefined {
  const absoluteRoot = resolve(root);
  const candidate = resolve(absoluteRoot, path);
  if (!isInsideRoot(candidate, absoluteRoot)) throw new SkillPathRefusalError();
  let realCandidate: string;
  let realRoot: string;
  try {
    realCandidate = realpathSync(candidate);
    realRoot = realpathSync(absoluteRoot);
  } catch {
    // degradation-audit: optional-capability - the caller handles an unavailable skill.
    return undefined;
  }
  if (!isInsideRoot(realCandidate, realRoot)) throw new SkillPathRefusalError();
  return realCandidate;
}
