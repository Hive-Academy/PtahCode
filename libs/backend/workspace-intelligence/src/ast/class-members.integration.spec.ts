/**
 * Class membership of TS/JS methods — real-grammar integration test
 * (TASK_2026_2299). Membership comes from the `@class_member.*` captures of
 * the real class queries, so only the shipped grammars prove it. The shims
 * are the ones `tsx-grammar.integration.spec.ts` documents.
 */

import 'reflect-metadata';
import type { Logger } from '@ptah-extension/vscode-core';

jest.mock('./wasm-bundle-dir', () => {
  const nodePath = require('path');
  const grammarDir = nodePath.join(
    nodePath.dirname(require.resolve('@vscode/tree-sitter-wasm/package.json')),
    'wasm',
  );
  const runtimeDir = nodePath.dirname(require.resolve('web-tree-sitter'));
  return {
    BUNDLE_DIR: grammarDir,
    resolveWasmPath: (filename: string) =>
      filename.startsWith('web-tree-sitter')
        ? nodePath.join(runtimeDir, filename)
        : nodePath.join(grammarDir, filename),
  };
});

jest.mock('web-tree-sitter', () => {
  const actual =
    jest.requireActual<typeof import('web-tree-sitter')>('web-tree-sitter');
  const nodeFs = require('fs');
  const loadFromPathOrBuffer = actual.Language.load.bind(actual.Language);
  actual.Language.load = (input: string | Uint8Array) =>
    loadFromPathOrBuffer(
      typeof input === 'string'
        ? new Uint8Array(nodeFs.readFileSync(input))
        : input,
    );
  return actual;
});

import { AstAnalysisService } from './ast-analysis.service';
import { TreeSitterParserService } from './tree-sitter-parser.service';
import type { ClassInfo, CodeInsights } from './ast-analysis.interfaces';
import type { SupportedLanguage } from './ast.types';

const TS_SOURCE = `export class Store extends Base {
  private cache = { read() { return 1; } };
  constructor(private readonly id: string) { super(); }
  public load(key: string) { return { inner() { return key; } }; }
  protected static create() { return new Store('x'); }
  get size() { return 0; }
  set size(value: number) {}
  async fetch(url: string) { return url; }
  static async *stream() {}
  #secret() { return 1; }
  private override render() {
    class Inner {
      run() {}
    }
    return new Inner();
  }
}

export abstract class Shape {
  abstract area(): number;
  describe() { return 'shape'; }
}

export const Factory = class {
  build(a: number, b: number) { return a + b; }
};

const helpers = {
  format(value: string) { return value; },
};

function wrap() {
  return new (class { hidden() {} })();
}
`;

const JS_SOURCE = `class Counter {
  static #count = 0;
  #bump() { Counter.#count++; }
  get value() { return 1; }
  reset() { return { nested() {} }; }
}
`;

function silentLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as Logger;
}

function byName(classes: readonly ClassInfo[], name: string): ClassInfo {
  const found = classes.find((info) => info.name === name);
  if (!found) {
    throw new Error(`class ${name} not captured`);
  }
  return found;
}

function members(info: ClassInfo): [string, string | undefined][] {
  return (info.methods ?? []).map((method) => [method.name, method.modifiers]);
}

describe('class members (real tree-sitter WASM, TASK_2026_2299)', () => {
  let parser: TreeSitterParserService;
  let analysis: AstAnalysisService;

  async function analyze(
    source: string,
    language: SupportedLanguage,
  ): Promise<CodeInsights> {
    const result = await analysis.analyzeSource(source, language, 'file');
    if (result.isErr() || !result.value) {
      throw result.error ?? new Error('analyzeSource returned no insights');
    }
    return result.value;
  }

  beforeAll(() => {
    parser = new TreeSitterParserService(silentLogger());
    analysis = new AstAnalysisService(silentLogger(), parser);
  });

  afterAll(() => {
    parser?.dispose();
  });

  describe.each(['typescript', 'tsx'] as const)('%s', (language) => {
    let insights: CodeInsights;

    beforeAll(async () => {
      insights = await analyze(TS_SOURCE, language);
    }, 60_000);

    it('parses cleanly', () => {
      expect(insights.parseStatus).toBe('ok');
    });

    it('lists each class method under its class with modifiers in source order', () => {
      expect(members(byName(insights.classes, 'Store'))).toEqual([
        ['constructor', undefined],
        ['load', 'public'],
        ['create', 'protected static'],
        ['size', 'get'],
        ['size', 'set'],
        ['fetch', 'async'],
        ['stream', 'static async'],
        ['#secret', 'private'],
        ['render', 'private override'],
      ]);
    });

    it('keeps the method line range and parameters', () => {
      const load = byName(insights.classes, 'Store').methods?.find(
        (method) => method.name === 'load',
      );
      expect(load).toEqual({
        name: 'load',
        parameters: ['key'],
        startLine: 3,
        endLine: 3,
        modifiers: 'public',
      });
    });

    it('attaches a nested class method to the nested class only', () => {
      expect(members(byName(insights.classes, 'Inner'))).toEqual([
        ['run', undefined],
      ]);
    });

    it('captures abstract classes and class expressions with their members', () => {
      expect(members(byName(insights.classes, 'Shape'))).toEqual([
        ['describe', undefined],
      ]);
      expect(members(byName(insights.classes, 'Factory'))).toEqual([
        ['build', undefined],
      ]);
    });

    it('keeps object-literal and anonymous-class methods out of every class', () => {
      const attached = insights.classes.flatMap((info) =>
        (info.methods ?? []).map((method) => method.name),
      );
      for (const name of ['read', 'inner', 'format', 'hidden']) {
        expect(attached).not.toContain(name);
        expect(insights.functions.map((fn) => fn.name)).toContain(name);
      }
    });
  });

  it('javascript: #private methods are private, nested literal methods stay out', async () => {
    const insights = await analyze(JS_SOURCE, 'javascript');
    expect(members(byName(insights.classes, 'Counter'))).toEqual([
      ['#bump', 'private'],
      ['value', 'get'],
      ['reset', undefined],
    ]);
  }, 60_000);
});
