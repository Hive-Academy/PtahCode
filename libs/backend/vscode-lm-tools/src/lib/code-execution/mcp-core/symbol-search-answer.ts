/**
 * Wire form of a `ptah_code_search_symbols` answer (TASK_2026_2299 B3).
 *
 * Each hit names its file once (workspace-relative) and carries its line
 * range and signature, plus a short extract on the top hits. The `index`
 * and `coverage` blocks are left out when the index is clean, fresh and not
 * reindexing: then they say nothing a caller acts on. Otherwise they stay,
 * with the coverage in its compact form, ahead of the hits.
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
): SymbolSearchWireAnswer {
  const quiet = !('error' in result) && isIndexQuiet(result);
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
