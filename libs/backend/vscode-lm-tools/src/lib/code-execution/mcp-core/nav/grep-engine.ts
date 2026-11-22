/**
 * Search engines of `ptah_grep`, tried in order: `rg --json` when a ripgrep
 * binary is on PATH, `git grep` when the root is in a git work tree and git
 * is on PATH, else a bounded Node walk. All return the same shape, so the
 * handler renders one result form. No shell is used; binaries get an argv.
 */
import {
  execFile,
  spawn,
  type ChildProcessByStdio,
} from 'node:child_process';
import type { Readable } from 'node:stream';
import {
  access,
  open,
  readdir,
  readFile,
  realpath,
  stat,
} from 'node:fs/promises';
import { constants as fsConstants, type Dirent } from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { canonicalPathInsideRoot } from '../../namespace-builders/browser-file-url';
import { toPosixRelative } from './nav-workspace-path';
import {
  GREP_COLLECT_CAP,
  GREP_MAX_ENGINE_BYTES,
  GREP_MAX_FILE_BYTES,
  GREP_MAX_LINE_CHARS,
  GREP_MAX_SEARCHED_LINE_CHARS,
  GREP_MAX_FILES_VISITED,
  GREP_TIMEOUT_MS,
} from './grep.limits';

export type GrepEngineName = 'rg' | 'git' | 'node';

export interface GrepRequest {
  readonly pattern: string;
  readonly regex: boolean;
  /** `undefined` = smart case. */
  readonly caseSensitive?: boolean;
  readonly glob?: string;
  readonly includeIgnored: boolean;
  /** Real absolute root; result paths are relative to it. */
  readonly rootReal: string;
  /** Real absolute file or directory to search. */
  readonly targetAbsolute: string;
  readonly targetIsDirectory: boolean;
}

export interface GrepMatch {
  /** Workspace-relative, `/`-separated. */
  readonly file: string;
  /** 1-based. */
  readonly line: number;
  readonly text: string;
}

export interface GrepEngineResult {
  readonly engine: GrepEngineName;
  /** At most `GREP_COLLECT_CAP` matches. */
  readonly matches: readonly GrepMatch[];
  /** Matches seen, including those past the collect cap. */
  readonly totalMatches: number;
  /** The engine stopped early (cap, time or file limit). */
  readonly incomplete: boolean;
  /** What the engine could not search, in words; absent when nothing. */
  readonly skippedNote?: string;
  /** Set when the search failed; `matches` may then be partial. */
  readonly error?: string;
}

const NODE_SKIPPED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
]);

/** Smart case: insensitive unless the pattern has an upper-case letter. */
export function isCaseInsensitive(
  pattern: string,
  caseSensitive: boolean | undefined,
): boolean {
  if (caseSensitive !== undefined) {
    return !caseSensitive;
  }
  return pattern === pattern.toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the matcher; a bad regular expression throws a `SyntaxError`. */
export function buildMatcher(request: GrepRequest): RegExp {
  const source = request.regex
    ? request.pattern
    : escapeRegExp(request.pattern);
  return new RegExp(
    source,
    isCaseInsensitive(request.pattern, request.caseSensitive) ? 'i' : '',
  );
}

/** Time limit of one regular-expression test on one line, in ms. */
const REGEX_TEST_TIMEOUT_MS = 100;

/** Thrown when a user regular expression runs past its time limit. */
export class RegexTimeoutError extends Error {
  constructor() {
    super('the regular expression is too slow (catastrophic backtracking)');
    this.name = 'RegexTimeoutError';
  }
}

/**
 * A line test for `matcher`. A user regular expression runs under a `vm`
 * timeout, so a backtracking pattern cannot freeze the event loop; a literal
 * pattern is escaped first and cannot backtrack, so it runs directly.
 */
export function buildLineTester(
  matcher: RegExp,
  userRegex: boolean,
): (line: string) => boolean {
  if (!userRegex) {
    return (line) => matcher.test(line);
  }
  const context = vm.createContext({ re: matcher, line: '' });
  const script = new vm.Script('re.test(line)');
  return (line) => {
    context['line'] = line;
    try {
      return script.runInContext(context, {
        timeout: REGEX_TEST_TIMEOUT_MS,
      }) as boolean;
    } catch {
      throw new RegexTimeoutError();
    }
  };
}

/** Glob to RegExp: `**`, `*`, `?` and `{a,b}`; matched on the relative path. */
export function globToRegExp(glob: string): RegExp {
  return globToRegExpBody(glob.startsWith('!') ? glob.slice(1) : glob);
}

/** True for an exclusion glob (`!*.spec.ts`), as rg reads it. */
export function isNegatedGlob(glob: string): boolean {
  return glob.startsWith('!');
}

function globToRegExpBody(rawGlob: string): RegExp {
  // `***` and longer star runs mean the same as `**`; collapsing them keeps
  // the generated expression free of stacked quantifiers.
  const glob = rawGlob.replace(/\*{3,}/g, '**');
  let out = '';
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if (ch === '{') {
      braceDepth++;
      out += '(?:';
    } else if (ch === '}' && braceDepth > 0) {
      braceDepth--;
      out += ')';
    } else if (ch === ',' && braceDepth > 0) {
      out += '|';
    } else {
      out += escapeRegExp(ch);
    }
  }
  while (braceDepth-- > 0) {
    out += ')';
  }
  // A glob without a slash matches the file name anywhere, like rg.
  return new RegExp(glob.includes('/') ? `^${out}$` : `(?:^|/)${out}$`);
}

