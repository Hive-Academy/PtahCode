/**
 * Shaping of code-symbol search hits (TASK_2026_2299 B3): name-match
 * ranking, workspace-relative paths, line ranges, a declaration signature
 * and a short extract read from disk.
 *
 * Kept apart from `code-namespace.builder.ts` so the ranking and the
 * signature rules are pure functions the specs pin without an index.
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/** Longest `signature`, in characters. */
export const SIGNATURE_MAX_CHARS = 200;
/** Lines an `extract` holds at most, from the declaration's first line. */
export const EXTRACT_MAX_LINES = 8;
/** Hits (after ranking) that carry an `extract`. */
export const EXTRACT_TOP_HITS = 3;
/** A source file larger than this is not read for a signature or extract. */
export const SOURCE_READ_MAX_BYTES = 2 * 1024 * 1024;
/** Lines a signature may span before it is cut. */
const SIGNATURE_MAX_LINES = 6;

/** `<kind> <name> in <relPath>:<startLine>-<endLine>`; the indexer writes 0-based rows. */
const LINE_RANGE_RE = /:(\d+)-(\d+)\s*$/;

/** 1-based inclusive line range parsed from an index row's text, when it carries one. */
export function parseLineRange(
  text: string,
): { startLine: number; endLine: number } | undefined {
  const match = LINE_RANGE_RE.exec(text);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return { startLine: start + 1, endLine: Math.max(start, end) + 1 };
}

/**
 * `filePath` relative to `workspaceRoot`, `/`-separated; the absolute path
 * (with `/`) when it lies outside the root or there is no root.
 */
export function toWorkspaceRelative(
  filePath: string,
  workspaceRoot: string | undefined,
): string {
  const slashed = filePath.replace(/\\/g, '/');
  if (!workspaceRoot) return slashed;
  const relative = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    return slashed;
  }
  return relative;
}

/**
 * The lower-case word tokens of an identifier: camelCase, PascalCase,
 * acronyms, snake_case, kebab-case and `Class.method` are split.
 */
export function splitNameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0);
}

/** The lower-case word tokens of a search query, without duplicates. */
export function splitQueryTokens(query: string): string[] {
  return [...new Set(query.split(/\s+/).flatMap(splitNameTokens))];
}

/** A query token matches a name token equal to it or starting with it. */
function tokenMatches(
  queryToken: string,
  nameTokens: readonly string[],
): boolean {
  return nameTokens.some((nameToken) => nameToken.startsWith(queryToken));
}

/**
 * Name-match tier of a symbol for a query; lower ranks first.
 * 0 exact name (case-insensitive, or the query's words joined), 1 name
 * starts with the query, 2 the name holds every query word, 3 the name
 * holds some query words, 4 no name match (text or vector match only).
 * `matched` is how many query words the name holds.
 */
export function nameMatchRank(
  name: string,
  query: string,
): { tier: number; matched: number } {
  const lowerName = name.toLowerCase();
  const lowerQuery = query.trim().toLowerCase();
  const queryTokens = splitQueryTokens(query);
  const nameTokens = splitNameTokens(name);
  const matched = queryTokens.filter((token) =>
    tokenMatches(token, nameTokens),
  ).length;
  const lastSegment = lowerName.slice(lowerName.lastIndexOf('.') + 1);
  if (
    lowerName === lowerQuery ||
    lastSegment === lowerQuery ||
    (queryTokens.length > 1 &&
      queryTokens.join('') === lastSegment.replace(/[^a-z0-9]/g, ''))
  ) {
    return { tier: 0, matched };
  }
  if (
    !/\s/.test(lowerQuery) &&
    (lowerName.startsWith(lowerQuery) || lastSegment.startsWith(lowerQuery))
  ) {
    return { tier: 1, matched };
  }
  if (matched === 0) return { tier: 4, matched };
  if (queryTokens.length > 1 && matched === queryTokens.length) {
    return { tier: 2, matched };
  }
  return { tier: 3, matched };
}

/**
 * `hits` ordered by name match first (see {@link nameMatchRank}): a lower
 * tier first, then more matched query words, then the index's own order.
 */
export function rankByNameMatch<T>(
  hits: readonly T[],
  query: string,
  nameOf: (hit: T) => string,
): T[] {
  return hits
    .map((hit, order) => ({ hit, order, ...nameMatchRank(nameOf(hit), query) }))
    .sort(
      (a, b) => a.tier - b.tier || b.matched - a.matched || a.order - b.order,
    )
    .map(({ hit }) => hit);
}

/**
 * The declaration's head: its lines from `startIndex` joined until the
 * opening brace, an arrow or a line-ending `:` (Python) outside brackets,
 * whitespace collapsed, at most {@link SIGNATURE_MAX_CHARS} characters.
 */
export function extractSignature(
  lines: readonly string[],
  startIndex: number,
): string {
  let depth = 0;
  let out = '';
  const end = Math.min(lines.length, startIndex + SIGNATURE_MAX_LINES);
  for (let i = startIndex; i < end; i++) {
    const line = lines[i] ?? '';
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (depth === 0 && ch === '{') return finishSignature(out);
      if (depth === 0 && ch === '=' && line[c + 1] === '>') {
        return finishSignature(`${out}=>`);
      }
      if (ch === '(' || ch === '[' || ch === '<') depth++;
      else if (
        (ch === ')' || ch === ']' || (ch === '>' && line[c - 1] !== '=')) &&
        depth > 0
      ) {
        depth--;
      }
      out += ch;
    }
    if (
      depth === 0 &&
      /:\s*$/.test(line) &&
      /^\s*(?:async\s+)?(?:def|class)\b/.test(lines[startIndex] ?? '')
    ) {
      return finishSignature(out.replace(/:\s*$/, ''));
    }
    if (depth === 0 && /;\s*$/.test(line)) return finishSignature(out);
    out += ' ';
  }
  return finishSignature(out);
}

