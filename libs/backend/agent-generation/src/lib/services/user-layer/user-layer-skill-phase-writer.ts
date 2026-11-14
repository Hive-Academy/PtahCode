import { basename, isAbsolute, join, relative, sep } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { isSkillCloneFile, phaseKindOfSkillCloneFile, type SkillClonePhaseFile } from '@ptah-extension/shared';
import { DEFAULT_HISTORY_DIR } from './origin-sidecar.types';
import { computeSourceHash } from './source-hash';

export interface SkillPhaseFileOps {
  readonly skillsRoot: () => string;
  readonly withSlugLock: <T>(slug: string, work: () => Promise<T>) => Promise<T>;
  readonly assertUnderUserLayer: (path: string) => void;
  readonly dirExists: (path: string) => Promise<boolean>;
  readonly fileExists: (path: string) => Promise<boolean>;
  readonly snapshotDirToHistory: (path: string) => Promise<string>;
  readonly writeTextAtomic: (path: string, text: string) => Promise<void>;
  readonly copyFileAtomic: (source: string, target: string) => Promise<void>;
  readonly refreshSidecar: (cloneDir: string, slug: string, hash: string) => Promise<void>;
}

export interface SkillPhaseWriteArgs {
  readonly slug: string;
  readonly file: SkillClonePhaseFile;
  readonly newBody: string;
}

export interface SkillPhaseRevertArgs {
  readonly slug: string;
  readonly file: SkillClonePhaseFile;
  readonly historyTs: string;
}

function isInsideRoot(candidate: string, root: string): boolean {
  const rel = relative(root, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function paths(ops: SkillPhaseFileOps, slug: string, file: SkillClonePhaseFile) {
  if (!isSkillCloneFile(file) || !phaseKindOfSkillCloneFile(file)) throw new Error('Invalid phase file');
  const skillsRoot = ops.skillsRoot();
  const cloneDir = join(skillsRoot, slug);
  const target = join(cloneDir, file);
  ops.assertUnderUserLayer(cloneDir);
  ops.assertUnderUserLayer(target);
  if (!isInsideRoot(cloneDir, skillsRoot)) throw new Error('Skill clone escapes skills root');
  if (!isInsideRoot(target, cloneDir)) throw new Error('Phase file escapes skill clone');
  return { cloneDir, target };
}

export async function writeSkillPhaseFile(ops: SkillPhaseFileOps, args: SkillPhaseWriteArgs) {
  return ops.withSlugLock(args.slug, async () => {
    const { cloneDir, target } = paths(ops, args.slug, args.file);
    let historyTs: string | null = null;
    if (await ops.dirExists(cloneDir)) historyTs = basename(await ops.snapshotDirToHistory(cloneDir));
    else await mkdir(cloneDir, { recursive: true });
    const phasesDir = join(cloneDir, 'phases');
    ops.assertUnderUserLayer(phasesDir);
    if (!isInsideRoot(phasesDir, cloneDir)) throw new Error('Phase directory escapes skill clone');
    await mkdir(phasesDir, { recursive: true });
    await ops.writeTextAtomic(target, args.newBody);
    const currentContentHash = await computeSourceHash(cloneDir);
    await ops.refreshSidecar(cloneDir, args.slug, currentContentHash);
    return { slug: args.slug, historyTs, currentContentHash };
  });
}

export async function revertSkillPhaseFile(ops: SkillPhaseFileOps, args: SkillPhaseRevertArgs) {
  return ops.withSlugLock(args.slug, async () => {
    const { cloneDir, target } = paths(ops, args.slug, args.file);
    if (!args.historyTs || basename(args.historyTs) !== args.historyTs) throw new Error('Invalid history stamp');
    const historyRoot = join(cloneDir, DEFAULT_HISTORY_DIR);
    const historyDir = join(historyRoot, args.historyTs);
    const source = join(historyDir, args.file);
    ops.assertUnderUserLayer(historyRoot);
    ops.assertUnderUserLayer(historyDir);
    ops.assertUnderUserLayer(source);
    if (!isInsideRoot(historyRoot, cloneDir) || !isInsideRoot(historyDir, historyRoot) || !isInsideRoot(source, historyDir)) throw new Error('History file escapes skill clone');
    if (!(await ops.fileExists(source))) return { restored: false, revertedFrom: args.historyTs, newHistoryTs: null };
    const newHistoryTs = basename(await ops.snapshotDirToHistory(cloneDir));
    await ops.copyFileAtomic(source, target);
    const hash = await computeSourceHash(cloneDir);
    await ops.refreshSidecar(cloneDir, args.slug, hash);
    return { restored: true, revertedFrom: args.historyTs, newHistoryTs };
  });
}
