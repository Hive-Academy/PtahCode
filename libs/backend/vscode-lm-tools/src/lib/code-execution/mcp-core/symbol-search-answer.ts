/**
 * Wire form of a `ptah_code_search_symbols` answer (TASK_2026_2299 B3).
 *
 * Two forms:
 *
 * - Text (the default, {@link renderSymbolSearchText}): one `path:start-end
 *   kind name` line per hit with its signature or short extract below it,
 *   like `ptah_read_symbol` and `ptah_grep`. When the index is not quiet one
 *   header line states the index size and age and the coverage verdict with
 *   its non-zero counts, and names `includeCoverage`. The full coverage
 *   block never travels in this form.
 * - JSON (`includeCoverage: true`, {@link toSymbolSearchWireAnswer}): the
 *   `index` and the compact `coverage` block (always present, so the full
 *   honesty statement can be read) ahead of the hits. Each hit names its
 *   file once.
 */
import {
  compactCoverage,
  type CompactCoverage,
} from '@ptah-extension/platform-core';
import {
  CODE_INDEX_STALE_MS,
  type IndexFreshnessStatus,
  type SymbolHit,
  type SymbolSearchError,
  type SymbolSearchResult,
} from '../namespace-builders/code-namespace.builder';

/** One hit as the MCP tool returns it. */
export interface SymbolSearchWireHit {
  file: string;
  name: string;
  kind: string;
  startLine?: number;
  endLine?: number;
  signature: string;
  extract?: string;
  score: number;
}

export interface SymbolSearchWireAnswer {
  index?: IndexFreshnessStatus;
  coverage?: CompactCoverage;
  bm25Only?: true;
  error?: string;
  extractUnavailable?: number;
  hits: SymbolSearchWireHit[];
}

/** The index needs no mention: populated, younger than the stale age, no run, clean coverage. */
export function isIndexQuiet(
  result: Pick<SymbolSearchResult, 'index' | 'coverage'>,
): boolean {
  const { index, coverage } = result;
  return (
    coverage.clean &&
    !index.reindexStarted &&
    !index.reindexInFlight &&
    index.symbolCount !== null &&
    index.symbolCount > 0 &&
    index.indexAgeMs !== null &&
    index.indexAgeMs < CODE_INDEX_STALE_MS
  );
}

function wireHit(hit: SymbolHit): SymbolSearchWireHit {
  return {
    file: hit.file,
    name: hit.name,
    kind: hit.kind,
    ...(hit.startLine !== undefined ? { startLine: hit.startLine } : {}),
    ...(hit.endLine !== undefined ? { endLine: hit.endLine } : {}),
    signature: hit.signature,
    ...(hit.extract !== undefined ? { extract: hit.extract } : {}),
    score: Math.round(hit.score * 10_000) / 10_000,
  };
}

/** The answer the tool returns for a search result or error (key order is wire order). */
export function toSymbolSearchWireAnswer(
  result: SymbolSearchResult | SymbolSearchError,
  alwaysIncludeCoverage = false,
): SymbolSearchWireAnswer {
  const quiet =
    !alwaysIncludeCoverage && !('error' in result) && isIndexQuiet(result);
  return {
    ...(quiet
      ? {}
      : { index: result.index, coverage: compactCoverage(result.coverage) }),
    ...(result.bm25Only ? { bm25Only: true as const } : {}),
    ...('error' in result ? { error: result.error } : {}),
    ...('extractUnavailable' in result &&
    result.extractUnavailable !== undefined
      ? { extractUnavailable: result.extractUnavailable }
      : {}),
    hits: result.hits.map(wireHit),
  };
}

/** The coverage fields the one-line header may name, in `CoverageFields` order. */
const HEADER_COUNT_KEYS = [
  'unchecked',
  'failed',
  'unsupported',
  'unrecognised',
  'omittedByCap',
] as const;

/** `unchecked 12, failed 3`: the counts that are not 0 (`?` is unknown). */
function countList(coverage: CompactCoverage): string[] {
  if (coverage.clean) return [];
  const parts: string[] = [];
  for (const key of HEADER_COUNT_KEYS) {
    const value = coverage[key];
    if (value !== undefined) parts.push(`${key} ${value ?? '?'}`);
  }
  return parts;
}

function ageText(indexAgeMs: number | null): string {
  if (indexAgeMs === null) return 'age unknown';
  const minutes = Math.round(indexAgeMs / 60_000);
  if (minutes < 120) return `${minutes} min old`;
  return `${Math.round(minutes / 60)} h old`;
}

/**
 * The one header line of a search whose index is not quiet: size, age, a
 * reindex in progress, and the coverage verdict with the counts that are
 * not 0. An empty result still carries it: it says whether 0 hits mean
 * "absent" or "not indexed".
 */
function indexHeader(
  result: Pick<SymbolSearchResult, 'index' | 'coverage'>,
): string {
  const { index, coverage } = result;
  const compact = compactCoverage(coverage);
  const parts = [
    index.symbolCount === null
      ? 'index size unknown'
      : `index ${index.symbolCount} symbols`,
    ageText(index.indexAgeMs),
  ];
  if (index.reindexStarted) parts.push('reindex started');
  else if (index.reindexInFlight) parts.push('reindex running');
  const verdict = compact.clean
    ? 'coverage clean'
    : `coverage not clean (${[...compact.reasons, ...countList(compact)].join(', ')})`;
  return `[${parts.join(', ')}; ${verdict}; full: includeCoverage=true]`;
}

function hitText(hit: SymbolHit): string {
  const range =
    hit.startLine !== undefined
      ? `:${hit.startLine}${hit.endLine !== undefined ? `-${hit.endLine}` : ''}`
      : '';
  const head = `${hit.file}${range} ${hit.kind} ${hit.name}`;
  const body = (hit.extract ?? hit.signature)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  return `${head}\n${body}`;
}

/** The default answer text of a search result or error. */
export function renderSymbolSearchText(
  result: SymbolSearchResult | SymbolSearchError,
): string {
  const lines: string[] = [];
  if ('error' in result) {
    lines.push(`Error: ${result.error}`);
  }
  if ('error' in result || !isIndexQuiet(result)) {
    lines.push(indexHeader(result));
  }
  if (result.bm25Only) {
    lines.push('[text match only: the vector index was not used]');
  }
  if (
    'extractUnavailable' in result &&
    result.extractUnavailable !== undefined &&
    result.extractUnavailable > 0
  ) {
    lines.push(
      `[${result.extractUnavailable} hit(s) without a range: the index row is older than the file]`,
    );
  }
  if (result.hits.length === 0) {
    lines.push('No symbols found.');
  } else {
    lines.push(...result.hits.map(hitText));
  }
  return lines.join('\n');
}
