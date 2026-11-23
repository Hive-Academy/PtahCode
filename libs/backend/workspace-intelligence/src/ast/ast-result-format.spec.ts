/**
 * `formatAstAnalysisResult` — the table form of an AST analysis result
 * (TASK_2026_559 Batch 20.2p). The real-parser token and round-trip checks
 * live in vscode-lm-tools `ast-analyze-result.spec.ts`; these pin the format
 * rules on hand-built records.
 */
import { formatAstAnalysisResult } from './ast-result-format';

function parse(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

describe('formatAstAnalysisResult', () => {
  it('writes a list of records as a header row plus one row per record', () => {
    const text = formatAstAnalysisResult({
      parseStatus: 'ok',
      functions: [
        { name: 'load', parameters: ['id'], startLine: 3, endLine: 9 },
        { name: 'save', parameters: [], startLine: 11, endLine: 20 },
      ],
    });
    expect(text).toBe(
      '{"parseStatus":"ok","functions":[["name","parameters","startLine","endLine"],' +
        '["load",["id"],3,9],["save",[],11,20]]}',
    );
  });

  it('keeps the top-level key order, so status and coverage stay first', () => {
    const text = formatAstAnalysisResult({
      parseStatus: 'recovered',
      errorNodeCount: 2,
      errorNodeCountCapped: false,
      coverage: { census: 'complete', failed: 1 },
      file: 'a.ts',
      language: 'typescript',
      functions: [{ name: 'f', parameters: [] }],
      classes: [],
    });
    expect(Object.keys(parse(text))).toEqual([
      'parseStatus',
      'errorNodeCount',
      'errorNodeCountCapped',
      'coverage',
      'file',
      'language',
      'functions',
      'classes',
    ]);
    expect(parse(text)['functions']).toEqual([
      ['name', 'parameters'],
      ['f', []],
    ]);
  });

  it('writes an absent field as null inside a row and drops trailing absent fields', () => {
    const text = formatAstAnalysisResult({
      exports: [
        { name: 'a', kind: 'function' },
        { name: 'b', kind: 'unknown', isReExport: true, source: './b' },
        { name: 'c', kind: 'class', isDefault: true, isReExport: undefined },
        { name: 'd', kind: 'unknown', source: './d' },
      ],
    });
    expect(parse(text)['exports']).toEqual([
      ['name', 'kind', 'isReExport', 'source', 'isDefault'],
      ['a', 'function'],
      ['b', 'unknown', true, './b'],
      ['c', 'class', null, null, true],
      ['d', 'unknown', null, './d'],
    ]);
  });

  it('leaves a list unchanged when a real null would be ambiguous with an absent field', () => {
    const records = [
      { name: 'a', endLine: null },
      { name: 'b', endLine: 4 },
    ];
    expect(parse(formatAstAnalysisResult({ functions: records }))).toEqual({
      functions: records,
    });
  });

  it('leaves empty lists and non-record lists as JSON writes them', () => {
    const input = {
      imports: [],
      supportedLanguages: ['typescript', 'python'],
      classes: [{ name: 'Box', members: [] }],
    };
    expect(parse(formatAstAnalysisResult(input))).toEqual({
      imports: [],
      supportedLanguages: ['typescript', 'python'],
      classes: [
        ['name', 'members'],
        ['Box', []],
      ],
    });
  });

  it('writes a nested list of records (class members) as a nested table', () => {
    const input = {
      classes: [
        {
          name: 'Box',
          startLine: 0,
          members: [
            { name: 'open', parameters: [], modifiers: 'private static' },
            { name: 'close', parameters: ['force'] },
          ],
        },
        { name: 'Empty', startLine: 9 },
      ],
    };
    expect(parse(formatAstAnalysisResult(input))).toEqual({
      classes: [
        ['name', 'startLine', 'members'],
        [
          'Box',
          0,
          [
            ['name', 'parameters', 'modifiers'],
            ['open', [], 'private static'],
            ['close', ['force']],
          ],
        ],
        ['Empty', 9],
      ],
    });
  });

  it('leaves a nested list with a real null as objects', () => {
    const input = {
      classes: [{ name: 'Box', members: [{ name: 'open', note: null }] }],
    };
    expect(parse(formatAstAnalysisResult(input))).toEqual({
      classes: [
        ['name', 'members'],
        ['Box', [{ name: 'open', note: null }]],
      ],
    });
  });

  describe('with a fits limit', () => {
    const result = {
      parseStatus: 'ok',
      file: 'a.ts',
      classes: [{ name: 'Box' }],
      imports: [{ source: 'x' }, { source: 'y' }],
      functions: Array.from({ length: 50 }, (_, i) => ({
        name: `fn${i}`,
        parameters: [],
      })),
    };

    it('returns the default text when it fits', () => {
      expect(
        formatAstAnalysisResult(result, { fits: () => true, hint: 'h' }),
      ).toBe(formatAstAnalysisResult(result));
    });

    it('cuts the last list at a record boundary and notes it before the first list', () => {
      const limit = formatAstAnalysisResult(result).length - 100;
      const rejected: string[] = [];
      const text = formatAstAnalysisResult(result, {
        fits: (t) => t.length <= limit || (rejected.push(t), false),
        hint: 'read one symbol instead',
      });
      const parsed = parse(text);

      expect(text.length).toBeLessThanOrEqual(limit);
      expect(Object.keys(parsed)).toEqual([
        'parseStatus',
        'file',
        'truncated',
        'hint',
        'classes',
        'imports',
        'functions',
      ]);
      const shown = (parsed['functions'] as unknown[]).length - 1;
      expect(parsed['truncated']).toEqual({
        functions: {
          shown,
          total: 50,
          // The cut records stay findable by name.
          omittedNames: expect.stringContaining('fn49'),
        },
      });
      expect(shown).toBeGreaterThan(0);
      expect(parsed['hint']).toBe('read one symbol instead');
      expect(parsed['imports']).toEqual([['source'], ['x'], ['y']]);
      // The longest prefix that fits: one more record was tried and refused.
      const rowCounts = rejected.map(
        (t) => (parse(t)['functions'] as unknown[]).length - 1,
      );
      expect(rowCounts).toContain(shown + 1);
    });

    it('empties the last list and cuts the one before it when needed', () => {
      const text = formatAstAnalysisResult(result, {
        fits: (t) => !t.includes('"y"') && !t.includes('"fn0"'),
      });
      const parsed = parse(text);

      expect(parsed['functions']).toEqual([]);
      expect(parsed['imports']).toEqual([['source'], ['x']]);
      expect(parsed['truncated']).toEqual({
        imports: { shown: 1, total: 2 },
        functions: {
          shown: 0,
          total: 50,
          omittedNames: expect.stringContaining('fn0,fn1'),
        },
      });
      expect(parsed).not.toHaveProperty('hint');
    });
  });

  describe('a cut class', () => {
    const store = {
      name: 'Store',
      members: [
        { name: 'load', parameters: [] },
        { name: 'save', parameters: ['key'] },
      ],
    };
    const result = {
      parseStatus: 'ok',
      classes: [{ name: 'Box' }, store, { name: 'Queue', members: [] }],
      functions: [{ name: 'helper', parameters: [] }],
    };
    // Accepts a text whose `classes` table has at most `rows` records (the
    // header row is not a record), so the class list is cut to `rows`.
    const fitsRows =
      (rows: number) =>
      (text: string): boolean =>
        (parse(text)['classes'] as unknown[]).length <= rows + 1;

    it('names every cut class first, then its members as Class.member', () => {
      const parsed = parse(
        formatAstAnalysisResult(result, { fits: fitsRows(1) }),
      );

      expect(parsed['truncated']).toEqual({
        classes: {
          shown: 1,
          total: 3,
          omittedNames: 'Store,Queue,Store.load,Store.save',
          omittedMembers: 2,
        },
        // The later list is emptied first, as for any cut.
        functions: { shown: 0, total: 1, omittedNames: 'helper' },
      });
      expect(parsed['classes']).toEqual([['name'], ['Box']]);
    });

    it('lists the names the caller gives, for a class and for its members', () => {
      const listed: Record<string, string> = {
        Inner: 'A.Inner',
        run: 'A.Inner.run',
      };
      const parsed = parse(
        formatAstAnalysisResult(
          {
            parseStatus: 'ok',
            classes: [
              { name: 'Box' },
              { name: 'Inner', members: [{ name: 'run' }] },
            ],
          },
          {
            fits: fitsRows(1),
            listedName: {
              classes: (record) => listed[(record as { name: string }).name],
            },
          },
        ),
      );

      expect(parsed['truncated']).toEqual({
        classes: {
          shown: 1,
          total: 2,
          omittedNames: 'A.Inner,A.Inner.run',
          omittedMembers: 1,
        },
      });
    });

    it('lists no name the caller leaves out, and still counts the members', () => {
      const parsed = parse(
        formatAstAnalysisResult(
          { parseStatus: 'ok', classes: [{ name: 'Box' }, store] },
          { fits: fitsRows(1), listedName: { classes: () => undefined } },
        ),
      );

      expect(parsed['truncated']).toEqual({
        classes: { shown: 1, total: 2, omittedMembers: 2 },
      });
    });

    it('does not list members of a class that is still shown', () => {
      const parsed = parse(
        formatAstAnalysisResult(
          { parseStatus: 'ok', classes: [store, { name: 'Queue' }] },
          { fits: fitsRows(1) },
        ),
      );

      expect(parsed['truncated']).toEqual({
        classes: { shown: 1, total: 2, omittedNames: 'Queue' },
      });
    });

    type CutNote = { omittedNames?: string; omittedMembers?: number };
    const cutAll = (classes: unknown[], fits?: (text: string) => boolean) =>
      parse(
        formatAstAnalysisResult(
          { parseStatus: 'ok', classes },
          {
            fits:
              fits ??
              ((text) => (parse(text)['classes'] as unknown[]).length === 0),
          },
        ),
      )['truncated'] as Record<string, CutNote>;

    it('stops at 1800 characters and closes the list with an ellipsis', () => {
      const methods = Array.from({ length: 200 }, (_, i) => ({
        name: `method${i}`,
      }));
      const note = cutAll([{ name: 'Big', members: methods }])['classes'];
      const names = (note.omittedNames ?? '').split(',');

      expect(names[0]).toBe('Big');
      expect(names[1]).toBe('Big.method0');
      expect(note.omittedMembers).toBe(200);
      // Characters are reached before the 150-name cap.
      expect(names.length).toBeLessThan(150);
      expect(names[names.length - 1]).toBe('…');
      expect((note.omittedNames ?? '').length).toBeLessThanOrEqual(1800);
    });

    it('keeps a sole name of exactly 1800 characters', () => {
      const note = cutAll([{ name: 'x'.repeat(1800) }])['classes'];

      expect(note.omittedNames).toBe('x'.repeat(1800));
    });

    it('lists two names that end exactly at 1800 characters', () => {
      const note = cutAll([{ name: 'y'.repeat(1798) }, { name: 'z' }])[
        'classes'
      ];

      expect(note.omittedNames).toBe(`${'y'.repeat(1798)},z`);
    });

    it('closes with an ellipsis, within 1800 characters, when the next name would pass the cap', () => {
      const note = cutAll([{ name: 'y'.repeat(1799) }, { name: 'z' }])[
        'classes'
      ];

      expect(note.omittedNames).toBe('…');
    });

    it('stops at 150 names when the names are short', () => {
      const methods = Array.from({ length: 300 }, (_, i) => ({
        name: `m${i}`,
      }));
      const note = cutAll([{ name: 'B', members: methods }])['classes'];
      const names = (note.omittedNames ?? '').split(',');

      expect(names).toHaveLength(151);
      expect(names[150]).toBe('…');
      expect(note.omittedMembers).toBe(300);
    });

    it('counts only named member records', () => {
      const note = cutAll([
        { name: 'A', members: [null, 4, {}, { name: 'x' }] },
      ])['classes'];

      expect(note.omittedNames).toBe('A,A.x');
      expect(note.omittedMembers).toBe(1);
    });

    it('drops the names, keeps the counts, when the note alone does not fit', () => {
      const methods = Array.from({ length: 40 }, (_, i) => ({
        name: `method${i}`,
      }));
      const text = formatAstAnalysisResult(
        { parseStatus: 'ok', classes: [{ name: 'Big', members: methods }] },
        { fits: (out) => !out.includes('omittedNames') && out.length < 400 },
      );
      const note = (parse(text)['truncated'] as Record<string, CutNote>)[
        'classes'
      ];

      expect(note.omittedNames).toBeUndefined();
      expect(note.omittedMembers).toBe(40);
      expect(parse(text)['classes']).toEqual([]);
    });
  });
});
