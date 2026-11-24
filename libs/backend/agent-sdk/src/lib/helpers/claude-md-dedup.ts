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
import { homedir } from 'node:os';
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
 * Longest text the import scan reads. A longer text counts as one with an
 * import, so its file is always kept.
 */
export const CLAUDE_MD_IMPORT_SCAN_MAX_CHARS = CLAUDE_MD_DEDUP_MAX_BYTES;

/** A fence opener: up to three spaces, then three or more of one marker. */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** A fence closer candidate: a run of one marker and trailing blanks only. */
const FENCE_CLOSE = /^ {0,3}(`+|~+)[ \t]*\r?$/;

/**
 * `text` with each fenced code block blanked. A block closes only on a line
 * of the opener's marker with a run at least as long (CommonMark); a block
 * with no closer runs to the end. The scan reads each line once.
 */
function stripFencedBlocks(text: string): string {
  const out: string[] = [];
  let fence: { readonly marker: string; readonly length: number } | undefined;
  for (const line of text.split('\n')) {
    if (fence) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) {
        fence = undefined;
      }
      out.push('');
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    // The info string of a backtick fence cannot hold a backtick.
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { marker: open[1][0], length: open[1].length };
      out.push('');
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * `text` with each closed HTML comment blanked. An unterminated `<!--` and
 * the text after it stay as they are. Each search starts after the previous
 * match, so the scan is linear in the text length.
 */
function stripHtmlComments(text: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const open = text.indexOf('<!--', from);
    if (open < 0) break;
    const close = text.indexOf('-->', open + 4);
    if (close < 0) break;
    out += `${text.slice(from, open)} `;
    from = close + 3;
  }
  return out + text.slice(from);
}

/**
 * True when Markdown text holds an `@path` import outside code. Fenced blocks,
 * HTML comments and inline code spans are removed first, as the CLI skips
 * imports in them. A text above {@link CLAUDE_MD_IMPORT_SCAN_MAX_CHARS}
 * counts as one with an import.
 */
export function hasClaudeMdImport(text: string): boolean {
  if (text.length > CLAUDE_MD_IMPORT_SCAN_MAX_CHARS) return true;
  const prose = stripHtmlComments(stripFencedBlocks(text)).replace(
    /`[^`\n]*`/g,
    ' ',
  );
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
    // degradation-audit: optional-capability - an absent or unreadable file
    // is not a candidate; the CLI cannot load it twice either.
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

/** What the session loads, so a kept copy is known to reach the model. */
export interface ClaudeMdDedupOptions {
  /** The SDK `settingSources` of the session. */
  readonly settingSources: readonly string[];
  /** The Claude config folder the child reads (`~/.claude` by default). */
  readonly claudeConfigDir?: string;
  readonly platform?: NodeJS.Platform;
  /** The walk gives up and excludes nothing after this many ms. */
  readonly deadlineMs?: number;
  /**
   * Replaces {@link machinePolicyPaths} for the platform (a test hook). The
   * walk excludes nothing when one of these paths exists.
   */
  readonly machinePolicyPaths?: readonly string[];
}

/** The folder of the managed-settings file the CLI reads on Linux. */
const LINUX_MANAGED_DIR = '/etc/claude-code';

/** The reg.exe a CLI under WSL runs to read the Windows policy key. */
const WSL_REG_EXE = '/mnt/c/Windows/System32/reg.exe';

/**
 * The paths of the managed (policy) settings sources the CLI reads on
 * `platform`: the managed-settings file, its drop-in folder, the cached
 * server-managed settings, and on Linux the reg.exe of WSL (WSL can inherit
 * the Windows policy). `undefined` on a platform where a policy source is not
 * a file (the macOS MDM profile, the Windows registry key), because a file
 * check cannot prove that it is absent.
 */
export function machinePolicyPaths(
  platform: NodeJS.Platform,
  claudeConfigDir: string,
): readonly string[] | undefined {
  if (platform !== 'linux') return undefined;
  return [
    path.posix.join(LINUX_MANAGED_DIR, 'managed-settings.json'),
    path.posix.join(LINUX_MANAGED_DIR, 'managed-settings.d'),
    WSL_REG_EXE,
    path.join(claudeConfigDir, 'remote-settings.json'),
  ];
}

/**
 * True when a managed settings source may apply. Managed settings can set
 * `claudeMdExcludes` (or a policy helper that sets it), and that list could
 * drop the copy this module keeps. So any present, unreadable or uncheckable
 * source turns the walk off.
 */
async function machinePolicyMayApply(
  paths: readonly string[] | undefined,
): Promise<boolean> {
  if (paths === undefined) return true;
  for (const file of paths) {
    try {
      await stat(file);
      return true;
    } catch (error: unknown) {
      // degradation-audit: optional-capability - an absent policy path holds
      // no policy; one that cannot be checked may hold policy, so the walk
      // turns off (excludes nothing).
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT' || code === 'ENOTDIR') continue;
      return true;
    }
  }
  return false;
}

/** Default time limit of the walk; session start must not wait on a slow mount. */
export const CLAUDE_MD_DEDUP_DEADLINE_MS = 1_500;

/**
 * True when a settings file the session loads sets its own
 * `claudeMdExcludes`, or cannot be read as JSON. The user's own list could
 * drop the copy this module keeps, so the walk then excludes nothing.
 */
async function userExcludesMayApply(
  cwd: string,
  options: ClaudeMdDedupOptions,
  configDir: string,
): Promise<boolean> {
  const files: string[] = [];
  if (options.settingSources.includes('user')) {
    files.push(path.join(configDir, 'settings.json'));
  }
  files.push(path.join(cwd, '.claude', 'settings.json'));
  files.push(path.join(cwd, '.claude', 'settings.local.json'));
  for (const file of files) {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (error: unknown) {
      // degradation-audit: optional-capability - an absent file sets nothing;
      // any other failure (no permission, a folder in its place) could hide
      // the user's own list, so the walk turns off (excludes nothing).
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT' || code === 'ENOTDIR') continue;
      return true;
    }
    try {
      const parsed: unknown = JSON.parse(text);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'claudeMdExcludes' in parsed
      ) {
        return true;
      }
    } catch {
      // degradation-audit: optional-capability - a settings file that is not
      // valid JSON could hide the user's own list, so the walk turns off.
      return true;
    }
  }
  return false;
}

