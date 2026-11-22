/**
 * Search engines of `ptah_grep`: `rg --json` when a ripgrep binary is on
 * PATH, else a bounded Node walk. Both return the same shape, so the
 * handler renders one result form. No shell is used; `rg` gets an argv.
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { access, open, readdir, readFile, stat } from 'node:fs/promises';
import { constants as fsConstants, type Dirent } from 'node:fs';
import * as path from 'node:path';
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

export type GrepEngineName = 'rg' | 'node';

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

/** Glob to RegExp: `**`, `*`, `?` and `{a,b}`; matched on the relative path. */
export function globToRegExp(glob: string): RegExp {
  return globToRegExpBody(glob.startsWith('!') ? glob.slice(1) : glob);
}

/** True for an exclusion glob (`!*.spec.ts`), as rg reads it. */
export function isNegatedGlob(glob: string): boolean {
  return glob.startsWith('!');
}

function globToRegExpBody(glob: string): RegExp {
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

/** First `rg` binary on PATH, or `undefined`. */
export async function findRipgrep(
  envPath: string | undefined = process.env['PATH'],
): Promise<string | undefined> {
  if (!envPath) {
    return undefined;
  }
  // `.cmd` is not spawnable without a shell, so only the real binary counts.
  const names = process.platform === 'win32' ? ['rg.exe'] : ['rg'];
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

/** Run ripgrep; kills it at the output cap or the time limit. */
export function runRipgrep(
  binary: string,
  request: GrepRequest,
): Promise<GrepEngineResult> {
  const relativeTarget = toPosixRelative(
    request.rootReal,
    request.targetAbsolute,
  );
  const args = buildRipgrepArgs(request, relativeTarget);
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
      child = spawn(binary, args, {
        cwd: request.rootReal,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error: unknown) {
      // degradation-audit: reported - the spawn error text is returned in
      // `error`, and the handler then runs the Node walk instead.
      resolve({
        engine: 'rg',
        matches: [],
        totalMatches: 0,
        incomplete: false,
        error: `rg failed to start: ${error instanceof Error ? error.message : String(error)}`,
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
        engine: 'rg',
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

    const consume = (line: string): void => {
      const parsed = parseRgLine(line);
      if (parsed?.type !== 'match' || !parsed.data) {
        return;
      }
      const file = parsed.data.path?.text;
      const lineNumber = parsed.data.line_number;
      if (file === undefined || lineNumber === undefined) {
        return;
      }
      total++;
      if (matches.length < GREP_COLLECT_CAP) {
        matches.push({
          file: file.replace(/^\.\//, '').split(path.sep).join('/'),
          line: lineNumber,
          text: (parsed.data.lines?.text ?? '').replace(/\r?\n$/, ''),
        });
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
      finish(`rg failed to start: ${error.message}`),
    );
    child.on('close', (code) => {
      if (pending.length > 0 && !incomplete) {
        consume(pending);
      }
      // Exit 1 = no match; 2 = an error, though matches may still stand.
      if (code === 2 && !incomplete && total === 0) {
        finish(stderr.trim().split('\n')[0] || 'rg exited with an error');
        return;
      }
      finish();
    });
  });
}

async function isBinary(filePath: string): Promise<boolean> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

/** Bounded Node search used when `rg` is not on PATH. */
export async function runNodeSearch(
  request: GrepRequest,
): Promise<GrepEngineResult> {
  const matcher = buildMatcher(request);
  const globMatcher = request.glob ? globToRegExp(request.glob) : undefined;
  const globNegated = request.glob ? isNegatedGlob(request.glob) : false;
  const deadline = Date.now() + GREP_TIMEOUT_MS;
  const matches: GrepMatch[] = [];
  let total = 0;
  let visited = 0;
  let incomplete = false;

  const searchFile = async (absolute: string): Promise<void> => {
    const relative = toPosixRelative(request.rootReal, absolute);
    if (globMatcher && globMatcher.test(relative) === globNegated) {
      return;
    }
    visited++;
    const info = await stat(absolute);
    if (info.size > GREP_MAX_FILE_BYTES || (await isBinary(absolute))) {
      return;
    }
    const lines = (await readFile(absolute, 'utf8')).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      // A very long line (minified code) is skipped: a backtracking pattern
      // on it could block the event loop, and rg would print it unreadable.
      if (lines[i].length > GREP_MAX_SEARCHED_LINE_CHARS) {
        continue;
      }
      if (i % 1000 === 999 && Date.now() > deadline) {
        incomplete = true;
        return;
      }
      if (matcher.test(lines[i])) {
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
      if (entry.isDirectory()) {
        const skipped = request.includeIgnored
          ? entry.name === '.git'
          : NODE_SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.');
        if (!skipped) {
          await walk(absolute);
        }
      } else if (entry.isFile()) {
        if (!request.includeIgnored && entry.name.startsWith('.')) {
          continue;
        }
        try {
          await searchFile(absolute);
        } catch {
          // unreadable file: skip it, like rg does
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
  return { engine: 'node', matches, totalMatches: total, incomplete };
}
