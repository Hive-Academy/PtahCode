import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { shapeSymbolHits, type RawSymbolHit } from './symbol-hit-format';

describe('shapeSymbolHits range check', () => {
  let root: string;
  let file: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'hits-'));
    file = path.join(root, 'a.ts');
    await writeFile(
      file,
      [
        '// header',
        'export function other() {',
        '  return 1;',
        '}',
        'export function target(a: number) {',
        '  return a;',
        '}',
      ].join('\n'),
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function hit(range: string): RawSymbolHit {
    return {
      subject: null,
      filePath: file,
      symbolName: 'target',
      kind: 'function',
      text: `function target in a.ts:${range}`,
      score: 1,
    } as RawSymbolHit;
  }

  it('keeps the range and the extract when the lines hold the symbol name', async () => {
    const { hits, extractUnavailable } = await shapeSymbolHits(
      [hit('4-6')],
      'target',
      5,
      root,
    );
    expect(hits[0].startLine).toBe(5);
    expect(hits[0].extract).toContain('export function target');
    expect(extractUnavailable).toBe(0);
  });

  it('drops a stale range instead of showing the wrong lines', async () => {
    const { hits, extractUnavailable } = await shapeSymbolHits(
      [hit('0-2')],
      'target',
      5,
      root,
    );
    expect(hits[0].startLine).toBeUndefined();
    expect(hits[0].extract).toBeUndefined();
    expect(extractUnavailable).toBe(1);
  });
});
