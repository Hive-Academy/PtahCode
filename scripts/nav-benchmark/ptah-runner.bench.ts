/**
 * In-process ptah runner of the offline navigation benchmark (TASK_2026_2299_d6f5).
 *
 * Reads `NAV_BENCH_STEPS_IN` (JSON `[{key, tool, args}]`), wires the REAL
 * services the desktop app wires (tree-sitter, file system, SQLite code-symbol
 * index, dependency graph, `ElectronIDECapabilities`), sends every step through
 * `handleMCPRequest` exactly as the HTTP MCP server does, and writes
 * `[{key, output, status, error?}]` to `NAV_BENCH_OUT`. No tool logic is mocked.
 * Namespaces the runner does not wire answer with the OFFLINE_MARKER error;
 * such a step is reported as `unavailable-offline`, not as a result.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { container } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import {
  PLATFORM_TOKENS,
  type IFileSystemProvider,
  type IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import { registerPlatformCliServices } from '@ptah-extension/platform-cli';
import {
  ElectronEditorProvider,
  ElectronFileSystemProvider,
  ElectronWorkspaceProvider,
} from '@ptah-extension/platform-electron';
import {
  CODE_SYMBOL_INDEXER,
  recognisedSourceExtensions,
  registerWorkspaceIntelligenceServices,
  type AstAnalysisService,
  type CodeSymbolIndexer,
  type ContextEnrichmentService,
  type ContextOrchestrationService,
  type ContextSizeOptimizerService,
  type DependencyAnalyzerService,
  type DependencyGraphService,
  type FileRelevanceScorerService,
  type IgnorePatternResolverService,
  type MonorepoDetectorService,
  type ProjectDetectorService,
  type TokenCounterService,
  type TreeSitterParserService,
  type WorkspaceAnalyzerService,
  type WorkspaceIndexerService,
} from '@ptah-extension/workspace-intelligence';
import {
  SqliteConnectionService,
  VecStatusService,
  type IEmbedder,
} from '@ptah-extension/persistence-sqlite';
import { CodeSymbolStore } from '@ptah-extension/memory-curator';
import { MEMORY_CONTRACT_TOKENS } from '@ptah-extension/memory-contracts';
// Deep imports: these are not in their barrels. A scripts file may import the
// Electron app's IDE capabilities; a lib spec could not (module boundaries).
import { MemoryStoreSymbolSink } from '../../libs/backend/memory-curator/src/lib/symbol-sink.adapter';
import { ElectronIDECapabilities } from '../../apps/ptah-electron/src/services/electron-ide-capabilities';
import {
  buildAstNamespace,
  buildContextNamespace,
  buildDependencyNamespace,
  buildFilesNamespace,
  buildIDENamespace,
  buildProjectNamespace,
  buildRelevanceNamespace,
  buildSearchNamespace,
  buildWorkspaceNamespace,
} from '../../libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders';
import { buildCodeNamespace } from '../../libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/code-namespace.builder';
import {
  handleMCPRequest,
  type ProtocolHandlerDependencies,
} from '../../libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher';
import { TreeSitterCodeOutliner } from '../../libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/code-outliner.adapter';
import type {
  MCPRequest,
  MCPResponse,
} from '../../libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/types/mcp-protocol.types';
import type { PtahAPI } from '../../libs/backend/vscode-lm-tools/src/lib/code-execution/types';
import type { PermissionPromptService } from '../../libs/backend/vscode-lm-tools/src/lib/permission/permission-prompt.service';

// Same shim as ast-analyze-result.spec.ts: under Jest's VM, web-tree-sitter's
// path-based Language.load cannot read the file, so hand it the bytes.
jest.mock('web-tree-sitter', () => {
  const actual =
    jest.requireActual<typeof import('web-tree-sitter')>('web-tree-sitter');
  const nodeFs = jest.requireActual<typeof import('fs')>('fs');
  const loadFromPathOrBuffer = actual.Language.load.bind(actual.Language);
  actual.Language.load = (input: string | Uint8Array) =>
    loadFromPathOrBuffer(
      typeof input === 'string'
        ? new Uint8Array(nodeFs.readFileSync(input))
        : input,
    );
  return actual;
});

type StepStatus = 'ok' | 'unavailable' | 'unavailable-offline' | 'error';

interface StepIn {
  readonly key: string;
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

interface StepOut {
  readonly key: string;
  readonly output: string;
  readonly status: StepStatus;
  readonly error?: string;
}

/** Dirs the benchmark tasks target (scripts/nav-benchmark/tasks.ts). */
const DEFAULT_INDEX_DIRS = [
  'libs/backend/cli-agent-runtime',
  'libs/backend/agent-sdk',
  'libs/backend/rpc-handlers',
  'libs/backend/platform-core',
  'libs/backend/memory-curator',
  'libs/shared',
  'libs/frontend/chat',
  'libs/frontend/chat-state',
  'libs/frontend/command-center',
];