function finishSignature(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > SIGNATURE_MAX_CHARS
    ? `${collapsed.slice(0, SIGNATURE_MAX_CHARS - 1)}…`
    : collapsed;
}

/** Up to {@link EXTRACT_MAX_LINES} lines from the declaration's start, never past its end. */
export function extractLines(
  lines: readonly string[],
  startLine: number,
  endLine: number,
): string {
  const from = startLine - 1;
  const to = Math.min(lines.length, endLine, from + EXTRACT_MAX_LINES);
  return lines.slice(from, to).join('\n');
}

/** `<kind> <name>` from an index row's text, the signature when the source cannot be read. */
export function signatureFromIndexText(text: string): string {
  const head = text.split(' in ')[0] ?? text;
  return finishSignature(head);
}

/**
 * The lines of each source file, read once per path. A file that is
 * missing, unreadable or over {@link SOURCE_READ_MAX_BYTES} maps to
 * `undefined`; the caller records it (`extractUnavailable`).
 */
export async function readSourceFiles(
  filePaths: readonly string[],
): Promise<Map<string, readonly string[] | undefined>> {
  const unique = [...new Set(filePaths)];
  const entries = await Promise.all(
    unique.map(
      async (filePath) => [filePath, await readSourceLines(filePath)] as const,
    ),
  );
  return new Map(entries);
}

async function readSourceLines(
  filePath: string,
): Promise<readonly string[] | undefined> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > SOURCE_READ_MAX_BYTES) return undefined;
    const content = await fs.readFile(filePath, 'utf8');
    return content.split(/\r?\n/);
  } catch {
    // degradation-audit: reported — a missing or unreadable file only loses
    // the hit's signature and extract; the caller counts it in
    // `extractUnavailable` and the hit keeps its index fields.
    return undefined;
  }
}

/** An index hit before shaping (the reader's fields the namespace keeps). */
export interface RawSymbolHit {
  readonly subject: string | null;
  readonly filePath: string;
  readonly symbolName: string;
  readonly kind: string;
  readonly text: string;
  readonly score: number;
}

/** A hit with the navigation fields of TASK_2026_2299 added to the index fields. */
export interface ShapedSymbolHit extends RawSymbolHit {
  /** Workspace-relative, `/`-separated (absolute when outside the root). */
  readonly file: string;
  /** The symbol's name (same as `symbolName`). */
  readonly name: string;
  /** 1-based first line, when the index row records it. */
  readonly startLine?: number;
  /** 1-based last line, when the index row records it. */
  readonly endLine?: number;
  /** The declaration's head, or `<kind> <name>` when the source cannot be read. */
  readonly signature: string;
  /** Up to {@link EXTRACT_MAX_LINES} source lines; top {@link EXTRACT_TOP_HITS} hits only. */
  readonly extract?: string;
}

/** True when the declaration's first lines contain the symbol's own name. */
function rangeNamesSymbol(
  lines: readonly string[],
  range: { startLine: number; endLine: number },
  symbolName: string,
): boolean {
  const own = symbolName.split('.').pop() ?? symbolName;
  if (own === '') return false;
  const head = lines
    .slice(
      range.startLine - 1,
      Math.min(range.startLine - 1 + SIGNATURE_MAX_LINES, range.endLine),
    )
    .join('\n');
  return head.includes(own);
}

/**
 * Rank `raw` by name match, keep the first `maxResults`, and add the
 * navigation fields. `extractUnavailable` counts the kept hits whose source
 * file could not be read (missing, unreadable or too large).
 */
export async function shapeSymbolHits(
  raw: readonly RawSymbolHit[],
  query: string,
  maxResults: number,
  workspaceRoot: string | undefined,
): Promise<{ hits: ShapedSymbolHit[]; extractUnavailable: number }> {
  const kept = rankByNameMatch(raw, query, (hit) => hit.symbolName).slice(
    0,
    Math.max(0, maxResults),
  );
  const indexed = kept.map((hit) => parseLineRange(hit.text));
  const sources = await readSourceFiles(
    kept.filter((_, i) => indexed[i] !== undefined).map((hit) => hit.filePath),
  );
  let extractUnavailable = 0;
  const hits = kept.map((hit, i): ShapedSymbolHit => {
    const lines = indexed[i] ? sources.get(hit.filePath) : undefined;
    // The index stores lines at indexing time and may be up to a day old: a
    // range whose first lines do not name the symbol is stale (or the
    // `:0-0` fallback row), so it is dropped, not shown as a wrong extract.
    const range =
      indexed[i] && lines && rangeNamesSymbol(lines, indexed[i], hit.symbolName)
        ? indexed[i]
        : undefined;
    if (indexed[i] && !range) extractUnavailable++;
    const signature = range
      ? extractSignature(lines ?? [], range.startLine - 1) ||
        signatureFromIndexText(hit.text)
      : signatureFromIndexText(hit.text);
    const extract =
      range && lines && i < EXTRACT_TOP_HITS
        ? extractLines(lines, range.startLine, range.endLine)
        : undefined;
    return {
      ...hit,
      file: toWorkspaceRelative(hit.filePath, workspaceRoot),
      name: hit.symbolName,
      ...(range ?? {}),
      signature,
      ...(extract ? { extract } : {}),
    };
  });
  return { hits, extractUnavailable };
}

/** The candidate count to ask the index for, so name ranking has room. */
export function symbolCandidateCount(maxResults: number): number {
  return Math.max(maxResults, Math.min(50, maxResults * 2));
}
