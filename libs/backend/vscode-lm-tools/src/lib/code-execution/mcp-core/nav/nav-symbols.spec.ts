import type { AstCodeInsights } from '../../types';
import { innermostSymbolAt, toNavSymbols } from './nav-symbols';

const outline = (
  partial: Pick<AstCodeInsights, 'functions' | 'classes'>,
): AstCodeInsights =>
  ({
    file: 'a.ts',
    language: 'typescript',
    imports: [],
    exports: [],
    ...partial,
  }) as unknown as AstCodeInsights;

describe('toNavSymbols', () => {
  it('converts to 1-based ranges, kinds and qualified names', () => {
    const symbols = toNavSymbols(
      outline({
        classes: [
          { name: 'Outer', startLine: 0, endLine: 20 },
          { name: 'Inner', startLine: 2, endLine: 10 },
        ],
        functions: [
          { name: 'run', parameters: ['a', 'b'], startLine: 4, endLine: 6 },
          { name: 'top', parameters: [], startLine: 22, endLine: 24 },
          { name: 'noRange', parameters: [] },
        ],
      }),
    );
    expect(symbols).toEqual([
      expect.objectContaining({
        qualifiedName: 'Outer',
        kind: 'class',
        startLine: 1,
        endLine: 21,
      }),
      expect.objectContaining({
        qualifiedName: 'Outer.Inner',
        kind: 'class',
        startLine: 3,
        endLine: 11,
      }),
      expect.objectContaining({
        name: 'run',
        qualifiedName: 'Outer.Inner.run',
        kind: 'method',
        startLine: 5,
        endLine: 7,
        signature: 'run(a, b)',
      }),
      expect.objectContaining({
        qualifiedName: 'top',
        kind: 'function',
        startLine: 23,
      }),
    ]);
  });

  it('does not duplicate a method listed both flat and under its class', () => {
    const method = { name: 'm', parameters: [], startLine: 1, endLine: 2 };
    const symbols = toNavSymbols(
      outline({
        classes: [{ name: 'C', startLine: 0, endLine: 3, methods: [method] }],
        functions: [method],
      }),
    );
    expect(symbols.filter((s) => s.name === 'm')).toHaveLength(1);
  });
});

describe('innermostSymbolAt', () => {
  const symbols = toNavSymbols(
    outline({
      classes: [{ name: 'C', startLine: 0, endLine: 9 }],
      functions: [{ name: 'm', parameters: [], startLine: 2, endLine: 4 }],
    }),
  );

  it('returns the smallest containing declaration', () => {
    expect(innermostSymbolAt(symbols, 4)?.qualifiedName).toBe('C.m');
    expect(innermostSymbolAt(symbols, 8)?.qualifiedName).toBe('C');
  });

  it('returns undefined outside every declaration', () => {
    expect(innermostSymbolAt(symbols, 30)).toBeUndefined();
  });
});