/** Marker of a namespace this runner does not wire. */
const OFFLINE_MARKER = '[nav-bench] namespace not wired offline:';

const ROOT = path.resolve(__dirname, '..', '..');

function readSteps(): StepIn[] {
  const file = process.env['NAV_BENCH_STEPS_IN'];
  if (!file) throw new Error('NAV_BENCH_STEPS_IN is not set');
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('steps-in must be a JSON array');
  return parsed.map((raw: unknown, i) => {
    const s = raw as Partial<StepIn> | null;
    if (
      !s ||
      typeof s.key !== 'string' ||
      typeof s.tool !== 'string' ||
      typeof s.args !== 'object' ||
      s.args === null
    ) {
      throw new Error(`steps-in[${i}] needs {key, tool, args}`);
    }
    return { key: s.key, tool: s.tool, args: s.args };
  });
}

/** Warnings and errors go to stderr so a failed wiring is visible; the rest is dropped. */
function benchLogger(): Logger {
  const noop = (): void => undefined;
  const log = {
    debug: noop,
    info: noop,
    trace: noop,
    warn: (message: string): void => {
      process.stderr.write(`[warn] ${message}\n`);
    },
    error: (message: string, err?: unknown): void => {
      const detail = err instanceof Error ? `: ${err.message}` : '';
      process.stderr.write(`[error] ${message}${detail}\n`);
    },
    logWithContext: noop,
    show: noop,
    dispose: noop,
  };
  return log as unknown as Logger;
}

/** No vectors: every text gets a 0-length vector, which the store skips (BM25 only). */
const noVectorEmbedder: IEmbedder = {
  dim: 384,
  modelId: 'nav-bench/no-vectors',
  embed: async (texts) => texts.map(() => new Float32Array(0)),
  dispose: async () => undefined,
};

function sourceFilesUnder(dirs: readonly string[]): string[] {
  const exts = new Set(recognisedSourceExtensions());
  const skip = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.has(path.extname(entry.name))) out.push(full);
    }
  };
  for (const dir of dirs) {
    const abs = path.resolve(ROOT, dir);
    if (fs.existsSync(abs)) walk(abs);
  }
  return out;
}

/** Every namespace this runner does not wire throws a marked error when called. */
function withOfflineNamespaces(wired: Partial<PtahAPI>): PtahAPI {
  const offline = (ns: string): unknown =>
    new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === 'then' || typeof prop === 'symbol'
            ? undefined
            : () => {
                throw new Error(`${OFFLINE_MARKER} ${ns}.${String(prop)}`);
              },
      },
    );
  return new Proxy(wired, {
    get: (target, prop) => {
      if (typeof prop === 'symbol' || prop in target) {
        return Reflect.get(target, prop);
      }
      return offline(prop);
    },
  }) as unknown as PtahAPI;
}

interface Bench {
  readonly deps: ProtocolHandlerDependencies;
  readonly close: () => void;
  readonly indexInfo: string;
}

