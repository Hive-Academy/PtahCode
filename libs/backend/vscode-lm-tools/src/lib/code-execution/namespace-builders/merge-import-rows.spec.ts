import { mergeImportRows } from './merge-import-rows';

describe('mergeImportRows', () => {
  it('merges the rows the TS query yields for one tsyringe import', () => {
    // The real rows of `import { injectable, inject } from 'tsyringe'` plus a
    // later `import type { DependencyContainer } from 'tsyringe'`.
    expect(
      mergeImportRows([
        { source: 'tsyringe', importedSymbols: ['injectable'] },
        { source: 'tsyringe', importedSymbols: ['inject'] },
        { source: 'tsyringe' },
        { source: 'tsyringe', importedSymbols: ['DependencyContainer'] },
      ]),
    ).toEqual([
      {
        source: 'tsyringe',
        importedSymbols: ['injectable', 'inject', 'DependencyContainer'],
      },
    ]);
  });

  it('puts the default symbol first and keeps the flags', () => {
    expect(
      mergeImportRows([
        { source: './d', importedSymbols: ['a'] },
        { source: './d', importedSymbols: ['Def'], isDefault: true },
        { source: './d', importedSymbols: ['* as ns'], isNamespace: true },
        { source: './d', importedSymbols: ['a'] },
      ]),
    ).toEqual([
      {
        source: './d',
        importedSymbols: ['Def', 'a', '* as ns'],
        isDefault: true,
        isNamespace: true,
      },
    ]);
  });

  it('keeps a source without symbols as one bare row, at its first place', () => {
    expect(
      mergeImportRows([
        { source: './side' },
        { source: 'x', importedSymbols: ['y'] },
        { source: './side', importedSymbols: undefined, isDefault: undefined },
      ]),
    ).toEqual([{ source: './side' }, { source: 'x', importedSymbols: ['y'] }]);
  });

  it('passes rows with contract fields unchanged and in place', () => {
    const pythonRow = {
      source: 'a.b',
      importedSymbols: ['C'],
      kind: 'from',
      line: 3,
    };
    const aliased = {
      source: 'a.b',
      importedSymbols: ['D'],
      importedSymbolAliases: ['E'],
    };
    const rows = [
      pythonRow,
      { source: 'm', importedSymbols: ['p'] },
      aliased,
      { source: 'm', importedSymbols: ['q'] },
    ];
    const out = mergeImportRows(rows);
    expect(out).toEqual([
      pythonRow,
      { source: 'm', importedSymbols: ['p', 'q'] },
      aliased,
    ]);
    expect(out[0]).toBe(pythonRow);
    expect(out[2]).toBe(aliased);
  });

  it('returns an empty list for no rows', () => {
    expect(mergeImportRows([])).toEqual([]);
  });
});