/** Glob to a RegExp anchored at both ends of a root-relative path. */
function globToAnchoredRegExp(glob: string): RegExp {
  const body = globToRegExpBody(glob.includes('/') ? glob : `/${glob}`).source;
  // `body` is `^...$` when the glob holds a slash; the leading `/` marker
  // makes a slash-less glob take that form too, then the marker is dropped.
  return new RegExp(body.replace(/^\^\\\//, '^'));
}

interface IgnoreRule {
  readonly regex: RegExp;
  readonly dirOnly: boolean;
  /** Matched against the root-relative path, else against the entry name. */
  readonly anchored: boolean;
  /** A `!` rule: a match re-includes the entry. */
  readonly negated: boolean;
}

/**
 * Text of the root `.gitignore`, or `undefined` when it is absent, not a
 * regular file (a FIFO or device would block the read) or over the file
 * size cap. The open is non-blocking and the type is checked on the open
 * handle, so a swap after a path check cannot make the read hang.
 */
async function readRootIgnoreText(
  rootReal: string,
): Promise<string | undefined> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      path.join(rootReal, '.gitignore'),
      fsConstants.O_RDONLY | (fsConstants.O_NONBLOCK ?? 0),
    );
    const info = await handle.stat();
    if (!info.isFile() || info.size > GREP_MAX_FILE_BYTES) {
      return undefined;
    }
    return await handle.readFile('utf8');
  } catch {
    // degradation-audit: optional-capability - no readable .gitignore means
    // no extra rules; the fixed skip list still applies.
    return undefined;
  } finally {
    await handle?.close();
  }
}

/**
 * Root `.gitignore` rules for the Node walk, as a test of one entry. Only
 * the root file is read; nested ignore files are not, so the walk may search
 * a little more than rg. The last matching rule wins, as in git, so a `!`
 * rule re-includes an entry. The walk never enters an ignored directory, so
 * a file under one stays out, as in git.
 */
async function loadRootIgnore(
  rootReal: string,
): Promise<(relative: string, name: string, isDir: boolean) => boolean> {
  const text = await readRootIgnoreText(rootReal);
  if (text === undefined) {
    return () => false;
  }
  const rules: IgnoreRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const negated = line.startsWith('!');
    const rule = negated ? line.slice(1) : line;
    const dirOnly = rule.endsWith('/');
    const pattern = rule.replace(/\/+$/, '').replace(/^\//, '');
    if (pattern === '') {
      continue;
    }
    const anchored = rule.replace(/\/+$/, '').includes('/');
    rules.push({
      regex: anchored ? globToAnchoredRegExp(pattern) : globToRegExp(pattern),
      dirOnly,
      anchored,
      negated,
    });
  }
  return (relative, name, isDir) => {
    let ignored = false;
    for (const rule of rules) {
      if (
        (!rule.dirOnly || isDir) &&
        rule.regex.test(rule.anchored ? relative : name)
      ) {
        ignored = !rule.negated;
      }
    }
    return ignored;
  };
}

