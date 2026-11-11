/**
 * The `.gitignore` managed block (E23, defect 15).
 *
 * Every artifact this lib writes is a DERIVED copy of `~/.ptah/user`. Committing
 * one is committing a build output: the next reconcile on another machine
 * overwrites it, and a reviewer reads a hundred-file diff for a skill nobody
 * edited. Before this, Ptah wrote no ignore entries at all, so every copy
 * landed untracked-but-visible in `git status` and the user either committed it
 * or learned to ignore their own status output.
 *
 * Three properties make this safe to run on every full reconcile:
 *
 * 1. **Everything outside the markers is preserved byte-for-byte.** The block is
 *    spliced by index, not by splitting and re-joining lines, so a file with
 *    mixed line endings, no trailing newline, or a BOM comes back unchanged
 *    except between the markers.
 * 2. **A path any existing rule already talks about is never restated.**
 *    `git check-ignore` needs a git binary this lib does not have, so the test
 *    is a path-prefix comparison against the rules OUTSIDE our own block, in
 *    both directions. The downward direction (`.claude/*` covers
 *    `.claude/commands/`) saves a redundant line; the UPWARD direction
 *    (`!.claude/skills/example-skill/**` blocks `.claude/skills/`) prevents a
 *    blanket rule appended at the end of the file from silently defeating an
 *    earlier negation and dropping tracked files out of `git status`.
 * 3. **A deleted block stays deleted.** Absence alone cannot distinguish "never
 *    written" from "written and removed", so the fact is recorded in
 *    `{ws}/.ptah/harness/state.json` and re-adding requires toggling
 *    `harness.manageGitignore`.
 *
 * MCP config files are deliberately NOT ignored. `.mcp.json`, `.cursor/mcp.json`
 * and `.vscode/mcp.json` are files teams commit on purpose — they are project
 * configuration that happens to have a Ptah-owned fragment inside it, not a
 * derived copy. Only whole directories of skill/command/agent copies are listed.
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, posix } from 'path';
import type { Logger } from '@ptah-extension/vscode-core';
import { atomicWriteWithRetry } from '../fs/atomic-write';
import { HarnessStateStore } from './harness-state-store';

export const GITIGNORE_BEGIN = '# ptah:harness:begin';
export const GITIGNORE_END = '# ptah:harness:end';

/** The two lines of explanation that ride inside the block. */
const BLOCK_PREAMBLE = [
  '# Managed by Ptah. Derived copies of ~/.ptah/user — edit the source, not these.',
  '# Delete this whole block to opt out, or set harness.manageGitignore to false.',
];

/** Why a pass did nothing, or what it did. Reported in logs and in specs. */
export type GitignoreOutcome =
  | 'written'
  | 'unchanged'
  | 'nothing-to-ignore'
  | 'disabled'
  | 'removed-by-user'
  | 'failed';

export interface GitignoreResult {
  outcome: GitignoreOutcome;
  /** Patterns in the block after this pass. Empty unless `written`/`unchanged`. */
  patterns: string[];
  /** Narrowed message; only set for `failed`. */
  reason?: string;
}

export interface HarnessGitignoreDeps {
  /**
   * Reads `harness.manageGitignore`; `undefined` means "use the default".
   *
   * A lambda rather than an injected `IWorkspaceProvider` because this lib does
   * not depend on `platform-core` and is not going to start — the host reads
   * the setting and hands the value down, exactly as it already does for
   * `harness.preflightTimeoutMs`.
   */
  readManageGitignore?: () => boolean | undefined;
  stateStore?: HarnessStateStore;
  /**
   * Which of `relPaths` (workspace-relative POSIX directories) hold at least
   * one file tracked by git. `null` means "unknown" (no git, not a repository,
   * a timeout), and then NO per-skill rule is written: hiding a skill the
   * project owns is worse than one untracked folder in `git status`.
   * Defaults to one `git ls-files` call.
   */
  listTrackedPaths?: (
    workspaceRoot: string,
    relPaths: readonly string[],
  ) => ReadonlySet<string> | null;
}

/** Unset means on. An ignore block is the behaviour a user expects by default. */
export const DEFAULT_MANAGE_GITIGNORE = true;

