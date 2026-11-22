import 'reflect-metadata';
import type {
  SymbolHit,
  SymbolSearchResult,
} from '../namespace-builders/code-namespace.builder';
import {
  renderSymbolSearchText,
  toSymbolSearchWireAnswer,
} from './symbol-search-answer';

const CLEAN_COVERAGE = {
  clean: true,
  analyzed: 10,
  unchecked: 0,
  failed: 0,
  unsupported: 0,
  unrecognised: 0,
  nonSource: 0,
  excluded: null,
  omittedByCap: 0,
  census: 'complete',
  supportedLanguages: ['typescript', 'python'],
} as unknown as SymbolSearchResult['coverage'];

const DIRTY_COVERAGE = {
  ...CLEAN_COVERAGE,
  clean: false,
  unchecked: 12,
  failed: 3,
  unsupported: 4,
  census: 'unknown',
} as unknown as SymbolSearchResult['coverage'];

const HIT: SymbolHit = {
  file: 'libs/a/src/store.ts',
  name: 'Store.load',
  symbolName: 'Store.load',
  filePath: '/ws/libs/a/src/store.ts',
  kind: 'method',
  startLine: 10,
  endLine: 12,
  signature: 'load(id: string)',
  extract: 'load(id: string) {\n  return id;\n}',
  score: 0.123456789,
  text: 'method Store.load in store.ts:10-12',
} as unknown as SymbolHit;

function result(
  overrides: Partial<SymbolSearchResult> = {},
): SymbolSearchResult {
  return {
    index: {
      symbolCount: 20124,
      indexAgeMs: 480_000,
      reindexStarted: false,
      reindexInFlight: false,
    },
    coverage: CLEAN_COVERAGE,
    hits: [HIT],
    ...overrides,
  } as SymbolSearchResult;
}

describe('renderSymbolSearchText', () => {
  it('writes one line per hit and no header when the index is quiet', () => {
    expect(renderSymbolSearchText(result())).toBe(
      [
        'libs/a/src/store.ts:10-12 method Store.load',
        '  load(id: string) {',
        '    return id;',
        '  }',
      ].join('\n'),
    );
  });

  it('shows the signature when a hit has no extract', () => {
    const text = renderSymbolSearchText(
      result({ hits: [{ ...HIT, extract: undefined }] }),
    );
    expect(text).toBe(
      'libs/a/src/store.ts:10-12 method Store.load\n  load(id: string)',
    );
  });

  it('replaces the index and coverage blocks with one header line', () => {
    const text = renderSymbolSearchText(result({ coverage: DIRTY_COVERAGE }));
    const [header] = text.split('\n');
    expect(header).toContain('index 20124 symbols');
    expect(header).toContain('8 min old');
    expect(header).toContain('coverage not clean');
    expect(header).toContain('unchecked 12');
    expect(header).toContain('failed 3');
    expect(header).toContain('unsupported 4');
    expect(header).toContain('includeCoverage=true');
    expect(text).not.toContain('supportedLanguages');
    expect(text).not.toContain('typescript');
  });

  it('keeps the header on an empty result, so 0 hits are not read as absent', () => {
    const text = renderSymbolSearchText(
      result({ coverage: DIRTY_COVERAGE, hits: [] }),
    );
    expect(text).toContain('coverage not clean');
    expect(text).toContain('No symbols found.');
  });

  it('names a reindex that started and an unknown index size', () => {
    const text = renderSymbolSearchText(
      result({
        index: {
          symbolCount: null,
          indexAgeMs: null,
          reindexStarted: true,
          reindexInFlight: true,
        },
        hits: [],
      }),
    );
    expect(text).toContain('index size unknown');
    expect(text).toContain('age unknown');
    expect(text).toContain('reindex started');
  });

  it('names both causes when hits have no code extract', () => {
    const text = renderSymbolSearchText(result({ extractUnavailable: 2 }));
    expect(text).toContain('2 hit(s) without a code extract');
    expect(text).toContain('missing, unreadable or too large');
    expect(text).toContain('indexed range no longer matches');
  });

  it('says nothing about extracts when all of them were read', () => {
    const text = renderSymbolSearchText(result({ extractUnavailable: 0 }));
    expect(text).not.toContain('without a code extract');
  });

  it('reports an error with the header', () => {
    const text = renderSymbolSearchText({
      index: result().index,
      coverage: CLEAN_COVERAGE,
      bm25Only: true,
      error: 'vector store down',
      hits: [],
    });
    expect(text).toContain('Error: vector store down');
    expect(text).toContain('text match only');
  });
});

describe('toSymbolSearchWireAnswer', () => {
  it('leaves the blocks out of a quiet answer', () => {
    const wire = toSymbolSearchWireAnswer(result());
    expect(wire.index).toBeUndefined();
    expect(wire.coverage).toBeUndefined();
  });

  it('keeps both blocks, also for a quiet index, when asked', () => {
    const wire = toSymbolSearchWireAnswer(result(), true);
    expect(wire.index?.symbolCount).toBe(20124);
    expect(wire.coverage?.clean).toBe(true);
    expect(wire.hits[0]?.score).toBe(0.1235);
  });
});