async function buildBench(): Promise<Bench> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-bench-'));
  const logger = benchLogger();
  const c = container.createChildContainer();

  registerPlatformCliServices(c, {
    appPath: ROOT,
    workspacePath: ROOT,
    userDataPath: tmp,
  });
  // The desktop host's own providers replace the CLI ones (registration.ts of
  // platform-electron); none of them imports `electron`.
  const fsProvider = new ElectronFileSystemProvider({
    getLogger: () => logger,
  });
  const workspaceProvider = new ElectronWorkspaceProvider(tmp, [ROOT]);
  const editorProvider = new ElectronEditorProvider();
  c.register(PLATFORM_TOKENS.FILE_SYSTEM_PROVIDER, { useValue: fsProvider });
  c.register(PLATFORM_TOKENS.WORKSPACE_PROVIDER, {
    useValue: workspaceProvider,
  });
  c.register(PLATFORM_TOKENS.EDITOR_PROVIDER, { useValue: editorProvider });
  c.register(TOKENS.LOGGER, { useValue: logger });
  // Same FILE_SYSTEM_MANAGER shim as libs/backend/cli-engine/src/lib/container.ts.
  c.register(TOKENS.FILE_SYSTEM_MANAGER, { useValue: fsProvider });

  const connection = new SqliteConnectionService(
    path.join(tmp, 'nav-bench.sqlite'),
    logger,
  );
  await connection.openAndMigrate();
  const vecStatus = new VecStatusService(logger, connection);
  const store = new CodeSymbolStore(
    logger,
    connection,
    noVectorEmbedder,
    vecStatus,
  );
  c.register(MEMORY_CONTRACT_TOKENS.SYMBOL_SINK, {
    useValue: new MemoryStoreSymbolSink(store),
  });
  // Error reporting is not part of navigation: any method is a no-op.
  // Same for the settings/context/output managers that only the context
  // (not the navigation) services read.
  for (const token of [
    TOKENS.SENTRY_SERVICE,
    TOKENS.CONFIG_MANAGER,
    TOKENS.WORKSPACE_CONTEXT_MANAGER,
    TOKENS.OUTPUT_MANAGER,
  ]) {
    c.register(token, {
      useValue: new Proxy({}, { get: () => () => undefined }),
    });
  }
  registerWorkspaceIntelligenceServices(c, logger);

  const r = <T>(token: symbol): T => c.resolve<T>(token);
  /**
   * Services that only the context/analysis tools need and whose own graph
   * reaches host-only parts (file watchers, ...). A service that cannot be
   * built here answers every call with the offline marker, never with data.
   */
  const soft = <T extends object>(token: symbol, name: string): T => {
    try {
      return c.resolve<T>(token);
    } catch {
      return new Proxy({} as T, {
        get: (_t, prop) => () => {
          throw new Error(`${OFFLINE_MARKER} ${name}.${String(prop)}`);
        },
      });
    }
  };
  const treeSitterParser = r<TreeSitterParserService>(
    TOKENS.TREE_SITTER_PARSER_SERVICE,
  );
  const astAnalysis = r<AstAnalysisService>(TOKENS.AST_ANALYSIS_SERVICE);
  const dependencyGraph = r<DependencyGraphService>(
    TOKENS.DEPENDENCY_GRAPH_SERVICE,
  );
  const workspaceAnalyzer = soft<WorkspaceAnalyzerService>(
    TOKENS.WORKSPACE_ANALYZER_SERVICE,
    'WorkspaceAnalyzerService',
  );
  const symbolIndexer = r<CodeSymbolIndexer>(CODE_SYMBOL_INDEXER);
  const ws: IWorkspaceProvider = workspaceProvider;
  const fsp: IFileSystemProvider = fsProvider;

  const coreDeps = {
    workspaceAnalyzer,
    contextOrchestration: soft<ContextOrchestrationService>(
      TOKENS.CONTEXT_ORCHESTRATION_SERVICE,
      'ContextOrchestrationService',
    ),
    workspaceProvider: ws,
    fileSystemProvider: fsp,
  };
  const analysisDeps = {
    contextOptimizer: soft<ContextSizeOptimizerService>(
      TOKENS.CONTEXT_SIZE_OPTIMIZER,
      'ContextSizeOptimizerService',
    ),
    monorepoDetector: soft<MonorepoDetectorService>(
      TOKENS.MONOREPO_DETECTOR_SERVICE,
      'MonorepoDetectorService',
    ),
    dependencyAnalyzer: soft<DependencyAnalyzerService>(
      TOKENS.DEPENDENCY_ANALYZER_SERVICE,
      'DependencyAnalyzerService',
    ),
    relevanceScorer: r<FileRelevanceScorerService>(
      TOKENS.FILE_RELEVANCE_SCORER,
    ),
    tokenCounter: r<TokenCounterService>(TOKENS.TOKEN_COUNTER_SERVICE),
    workspaceIndexer: r<WorkspaceIndexerService>(
      TOKENS.WORKSPACE_INDEXER_SERVICE,
    ),
    projectDetector: soft<ProjectDetectorService>(
      TOKENS.PROJECT_DETECTOR_SERVICE,
      'ProjectDetectorService',
    ),
    workspaceAnalyzer,
    contextEnrichment: r<ContextEnrichmentService>(
      TOKENS.CONTEXT_ENRICHMENT_SERVICE,
    ),
    dependencyGraph,
    workspaceProvider: ws,
    fileSystemProvider: fsp,
    logger,
  };
  const ideCapabilities = new ElectronIDECapabilities(
    store,
    fsp,
    r<IgnorePatternResolverService>(TOKENS.IGNORE_PATTERN_RESOLVER_SERVICE),
    ws,
    editorProvider,
    dependencyGraph,
    astAnalysis,
    treeSitterParser,
    logger,
  );
  const code = buildCodeNamespace({
    getCodeSymbolSearch: () => store,
    // The memory store is not part of navigation; code search uses the
    // dedicated symbol reader above.
    getMemorySearch: () => undefined,
    getSymbolIndexer: () => symbolIndexer,
    getWorkspaceRoot: () => ROOT,
    getHostWorkspaceRoots: () => [ROOT],
    logger,
  });
  const dependencies = buildDependencyNamespace(analysisDeps);
  const ptahAPI = withOfflineNamespaces({
    workspace: buildWorkspaceNamespace(coreDeps),
    search: buildSearchNamespace(coreDeps),
    files: buildFilesNamespace({
      // The CLI host's shim: FileSystemManager delegates to the fs provider.
      fileSystemManager: fsProvider as unknown as Parameters<
        typeof buildFilesNamespace
      >[0]['fileSystemManager'],
      workspaceProvider: ws,
      fileSystemProvider: fsp,
    }),
    context: buildContextNamespace(analysisDeps),
    project: buildProjectNamespace(analysisDeps),
    relevance: buildRelevanceNamespace(analysisDeps),
    dependencies,
    ast: buildAstNamespace({
      treeSitterParser,
      astAnalysis,
      fileSystemProvider: fsp,
      workspaceProvider: ws,
    }),
    ide: buildIDENamespace(ideCapabilities),
    code,
  });

  // Index first, then build the graph, as a warmed-up desktop session has.
  const dirsEnv = process.env['NAV_BENCH_INDEX_DIRS'];
  const dirs = dirsEnv
    ? dirsEnv
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)
    : DEFAULT_INDEX_DIRS;
  const full = dirs.length === 1 && path.resolve(ROOT, dirs[0]) === ROOT;
  const started = Date.now();
  let files: string[];
  if (full) {
    await symbolIndexer.indexWorkspace(ROOT, { userInitiated: true });
    files = (await dependencies.discoverSourceFiles(ROOT)).files;
  } else {
    files = sourceFilesUnder(dirs);
    for (const file of files) await symbolIndexer.reindexFile(file, ROOT);
  }
  const indexMs = Date.now() - started;
  const graph = await dependencies.buildGraph(files, ROOT, files.length);
  const indexInfo =
    `index: ${full ? 'full workspace' : dirs.join(',')}; ` +
    `${files.length} files, ${store.count(ROOT)} symbols in ${indexMs} ms; ` +
    `graph: ${JSON.stringify(graph).slice(0, 200)}`;

  const deps: ProtocolHandlerDependencies = {
    ptahAPI,
    // Electron auto-allows approval prompts; no navigation tool asks.
    permissionPromptService: {} as unknown as PermissionPromptService,
    logger,
    hasIDECapabilities: true,
    hasSqliteLayer: true,
    codeOutliner: new TreeSitterCodeOutliner(treeSitterParser),
    workspaceProvider: ws,
  };
  return { deps, close: () => connection.close(), indexInfo };
}