async function computeExcludes(
  cwd: string,
  options: ClaudeMdDedupOptions,
): Promise<string[]> {
  const platform = options.platform ?? process.platform;
  const configDir = path.resolve(
    options.claudeConfigDir ?? path.join(homedir(), '.claude'),
  );
  // A session folder that does not exist starts no CLI that could load a
  // file, so there is nothing to dedupe.
  if (!(await stat(path.resolve(cwd))).isDirectory()) return [];
  const policyPaths =
    options.machinePolicyPaths ?? machinePolicyPaths(platform, configDir);
  if (await machinePolicyMayApply(policyPaths)) return [];
  if (await userExcludesMayApply(cwd, options, configDir)) return [];
  // The user memory file loads only with the `user` source; it is never kept
  // and never excluded, so no decision depends on it.
  const userMemory = path.join(configDir, 'CLAUDE.md');
  const userMemoryReal = await realpath(userMemory).catch(() => userMemory);
  const candidates = (await collectCandidates(cwd)).filter(
    (file) => file.filePath !== userMemory && file.realPath !== userMemoryReal,
  );

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

/**
 * The `claudeMdExcludes` patterns that drop exact repeats of an instruction
 * file nearer to `cwd`. Empty when nothing repeats. Never throws.
 *
 * A kept copy must reach the model, so the walk excludes nothing unless the
 * session loads both the `project` and the `local` source (every candidate
 * except the user memory file is then loaded) and no loaded settings file
 * sets its own `claudeMdExcludes`. Managed settings can set the same key, so
 * it also excludes nothing when a managed source exists, cannot be read, or
 * cannot be checked with a file read (macOS and Windows; see
 * {@link machinePolicyPaths}). Ptah never passes the SDK `managedSettings`
 * option (the certified launch refuses it). It also excludes nothing when it
 * does not finish within the deadline.
 *
 * A second path to a file already kept (a symlink) is not excluded: the CLI
 * already reads such a file once. Both the spelled path and the real path of
 * an excluded file are returned, because the CLI may match either spelling.
 */
export async function findDuplicateClaudeMdExcludes(
  cwd: string,
  options: ClaudeMdDedupOptions,
): Promise<string[]> {
  if (
    !options.settingSources.includes('project') ||
    !options.settingSources.includes('local')
  ) {
    return [];
  }
  // degradation-audit: optional-capability - dedup only saves tokens; on any
  // failure the session loads every copy, which is the behavior without it.
  return withDeadline(
    computeExcludes(cwd, options).catch((): string[] => []),
    options.deadlineMs ?? CLAUDE_MD_DEDUP_DEADLINE_MS,
  );
}

/** `work`, or no excludes when it does not settle within `ms`. */
export async function withDeadline(
  work: Promise<string[]>,
  ms: number,
): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<string[]>((resolve) => {
    timer = setTimeout(() => resolve([]), ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
