/**
 * ESM/CJS module-flavour extensions — real-grammar integration test
 * (TASK_2026_2322).
 *
 * `.mjs/.cjs` parse with the shipped JavaScript grammar and `.mts/.cts` with
 * the TypeScript grammar. The language is resolved the way the code-symbol
 * indexer resolves it, from `EXTENSION_LANGUAGE_MAP` by extension, so a
 * suffix missing from the map, or a source the grammar rejects, fails here.
 *
 * Fails before TASK_2026_2322: the map had no entry for these suffixes, so
 * `languageOf` returned undefined and nothing was parsed.
 *
 * The shims are the ones `csharp-grammar.integration.spec.ts` documents:
 * `./wasm-bundle-dir` reads `import.meta.url` (Jest's CJS runtime cannot parse
 * it), and `Language.load(path)` uses a dynamic import Jest's VM rejects, so
 * the file is read here and handed over as bytes.
 */

import 'reflect-metadata';
import * as path from 'path';
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
import type { CodeInsights } from './ast-analysis.interfaces';
import {
  EXTENSION_LANGUAGE_MAP,
  type SupportedLanguage,
} from './tree-sitter.config';
import { classifyFileForCoverage } from './language-registry';

// Relative imports only: validate-deps scans spec text for bare specifiers.
const MJS_SOURCE = `import { helper } from './helper.mjs';

export function run(input) {
  return helper(input);
}

export class Runner {
  start() {
    return run(1);
  }
}

export const stop = () => undefined;
`;

const CJS_SOURCE = `'use strict';
const { helper } = require('./helper.cjs');

function run(input) {
  return helper(input);
}

class Runner {
  start() {
    return run(1);
  }
}

module.exports = { run, Runner };
`;

const MTS_SOURCE = `import type { Options } from './options.mjs';

export interface RunOptions extends Options {
  readonly retries: number;
}

export function run(options: RunOptions): number {
  return options.retries;
}

export class Runner<T> {
  start(value: T): T {
    return value;
  }
}
`;

const CTS_SOURCE = `import helper = require('./helper.cjs');

interface RunOptions {
  readonly retries: number;
}

function run(options: RunOptions): number {
  return helper(options.retries);
}

class Runner {
  start(): number {
    return run({ retries: 1 });
  }
}

export = { run, Runner };
`;

function silentLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as Logger;
}

/** The indexer's lookup: the last extension, lower-cased, through the map. */
function languageOf(filePath: string): SupportedLanguage | undefined {
  const extension = path.extname(filePath).toLowerCase();
  return Object.hasOwn(EXTENSION_LANGUAGE_MAP, extension)
    ? EXTENSION_LANGUAGE_MAP[extension]
    : undefined;
}

describe('module-flavour grammar integration (real tree-sitter WASM)', () => {
  let parser: TreeSitterParserService;
  let analysis: AstAnalysisService;

  beforeAll(() => {
    parser = new TreeSitterParserService(silentLogger());
    analysis = new AstAnalysisService(silentLogger(), parser);
  });

  afterAll(() => {
    parser?.dispose();
  });

  async function analyse(
    filePath: string,
    source: string,
  ): Promise<CodeInsights> {
    const language = languageOf(filePath);
    if (language === undefined) {
      throw new Error(`no grammar for ${filePath}`);
    }
    const result = await analysis.analyzeSource(source, language, filePath);
    if (result.isErr() || !result.value) {
      throw result.error ?? new Error(`analyzeSource failed for ${filePath}`);
    }
    return result.value;
  }

  it.each([
    ['src/runner.mjs', MJS_SOURCE, 'javascript'],
    ['src/runner.cjs', CJS_SOURCE, 'javascript'],
    ['src/runner.mts', MTS_SOURCE, 'typescript'],
    ['src/runner.cts', CTS_SOURCE, 'typescript'],
  ] as const)(
    'parses %s cleanly as %s and captures its functions and classes',
    async (filePath, source, language) => {
      expect(languageOf(filePath)).toBe(language);
      expect(classifyFileForCoverage(filePath, 'codeIndex')).toBe('eligible');

      const insights = await analyse(filePath, source);
      expect(insights.parseStatus).toBe('ok');
      expect(insights.errorNodeCount).toBe(0);
      expect(insights.functions.map((f) => f.name)).toEqual(
        expect.arrayContaining(['run', 'start']),
      );
      expect(insights.classes.map((c) => c.name)).toContain('Runner');
    },
    60_000,
  );

  it('reads ESM imports and exports of an .mjs file', async () => {
    const insights = await analyse('src/runner.mjs', MJS_SOURCE);
    expect(new Set(insights.imports.map((i) => i.source))).toEqual(
      new Set(['./helper.mjs']),
    );
    // Same grammar, same queries: identical to the source read as `.js`.
    const asJs = await analyse('src/runner.js', MJS_SOURCE);
    expect(insights.imports).toEqual(asJs.imports);
    expect(insights.exports).toEqual(asJs.exports);
    const exported = new Map(
      (insights.exports ?? []).map((e) => [e.name, e.kind] as const),
    );
    expect(exported.get('run')).toBe('function');
    expect(exported.get('Runner')).toBe('class');
    expect(exported.get('stop')).toBe('variable');
  }, 60_000);

  it('reads TypeScript-only exports of an .mts file', async () => {
    const insights = await analyse('src/runner.mts', MTS_SOURCE);
    const exported = new Map(
      (insights.exports ?? []).map((e) => [e.name, e.kind] as const),
    );
    expect(exported.get('RunOptions')).toBe('interface');
    expect(exported.get('Runner')).toBe('class');
  }, 60_000);

  it('parses a .d.cts declaration file with the TypeScript grammar', async () => {
    const insights = await analyse(
      'types/runner.d.cts',
      'declare function run(retries: number): number;\nexport = run;\n',
    );
    expect(insights.parseStatus).toBe('ok');
  }, 60_000);
});