function textOf(result: unknown): { text: string; isError: boolean } {
  const r = result as {
    content?: ReadonlyArray<{ type?: string; text?: string }>;
    isError?: boolean;
  } | null;
  const text = (r?.content ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n');
  return { text, isError: r?.isError === true };
}

async function runStep(
  bench: Bench,
  served: ReadonlySet<string>,
  step: StepIn,
  id: number,
): Promise<StepOut> {
  if (!served.has(step.tool)) {
    return {
      key: step.key,
      output: '',
      status: 'unavailable',
      error: `tool not in tools/list: ${step.tool}`,
    };
  }
  const request: MCPRequest = {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: step.tool, arguments: { ...step.args } },
    // The offline host has no workspace service; the navigation tools take
    // the caller's workspace root, as a lane in this checkout would send it.
    _callerWorkspaceRoot: process.cwd(),
  };
  const response: MCPResponse = await handleMCPRequest(request, bench.deps);
  if (response.error) {
    const message = response.error.message;
    return {
      key: step.key,
      output: '',
      status: /Unknown tool/i.test(message) ? 'unavailable' : 'error',
      error: message,
    };
  }
  const { text, isError } = textOf(response.result);
  if (!isError) return { key: step.key, output: text, status: 'ok' };
  if (text.includes(OFFLINE_MARKER)) {
    return {
      key: step.key,
      output: '',
      status: 'unavailable-offline',
      error: text,
    };
  }
  return {
    key: step.key,
    output: text,
    status: /Unknown tool/i.test(text) ? 'unavailable' : 'error',
    error: text,
  };
}

describe('nav-benchmark ptah runner', () => {
  it('runs every step through the real MCP dispatcher', async () => {
    const outFile = process.env['NAV_BENCH_OUT'];
    if (!outFile) throw new Error('NAV_BENCH_OUT is not set');
    const steps = readSteps();
    const bench = await buildBench();
    try {
      process.stderr.write(`[nav-bench] ${bench.indexInfo}\n`);
      const list = await handleMCPRequest(
        { jsonrpc: '2.0', id: 0, method: 'tools/list' },
        bench.deps,
      );
      const tools =
        (list.result as { tools?: ReadonlyArray<{ name: string }> } | undefined)
          ?.tools ?? [];
      const served = new Set(tools.map((t) => t.name));
      const results: StepOut[] = [];
      for (const [i, step] of steps.entries()) {
        results.push(await runStep(bench, served, step, i + 1));
      }
      fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
      fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
      expect(results).toHaveLength(steps.length);
    } finally {
      bench.close();
    }
  });
});