export class HarnessGitignoreWriter {
  private readonly stateStore: HarnessStateStore;

  constructor(
    private readonly logger: Logger,
    private readonly deps: HarnessGitignoreDeps = {},
  ) {
    this.stateStore =
      deps.stateStore ??
      new HarnessStateStore((message, detail) =>
        this.logger.warn(message, toDetail(detail)),
      );
  }

  /**
   * @param dirs Workspace-relative POSIX directories written for DETECTED
   *   targets this pass. An undetected CLI contributes nothing — ignoring
   *   `.cursor/skills/` in a workspace with no Cursor is noise about a
   *   directory that does not exist.
   * @param skillPaths Workspace-relative POSIX directories of the skills this
   *   workspace syncs (manifest-owned, `<skills dir>/<slug>`). When a
   *   re-inclusion (`!.claude/skills/**`) stops the whole-directory rule, each
   *   one that git does not track gets its own exact `<dir>/<slug>/` rule. The
   *   block is rebuilt every pass, so a skill that is no longer synced loses
   *   its rule.
   */
  apply(
    workspaceRoot: string,
    dirs: readonly string[],
    skillPaths: readonly string[] = [],
  ): GitignoreResult {
    const enabled = this.readSetting();
    const state = this.stateStore.load(workspaceRoot);

    // A toggle is the documented undo for a deletion. Comparing against the
    // RECORDED value is what makes it detectable: "the setting is on" reads
    // identically before and after the user turned it back on.
    const toggled =
      state.gitignoreSetting !== undefined &&
      state.gitignoreSetting !== enabled;
    if (toggled) {
      // Both flags, not just the first. `gitignoreBlockWritten` is what makes
      // an absent block read as a DELETION rather than as a first run, so
      // clearing the deletion without clearing the evidence for it would have
      // the very next pass re-derive the deletion and the toggle would do
      // nothing at all.
      state.gitignoreBlockRemovedByUser = false;
      state.gitignoreBlockWritten = false;
    }
    state.gitignoreSetting = enabled;

    if (!enabled) {
      this.stateStore.save(workspaceRoot, state);
      return { outcome: 'disabled', patterns: [] };
    }

    const path = join(workspaceRoot, '.gitignore');
    let text = '';
    try {
      text = existsSync(path) ? readFileSync(path, 'utf-8') : '';
    } catch (error: unknown) {
      return failed(error);
    }

    const existing = findBlock(text);

    if (existing.kind === 'unterminated') {
      this.logger.warn(
        '[harness-sync] .gitignore has a ptah:harness:begin marker with no end; leaving the file alone',
        { workspaceRoot },
      );
      this.stateStore.save(workspaceRoot, state);
      return { outcome: 'unchanged', patterns: [] };
    }

    // Written once, gone now: the user removed it by hand.
    if (state.gitignoreBlockWritten === true && existing.kind === 'absent') {
      state.gitignoreBlockRemovedByUser = true;
      this.stateStore.save(workspaceRoot, state);
      this.logger.debug(
        '[harness-sync] .gitignore block was removed by the user; leaving it out',
        { workspaceRoot },
      );
      return { outcome: 'removed-by-user', patterns: [] };
    }

    if (state.gitignoreBlockRemovedByUser === true) {
      this.stateStore.save(workspaceRoot, state);
      return { outcome: 'removed-by-user', patterns: [] };
    }

    // Presence is tested against the file MINUS our own block. Without the
    // subtraction the second run would find every pattern "already ignored"
    // (by us) and empty the block it wrote on the first.
    const outside =
      existing.kind === 'found'
        ? text.slice(0, existing.start) + text.slice(existing.end)
        : text;
    const dirPatterns = selectPatterns(dirs, outside);
    const skillPatterns = this.selectSkillPatterns(
      workspaceRoot,
      dirs,
      dirPatterns,
      skillPaths,
      outside,
    );
    const patterns = [...dirPatterns, ...skillPatterns].sort();

    if (patterns.length === 0 && existing.kind !== 'found') {
      // Either nothing is detected yet or the user ignores these paths their
      // own way. Writing an empty block would be a diff that says nothing.
      this.stateStore.save(workspaceRoot, state);
      return {
        outcome: 'nothing-to-ignore',
        patterns: [],
      };
    }

    const eol = detectEol(text);
    const block = renderBlock(patterns, eol);
    if (
      existing.kind === 'found' &&
      text.slice(existing.start, existing.end) === block
    ) {
      this.stateStore.save(workspaceRoot, state);
      return { outcome: 'unchanged', patterns };
    }

    // An exact skill rule must come after any project negation, because the
    // last matching gitignore rule wins. Move an existing block to the end
    // when a negation follows it. An empty block keeps its markers, so the
    // next pass does not read the removal of the last rule as a user opt-out.
    const negationAfterBlock =
      existing.kind === 'found' &&
      /^[ \t]*!/m.test(text.slice(existing.end));
    const next =
      existing.kind !== 'found'
        ? appendBlock(text, block, eol)
        : skillPatterns.length > 0 && negationAfterBlock
          ? appendBlock(
              (text.slice(0, existing.start) + text.slice(existing.end))
                .replace(/(\r?\n)+$/, ''),
              block,
              eol,
            )
          : text.slice(0, existing.start) + block + text.slice(existing.end);

    try {
      // Atomic + retried: `.gitignore` is a file the user's editor and every
      // git tool touch constantly, so a plain write is exactly the case where a
      // Windows sharing violation loses the block AND truncates the file.
      atomicWriteWithRetry(path, next);
    } catch (error: unknown) {
      return failed(error);
    }

    state.gitignoreBlockWritten = true;
    this.stateStore.save(workspaceRoot, state);
    this.logger.debug('[harness-sync] .gitignore managed block updated', {
      workspaceRoot,
      patterns: patterns.length,
    });
    return { outcome: 'written', patterns };
  }

