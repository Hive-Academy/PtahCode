import 'reflect-metadata';
import type { Logger } from '@ptah-extension/vscode-core';
import type {
  ICodeSymbolReader,
  CodeSymbolHit,
} from '@ptah-extension/memory-contracts';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import { CodeSymbolPromptInjector } from './code-symbol-prompt-injector';

function makeLogger(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

function makeWorkspace(injectionEnabled = true): IWorkspaceProvider {
  return {
    getConfiguration: jest.fn().mockReturnValue(injectionEnabled),
  } as unknown as IWorkspaceProvider;
}

function makeHit(over: Partial<CodeSymbolHit> = {}): CodeSymbolHit {
  return {
    id: '01',
    workspaceRoot: '/ws',
    filePath: '/ws/src/auth.ts',
    kind: 'function',
    symbolName: 'login',
    subject: 'code:/ws/src/auth.ts#login',
    text: 'function login() { return validateToken(); }',
    tokenCount: 9,
    score: 0.04,
    ...over,
  };
}

function makeReader(
  page: { hits: CodeSymbolHit[]; bm25Only: boolean } = {
    hits: [makeHit()],
    bm25Only: false,
  },
): ICodeSymbolReader {
  return {
    searchSymbols: jest.fn().mockResolvedValue(page),
  };
}

const QUERY = 'where do we validate the auth token';

describe('CodeSymbolPromptInjector.buildBlock', () => {
  it('shares concurrent lookup and invalidates after a write revision', async () => {
    let revision = 0;
    const reader: ICodeSymbolReader = {
      getRevision: () => revision,
      searchSymbols: jest.fn().mockResolvedValue({ hits: [makeHit()], bm25Only: false }),
    };
    const injector = new CodeSymbolPromptInjector(makeLogger(), makeWorkspace(), reader);
    const first = injector.buildBlock(QUERY, '/ws');
    const second = injector.buildBlock(QUERY, '/ws');
    expect(await first).toBe(await second);
    expect(reader.searchSymbols).toHaveBeenCalledTimes(1);
    revision++;
    await injector.buildBlock(QUERY, '/ws');
    expect(reader.searchSymbols).toHaveBeenCalledTimes(2);
  });
  it('returns "" when no reader is registered', async () => {
    const injector = new CodeSymbolPromptInjector(
      makeLogger(),
      makeWorkspace(),
      null,
    );
    expect(await injector.buildBlock(QUERY, '/ws')).toBe('');
  });

  it('returns "" when the query is shorter than the minimum length', async () => {
    const reader = makeReader();
    const injector = new CodeSymbolPromptInjector(
      makeLogger(),
      makeWorkspace(),
      reader,
    );
    expect(await injector.buildBlock('hi', '/ws')).toBe('');
    expect(reader.searchSymbols).not.toHaveBeenCalled();
  });

  it('returns "" when injection is disabled via setting', async () => {
    const reader = makeReader();
    const injector = new CodeSymbolPromptInjector(
      makeLogger(),
      makeWorkspace(false),
      reader,
    );
    expect(await injector.buildBlock(QUERY, '/ws')).toBe('');
    expect(reader.searchSymbols).not.toHaveBeenCalled();
  });

  it('returns "" when there are no hits', async () => {
    const reader = makeReader({ hits: [], bm25Only: false });
    const injector = new CodeSymbolPromptInjector(
      makeLogger(),
      makeWorkspace(),
      reader,
    );
    expect(await injector.buildBlock(QUERY, '/ws')).toBe('');
  });

  it('returns "" and does not throw when the reader rejects', async () => {
    const reader: ICodeSymbolReader = {
      searchSymbols: jest.fn().mockRejectedValue(new Error('db gone')),
    };
    const logger = makeLogger();
    const injector = new CodeSymbolPromptInjector(
      logger,
      makeWorkspace(),
      reader,
    );
    expect(await injector.buildBlock(QUERY, '/ws')).toBe('');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('formats a symbols block and forwards the workspace root', async () => {
    const reader = makeReader();
    const injector = new CodeSymbolPromptInjector(
      makeLogger(),
      makeWorkspace(),
      reader,
    );
    const block = await injector.buildBlock(QUERY, '/ws');
    expect(block).toContain('## Relevant Workspace Symbols');
    expect(block).toContain('`login`');
    expect(block).toContain('/ws/src/auth.ts');
    expect(reader.searchSymbols).toHaveBeenCalledWith(
      QUERY,
      expect.any(Number),
      '/ws',
    );
  });
});

/**
 * Size guard on the symbol block (TASK_2026_2323). The block is sent with the
 * system prompt of every turn that has a query; the hit count and the snippet
 * cap are what keep it bounded. The input is the worst realistic case: the
 * index returns every hit it is asked for, each with a long path, a long name
 * and a long first line. Raise the budget only with a measured reason.
 */
describe('CodeSymbolPromptInjector.buildBlock size budget', () => {
  // Measured 3,618 chars on main (TASK_2026_2323), plus five percent.
  const BLOCK_CHAR_BUDGET = 3_799;

  it('stays within the measured budget for the worst realistic hits', async () => {
    const reader: ICodeSymbolReader = {
      searchSymbols: jest.fn((_query: string, limit: number) =>
        Promise.resolve({
          hits: Array.from({ length: limit }, (_, i) =>
            makeHit({
              id: String(i),
              filePath: `/home/user/projects/app/libs/backend/feature-${i}/src/lib/services/${'x'.repeat(40)}.service.ts`,
              symbolName: `handle${'Y'.repeat(50)}${i}`,
              text: `export async function handle(${'arg: string, '.repeat(40)}): Promise<void> {}`,
            }),
          ),
          bm25Only: false,
        }),
      ),
    };
    const injector = new CodeSymbolPromptInjector(makeLogger(), makeWorkspace(), reader);

    const block = await injector.buildBlock(QUERY, '/home/user/projects/app');

    expect(block.length).toBeLessThanOrEqual(BLOCK_CHAR_BUDGET);
  });
});
