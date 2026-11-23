/**
 * `ptah_read_symbol`: read one declaration by name, or a line range, of a
 * workspace file. Plain text with 1-based line numbers, bounded in lines and
 * characters so the tool-result budget never cuts it mid-line.
 */
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { EXTENSION_LANGUAGE_MAP } from '@ptah-extension/workspace-intelligence';
import type { AstCodeInsights } from '../../types';
import { describeZodIssues } from '../route-tool-handlers';
import { resolveNavWorkspacePath } from './nav-workspace-path';
import { toNavSymbols, type NavSymbol } from './nav-symbols';
import {
  READ_SYMBOL_DEFAULT_MAX_LINES,
  READ_SYMBOL_HARD_MAX_LINES,
  READ_SYMBOL_MAX_CHARS,
  READ_SYMBOL_MAX_FILE_BYTES,
  READ_SYMBOL_TOOL_NAME,
} from './read-symbol.limits';

const MAX_LISTED_MATCHES = 20;
const MAX_CLOSEST_NAMES = 10;

export const ReadSymbolArgsSchema = z
  .object({
    file: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    kind: z.enum(['class', 'method', 'function']).optional(),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    maxLines: z
      .number()
      .int()
      .positive()
      .max(READ_SYMBOL_HARD_MAX_LINES)
      .optional(),
    workspaceRoot: z.string().trim().min(1).optional(),
  })
  .strict();

export type ReadSymbolArgs = z.infer<typeof ReadSymbolArgsSchema>;

export interface ReadSymbolDeps {
  /** Tree-sitter outline of an absolute file path. */
  readonly analyze: (absolutePath: string) => Promise<AstCodeInsights>;
  /** Root used when the call passes no `workspaceRoot`. */
  readonly defaultWorkspaceRoot: () => Promise<string | undefined>;
}

export interface ReadSymbolReply {
  readonly isError: boolean;
  readonly text: string;
}

const fail = (text: string): ReadSymbolReply => ({ isError: true, text });
const ok = (text: string): ReadSymbolReply => ({ isError: false, text });

