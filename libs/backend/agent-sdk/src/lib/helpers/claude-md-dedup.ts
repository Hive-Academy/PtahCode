/**
 * Duplicate CLAUDE.md detection for the flag-tier `claudeMdExcludes` setting.
 *
 * The Claude CLI loads every CLAUDE.md, `.claude/CLAUDE.md` and
 * `CLAUDE.local.md` from the session folder up to the filesystem root. A
 * workspace that is a copy of an ancestor checkout (a nested snapshot, an
 * archive extracted inside the repository, a standalone repository inside a
 * worktree) then carries the same instruction text two or three times on
 * every turn. The CLI skips the main checkout only for a linked git worktree,
 * so every other nested layout pays for each copy.
 *
 * This module finds the ancestor files whose bytes equal a file nearer to the
 * session folder. The nearest copy stays, so the session keeps all of its
 * instruction text once; only exact repeats are excluded. A file whose text
 * has an `@path` import is never excluded: an import resolves against the
 * folder of its own file, so two equal files can still import different text.
 *
 * The paths become picomatch patterns in the CLI, so a path that holds a glob
 * character is left out rather than escaped. Leaving it out only keeps a copy;
 * it never hides distinct text.
 */
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';

/** Instruction file names the CLI reads in each folder, nearest first. */
export const CLAUDE_MD_FILE_NAMES: readonly string[] = [
  'CLAUDE.local.md',
  path.join('.claude', 'CLAUDE.md'),
  'CLAUDE.md',
];

/** Files above this size are not read; the walk treats them as distinct. */
export const CLAUDE_MD_DEDUP_MAX_BYTES = 512 * 1024;

/** Upper bound on the folders walked, as a guard against odd mounts. */
const MAX_LEVELS = 64;

/** Characters that picomatch reads as glob syntax, plus a backslash. */
const GLOB_SPECIAL = /[*?[\]{}()!+@|^$\\]/;

/** One candidate file found on the walk. */
interface FoundFile {
  readonly filePath: string;
  readonly realPath: string;
  readonly digest: string;
  readonly hasImport: boolean;
}

/**
 * True when Markdown text holds an `@path` import outside code. Fenced blocks,
 * inline code spans and HTML comments are removed first, as the CLI skips
 * imports in them.
 */
export function hasClaudeMdImport(text: string): boolean {
  const prose = text
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/~~~[\s\S]*?(~~~|$)/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
  return /(?:^|\s)@[^\s]/.test(prose);
}

/**
 * The spelling of `filePath` the CLI matches a pattern against: forward
 * slashes on every platform. `undefined` when the path holds a glob character.
 */
export function toClaudeMdExcludePattern(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const spelled = platform === 'win32' ? filePath.replace(/\\/g, '/') : filePath;
  const absolute =
    platform === 'win32' ? path.win32.isAbsolute : path.posix.isAbsolute;
  if (!absolute(filePath)) return undefined;
  if (GLOB_SPECIAL.test(spelled)) return undefined;
  if (spelled.trim() !== spelled) return undefined;
  return spelled;
}

async function readCandidate(filePath: string): Promise<FoundFile | undefined> {
  try {
    const info = await stat(filePath);
    if (!info.isFile() || info.size > CLAUDE_MD_DEDUP_MAX_BYTES) return undefined;
    const bytes = await readFile(filePath);
    return {
      filePath,
      realPath: await realpath(filePath),
      digest: createHash('sha256').update(bytes).digest('hex'),
      hasImport: hasClaudeMdImport(bytes.toString('utf8')),
    };
  } catch {
    // Absent or unreadable: the CLI cannot load it twice either.
    return undefined;
  }
}

/** Every instruction file from `cwd` up to the root, nearest first. */
async function collectCandidates(cwd: string): Promise<FoundFile[]> {
  const found: FoundFile[] = [];
  let dir = path.resolve(cwd);
  for (let level = 0; level < MAX_LEVELS; level += 1) {
    for (const name of CLAUDE_MD_FILE_NAMES) {
      const file = await readCandidate(path.join(dir, name));
      if (file) found.push(file);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

/**
 * The `claudeMdExcludes` patterns that drop exact repeats of an instruction
 * file nearer to `cwd`. Empty when nothing repeats. Never throws.
 *
 * A second path to a file already kept (a symlink) is not excluded: the CLI
 * already reads such a file once. Both the spelled path and the real path of
 * an excluded file are returned, because the CLI may match either spelling.
 */
export async function findDuplicateClaudeMdExcludes(
  cwd: string,
  platform: NodeJS.Platform = process.platform,
): Promise<string[]> {
  let candidates: FoundFile[];
  try {
    // A session folder that does not exist starts no CLI that could load a
    // file, so there is nothing to dedupe.
    if (!(await stat(path.resolve(cwd))).isDirectory()) return [];
    candidates = await collectCandidates(cwd);
  } catch {
    return [];
  }
  const keptDigests = new Set<string>();
  const keptRealPaths = new Set<string>();
  const excludes = new Set<string>();
  for (const file of candidates) {
    if (keptRealPaths.has(file.realPath)) continue;
    if (file.hasImport || !keptDigests.has(file.digest)) {
      keptDigests.add(file.digest);
      keptRealPaths.add(file.realPath);
      continue;
    }
    const patterns = [file.filePath, file.realPath].map((p) =>
      toClaudeMdExcludePattern(p, platform),
    );
    // Exclude only when every spelling is safe; otherwise keep the copy.
    if (patterns.some((p) => p === undefined)) {
      keptRealPaths.add(file.realPath);
      continue;
    }
    for (const p of patterns) excludes.add(p as string);
  }
  return [...excludes];
}
