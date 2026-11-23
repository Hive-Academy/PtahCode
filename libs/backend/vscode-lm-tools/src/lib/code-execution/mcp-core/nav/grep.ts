/**
 * `ptah_grep`: free-text search of the workspace, grouped by file, each match
 * labelled with its innermost enclosing declaration. Plain text, bounded in
 * matches, files and characters so the tool-result budget never cuts it.
 */
import { readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { EXTENSION_LANGUAGE_MAP } from '@ptah-extension/workspace-intelligence';
import type { AstCodeInsights } from '../../types';
import { describeZodIssues } from '../route-tool-handlers';
import {
  buildMatcher,
  findGit,
  findRipgrep,
  inferRegexMode,
  isGitWorkTree,
  canGitGrepSearchRoot,
  runGitGrep,
  runNodeSearch,
  runRipgrep,
  isGlobTimeoutMessage,
  type GrepEngineResult,
  type GrepMatch,
  type GrepRequest,
} from './grep-engine';
import {
  GREP_DEFAULT_MAX_MATCHES,
  GREP_HARD_MAX_MATCHES,
  GREP_INLINE_LEAD_LINES,
  GREP_INLINE_MAX_BODY_LINES,
  GREP_INLINE_MAX_MATCHES,
  GREP_INLINE_MAX_SYMBOLS,
  GREP_INLINE_MAX_TOTAL_LINES,
  GREP_MAX_CHARS,
  GREP_MAX_CONTEXT,
  GREP_MAX_FILES,
  GREP_MAX_FILE_BYTES,
  GREP_MAX_LABEL_FILE_BYTES,
  GREP_MAX_LINE_CHARS,
  GREP_TOOL_NAME,
} from './grep.limits';
import { resolveNavWorkspacePath } from './nav-workspace-path';
import { innermostSymbolAt, toNavSymbols, type NavSymbol } from './nav-symbols';

export const GrepArgsSchema = z
  .object({
    // One line at a time: a line break never matches, and git would split
    // the pattern into several patterns at it.
    pattern: z
      .string()
      .min(1)
      .max(1000)
      .refine((value) => !/[\r\n]/.test(value), {
        message:
          'must be one line: the search matches single lines, so a line break never matches',
      }),
    path: z.string().trim().min(1).optional(),
    glob: z.string().trim().min(1).max(200).optional(),
    regex: z.boolean().optional(),
    caseSensitive: z.boolean().optional(),
    context: z.number().int().min(0).max(GREP_MAX_CONTEXT).optional(),
    maxMatches: z
      .number()
      .int()
      .positive()
      .max(GREP_HARD_MAX_MATCHES)
      .optional(),
    includeIgnored: z.boolean().optional(),
    /** `false` turns off the enclosing-body inlining of a small result. */
    inlineBody: z.boolean().optional(),
    workspaceRoot: z.string().trim().min(1).optional(),
  })
  .strict();

export type GrepArgs = z.infer<typeof GrepArgsSchema>;

export interface GrepDeps {
  /** Tree-sitter outline of an absolute file path (for the symbol labels). */
  readonly analyze: (absolutePath: string) => Promise<AstCodeInsights>;
  /** Root used when the call passes no `workspaceRoot`. */
  readonly defaultWorkspaceRoot: () => Promise<string | undefined>;
  /** Locate `rg`; replaced in tests. */
  readonly findRipgrep?: () => Promise<string | undefined>;
  /** Locate `git`; replaced in tests. */
  readonly findGit?: () => Promise<string | undefined>;
}

export interface GrepReply {
  readonly isError: boolean;
  readonly text: string;
}

/** Header note of a call whose `regex` mode was inferred from the pattern. */
export const REGEX_INFERRED_NOTE =
  '(pattern read as regex; pass regex:false for a literal search)';

const fail = (text: string): GrepReply => ({ isError: true, text });
const ok = (text: string): GrepReply => ({ isError: false, text });

function trimLine(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > GREP_MAX_LINE_CHARS
    ? `${trimmed.slice(0, GREP_MAX_LINE_CHARS)}…`
    : trimmed;
}

function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : word === 'match' ? 'matches' : `${word}s`}`;
}

/** Group matches by file (path order), keeping at most `maxMatches` in all. */
function selectMatches(
  matches: readonly GrepMatch[],
  maxMatches: number,
): { shown: Map<string, GrepMatch[]>; hidden: GrepMatch[] } {
  const sorted = [...matches].sort(
    (a, b) =>
      (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line,
  );
  const shown = new Map<string, GrepMatch[]>();
  const hidden: GrepMatch[] = [];
  let count = 0;
  for (const match of sorted) {
    const known = shown.has(match.file);
    if (count >= maxMatches || (!known && shown.size >= GREP_MAX_FILES)) {
      hidden.push(match);
      continue;
    }
    count++;
    const list = shown.get(match.file) ?? [];
    list.push(match);
    shown.set(match.file, list);
  }
  return { shown, hidden };
}

async function loadSymbols(
  deps: GrepDeps,
  rootReal: string,
  file: string,
): Promise<NavSymbol[]> {
  const extension = path.extname(file).toLowerCase();
  if (EXTENSION_LANGUAGE_MAP[extension] === undefined) {
    return [];
  }
  const absolute = path.join(rootReal, file);
  try {
    if ((await stat(absolute)).size > GREP_MAX_LABEL_FILE_BYTES) {
      return [];
    }
    return toNavSymbols(await deps.analyze(absolute));
  } catch {
    // degradation-audit: optional-capability - a parse failure only costs
    // the enclosing-symbol label; the match is still shown.
    return [];
  }
}

async function readLines(rootReal: string, file: string): Promise<string[]> {
  try {
    // An oversized file gets no context lines: rg and the Node walk skip
    // it, and git grep (no size option) shows only its match lines.
    if ((await stat(path.join(rootReal, file))).size > GREP_MAX_FILE_BYTES) {
      return [];
    }
    const lines = (await readFile(path.join(rootReal, file), 'utf8')).split(
      /\r?\n/,
    );
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines;
  } catch {
    // degradation-audit: optional-capability - context lines are an extra;
    // the match lines come from the engine, not from this read.
    return [];
  }
}

/** One enclosing declaration inlined into a small result, cut to `first..last`. */
interface InlineBody {
  readonly symbol: NavSymbol;
  /** 1-based lines of the shown window, inside the declaration. */
  readonly first: number;
  readonly last: number;
}

/**
 * The window of a declaration to show: all of it when it fits `maxLines`,
 * else a cut that keeps every match. `undefined` when the matches alone span
 * more than `maxLines`.
 */
function bodyWindow(
  symbol: NavSymbol,
  matchLines: readonly number[],
  fileLength: number,
  maxLines: number,
): { first: number; last: number } | undefined {
  const start = symbol.startLine;
  const end = Math.min(symbol.endLine, fileLength);
  const firstMatch = Math.min(...matchLines);
  const lastMatch = Math.max(...matchLines);
  if (end < start || maxLines < 1 || lastMatch - firstMatch + 1 > maxLines) {
    return undefined;
  }
  if (end - start + 1 <= maxLines) {
    return { first: start, last: end };
  }
  if (lastMatch <= start + maxLines - 1) {
    return { first: start, last: start + maxLines - 1 };
  }
  const first = Math.max(
    lastMatch - maxLines + 1,
    Math.min(firstMatch - GREP_INLINE_LEAD_LINES, end - maxLines + 1),
  );
  return { first, last: first + maxLines - 1 };
}

/**
 * Bodies to inline per file: only for a complete result of at most
 * GREP_INLINE_MAX_MATCHES matches in at most GREP_INLINE_MAX_SYMBOLS
 * enclosing declarations, one body per declaration, within the line budget.
 */
function planInlineBodies(
  shown: ReadonlyMap<string, readonly GrepMatch[]>,
  symbolsByFile: ReadonlyMap<string, readonly NavSymbol[]>,
  linesByFile: ReadonlyMap<string, readonly string[]>,
): Map<string, InlineBody[]> {
  const groups: { file: string; symbol: NavSymbol; lines: number[] }[] = [];
  for (const [file, matches] of shown) {
    const bySymbol = new Map<NavSymbol, number[]>();
    for (const match of matches) {
      const symbol = innermostSymbolAt(
        symbolsByFile.get(file) ?? [],
        match.line,
      );
      if (symbol) {
        bySymbol.set(symbol, [...(bySymbol.get(symbol) ?? []), match.line]);
      }
    }
    // A declaration inside another shown one (a method of a matched class)
    // joins the outer group: its lines are already part of the outer body.
    const entries = [...bySymbol];
    for (const [symbol, lines] of entries) {
      const outer = entries.find(
        ([other]) =>
          other !== symbol &&
          other.startLine <= symbol.startLine &&
          other.endLine >= symbol.endLine,
      );
      if (outer) {
        outer[1].push(...lines);
      }
    }
    for (const [symbol, lines] of entries) {
      const nested = entries.some(
        ([other]) =>
          other !== symbol &&
          other.startLine <= symbol.startLine &&
          other.endLine >= symbol.endLine,
      );
      if (!nested) {
        groups.push({ file, symbol, lines });
      }
    }
  }
  const plan = new Map<string, InlineBody[]>();
  if (groups.length === 0 || groups.length > GREP_INLINE_MAX_SYMBOLS) {
    return plan;
  }
  let budget = GREP_INLINE_MAX_TOTAL_LINES;
  for (const { file, symbol, lines } of groups) {
    const fileLength = linesByFile.get(file)?.length ?? 0;
    const window = bodyWindow(
      symbol,
      lines,
      fileLength,
      Math.min(GREP_INLINE_MAX_BODY_LINES, budget),
    );
    if (!window) {
      continue;
    }
    budget -= window.last - window.first + 1;
    plan.set(file, [...(plan.get(file) ?? []), { symbol, ...window }]);
  }
  return plan;
}

function clipBodyLine(text: string): string {
  const trimmed = text.trimEnd();
  return trimmed.length > GREP_MAX_LINE_CHARS
    ? `${trimmed.slice(0, GREP_MAX_LINE_CHARS)}…`
    : trimmed;
}

/**
 * An inlined body: a `[name] kind start-end` marker, then numbered lines with
 * the common indent removed, `|` on match lines and `-` on the others. A cut
 * says which lines were left out and how to read them.
 */
function renderBody(
  body: InlineBody,
  matchLines: ReadonlySet<number>,
  fileLines: readonly string[],
): string[] {
  const { symbol, first, last } = body;
  // An outline can end past the file (stale or off-by-one): clamp like bodyWindow.
  const end = Math.min(symbol.endLine, fileLines.length);
  const cut = first > symbol.startLine || last < end;
  const out = [
    `  [${symbol.qualifiedName}] ${symbol.kind} ${symbol.startLine}-${end}${cut ? `, showing ${first}-${last}` : ''}`,
  ];
  if (first > symbol.startLine) {
    out.push(`    … lines ${symbol.startLine}-${first - 1} not shown`);
  }
  const slice = fileLines.slice(first - 1, last);
  const indent = Math.min(
    ...slice
      .filter((text) => text.trim() !== '')
      .map((text) => text.length - text.trimStart().length),
  );
  slice.forEach((text, i) => {
    const n = first + i;
    const shownText = clipBodyLine(
      Number.isFinite(indent) ? text.slice(indent) : text,
    );
    // A match line keeps `| ` even when empty: the footer counts those lines.
    out.push(
      matchLines.has(n)
        ? `  ${n}| ${shownText}`
        : `  ${n}-${shownText ? ` ${shownText}` : ''}`,
    );
  });
  if (last < end) {
    out.push(
      `    … lines ${last + 1}-${end} not shown; read them with ptah_read_symbol (name "${symbol.qualifiedName}" or startLine ${last + 1})`,
    );
  }
  return out;
}

/** Lines of one file group: matches with labels, context lines, gap marks. */
function renderFileGroup(
  matches: readonly GrepMatch[],
  symbols: readonly NavSymbol[],
  fileLines: readonly string[],
  context: number,
): string[] {
  const matchLines = new Set(matches.map((m) => m.line));
  const wanted = new Set<number>();
  for (const match of matches) {
    for (let n = match.line - context; n <= match.line + context; n++) {
      if (n >= 1 && (n <= fileLines.length || matchLines.has(n))) {
        wanted.add(n);
      }
    }
  }
  const textByLine = new Map(matches.map((m) => [m.line, m.text]));
  const out: string[] = [];
  let previous = 0;
  for (const n of [...wanted].sort((a, b) => a - b)) {
    if (context > 0 && previous > 0 && n > previous + 1) {
      out.push('    --');
    }
    previous = n;
    if (matchLines.has(n)) {
      const symbol = innermostSymbolAt(symbols, n);
      const label = symbol ? `[${symbol.qualifiedName}] ` : '';
      out.push(`  ${n}| ${label}${trimLine(textByLine.get(n) ?? '')}`);
    } else {
      out.push(`  ${n}- ${trimLine(fileLines[n - 1] ?? '')}`);
    }
  }
  return out;
}

/** Render engine output as the tool's plain-text answer. */
export async function renderGrepResult(
  result: GrepEngineResult,
  args: {
    maxMatches: number;
    context: number;
    regexInferred?: boolean;
    inlineBody?: boolean;
  },
  deps: GrepDeps,
  rootReal: string,
): Promise<string> {
  const { shown } = selectMatches(result.matches, args.maxMatches);
  const fileCount = new Set(result.matches.map((m) => m.file)).size;
  const atLeast =
    result.incomplete || result.totalMatches > result.matches.length;
  const header = `${atLeast ? 'at least ' : ''}${plural(result.totalMatches, 'match')} in ${atLeast ? 'at least ' : ''}${plural(fileCount, 'file')} (engine: ${result.engine})${args.regexInferred ? ` ${REGEX_INFERRED_NOTE}` : ''}`;

  // Bodies are inlined only when every match is shown and the result is small.
  const inline =
    args.inlineBody !== false &&
    !atLeast &&
    result.totalMatches <= Math.min(GREP_INLINE_MAX_MATCHES, args.maxMatches);
  const symbolsByFile = new Map<string, NavSymbol[]>();
  const linesByFile = new Map<string, string[]>();
  for (const file of shown.keys()) {
    symbolsByFile.set(file, await loadSymbols(deps, rootReal, file));
    linesByFile.set(
      file,
      args.context > 0 || inline ? await readLines(rootReal, file) : [],
    );
  }
  const bodies = inline
    ? planInlineBodies(shown, symbolsByFile, linesByFile)
    : new Map<string, InlineBody[]>();

  const body: string[] = [];
  let chars = header.length;
  for (const [file, matches] of shown) {
    const symbols = symbolsByFile.get(file) ?? [];
    const fileLines = linesByFile.get(file) ?? [];
    const fileBodies = bodies.get(file) ?? [];
    const inBody = (line: number): boolean =>
      fileBodies.some((b) => b.first <= line && line <= b.last);
    const matchLines = new Set(matches.map((m) => m.line));
    const block = [
      `${file} (${plural(matches.length, 'match')})`,
      ...renderFileGroup(
        matches.filter((m) => !inBody(m.line)),
        symbols,
        fileLines,
        args.context,
      ),
      ...fileBodies.flatMap((b) => renderBody(b, matchLines, fileLines)),
    ];
    const blockChars = block.reduce((sum, line) => sum + line.length + 1, 0);
    if (chars + blockChars > GREP_MAX_CHARS) {
      // Keep whole lines of this file group while they fit.
      for (const line of block) {
        if (chars + line.length + 1 > GREP_MAX_CHARS) {
          break;
        }
        body.push(line);
        chars += line.length + 1;
      }
      break;
    }
    body.push(...block);
    chars += blockChars;
  }

  const shownCount = body.filter((line) => /^ {2}\d+\| /.test(line)).length;
  const notShown = Math.max(result.totalMatches - shownCount, 0);
  const footer: string[] = [];
  if (notShown > 0) {
    footer.push(
      `+ ${notShown} more matches not shown; narrow with path/glob or a longer pattern`,
    );
  }
  // An engine error explains the early stop itself (Engine note below).
  if (result.incomplete && !result.error) {
    footer.push(
      'The search stopped early (output, time or file limit); narrow with path/glob.',
    );
  }
  if (result.skippedNote) {
    footer.push(`Note: ${result.skippedNote}.`);
  }
  if (result.error) {
    footer.push(`Engine note: ${result.error}`);
  }
  return [header, ...body, ...footer].join('\n');
}

/** Validate, search and render one `ptah_grep` call. */
export async function handleGrep(
  rawArgs: unknown,
  deps: GrepDeps,
): Promise<GrepReply> {
  const parsed = GrepArgsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return fail(
      `Error: invalid ${GREP_TOOL_NAME} arguments — ${describeZodIssues(parsed.error)}`,
    );
  }
  const args = parsed.data;

  const root = args.workspaceRoot ?? (await deps.defaultWorkspaceRoot());
  if (!root) {
    return fail(
      'Error: no workspace is open. Open a workspace folder first; a "workspaceRoot" argument must lie inside an open workspace.',
    );
  }
  const resolved = await resolveNavWorkspacePath(args.path ?? '.', root);
  if (!resolved.ok) {
    return fail(resolved.error);
  }
  const target = resolved.value;
  const includeIgnored = args.includeIgnored === true;
  if (includeIgnored && target.relativePath === '.') {
    return fail(
      'Error: "includeIgnored" needs a scoped "path" (a directory or file below the workspace root), such as "node_modules/zod".',
    );
  }

  // An explicit `regex` wins; an omitted one is inferred from the pattern.
  const regexInferred =
    args.regex === undefined && inferRegexMode(args.pattern);
  const request: GrepRequest = {
    pattern: args.pattern,
    regex: args.regex ?? regexInferred,
    caseSensitive: args.caseSensitive,
    glob: args.glob,
    includeIgnored,
    rootReal: target.rootReal,
    targetAbsolute: target.absolutePath,
    targetIsDirectory: target.isDirectory,
  };
  try {
    buildMatcher(request);
  } catch (error: unknown) {
    return fail(
      `Error: invalid regular expression — ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const rg = await (deps.findRipgrep ?? findRipgrep)();
  let result = rg ? await runRipgrep(rg, request) : undefined;
  if (result?.error && result.totalMatches === 0) {
    // The binary failed (for example a regex dialect it rejects): go on.
    result = undefined;
  }
  if (!result) {
    // rg is absent or failed: `git grep` is a child process too, so a large
    // repository does not stall this process's event loop like the walk.
    const git = await (deps.findGit ?? findGit)();
    if (
      git &&
      (await isGitWorkTree(git, request.rootReal)) &&
      // A root that a parent repository ignores is "inside" the work tree,
      // but `git grep` lists no file of it and says nothing: use the walk.
      (await canGitGrepSearchRoot(git, request.rootReal))
    ) {
      result = await runGitGrep(git, request);
      if (
        result.error &&
        result.totalMatches === 0 &&
        // The walk runs the same glob and would time out again.
        !isGlobTimeoutMessage(result.error)
      ) {
        // For example a git built without PCRE rejects `-P`: use the walk.
        result = undefined;
      }
    }
  }
  result ??= await runNodeSearch(request);

  const maxMatches = args.maxMatches ?? GREP_DEFAULT_MAX_MATCHES;
  const context = args.context ?? 0;
  if (result.totalMatches === 0) {
    const stopped = result.incomplete
      ? ' The search stopped early (time or file limit) before it matched anything, so the text may still exist; narrow with path/glob.'
      : '';
    const modeHint = regexInferred
      ? 'The pattern was read as regex. Try regex:false for a literal search,'
      : request.regex
        ? 'Try regex:false for a literal search,'
        : 'Try regex:true for a pattern,';
    return ok(
      `0 matches (engine: ${result.engine}).${stopped}${result.skippedNote ? ` Note: ${result.skippedNote}.` : ''} ${modeHint} includeIgnored:true with a scoped path for node_modules, or a different glob.` +
        (result.error ? `\nEngine note: ${result.error}` : ''),
    );
  }
  return ok(
    await renderGrepResult(
      result,
      { maxMatches, context, regexInferred, inlineBody: args.inlineBody },
      deps,
      target.rootReal,
    ),
  );
}