/** First executable named one of `names` on PATH, or `undefined`. */
async function findOnPath(
  names: readonly string[],
  envPath: string | undefined,
): Promise<string | undefined> {
  if (!envPath) {
    return undefined;
  }
  for (const dir of envPath.split(path.delimiter)) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        await access(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // not here; try the next entry
      }
    }
  }
  return undefined;
}

/** First `rg` binary on PATH, or `undefined`. */
export function findRipgrep(
  envPath: string | undefined = process.env['PATH'],
): Promise<string | undefined> {
  // `.cmd` is not spawnable without a shell, so only the real binary counts.
  return findOnPath(process.platform === 'win32' ? ['rg.exe'] : ['rg'], envPath);
}

/** First `git` binary on PATH, or `undefined`. */
export function findGit(
  envPath: string | undefined = process.env['PATH'],
): Promise<string | undefined> {
  return findOnPath(
    process.platform === 'win32' ? ['git.exe'] : ['git'],
    envPath,
  );
}

/** Time limit of the work-tree probe, in ms. */
const GIT_PROBE_TIMEOUT_MS = 5_000;

/** Probe results by `<git binary>\0<root>`; a root rarely changes state. */
const gitWorkTreeCache = new Map<string, Promise<boolean>>();

/**
 * True when `rootReal` is inside a git work tree, by one
 * `git rev-parse --is-inside-work-tree`. Cached per binary and root.
 */
export function isGitWorkTree(
  gitBinary: string,
  rootReal: string,
): Promise<boolean> {
  const key = `${gitBinary}\0${rootReal}`;
  let probe = gitWorkTreeCache.get(key);
  if (!probe) {
    probe = new Promise<boolean>((resolve) => {
      execFile(
        gitBinary,
        ['-C', rootReal, 'rev-parse', '--is-inside-work-tree'],
        { timeout: GIT_PROBE_TIMEOUT_MS, windowsHide: true },
        // degradation-audit: optional-capability - a failed probe (not a
        // repository, git broken) means "not a work tree": the Node walk runs.
        (error, stdout) => resolve(!error && stdout.trim() === 'true'),
      );
    });
    gitWorkTreeCache.set(key, probe);
  }
  return probe;
}

/** argv for `rg`; the pattern and the path follow `--`. */
export function buildRipgrepArgs(
  request: GrepRequest,
  relativeTarget: string,
): string[] {
  const args = ['--json', '--no-config', '--max-filesize', '1M'];
  if (!request.regex) {
    args.push('--fixed-strings');
  }
  if (request.caseSensitive === undefined) {
    args.push('--smart-case');
  } else if (request.caseSensitive) {
    args.push('--case-sensitive');
  } else {
    args.push('--ignore-case');
  }
  if (request.includeIgnored) {
    args.push('--no-ignore', '--hidden', '--glob', '!.git');
  }
  if (request.glob) {
    args.push('--glob', request.glob);
  }
  args.push('--', request.pattern, relativeTarget);
  return args;
}

interface RgJsonLine {
  readonly type?: string;
  readonly data?: {
    readonly path?: { readonly text?: string };
    readonly lines?: { readonly text?: string };
    readonly line_number?: number;
  };
}

function parseRgLine(line: string): RgJsonLine | undefined {
  try {
    return JSON.parse(line) as RgJsonLine;
  } catch {
    // degradation-audit: optional-capability - one malformed rg line is
    // skipped; the other matches still count.
    return undefined;
  }
}

/** One search child process: what to run and how to read its output. */
interface ProcessSearch {
  readonly engine: Exclude<GrepEngineName, 'node'>;
  readonly binary: string;
  readonly args: readonly string[];
  readonly cwd: string;
  /** One `\n`-terminated stdout record to a match; `undefined` skips it. */
  readonly parse: (record: string) => GrepMatch | undefined;
  /** True for an exit code that means the search failed. */
  readonly isErrorExit: (code: number | null) => boolean;
}

/**
 * Run a search binary without a shell; kills it at the output cap or the
 * time limit. A failed exit with matches marks the result partial and
 * carries the first stderr line; without matches the stderr line is the
 * error, and the handler then tries the next engine.
 */