  /**
   * Exact rules for synced skills that would otherwise show in `git status`.
   * The whole-directory rule is skipped when the project re-includes the
   * directory for its own skills (see `isCovered`), so each synced skill gets
   * `<dir>/<slug>/` instead, but only when no outside rule already names or
   * ignores it and git tracks none of its files. A project-owned skill is
   * never hidden.
   */
  private selectSkillPatterns(
    workspaceRoot: string,
    dirs: readonly string[],
    dirPatterns: readonly string[],
    skillPaths: readonly string[],
    outsideText: string,
  ): string[] {
    if (skillPaths.length === 0) return [];
    const managed = new Set(
      dirs.map(toPattern).filter((p): p is string => p !== null),
    );
    const rules = parseRules(outsideText);

    const candidates = new Set<string>();
    for (const skillPath of skillPaths) {
      const pattern = toPattern(skillPath);
      if (pattern === null) continue;
      const rel = pattern.slice(0, -1);
      const parent = `${posix.dirname(rel)}/`;
      // Only skills inside a managed directory, and only when that directory
      // has no whole-directory rule in the block already.
      if (!managed.has(parent) || dirPatterns.includes(parent)) continue;
      const named = rules.some(
        (rule) => rule.path === rel || rule.path.startsWith(`${rel}/`),
      );
      if (named || isIgnoredByRules(rel, rules)) continue;
      candidates.add(rel);
    }
    if (candidates.size === 0) return [];

    const list = [...candidates];
    const tracked = this.listTracked(workspaceRoot, list);
    if (tracked === null) return [];
    return list
      .filter((rel) => !tracked.has(rel))
      .map((rel) => `${rel}/`);
  }