function splitLines(content: string): string[] {
  const lines = content.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/** Doc comment, attribute and decorator lines directly above a declaration. */
const LEADING_LINE = /^(@|\/\/|\/\*|\*|#\[|# )/;

function leadingStart(lines: readonly string[], startLine: number): number {
  let start = startLine;
  while (start > 1 && LEADING_LINE.test(lines[start - 2].trim())) {
    start -= 1;
  }
  return start;
}

/**
 * Numbered lines `first..last` (1-based), cut at `maxLines` and at the
 * character cap on a line boundary. The footer says where to continue.
 */
function renderLines(
  header: string,
  lines: readonly string[],
  first: number,
  last: number,
  maxLines: number,
  notes: readonly string[],
): string {
  const wanted = Math.min(last, first + maxLines - 1);
  const width = String(wanted).length;
  const out: string[] = [header, ...notes];
  let used = out.reduce((sum, line) => sum + line.length + 1, 0);
  let shownLast = first - 1;
  for (let n = first; n <= wanted; n += 1) {
    const row = `${String(n).padStart(width)}| ${lines[n - 1]}`;
    if (used + row.length + 1 > READ_SYMBOL_MAX_CHARS - 200) {
      if (n === first) {
        // A single line longer than the cap: show its head so the call
        // still makes progress, and continue from the next line.
        out.push(row.slice(0, READ_SYMBOL_MAX_CHARS - 200 - used) + ' …');
        shownLast = n;
      }
      break;
    }
    out.push(row);
    used += row.length + 1;
    shownLast = n;
  }
  if (shownLast < last) {
    const remaining = last - shownLast;
    out.push(
      `… ${remaining} more line${remaining === 1 ? '' : 's'}; call again with startLine=${shownLast + 1}${
        last > shownLast + 1 ? ` endLine=${last}` : ''
      }`,
    );
  }
  return out.join('\n');
}

function closestNames(symbols: readonly NavSymbol[], name: string): string[] {
  const needle = name.toLowerCase();
  const unique = [...new Set(symbols.map((symbol) => symbol.qualifiedName))];
  const score = (candidate: string): number => {
    const lower = candidate.toLowerCase();
    const short = lower.slice(lower.lastIndexOf('.') + 1);
    if (short.startsWith(needle) || needle.startsWith(short)) return 0;
    if (lower.includes(needle) || needle.includes(short)) return 1;
    return 2;
  };
  const ranked = unique
    .map((candidate) => ({ candidate, rank: score(candidate) }))
    .filter((entry) => entry.rank < 2)
    .sort((a, b) => a.rank - b.rank || a.candidate.localeCompare(b.candidate))
    .map((entry) => entry.candidate);
  return ranked.slice(0, MAX_CLOSEST_NAMES);
}

/** Overloads: one qualified name and kind whose ranges follow each other. */
function isOneDeclaration(matches: readonly NavSymbol[]): boolean {
  const [head, ...rest] = matches;
  if (
    rest.some(
      (m) => m.qualifiedName !== head.qualifiedName || m.kind !== head.kind,
    )
  ) {
    return false;
  }
  for (let i = 1; i < matches.length; i += 1) {
    if (matches[i].startLine > matches[i - 1].endLine + 2) {
      return false;
    }
  }
  return true;
}

function readByName(
  args: ReadSymbolArgs & { name: string },
  relativePath: string,
  lines: readonly string[],
  symbols: readonly NavSymbol[],
  maxLines: number,
  partial: boolean,
): ReadSymbolReply {
  const name = args.name;
  let matches = symbols.filter(
    (symbol) =>
      (symbol.name === name || symbol.qualifiedName === name) &&
      (args.kind === undefined || symbol.kind === args.kind),
  );
  if (args.startLine !== undefined && matches.length > 1) {
    const from = args.startLine;
    const to = args.endLine ?? from;
    const inRange = matches.filter(
      (symbol) => symbol.startLine <= to && symbol.endLine >= from,
    );
    // A range that hits none of them keeps the full list, so the answer
    // still names the candidates instead of claiming there is none.
    if (inRange.length > 0) {
      matches = inRange;
    }
  }

  if (matches.length === 0) {
    const kindNote = args.kind ? ` of kind ${args.kind}` : '';
    const close = closestNames(symbols, name);
    const tail =
      close.length > 0
        ? `Closest names: ${close.join(', ')}`
        : `No similar names among the ${symbols.length} declarations in this file.`;
    const hint = partial
      ? 'The file has syntax errors, so the declaration list may be incomplete. '
      : '';
    return ok(
      `No declaration named "${name}"${kindNote} in ${relativePath}.\n${tail}\n${hint}Only classes, functions and methods are addressable by name; for an interface, type, enum or constant use ptah_grep to find the line, then startLine/endLine.`,
    );
  }

  if (matches.length > 1 && !isOneDeclaration(matches)) {
    const listed = matches
      .slice(0, MAX_LISTED_MATCHES)
      .map(
        (m) =>
          `${relativePath}:${m.startLine}-${m.endLine} ${m.kind} ${m.qualifiedName} ${m.signature}`,
      );
    const more =
      matches.length > MAX_LISTED_MATCHES
        ? [`… ${matches.length - MAX_LISTED_MATCHES} more`]
        : [];
    return ok(
      [
        `${matches.length} declarations named "${name}" in ${relativePath}; pass startLine/endLine or kind to choose:`,
        ...listed,
        ...more,
      ].join('\n'),
    );
  }

  const head = matches[0];
  const start = leadingStart(lines, head.startLine);
  const end = Math.min(
    Math.max(...matches.map((m) => m.endLine)),
    lines.length,
  );
  const overloads = matches.length > 1 ? [`(${matches.length} overloads)`] : [];
  return ok(
    renderLines(
      `${relativePath}:${start}-${end} ${head.kind} ${head.qualifiedName}`,
      lines,
      start,
      end,
      maxLines,
      overloads,
    ),
  );
}

function readByRange(
  startLine: number,
  endLine: number | undefined,
  relativePath: string,
  lines: readonly string[],
  maxLines: number,
): ReadSymbolReply {
  const total = lines.length;
  if (endLine !== undefined && startLine > endLine) {
    return fail(
      `Error: startLine (${startLine}) is after endLine (${endLine}).`,
    );
  }
  if (startLine > total) {
    return fail(
      total === 0
        ? `Error: ${relativePath} is empty.`
        : `Error: startLine ${startLine} is past the end of ${relativePath} (${total} lines).`,
    );
  }
  const requestedEnd = endLine ?? startLine + maxLines - 1;
  const end = Math.min(requestedEnd, total);
  const notes =
    endLine !== undefined && endLine > total
      ? [`(endLine ${endLine} clamped to the end of the file)`]
      : [];
  return ok(
    renderLines(
      `${relativePath}:${startLine}-${end} (${total} lines)`,
      lines,
      startLine,
      end,
      maxLines,
      notes,
    ),
  );
}

/** Validate, resolve, read and render one `ptah_read_symbol` call. */
export async function handleReadSymbol(
  rawArgs: unknown,
  deps: ReadSymbolDeps,
): Promise<ReadSymbolReply> {
  const parsed = ReadSymbolArgsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return fail(
      `Error: invalid ${READ_SYMBOL_TOOL_NAME} arguments — ${describeZodIssues(parsed.error)}`,
    );
  }
  const args = parsed.data;
  const { name, startLine } = args;
  if (name === undefined && startLine === undefined) {
    return fail(
      'Error: pass "name" (a declaration to read) or "startLine" (a line range).',
    );
  }

  const root = args.workspaceRoot ?? (await deps.defaultWorkspaceRoot());
  if (!root) {
    return fail(
      'Error: no workspace is open. Open a workspace folder first; a "workspaceRoot" argument must lie inside an open workspace.',
    );
  }
  const resolved = await resolveNavWorkspacePath(args.file, root);
  if (!resolved.ok) {
    return fail(resolved.error);
  }
  const target = resolved.value;
  if (target.isDirectory) {
    return fail(`Error: ${target.relativePath} is a directory, not a file.`);
  }
  if (target.sizeBytes > READ_SYMBOL_MAX_FILE_BYTES) {
    return fail(
      `Error: ${target.relativePath} is ${target.sizeBytes} bytes; files above ${READ_SYMBOL_MAX_FILE_BYTES} bytes are not read.`,
    );
  }

  const text = await readFile(target.absolutePath, 'utf8');
  if (text.slice(0, 4096).includes('\u0000')) {
    return fail(
      `Error: ${target.relativePath} looks like a binary file; it is not printed.`,
    );
  }
  const lines = splitLines(text);
  const maxLines = args.maxLines ?? READ_SYMBOL_DEFAULT_MAX_LINES;

  if (name === undefined) {
    return readByRange(
      startLine ?? 1,
      args.endLine,
      target.relativePath,
      lines,
      maxLines,
    );
  }

  const extension = path.extname(target.absolutePath).toLowerCase();
  if (EXTENSION_LANGUAGE_MAP[extension] === undefined) {
    return ok(
      `Symbol lookup is not available for ${extension || 'extensionless'} files (${target.relativePath}); read a line range with startLine/endLine instead.`,
    );
  }
  const outline = await deps.analyze(target.absolutePath);
  return readByName(
    { ...args, name },
    target.relativePath,
    lines,
    toNavSymbols(outline),
    maxLines,
    outline.parseStatus !== 'ok',
  );
}