function runProcessSearch(spec: ProcessSearch): Promise<GrepEngineResult> {
  const { engine } = spec;
  return new Promise((resolve) => {
    const matches: GrepMatch[] = [];
    let total = 0;
    let incomplete = false;
    let bytes = 0;
    let pending = '';
    let stderr = '';
    let settled = false;

    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(spec.binary, [...spec.args], {
        cwd: spec.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error: unknown) {
      // degradation-audit: reported - the spawn error text is returned in
      // `error`, and the handler then runs the next engine instead.
      resolve({
        engine,
        matches: [],
        totalMatches: 0,
        incomplete: false,
        error: `${engine} failed to start: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    const finish = (error?: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        engine,
        matches,
        totalMatches: total,
        incomplete,
        ...(error ? { error } : {}),
      });
    };
    const stop = (): void => {
      incomplete = true;
      child.kill();
    };
    const timer = setTimeout(stop, GREP_TIMEOUT_MS);

    const consume = (record: string): void => {
      const match = spec.parse(record);
      if (!match) {
        return;
      }
      total++;
      if (matches.length < GREP_COLLECT_CAP) {
        matches.push(match);
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      pending += chunk.toString('utf8');
      const parts = pending.split('\n');
      pending = parts.pop() ?? '';
      parts.forEach(consume);
      if (bytes > GREP_MAX_ENGINE_BYTES) {
        stop();
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 2000) {
        stderr += chunk.toString('utf8');
      }
    });
    child.on('error', (error) =>
      finish(`${engine} failed to start: ${error.message}`),
    );
    child.on('close', (code) => {
      if (pending.length > 0 && !incomplete) {
        consume(pending);
      }
      if (spec.isErrorExit(code) && !incomplete) {
        const reason =
          stderr.trim().split('\n')[0] || `${engine} exited with an error`;
        if (total > 0) {
          incomplete = true;
          finish(
            `${engine} reported an error, so matches may be partial: ${reason}`,
          );
          return;
        }
        finish(reason);
        return;
      }
      finish();
    });
  });
}

/** Run ripgrep; kills it at the output cap or the time limit. */
export function runRipgrep(
  binary: string,
  request: GrepRequest,
): Promise<GrepEngineResult> {
  const relativeTarget = toPosixRelative(
    request.rootReal,
    request.targetAbsolute,
  );
  return runProcessSearch({
    engine: 'rg',
    binary,
    args: buildRipgrepArgs(request, relativeTarget),
    cwd: request.rootReal,
    parse: (record) => {
      const parsed = parseRgLine(record);
      if (parsed?.type !== 'match' || !parsed.data) {
        return undefined;
      }
      const file = parsed.data.path?.text;
      const lineNumber = parsed.data.line_number;
      if (file === undefined || lineNumber === undefined) {
        return undefined;
      }
      return {
        file: file.replace(/^\.\//, '').split(path.sep).join('/'),
        line: lineNumber,
        text: (parsed.data.lines?.text ?? '').replace(/\r?\n$/, ''),
      };
    },
    // Exit 1 = no match; 2 = an error, though matches may still stand.
    isErrorExit: (code) => code === 2,
  });
}

/** Escape glob metacharacters so a path is matched literally in a glob. */
function escapeGlobPath(value: string): string {
  return value.replace(/[*?[\]\\]/g, '\\$&');
}

/**
 * Pathspecs of a `git grep` search. The target is always one literal
 * pathspec (a `[id]` directory is not a wildcard). A plain glob narrows
 * that target: git ORs positive pathspecs, so a slash-less glob is joined
 * under the target directory (`src/**\/*.ts`, matching at any depth like
 * rg) and a glob with a slash, which is root-relative, replaces the target.
 * A negated glob becomes an exclude pathspec. Braces are not git glob
 * syntax, so a brace glob only filters the output (see `runGitGrep`).
 */
export function buildGitPathspecs(
  request: GrepRequest,
  relativeTarget: string,
): string[] {
  // `toPosixRelative` gives `.` for the root itself.
  const atRoot = relativeTarget === '.';
  const glob = request.glob;
  if (!glob || glob.includes('{')) {
    return [`:(literal)${relativeTarget}`];
  }
  if (isNegatedGlob(glob)) {
    const body = glob.slice(1);
    return [
      `:(literal)${relativeTarget}`,
      `:(exclude,glob)${body.includes('/') ? body : `**/${body}`}`,
    ];
  }
  if (glob.includes('/')) {
    return [`:(glob)${glob}`];
  }
  if (!request.targetIsDirectory) {
    return [`:(literal)${relativeTarget}`];
  }
  const prefix = atRoot ? '' : `${escapeGlobPath(relativeTarget)}/`;
  return [`:(glob)${prefix}**/${glob}`];
}

/**
 * argv for `git grep`. `-c` overrides keep user config (full names, column
 * numbers, colour, pattern type) from changing the output form.
 */
export function buildGitGrepArgs(
  request: GrepRequest,
  relativeTarget: string,
): string[] {
  const args = [
    '-C',
    request.rootReal,
    '-c',
    'grep.fullName=false',
    '-c',
    'grep.column=false',
    '-c',
    'grep.lineNumber=true',
    'grep',
    '--no-color',
    '-n',
    '-I',
    '--null',
    '--untracked',
  ];
  if (request.includeIgnored) {
    args.push('--no-exclude-standard');
  }
  if (isCaseInsensitive(request.pattern, request.caseSensitive)) {
    args.push('-i');
  }
  args.push(request.regex ? '-P' : '-F', '-e', request.pattern, '--');
  args.push(...buildGitPathspecs(request, relativeTarget));
  return args;
}

/**
 * Run `git grep` in a git work tree (tracked and untracked files). Ignored
 * files are left out by git's standard excludes, which read every nested
 * `.gitignore`, `.git/info/exclude` and the global excludes file; unlike the
 * Node walk there is no fixed hidden-dir or NODE_SKIPPED_DIRS skip list,
 * because git's ignore rules already cover what a repository wants skipped.
 * `.git` itself is never searched. A PCRE-less git fails a `-P` search with
 * no matches, so the handler falls through to the Node walk.
 */
export function runGitGrep(
  binary: string,
  request: GrepRequest,
): Promise<GrepEngineResult> {
  const relativeTarget = toPosixRelative(
    request.rootReal,
    request.targetAbsolute,
  );
  // The pathspecs narrow the search; this filter makes the result exact
  // (brace globs, a slash glob outside a scoped target), with the same
  // glob reading as the Node walk.
  const globMatcher = request.glob ? globToRegExp(request.glob) : undefined;
  const globNegated = request.glob ? isNegatedGlob(request.glob) : false;
  const inTarget = (file: string): boolean =>
    relativeTarget === '.' ||
    file === relativeTarget ||
    (request.targetIsDirectory && file.startsWith(`${relativeTarget}/`));
  return runProcessSearch({
    engine: 'git',
    binary,
    args: buildGitGrepArgs(request, relativeTarget),
    cwd: request.rootReal,
    parse: (record) => {
      // `--null -n` record: path NUL line NUL text.
      const fileEnd = record.indexOf('\0');
      const lineEnd = fileEnd < 0 ? -1 : record.indexOf('\0', fileEnd + 1);
      if (lineEnd < 0) {
        return undefined;
      }
      const file = record.slice(0, fileEnd).split(path.sep).join('/');
      const line = Number(record.slice(fileEnd + 1, lineEnd));
      if (
        !Number.isInteger(line) ||
        !inTarget(file) ||
        (globMatcher && globMatcher.test(file) === globNegated)
      ) {
        return undefined;
      }
      return {
        file,
        line,
        text: record
          .slice(lineEnd + 1)
          .replace(/\r$/, '')
          .slice(0, GREP_MAX_LINE_CHARS * 2),
      };
    },
    // Exit 1 = no match; anything else non-zero (128 = fatal) is an error.
    isErrorExit: (code) => code !== 0 && code !== 1,
  });
}

/** True when the first 4 KB of `content` hold a NUL byte, as rg decides. */
function isBinaryContent(content: Buffer): boolean {
  return content.subarray(0, 4096).includes(0);
}

/** Bounded Node search used when `rg` is not on PATH. */
export async function runNodeSearch(
  request: GrepRequest,
): Promise<GrepEngineResult> {
  const matchLine = buildLineTester(buildMatcher(request), request.regex);
  const globMatcher = request.glob ? globToRegExp(request.glob) : undefined;
  const globNegated = request.glob ? isNegatedGlob(request.glob) : false;
  const deadline = Date.now() + GREP_TIMEOUT_MS;
  const matches: GrepMatch[] = [];
  let total = 0;
  let visited = 0;
  let incomplete = false;
  let skippedLargeFiles = 0;
  let skippedLongLines = 0;
  const isIgnored = request.includeIgnored
    ? () => false
    : await loadRootIgnore(request.rootReal);

  const searchFile = async (absolute: string): Promise<void> => {
    const relative = toPosixRelative(request.rootReal, absolute);
    if (globMatcher && globMatcher.test(relative) === globNegated) {
      return;
    }
    visited++;
    const info = await stat(absolute);
    if (info.size > GREP_MAX_FILE_BYTES) {
      skippedLargeFiles++;
      return;
    }
    // One read per file: the binary test looks at the head of the buffer.
    const content = await readFile(absolute);
    if (isBinaryContent(content)) {
      return;
    }
    const lines = content.toString('utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      // A regular expression skips a very long line (minified code), counted
      // and reported; a literal pattern cannot backtrack and searches it.
      if (request.regex && lines[i].length > GREP_MAX_SEARCHED_LINE_CHARS) {
        skippedLongLines++;
        continue;
      }
      if (i % 1000 === 999 && Date.now() > deadline) {
        incomplete = true;
        return;
      }
      if (matchLine(lines[i])) {
        total++;
        if (matches.length < GREP_COLLECT_CAP) {
          matches.push({
            file: relative,
            line: i + 1,
            text: lines[i].slice(0, GREP_MAX_LINE_CHARS * 2),
          });
        }
      }
    }
  };

  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      // The entry was a directory when it was listed; confirm that its real
      // path is still inside the root before it is opened (a swapped symlink
      // must not lead the walk out of the workspace).
      if (!canonicalPathInsideRoot(await realpath(dir), request.rootReal)) {
        return;
      }
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // degradation-audit: optional-capability - an unreadable directory is
      // skipped, like rg does; the search goes on.
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (incomplete) {
        return;
      }
      if (visited >= GREP_MAX_FILES_VISITED || Date.now() > deadline) {
        incomplete = true;
        return;
      }
      const absolute = path.join(dir, entry.name);
      const relative = toPosixRelative(request.rootReal, absolute);
      if (entry.isDirectory()) {
        const skipped = request.includeIgnored
          ? entry.name === '.git'
          : NODE_SKIPPED_DIRS.has(entry.name) ||
            entry.name.startsWith('.') ||
            isIgnored(relative, entry.name, true);
        if (!skipped) {
          await walk(absolute);
        }
      } else if (entry.isFile()) {
        if (
          !request.includeIgnored &&
          (entry.name.startsWith('.') || isIgnored(relative, entry.name, false))
        ) {
          continue;
        }
        try {
          await searchFile(absolute);
        } catch (error: unknown) {
          if (error instanceof RegexTimeoutError) {
            throw error;
          }
          // An unreadable file is skipped, like rg does.
        }
      }
    }
  };

  try {
    if (request.targetIsDirectory) {
      await walk(request.targetAbsolute);
    } else {
      await searchFile(request.targetAbsolute);
    }
  } catch (error: unknown) {
    return {
      engine: 'node',
      matches,
      totalMatches: total,
      incomplete: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const notes = [
    skippedLargeFiles > 0
      ? `${skippedLargeFiles} file(s) over ${GREP_MAX_FILE_BYTES / (1024 * 1024)} MB`
      : '',
    skippedLongLines > 0
      ? `${skippedLongLines} line(s) over ${GREP_MAX_SEARCHED_LINE_CHARS} chars (regex only)`
      : '',
  ].filter((note) => note !== '');
  return {
    engine: 'node',
    matches,
    totalMatches: total,
    incomplete,
    ...(notes.length > 0
      ? { skippedNote: `not searched: ${notes.join('; ')}` }
      : {}),
  };
}
