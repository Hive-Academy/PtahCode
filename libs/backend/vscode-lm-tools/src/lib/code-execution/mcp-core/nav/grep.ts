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
  findRipgrep,
  runNodeSearch,
  runRipgrep,
  type GrepEngineResult,
  type GrepMatch,
  type GrepRequest,
} from './grep-engine';
import {
  GREP_DEFAULT_MAX_MATCHES,
  GREP_HARD_MAX_MATCHES,
  GREP_MAX_CHARS,
  GREP_MAX_CONTEXT,
  GREP_MAX_FILES,
  GREP_MAX_LABEL_FILE_BYTES,
  GREP_MAX_LINE_CHARS,
  GREP_TOOL_NAME,
} from './grep.limits';
import { resolveNavWorkspacePath } from './nav-workspace-path';
import { innermostSymbolAt, toNavSymbols, type NavSymbol } from './nav-symbols';

export const GrepArgsSchema = z
  .object({
    pattern: z.string().min(1).max(1000),
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
}

export interface GrepReply {
  readonly isError: boolean;
  readonly text: string;
}

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
  args: { maxMatches: number; context: number },
  deps: GrepDeps,
  rootReal: string,
): Promise<string> {
  const { shown } = selectMatches(result.matches, args.maxMatches);
  const fileCount = new Set(result.matches.map((m) => m.file)).size;
  const atLeast =
    result.incomplete || result.totalMatches > result.matches.length;
  const header = `${atLeast ? 'at least ' : ''}${plural(result.totalMatches, 'match')} in ${atLeast ? 'at least ' : ''}${plural(fileCount, 'file')} (engine: ${result.engine})`;

  const body: string[] = [];
  let chars = header.length;
  for (const [file, matches] of shown) {
    const symbols = await loadSymbols(deps, rootReal, file);
    const fileLines = args.context > 0 ? await readLines(rootReal, file) : [];
    const block = [
      `${file} (${plural(matches.length, 'match')})`,
      ...renderFileGroup(matches, symbols, fileLines, args.context),
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

  const request: GrepRequest = {
    pattern: args.pattern,
    regex: args.regex === true,
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
    // The binary failed (for example a regex dialect it rejects): use the walk.
    result = undefined;
  }
  result ??= await runNodeSearch(request);

  const maxMatches = args.maxMatches ?? GREP_DEFAULT_MAX_MATCHES;
  const context = args.context ?? 0;
  if (result.totalMatches === 0) {
    const stopped = result.incomplete
      ? ' The search stopped early (time or file limit) before it matched anything, so the text may still exist; narrow with path/glob.'
      : '';
    return ok(
      `0 matches (engine: ${result.engine}).${stopped}${result.skippedNote ? ` Note: ${result.skippedNote}.` : ''} Try regex:true for a pattern, includeIgnored:true with a scoped path for node_modules, or a different glob.` +
        (result.error ? `\nEngine note: ${result.error}` : ''),
    );
  }
  return ok(
    await renderGrepResult(
      result,
      { maxMatches, context },
      deps,
      target.rootReal,
    ),
  );
}