  private listTracked(
    workspaceRoot: string,
    relPaths: readonly string[],
  ): ReadonlySet<string> | null {
    try {
      return (this.deps.listTrackedPaths ?? gitTrackedPaths)(
        workspaceRoot,
        relPaths,
      );
    } catch (error: unknown) {
      this.logger.debug('[harness-sync] git tracked-path check failed', {
        workspaceRoot,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private readSetting(): boolean {
    try {
      const value = this.deps.readManageGitignore?.();
      return typeof value === 'boolean' ? value : DEFAULT_MANAGE_GITIGNORE;
    } catch {
      return DEFAULT_MANAGE_GITIGNORE;
    }
  }
}

/**
 * Locate the managed block.
 *
 * - `absent` — no begin marker; the block has never been written, or the user
 *   removed it whole.
 * - `found` — begin and end, with the byte range they span, markers included.
 * - `unterminated` — a begin marker with no end after it. Someone edited the
 *   file by hand and cut it in half. The caller refuses to write in that case,
 *   for the same reason a corrupt manifest reads as empty: guessing where the
 *   block ends risks deleting lines the user wrote.
 */
type BlockLocation =
  | { kind: 'absent' }
  | { kind: 'unterminated' }
  | { kind: 'found'; start: number; end: number };

function findBlock(text: string): BlockLocation {
  const begin = new RegExp(`^[ \\t]*${escapeRe(GITIGNORE_BEGIN)}[ \\t]*$`, 'm');
  const beginMatch = begin.exec(text);
  if (beginMatch === null) return { kind: 'absent' };

  const end = new RegExp(`^[ \\t]*${escapeRe(GITIGNORE_END)}[ \\t]*$`, 'm');
  const endMatch = end.exec(text.slice(beginMatch.index));
  if (endMatch === null) return { kind: 'unterminated' };

  return {
    kind: 'found',
    start: beginMatch.index,
    end: beginMatch.index + endMatch.index + endMatch[0].length,
  };
}

/**
 * Directories that are not already ignored, normalized to trailing-slash POSIX
 * patterns, deduplicated, sorted.
 *
 * Sorted so the block is stable: Codex and Antigravity both contribute
 * `.agents/skills/`, and target iteration order is a detection detail that must
 * not show up as a diff.
 */
function selectPatterns(
  dirs: readonly string[],
  outsideText: string,
): string[] {
  const existingPaths = parseRules(outsideText).map((rule) => rule.path);

  const selected = new Set<string>();
  for (const dir of dirs) {
    const pattern = toPattern(dir);
    if (pattern === null) continue;
    if (isCovered(pattern.slice(0, -1), existingPaths)) continue;
    selected.add(pattern);
  }
  return [...selected].sort();
}

interface ParsedRule {
  /** Path the rule talks about, as {@link rulePath} reduces it. */
  path: string;
  negated: boolean;
  /** The rule without `!` and a leading `/` or `**` + `/`. */
  body: string;
}

function parseRules(text: string): ParsedRule[] {
  const rules: ParsedRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const path = rulePath(line);
    if (path === null) continue;
    const body = line.replace(/^!/, '').replace(/^\*\*\//, '').replace(/^\//, '');
    rules.push({ path, negated: line.startsWith('!'), body });
  }
  return rules;
}

/**
 * Whether git would ignore the directory `rel`, from the outside rules only.
 * A small model of git's rules: the last matching rule wins; `x/**` and
 * `x/*` match what is inside `x`; a plain `x` or `x/` matches `x` and what is
 * inside it; a name with no inner slash matches at any depth. A rule with
 * other wildcards is skipped, so the answer can only err towards "not
 * ignored", which costs one redundant line, never a hidden skill.
 */
function isIgnoredByRules(rel: string, rules: readonly ParsedRule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (ruleMatches(rule.body, rel)) ignored = !rule.negated;
  }
  return ignored;
}

function ruleMatches(body: string, rel: string): boolean {
  let base = body;
  let insideOnly = false;
  if (base.endsWith('/**')) {
    base = base.slice(0, -3);
    insideOnly = true;
  } else if (base.endsWith('/*')) {
    base = base.slice(0, -2);
    insideOnly = true;
  }
  base = base.replace(/\/+$/, '');
  if (base === '' || /[*?[\]]/.test(base)) return false;

  if (!base.includes('/')) {
    // A bare name matches that name at any depth.
    const segments = rel.split('/');
    const last = insideOnly ? segments.length - 1 : segments.length;
    return segments.slice(0, last).includes(base);
  }
  if (rel.startsWith(`${base}/`)) return true;
  return !insideOnly && rel === base;
}

/**
 * The subset of `relPaths` that hold a git-tracked file, from one
 * `git ls-files` call. `null` when git cannot answer.
 */
function gitTrackedPaths(
  workspaceRoot: string,
  relPaths: readonly string[],
): ReadonlySet<string> | null {
  let output: string;
  try {
    output = execFileSync(
      'git',
      ['ls-files', '-z', '--', ...relPaths.map((rel) => `${rel}/`)],
      {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        timeout: 10_000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
  } catch {
    // degradation-audit: optional-capability - no repository, no git binary or
    // a timeout reads as "unknown", and the caller writes no per-skill rule.
    return null;
  }
  const tracked = new Set<string>();
  for (const file of output.split('\0')) {
    if (file === '') continue;
    for (const rel of relPaths) {
      if (file.startsWith(`${rel}/`)) tracked.add(rel);
    }
  }
  return tracked;
}

/**
 * The path a rule talks about: leading `!` and trailing `/`, `/*` or `/**`
 * stripped, so `!.claude/skills/example-skill/**` and `.claude/skills/*` both
 * reduce to a path this can compare against a candidate directory.
 */
function rulePath(line: string): string | null {
  const path = line
    .replace(/^!/, '')
    // An anchored `/.claude/*` and a `**/.claude/*` name the same path a
    // candidate does. Leaving either prefix on makes the comparison miss, and
    // a miss on a negation ladder is the whole defect this function exists for.
    .replace(/^\*\*\//, '')
    .replace(/^\//, '')
    .replace(/\/\*\*$/, '')
    .replace(/\/\*$/, '')
    .replace(/\/+$/, '')
    .trim();
  return path === '' ? null : path;
}

/**
 * Three ways an existing rule makes a candidate directory redundant or unsafe
 * to add. The first two are redundancy; the THIRD is the one that matters.
 *
 * A rule mentioning something INSIDE the candidate — `.claude/skills/*` paired
 * with `!.claude/skills/example-skill/**` — means the user (or this repo's own
 * `.gitignore`) is managing that subtree deliberately, and appending a blanket
 * `.claude/skills/` AFTER it re-ignores the whole directory: git cannot
 * re-include a file whose parent directory is excluded, so the later broad rule
 * silently defeats every earlier negation. That is a tracked file quietly
 * dropping out of `git status`, which is exactly the failure this block exists
 * to avoid causing.
 *
 * The old test was a literal line match, which saw `.claude/skills/*` and
 * `.claude/skills/` as unrelated strings and appended the second one.
 */
function isCovered(
  candidate: string,
  existingPaths: readonly string[],
): boolean {
  return existingPaths.some(
    (existing) =>
      existing === candidate ||
      candidate.startsWith(`${existing}/`) ||
      existing.startsWith(`${candidate}/`),
  );
}

function toPattern(dir: string): string | null {
  const normalized = dir
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .trim();
  if (normalized === '' || normalized === '.') return null;
  return `${normalized}/`;
}

function renderBlock(patterns: readonly string[], eol: string): string {
  return [GITIGNORE_BEGIN, ...BLOCK_PREAMBLE, ...patterns, GITIGNORE_END].join(
    eol,
  );
}

/**
 * Append with exactly one blank line of separation, and a trailing newline.
 *
 * The separator is only added when there is content to separate from, so a
 * workspace whose first `.gitignore` Ptah creates does not start with a blank
 * line.
 */
function appendBlock(text: string, block: string, eol: string): string {
  if (text === '') return `${block}${eol}`;
  const needsNewline = !/\r?\n$/.test(text);
  return `${text}${needsNewline ? eol : ''}${eol}${block}${eol}`;
}

/** CRLF only when the file is predominantly CRLF; a new file gets LF. */
function detectEol(text: string): string {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > lf ? '\r\n' : '\n';
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function failed(error: unknown): GitignoreResult {
  return {
    outcome: 'failed',
    patterns: [],
    reason: error instanceof Error ? error.message : String(error),
  };
}

function toDetail(detail: unknown): Record<string, unknown> | undefined {
  if (typeof detail === 'object' && detail !== null) {
    return detail as Record<string, unknown>;
  }
  return detail === undefined ? undefined : { detail };
}
