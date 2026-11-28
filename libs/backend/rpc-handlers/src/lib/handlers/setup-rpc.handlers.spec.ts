/**
 * SetupRpcHandlers — unit specs.
 *
 * Surface under test: setup RPC methods covering status, deep analysis,
 * cancellation, and saved analyses (list/load).
 *
 * Behavioural contracts locked in here:
 *   - Registration: `register()` wires every method into the mock RpcHandler.
 *   - Workspace gating: status and deep analysis require an open workspace.
 *   - DI container dispatch: `resolveService()` routes through
 *     `container.resolve()`; specs drive each method by mocking only the
 *     services the method actually calls.
 *   - `wizard:cancel-analysis` is best-effort — it returns
 *     `{ cancelled: true }` as soon as any service cancels, and
 *     `{ cancelled: false }` only when every service throws.
 *
 * Mocking posture: direct constructor injection, narrow
 * `jest.Mocked<Pick<T, ...>>` surfaces for the DI container and
 * ConfigManager helpers. No `as any` casts.
 *
 * Source-under-test:
 *   `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`
 */

import 'reflect-metadata';

// ---------------------------------------------------------------------------
// Jest transitive-import guard.
//
// The SUT imports from `@ptah-extension/agent-generation`, whose types
// barrel re-exports from `@ptah-extension/workspace-intelligence`. The
// workspace-intelligence `src/index.ts` barrel eagerly re-exports
// `TreeSitterParserService`, whose module top-level evaluates
// `path.dirname(fileURLToPath(import.meta.url))` — a construct Jest's
// ts-jest CJS transform cannot parse ("SyntaxError: Cannot use
// 'import.meta' outside a module").
//
// We short-circuit the parser module *before* the SUT is imported so the
// module graph never reaches the import.meta statement. Nothing in this
// spec exercises the parser service — it's pulled in only because it
// lives in the same barrel as the enums agent-generation actually uses.
// ---------------------------------------------------------------------------
// Intercept the only memory-curator symbol the SUT imports. Mocking the
// whole module (rather than `requireActual`-ing it) keeps the heavy SQLite /
// embedder dependencies of memory-curator's barrel out of the Jest module
// graph. The SUT only consumes `deriveWorkspaceFingerprint`.
jest.mock('@ptah-extension/memory-curator', () => ({
  deriveWorkspaceFingerprint: jest.fn(),
}));

jest.mock('@ptah-extension/workspace-intelligence', () => ({
  // Enums consumed by agent-generation's analysis-schema.ts — must match
  // the real string-valued enum shape so Zod native-enum schemas stay
  // structurally identical at test time.
  ProjectType: {
    Node: 'node',
    React: 'react',
    Vue: 'vue',
    Angular: 'angular',
    NextJS: 'nextjs',
    Python: 'python',
    Java: 'java',
    Rust: 'rust',
    Go: 'go',
    DotNet: 'dotnet',
    PHP: 'php',
    Ruby: 'ruby',
    General: 'general',
    Unknown: 'unknown',
  },
  Framework: {
    React: 'react',
    Vue: 'vue',
    Angular: 'angular',
    NextJS: 'nextjs',
    Nuxt: 'nuxt',
    Express: 'express',
    Django: 'django',
    Laravel: 'laravel',
    Rails: 'rails',
    Svelte: 'svelte',
    Astro: 'astro',
    NestJS: 'nestjs',
    Fastify: 'fastify',
    Flask: 'flask',
    FastAPI: 'fastapi',
    Spring: 'spring',
  },
  MonorepoType: {
    Nx: 'nx',
    Lerna: 'lerna',
    Rush: 'rush',
    Turborepo: 'turborepo',
    PnpmWorkspaces: 'pnpm-workspaces',
    YarnWorkspaces: 'yarn-workspaces',
  },
  FileType: {
    Source: 'source',
    Test: 'test',
    Config: 'config',
    Documentation: 'docs',
    Asset: 'asset',
  },
  // Service classes — agent-generation's DI register pulls the constructors,
  // but our spec never resolves them, so empty stub classes suffice.
  TreeSitterParserService: class TreeSitterParserServiceStub {},
  AstAnalysisService: class AstAnalysisServiceStub {},
  DependencyGraphService: class DependencyGraphServiceStub {},
  WorkspaceAnalyzerService: class WorkspaceAnalyzerServiceStub {},
  ContextService: class ContextServiceStub {},
  ContextOrchestrationService: class ContextOrchestrationServiceStub {},
  WorkspaceService: class WorkspaceServiceStub {},
  TokenCounterService: class TokenCounterServiceStub {},
  FileSystemService: class FileSystemServiceStub {},
  FileSystemError: class FileSystemErrorStub extends Error {},
  ProjectDetectorService: class ProjectDetectorServiceStub {},
  FrameworkDetectorService: class FrameworkDetectorServiceStub {},
  DependencyAnalyzerService: class DependencyAnalyzerServiceStub {},
  MonorepoDetectorService: class MonorepoDetectorServiceStub {},
  PatternMatcherService: class PatternMatcherServiceStub {},
  IgnorePatternResolverService: class IgnorePatternResolverServiceStub {},
  WorkspaceIndexerService: class WorkspaceIndexerServiceStub {},
  FileTypeClassifierService: class FileTypeClassifierServiceStub {},
  FileRelevanceScorerService: class FileRelevanceScorerServiceStub {},
  ContextSizeOptimizerService: class ContextSizeOptimizerServiceStub {},
  ContextEnrichmentService: class ContextEnrichmentServiceStub {},
}));

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DependencyContainer } from 'tsyringe';
import { RpcUserError } from '@ptah-extension/vscode-core';
import { PtahFileSettingsManager } from '@ptah-extension/platform-core';
import {
  SETTINGS_TOKENS,
  WorkspaceScopeResolver,
} from '@ptah-extension/settings-core';
import type { IGlobalBatchSettingsStore } from '@ptah-extension/settings-core';
import type {
  ModelPair,
  WizardGetSetupModelResult,
  WizardRecommendAnalysisSkillsResult,
  WizardGetSkillReviewResult,
  WizardSetSetupModelResult,
} from '@ptah-extension/shared';
import type {
  Logger,
  RpcHandler,
  SentryService,
} from '@ptah-extension/vscode-core';
import {
  createMockRpcHandler,
  createMockSentryService,
  type MockRpcHandler,
  type MockSentryService,
} from '@ptah-extension/vscode-core/testing';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import {
  createMockWorkspaceProvider,
  type MockWorkspaceProvider,
} from '@ptah-extension/platform-core/testing';
import { SDK_TOKENS } from '@ptah-extension/agent-sdk';
import type {
  PluginLoaderService,
  ResolvedSetupSnapshot,
  SetupResolution,
} from '@ptah-extension/agent-sdk';
import {
  createMockLogger,
  type MockLogger,
} from '@ptah-extension/shared/testing';

import { SetupRpcHandlers } from './setup-rpc.handlers';
import {
  SKILL_DRAFT_GENERATION_SERVICE,
  SKILL_PROJECT_GUIDANCE_SERVICE,
  SKILL_RECOMMENDATION_SERVICE,
} from '../di/tokens';

// ---------------------------------------------------------------------------
// Token re-declaration (via Symbol.for) — avoids transitively loading the
// full `@ptah-extension/agent-generation` barrel, which pulls in
// `workspace-intelligence` → `tree-sitter-parser.service.ts`, whose
// top-level `import.meta.url` can't be parsed under Jest's CJS transform.
//
// These Symbol.for descriptors MUST match
// `libs/backend/agent-generation/src/lib/di/tokens.ts` exactly — the
// global Symbol.for registry guarantees identity, so the handler's
// `container.resolve(TOKEN)` call sees the same symbol the spec
// registers under.
// ---------------------------------------------------------------------------

const AGENT_GENERATION_TOKENS = {
  SETUP_STATUS_SERVICE: Symbol.for('SetupStatusService'),
  SETUP_WIZARD_SERVICE: Symbol.for('SetupWizardService'),
  MULTI_PHASE_ANALYSIS_SERVICE: Symbol.for('MultiPhaseAnalysisService'),
  ANALYSIS_STORAGE_SERVICE: Symbol.for('AnalysisStorageService'),
  ANALYSIS_FRESHNESS_SERVICE: Symbol.for('AnalysisFreshnessService'),
  ANALYSIS_CLAUDE_MD_LINKER: Symbol.for('AnalysisClaudeMdLinker'),
  AGENT_RECOMMENDATION_SERVICE: Symbol.for('AgentRecommendationService'),
  AGENTIC_ANALYSIS_SERVICE: Symbol.for('AgenticAnalysisService'),
  WIZARD_WEBVIEW_LIFECYCLE: Symbol.for('WizardWebviewLifecycleService'),
} as const;

// ---------------------------------------------------------------------------
// Narrow mock surfaces — only what the handler actually touches.
// ---------------------------------------------------------------------------

type MockPluginLoader = jest.Mocked<
  Pick<
    PluginLoaderService,
    | 'getWorkspacePluginConfig'
    | 'resolvePluginPaths'
    | 'saveWorkspacePluginConfig'
  >
>;

function createMockPluginLoader(): MockPluginLoader {
  return {
    getWorkspacePluginConfig: jest.fn().mockReturnValue({
      enabledPluginIds: [],
      disabledSkillIds: [],
    }),
    resolvePluginPaths: jest.fn().mockReturnValue([]),
    saveWorkspacePluginConfig: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Mock DI container that maps tokens to prepared service stubs. The real
 * handler calls `container.resolve(token)` for every agent-generation
 * service; this harness lets each spec seed the subset of services its
 * RPC path touches.
 */
interface MockContainer extends jest.Mocked<
  Pick<DependencyContainer, 'resolve'>
> {
  __register(token: symbol | string, service: unknown): void;
}

function createMockContainer(): MockContainer {
  const services = new Map<symbol | string, unknown>();
  const mock = {
    resolve: jest.fn((token: symbol | string): unknown => {
      if (services.has(token)) {
        return services.get(token);
      }
      throw new Error(
        `MockContainer: no service registered for token ${String(token)}`,
      );
    }),
    __register(token: symbol | string, service: unknown): void {
      services.set(token, service);
    },
  } as unknown as MockContainer;
  return mock;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const WORKSPACE = '/fake/workspace';
const SNAPSHOT: ResolvedSetupSnapshot = {
  providerId: 'anthropic',
  model: 'workspace-sonnet',
  auth: { env: { ANTHROPIC_API_KEY: 'secret-snapshot' } },
};
const INVALID_SETUP = {
  kind: 'invalid',
  source: 'setup',
  provider: 'anthropic',
  model: 'stale',
  cause: 'model-stale',
} satisfies SetupResolution;

function setupResolution(pair: ModelPair | null): SetupResolution {
  return pair
    ? {
        kind: 'set',
        snapshot: { ...SNAPSHOT, providerId: pair.provider, model: pair.model },
      }
    : { kind: 'unset', snapshot: SNAPSHOT };
}

interface Harness {
  handlers: SetupRpcHandlers;
  logger: MockLogger;
  rpcHandler: MockRpcHandler;
  pluginLoader: MockPluginLoader;
  workspace: MockWorkspaceProvider;
  container: MockContainer;
  sentry: MockSentryService;
  resolveSetup: jest.Mock;
}

function makeHarness(opts: { workspaceFolders?: string[] } = {}): Harness {
  const logger = createMockLogger();
  const rpcHandler = createMockRpcHandler();
  const pluginLoader = createMockPluginLoader();
  const workspace = createMockWorkspaceProvider({
    folders: opts.workspaceFolders ?? [WORKSPACE],
  });
  const container = createMockContainer();
  const sentry = createMockSentryService();
  const resolveSetup = jest.fn().mockResolvedValue(setupResolution(null));
  container.__register(SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER, { resolveSetup });

  const handlers = new SetupRpcHandlers(
    logger as unknown as Logger,
    rpcHandler as unknown as RpcHandler,
    pluginLoader as unknown as PluginLoaderService,
    workspace as unknown as IWorkspaceProvider,
    container as unknown as DependencyContainer,
    sentry as unknown as SentryService,
    {
      search: jest.fn(),
      invalidateInstallCaches: jest.fn(),
    } as unknown as ConstructorParameters<typeof SetupRpcHandlers>[6],
  );

  return {
    handlers,
    logger,
    rpcHandler,
    pluginLoader,
    workspace,
    container,
    sentry,
    resolveSetup,
  };
}

async function call<TResult>(
  h: Harness,
  method: string,
  params: unknown = {},
): Promise<TResult> {
  const response = await h.rpcHandler.handleMessage({
    method,
    params: params as Record<string, unknown>,
    correlationId: `corr-${method}`,
  });
  if (!response.success) {
    throw new Error(`RPC ${method} failed: ${response.error}`);
  }
  return response.data as TResult;
}

async function callRaw(
  h: Harness,
  method: string,
  params: unknown = {},
): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
}> {
  return h.rpcHandler.handleMessage({
    method,
    params: params as Record<string, unknown>,
    correlationId: `corr-${method}`,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SetupRpcHandlers', () => {
  it('passes only supplied analysis fields and the host root to guidance', async () => {
    const h = makeHarness();
    const getGuidance = jest
      .fn()
      .mockResolvedValue({ facts: [], ownerDecisionPrompt: '' });
    h.container.__register(SKILL_PROJECT_GUIDANCE_SERVICE, { getGuidance });
    h.handlers.register();
    await call(h, 'wizard:get-project-guidance', {
      analysis: { projectType: 'unknown', frameworks: [] },
      ownerDecision: 'raise',
    });
    expect(getGuidance).toHaveBeenCalledWith(
      { frameworks: [] },
      WORKSPACE,
      'raise',
    );
  });
  it('rejects an invalid project guidance owner decision at the RPC boundary', async () => {
    const h = makeHarness();
    h.handlers.register();
    const response = await callRaw(h, 'wizard:get-project-guidance', {
      analysis: { projectType: 'unknown', frameworks: [] },
      ownerDecision: 'ignore',
    });
    expect(response.success).toBe(false);
  });
  it('does not pass empty code conventions as detected', async () => {
    const h = makeHarness();
    const getGuidance = jest
      .fn()
      .mockResolvedValue({ facts: [], ownerDecisionPrompt: '' });
    h.container.__register(SKILL_PROJECT_GUIDANCE_SERVICE, { getGuidance });
    h.handlers.register();
    await call(h, 'wizard:get-project-guidance', {
      analysis: { projectType: 'unknown', frameworks: [], codeConventions: {} },
    });
    expect(getGuidance.mock.calls[0][0]).toEqual({ frameworks: [] });
  });
  describe('register()', () => {
    it('registers all setup RPC methods', () => {
      const h = makeHarness();
      h.handlers.register();

      expect(h.rpcHandler.getRegisteredMethods().sort()).toEqual(
        [
          'setup-status:get-status',
          'wizard:cancel-analysis',
          'wizard:cancel-skill-install',
          'wizard:deep-analyze',
          'wizard:get-setup-model',
          'wizard:set-setup-model',
          'wizard:generate-skill-draft',
          'wizard:get-project-guidance',
          'wizard:get-resumable-run',
          'wizard:analysis-status',
          'wizard:install-skills-with-consent',
          'wizard:preview-skills-for-consent',
          'wizard:list-analyses',
          'wizard:load-analysis',
          'wizard:recommend-skills',
          'wizard:recommend-analysis-skills',
          'wizard:get-skill-review',
          'wizard:search-skills',
        ].sort(),
      );
    });

    it('exposes wizard:get-resumable-run in the static METHODS manifest', () => {
      expect(SetupRpcHandlers.METHODS).toContain('wizard:get-resumable-run');
      expect(SetupRpcHandlers.METHODS).toContain('wizard:analysis-status');
      expect(SetupRpcHandlers.METHODS).toContain('wizard:get-skill-review');
      expect(SetupRpcHandlers.METHODS).toContain('wizard:cancel-skill-install');
    });
  });

  describe('wizard:analysis-status', () => {
    const missing = {
      state: 'missing' as const,
      reason: 'no-analysis' as const,
      analysisDir: null,
      checkedAt: '2026-10-14T00:00:00.000Z',
      analyzedAt: null,
    };

    it('passes null to the freshness service when no workspace is open', async () => {
      const h = makeHarness({ workspaceFolders: [] });
      const getStatus = jest.fn().mockResolvedValue(missing);
      h.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_FRESHNESS_SERVICE,
        {
          getStatus,
        },
      );
      h.handlers.register();

      expect(await call(h, 'wizard:analysis-status')).toEqual(missing);
      expect(getStatus).toHaveBeenCalledWith(null);
    });

    it('reads the explicitly selected open workspace', async () => {
      const selected = await fs.mkdtemp(
        path.join(os.tmpdir(), 'setup-pinned-'),
      );
      try {
        const h = makeHarness({ workspaceFolders: [WORKSPACE, selected] });
        const getStatus = jest.fn().mockResolvedValue(missing);
        const findLatestResumableRun = jest.fn().mockResolvedValue(null);
        h.container.__register(
          AGENT_GENERATION_TOKENS.ANALYSIS_FRESHNESS_SERVICE,
          {
            getStatus,
          },
        );
        h.container.__register(
          AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
          {
            findLatestResumableRun,
          },
        );
        h.handlers.register();

        await callRaw(h, 'wizard:analysis-status', { workspacePath: selected });
        await callRaw(h, 'wizard:get-resumable-run', {
          workspacePath: selected,
        });
        expect(getStatus).toHaveBeenCalledWith(selected);
        expect(findLatestResumableRun).toHaveBeenCalledWith(selected);
      } finally {
        await fs.rm(selected, { recursive: true, force: true });
      }
    });

    it.each([
      'wizard:analysis-status',
      'wizard:get-resumable-run',
      'wizard:list-analyses',
      'wizard:load-analysis',
    ] as const)('requires an exact open directory on %s', async (method) => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'setup-pinned-'));
      const root = path.join(dir, 'open');
      const outside = path.join(dir, 'outside');
      const link = path.join(root, 'link');
      try {
        await fs.mkdir(path.join(root, 'sub'), { recursive: true });
        await fs.mkdir(path.join(outside, 'sub'), { recursive: true });
        await fs.symlink(path.join(outside, 'sub'), link, 'junction');
        const h = makeHarness({ workspaceFolders: [root] });
        h.handlers.register();
        for (const workspacePath of [
          path.join(root, 'sub'),
          `${root}${path.sep}..${path.sep}outside`,
          link,
          `${link}${path.sep}..`,
        ]) {
          const response = await callRaw(h, method, {
            workspacePath,
            filename: 'analysis',
          });
          expect(response).toMatchObject({
            success: false,
            errorCode: 'UNAUTHORIZED_WORKSPACE',
          });
        }
        expect(
          await callRaw(h, method, {
            workspacePath: '   ',
            filename: 'analysis',
          }),
        ).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });

    it.each(['wizard:analysis-status', 'wizard:get-resumable-run'] as const)(
      'rejects an out-of-workspace path on %s',
      async (method) => {
        const h = makeHarness({ workspaceFolders: [WORKSPACE] });
        h.handlers.register();

        const response = await callRaw(h, method, {
          workspacePath: '/not-open',
        });
        expect(response.success).toBe(false);
        expect(response.errorCode).toBe('UNAUTHORIZED_WORKSPACE');
      },
    );

    it('returns the service result unchanged and does not mutate storage', async () => {
      const h = makeHarness();
      const status = {
        state: 'fresh',
        reason: 'ok',
        analysisDir: '/fake/workspace/.ptah/analysis/acme',
        checkedAt: '2026-10-14T00:00:00.000Z',
        analyzedAt: '2026-10-13T00:00:00.000Z',
      };
      const getStatus = jest.fn().mockResolvedValue(status);
      const writeManifest = jest.fn();
      h.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_FRESHNESS_SERVICE,
        {
          getStatus,
        },
      );
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        writeManifest,
      });
      h.handlers.register();

      expect(await call(h, 'wizard:analysis-status', { ignored: true })).toBe(
        status,
      );
      expect(getStatus).toHaveBeenCalledWith(WORKSPACE);
      expect(writeManifest).not.toHaveBeenCalled();
      expect(h.container.resolve).not.toHaveBeenCalledWith(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
      );
    });

    it('passes excludeRunId and excludeSlug to freshness when an analysis run is active', async () => {
      const h = makeHarness();
      const status = {
        state: 'fresh',
        reason: 'ok',
        analysisDir: '/fake/workspace/.ptah/analysis/prev',
        checkedAt: '2026-10-14T00:00:00.000Z',
        analyzedAt: '2026-10-13T00:00:00.000Z',
      };
      const getStatus = jest.fn().mockResolvedValue(status);
      const getActiveRun = jest.fn().mockReturnValue({
        workspacePath: WORKSPACE,
        runId: 'run-active-1',
        slug: 'active-slug',
        startedAt: '2026-10-14T00:05:00.000Z',
      });
      h.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_FRESHNESS_SERVICE,
        { getStatus },
      );
      h.container.__register(
        AGENT_GENERATION_TOKENS.MULTI_PHASE_ANALYSIS_SERVICE,
        { getActiveRun },
      );
      h.handlers.register();

      expect(await call(h, 'wizard:analysis-status')).toBe(status);
      expect(getActiveRun).toHaveBeenCalledWith(WORKSPACE);
      expect(getStatus).toHaveBeenCalledWith(WORKSPACE, {
        excludeRunId: 'run-active-1',
        excludeSlug: 'active-slug',
      });
    });

    it('rejects non-object params before resolving the service', async () => {
      const h = makeHarness();
      h.handlers.register();

      const response = await callRaw(h, 'wizard:analysis-status', []);
      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('INVALID_PARAMS');
      expect(h.container.resolve).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Zod boundary (TASK_2026_361)
  // -------------------------------------------------------------------------

  describe('Zod parameter validation', () => {
    it('rejects wizard:load-analysis without a filename as INVALID_PARAMS', async () => {
      const h = makeHarness();
      h.handlers.register();

      const response = await callRaw(h, 'wizard:load-analysis', {});
      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('INVALID_PARAMS');
      expect(h.container.resolve).not.toHaveBeenCalled();
    });

    it('rejects wizard:deep-analyze with a non-boolean resume flag as INVALID_PARAMS', async () => {
      const h = makeHarness();
      h.handlers.register();

      const response = await callRaw(h, 'wizard:deep-analyze', {
        resume: 'yes',
      });
      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('INVALID_PARAMS');
    });
  });

  // -------------------------------------------------------------------------
  // wizard:get-resumable-run (TASK_2026_361)
  // -------------------------------------------------------------------------

  describe('wizard:get-resumable-run', () => {
    const V4_MANIFEST = {
      version: 4 as const,
      runId: 'run-analysis-1',
      slug: 'acme',
      analyzedAt: '2026-08-31T00:00:00.000Z',
      updatedAt: '2026-08-31T00:10:00.000Z',
      lifecycle: 'paused' as const,
      model: 'sonnet',
      totalDurationMs: 100,
      phases: {
        'project-profile': {
          status: 'completed' as const,
          file: '01-project-profile.md',
          durationMs: 50,
        },
        'architecture-assessment': {
          status: 'failed' as const,
          file: '02-architecture-assessment.md',
          durationMs: 50,
          error: 'analysis_timeout',
        },
        'quality-audit': {
          status: 'pending' as const,
          file: '03-quality-audit.md',
          durationMs: 0,
        },
        'elevation-plan': {
          status: 'pending' as const,
          file: '04-elevation-plan.md',
          durationMs: 0,
        },
      },
    };

    const GENERATION = {
      version: 1 as const,
      runId: 'run-gen-1',
      analysisDirectory: '/fake/workspace/.ptah/analysis/acme',
      createdAt: '2026-08-31T00:00:00.000Z',
      updatedAt: '2026-08-31T00:20:00.000Z',
      lifecycle: 'timed-out' as const,
      outputDirectory: '/fake/workspace/.claude/agents',
      selectedAgentIds: ['agent-a', 'agent-b'],
      input: {},
      agents: {
        'agent-a': {
          agentId: 'agent-a',
          filePath: '/fake/workspace/.claude/agents/agent-a.md',
          status: 'written' as const,
          rejectedSections: 1,
          tailoredSections: 2,
        },
        'agent-b': {
          agentId: 'agent-b',
          filePath: '/fake/workspace/.claude/agents/agent-b.md',
          status: 'failed' as const,
          rejectedSections: 0,
          tailoredSections: 0,
          error: 'not generated: generation_timeout',
        },
      },
    };

    function storageWith(run: unknown): {
      findLatestResumableRun: jest.Mock;
      readPhaseFile: jest.Mock;
      toResponse: jest.Mock;
    } {
      return {
        findLatestResumableRun: jest.fn().mockResolvedValue(run),
        readPhaseFile: jest
          .fn()
          .mockImplementation(async (_dir: string, file: string) =>
            file === '01-project-profile.md' ? '# Profile' : null,
          ),
        toResponse: jest.fn(
          (
            slugDir: string,
            manifest: typeof V4_MANIFEST,
            phaseContents: Record<string, string>,
          ) => ({
            isMultiPhase: true,
            manifest,
            phaseContents,
            analysisDir: slugDir,
          }),
        ),
      };
    }

    it('returns nulls when no workspace is open (no storage access)', async () => {
      const h = makeHarness({ workspaceFolders: [] });
      h.handlers.register();

      const result = await call<{
        analysis: unknown;
        generation: unknown;
        analysisActive?: boolean;
      }>(h, 'wizard:get-resumable-run');
      expect(result).toEqual({
        analysis: null,
        generation: null,
        analysisActive: false,
      });
      expect(h.container.resolve).not.toHaveBeenCalled();
    });

    it('returns nulls when storage finds no resumable run', async () => {
      const h = makeHarness();
      h.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        storageWith(null),
      );
      h.handlers.register();

      const result = await call<{
        analysis: unknown;
        generation: unknown;
        analysisActive?: boolean;
      }>(h, 'wizard:get-resumable-run');
      expect(result).toEqual({
        analysis: null,
        generation: null,
        analysisActive: false,
      });
    });

    it('does not offer a legacy v3 run for resume', async () => {
      const h = makeHarness();
      const storage = storageWith(null); // Storage excludes v3 manifests from resumable runs.
      h.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        storage,
      );
      h.handlers.register();

      expect(await call(h, 'wizard:get-resumable-run')).toEqual({
        analysis: null,
        generation: null,
        analysisActive: false,
      });
      expect(storage.findLatestResumableRun).toHaveBeenCalledWith(WORKSPACE);
      expect(storage.readPhaseFile).not.toHaveBeenCalled();
    });

    it('returns the paused analysis (completed phases only) and the generation DTO, read-only', async () => {
      const h = makeHarness();
      const storage = storageWith({
        slugDir: '/fake/workspace/.ptah/analysis/acme',
        manifest: V4_MANIFEST,
        generation: {
          ...GENERATION,
          tabBinding: {
            tabId: 'setup-owner',
            workspacePath: WORKSPACE,
            workflow: 'setup-agent-generation',
          },
        },
      });
      h.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        storage,
      );
      h.handlers.register();

      const result = await call<{
        analysis: {
          manifest: { lifecycle: string };
          phaseContents: Record<string, string>;
          analysisDir: string;
        } | null;
        generation: {
          runId: string;
          analysisDirectory: string | null;
          lifecycle: string;
          selectedAgentIds: string[];
          agents: Array<{ agentId: string; status: string; error?: string }>;
        } | null;
      }>(h, 'wizard:get-resumable-run');

      expect(result.analysis?.manifest.lifecycle).toBe('paused');
      expect(result.analysis?.analysisDir).toBe(
        '/fake/workspace/.ptah/analysis/acme',
      );
      // Only the completed phase is read; the failed partial stays excluded.
      expect(Object.keys(result.analysis?.phaseContents ?? {})).toEqual([
        'project-profile',
      ]);
      expect(storage.readPhaseFile).toHaveBeenCalledTimes(1);

      expect(result.generation).toEqual({
        runId: 'run-gen-1',
        ownerTabId: 'setup-owner',
        analysisDirectory: '/fake/workspace/.ptah/analysis/acme',
        outputDirectory: '/fake/workspace/.claude/agents',
        lifecycle: 'timed-out',
        selectedAgentIds: ['agent-a', 'agent-b'],
        agents: [
          {
            agentId: 'agent-a',
            filePath: '/fake/workspace/.claude/agents/agent-a.md',
            status: 'written',
            rejectedSections: 1,
            tailoredSections: 2,
          },
          {
            agentId: 'agent-b',
            filePath: '/fake/workspace/.claude/agents/agent-b.md',
            status: 'failed',
            rejectedSections: 0,
            tailoredSections: 0,
            error: 'not generated: generation_timeout',
          },
        ],
      });
      // Read-only: nothing on disk is touched by discovery.
      expect(storage).not.toHaveProperty('writeGenerationManifest');
    });

    it('maps a slug-less generation checkpoint with analysisDirectory: null', async () => {
      const h = makeHarness();
      const { analysisDirectory: _omitted, ...rootGeneration } = GENERATION;
      void _omitted;
      h.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        storageWith({
          slugDir: null,
          manifest: null,
          generation: rootGeneration,
        }),
      );
      h.handlers.register();

      const result = await call<{
        analysis: unknown;
        generation: { analysisDirectory: string | null } | null;
      }>(h, 'wizard:get-resumable-run');

      expect(result.analysis).toBeNull();
      expect(result.generation?.analysisDirectory).toBeNull();
    });

    it('reports analysisActive even when no manifest exists on disk yet', async () => {
      const h = makeHarness();
      h.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        storageWith(null),
      );
      h.container.__register(
        AGENT_GENERATION_TOKENS.MULTI_PHASE_ANALYSIS_SERVICE,
        {
          getActiveRun: jest.fn().mockReturnValue({
            workspacePath: WORKSPACE,
            runId: 'run-live',
            slug: null,
            startedAt: '2026-10-14T01:00:00.000Z',
          }),
        },
      );
      h.handlers.register();

      const result = await call(h, 'wizard:get-resumable-run');
      expect(result).toEqual({
        analysis: null,
        generation: null,
        analysisActive: true,
        activeAnalysisStartedAt: '2026-10-14T01:00:00.000Z',
      });
    });

    it('reports analysisActive accurately alongside a discovered resumable run', async () => {
      const h = makeHarness();
      const getActiveRun = jest.fn().mockReturnValue({
        workspacePath: WORKSPACE,
        runId: 'run-analysis-1',
        slug: 'acme',
        startedAt: '2026-10-14T02:00:00.000Z',
      });
      h.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        storageWith({
          slugDir: '/fake/workspace/.ptah/analysis/acme',
          manifest: V4_MANIFEST,
          generation: null,
        }),
      );
      h.container.__register(
        AGENT_GENERATION_TOKENS.MULTI_PHASE_ANALYSIS_SERVICE,
        { getActiveRun },
      );
      h.handlers.register();

      const activeResult = await call<{
        analysisActive?: boolean;
        activeAnalysisStartedAt?: string;
      }>(h, 'wizard:get-resumable-run');
      expect(activeResult.analysisActive).toBe(true);
      expect(activeResult.activeAnalysisStartedAt).toBe(
        '2026-10-14T02:00:00.000Z',
      );

      getActiveRun.mockReturnValue(null);
      const inactiveResult = await call<{
        analysisActive?: boolean;
        activeAnalysisStartedAt?: string;
      }>(h, 'wizard:get-resumable-run');
      expect(inactiveResult.analysisActive).toBe(false);
      expect(inactiveResult.activeAnalysisStartedAt).toBeUndefined();
    });

    it('reports analysisActive: true when a run starts during the disk read (Race 1)', async () => {
      const h = makeHarness();
      let activeRun: {
        workspacePath: string;
        runId: string;
        slug: string;
        startedAt: string;
      } | null = null;
      const getActiveRun = jest.fn(() => activeRun);
      const runningManifest = { ...V4_MANIFEST, lifecycle: 'running' as const };
      const storage = storageWith(null);
      storage.findLatestResumableRun.mockImplementation(async () => {
        activeRun = {
          workspacePath: WORKSPACE,
          runId: runningManifest.runId,
          slug: runningManifest.slug,
          startedAt: '2026-10-14T03:00:00.000Z',
        };
        return {
          slugDir: '/fake/workspace/.ptah/analysis/acme',
          manifest: runningManifest,
          generation: null,
        };
      });
      h.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        storage,
      );
      h.container.__register(
        AGENT_GENERATION_TOKENS.MULTI_PHASE_ANALYSIS_SERVICE,
        { getActiveRun },
      );
      h.handlers.register();

      const result = await call<{
        analysis: { manifest: { lifecycle: string } } | null;
        analysisActive?: boolean;
        activeAnalysisStartedAt?: string;
      }>(h, 'wizard:get-resumable-run');
      expect(result.analysis?.manifest.lifecycle).toBe('running');
      expect(result.analysisActive).toBe(true);
      expect(result.activeAnalysisStartedAt).toBe('2026-10-14T03:00:00.000Z');
    });

    it('reports analysisActive: false and re-queries when a run finishes during the disk read (Race 2)', async () => {
      // Subcase A: run completes and disk already returns null.
      const hNull = makeHarness();
      let activeA: {
        workspacePath: string;
        runId: string;
        slug: string;
        startedAt: string;
      } | null = {
        workspacePath: WORKSPACE,
        runId: 'run-analysis-1',
        slug: 'acme',
        startedAt: '2026-10-14T04:00:00.000Z',
      };
      const storageA = storageWith(null);
      storageA.findLatestResumableRun.mockImplementation(async () => {
        activeA = null;
        return null;
      });
      hNull.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        storageA,
      );
      hNull.container.__register(
        AGENT_GENERATION_TOKENS.MULTI_PHASE_ANALYSIS_SERVICE,
        { getActiveRun: jest.fn(() => activeA) },
      );
      hNull.handlers.register();

      expect(await call(hNull, 'wizard:get-resumable-run')).toEqual({
        analysis: null,
        generation: null,
        analysisActive: false,
      });

      // Subcase B: disk read saw stale `running` manifest just as run completed -> re-queries and returns inactive null.
      const hStale = makeHarness();
      let activeB: {
        workspacePath: string;
        runId: string;
        slug: string;
        startedAt: string;
      } | null = {
        workspacePath: WORKSPACE,
        runId: 'run-analysis-1',
        slug: 'acme',
        startedAt: '2026-10-14T04:00:00.000Z',
      };
      const runningManifest = { ...V4_MANIFEST, lifecycle: 'running' as const };
      const storageB = storageWith(null);
      storageB.findLatestResumableRun
        .mockImplementationOnce(async () => {
          activeB = null;
          return {
            slugDir: '/fake/workspace/.ptah/analysis/acme',
            manifest: runningManifest,
            generation: null,
          };
        })
        .mockResolvedValueOnce(null);
      hStale.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
        storageB,
      );
      hStale.container.__register(
        AGENT_GENERATION_TOKENS.MULTI_PHASE_ANALYSIS_SERVICE,
        { getActiveRun: jest.fn(() => activeB) },
      );
      hStale.handlers.register();

      expect(await call(hStale, 'wizard:get-resumable-run')).toEqual({
        analysis: null,
        generation: null,
        analysisActive: false,
      });
      expect(storageB.findLatestResumableRun).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // setup-status:get-status
  // -------------------------------------------------------------------------

  describe('setup-status:get-status', () => {
    it('returns WORKSPACE_NOT_OPEN typed error (not a Sentry-reported throw) when no workspace is open', async () => {
      const h = makeHarness({ workspaceFolders: [] });
      h.handlers.register();

      const response = await callRaw(h, 'setup-status:get-status');

      // Must be a structured error response, not an unhandled exception.
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/No workspace folder/);
      // The typed errorCode must be present so the frontend can show a
      // friendly "Open Folder" prompt instead of a generic error toast.
      expect(response.errorCode).toBe('WORKSPACE_NOT_OPEN');
      // Sentry must NOT be called — this is an expected user condition.
      expect(h.sentry.captureException).not.toHaveBeenCalled();
    });

    it('delegates to SetupStatusService and returns its .value when workspace is open', async () => {
      const h = makeHarness();
      const expected = {
        isConfigured: true,
        agentCount: 3,
        lastModified: '2025-01-01T00:00:00Z',
        projectAgents: ['a', 'b'],
        userAgents: ['c'],
      };
      h.container.__register(AGENT_GENERATION_TOKENS.SETUP_STATUS_SERVICE, {
        getStatus: jest.fn().mockResolvedValue({
          isErr: () => false,
          value: expected,
        }),
      });
      h.handlers.register();

      const result = await call<typeof expected>(h, 'setup-status:get-status');
      expect(result).toEqual(expected);
      // No errors on the happy path.
      expect(h.sentry.captureException).not.toHaveBeenCalled();
    });

    it('returns error response when SetupStatusService returns an Err result', async () => {
      const h = makeHarness();
      h.container.__register(AGENT_GENERATION_TOKENS.SETUP_STATUS_SERVICE, {
        getStatus: jest.fn().mockResolvedValue({
          isErr: () => true,
          error: new Error('stat failed'),
        }),
      });
      h.handlers.register();

      const response = await callRaw(h, 'setup-status:get-status');
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/stat failed/);
    });
  });

  // -------------------------------------------------------------------------
  // wizard:deep-analyze — MCP gating
  // -------------------------------------------------------------------------

  describe('wizard:deep-analyze', () => {
    it('returns WORKSPACE_NOT_OPEN typed error (no Sentry) when no workspace is open', async () => {
      const h = makeHarness({ workspaceFolders: [] });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:deep-analyze', {});
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/No workspace folder/);
      expect(response.errorCode).toBe('WORKSPACE_NOT_OPEN');
      expect(h.sentry.captureException).not.toHaveBeenCalled();
    });

    it('throws when the MCP server cannot be resolved', async () => {
      // No CodeExecutionMCP registered → resolveService throws, the handler
      // catches and leaves mcpServerRunning=false, so the subsequent MCP check
      // fails with the user-facing message.
      const h = makeHarness();
      h.handlers.register();

      const response = await callRaw(h, 'wizard:deep-analyze', {});
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/MCP server required/);
    });

    it('returns UNAUTHORIZED_WORKSPACE error when renderer supplies an unauthorized workspacePath', async () => {
      const h = makeHarness({ workspaceFolders: [WORKSPACE] });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:deep-analyze', {
        workspacePath: '/tmp/evil-directory',
      });
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/Access denied/);
      expect(response.errorCode).toBe('UNAUTHORIZED_WORKSPACE');
      expect(h.sentry.captureException).not.toHaveBeenCalled();
    });

    it('does not gate when renderer does not supply workspacePath (backend fallback is trusted)', async () => {
      // When workspacePath is absent the backend uses getWorkspaceRoot() which
      // is trusted — the auth gate must NOT fire. The MCP check fires next and
      // fails with "MCP server required" (expected when MCP is unregistered).
      const h = makeHarness({ workspaceFolders: [WORKSPACE] });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:deep-analyze', {});
      expect(response.success).toBe(false);
      // Must NOT be an UNAUTHORIZED_WORKSPACE error
      expect(response.errorCode).not.toBe('UNAUTHORIZED_WORKSPACE');
    });
  });

  // -------------------------------------------------------------------------
  // wizard:load-analysis — unauthorized workspace gate
  // -------------------------------------------------------------------------

  describe('wizard:load-analysis — authorization gate', () => {
    it('returns UNAUTHORIZED_WORKSPACE error for an out-of-workspace path', async () => {
      const h = makeHarness({ workspaceFolders: [WORKSPACE] });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:load-analysis', {
        filename: 'analysis.json',
        workspacePath: '/tmp/evil',
      });
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/Access denied/);
      expect(response.errorCode).toBe('UNAUTHORIZED_WORKSPACE');
    });
  });

  // -------------------------------------------------------------------------
  // wizard:list-analyses — workspacePath fallback + authorization gate
  // -------------------------------------------------------------------------

  describe('wizard:list-analyses — workspacePath param', () => {
    it('returns UNAUTHORIZED_WORKSPACE for an out-of-workspace path', async () => {
      const h = makeHarness({ workspaceFolders: [WORKSPACE] });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:list-analyses', {
        workspacePath: '/tmp/evil',
      });
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/Access denied/);
      expect(response.errorCode).toBe('UNAUTHORIZED_WORKSPACE');
    });

    it('returns empty analyses when no workspace is open and no workspacePath supplied', async () => {
      const h = makeHarness({ workspaceFolders: [] });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:list-analyses', {});
      expect(response.success).toBe(true);
      expect((response.data as { analyses: unknown[] }).analyses).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // wizard:cancel-analysis — best-effort
  // -------------------------------------------------------------------------

  describe('wizard:cancel-analysis', () => {
    it('returns cancelled=true when at least one service cancels', async () => {
      const h = makeHarness();
      h.container.__register(
        AGENT_GENERATION_TOKENS.MULTI_PHASE_ANALYSIS_SERVICE,
        {
          cancelAnalysis: jest.fn(),
        },
      );
      // AgenticAnalysisService deliberately NOT registered → resolveService
      // throws, handler swallows it. `cancelled` should still be true.
      h.handlers.register();

      const result = await call<{ cancelled: boolean }>(
        h,
        'wizard:cancel-analysis',
      );
      expect(result.cancelled).toBe(true);
    });

    it('returns cancelled=false when every service fails to resolve', async () => {
      const h = makeHarness();
      h.handlers.register();

      const result = await call<{ cancelled: boolean }>(
        h,
        'wizard:cancel-analysis',
      );
      expect(result.cancelled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // wizard:list-analyses / wizard:load-analysis
  // -------------------------------------------------------------------------

  describe('wizard:list-analyses', () => {
    it('returns { analyses: [] } when no workspace is open', async () => {
      const h = makeHarness({ workspaceFolders: [] });
      h.handlers.register();

      const result = await call<{ analyses: unknown[] }>(
        h,
        'wizard:list-analyses',
      );
      expect(result.analyses).toEqual([]);
    });

    it('delegates to AnalysisStorageService.list when workspace is open', async () => {
      const h = makeHarness();
      const analyses = [
        { filename: 'a.json', analyzedAt: 1 },
        { filename: 'b.json', analyzedAt: 2 },
      ];
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        list: jest.fn().mockResolvedValue(analyses),
      });
      h.handlers.register();

      const result = await call<{ analyses: unknown[] }>(
        h,
        'wizard:list-analyses',
      );
      expect(result.analyses).toEqual(analyses);
    });

    it('marks the active in-process analysis entry with isActive: true', async () => {
      const h = makeHarness();
      const analyses = [
        { filename: 'prev-slug', analyzedAt: 1, lifecycle: 'completed' },
        { filename: 'live-slug', analyzedAt: 2, lifecycle: 'running' },
      ];
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        list: jest.fn().mockResolvedValue(analyses),
      });
      h.container.__register(
        AGENT_GENERATION_TOKENS.MULTI_PHASE_ANALYSIS_SERVICE,
        {
          getActiveRun: jest.fn().mockReturnValue({
            workspacePath: WORKSPACE,
            runId: 'run-live',
            slug: 'live-slug',
            startedAt: '2026-10-14T03:00:00.000Z',
          }),
        },
      );
      h.handlers.register();

      const result = await call<{
        analyses: Array<{ filename: string; isActive?: boolean }>;
      }>(h, 'wizard:list-analyses');
      expect(result.analyses).toEqual([
        { filename: 'prev-slug', analyzedAt: 1, lifecycle: 'completed' },
        {
          filename: 'live-slug',
          analyzedAt: 2,
          lifecycle: 'running',
          isActive: true,
        },
      ]);
    });
  });

  describe('wizard Setup model', () => {
    it('returns the effective workspace pair without credentials when Setup is unset', async () => {
      const h = makeHarness();
      h.handlers.register();
      expect(
        await call<WizardGetSetupModelResult>(h, 'wizard:get-setup-model'),
      ).toEqual({
        state: {
          kind: 'unset',
          effective: { provider: SNAPSHOT.providerId, model: SNAPSHOT.model },
        },
      });
      expect(h.resolveSetup).toHaveBeenCalledWith(WORKSPACE);
    });

    it.each(['apiKey', 'claudeCli'])(
      'returns the stored %s selector alongside the effective Setup pair',
      async (provider) => {
        const h = makeHarness();
        const committed = { provider, model: SNAPSHOT.model };
        h.resolveSetup.mockResolvedValue({
          kind: 'set',
          snapshot: SNAPSHOT,
          storedPair: committed,
        } satisfies SetupResolution);
        h.handlers.register();

        expect(await call(h, 'wizard:get-setup-model')).toEqual({
          state: {
            kind: 'set',
            pair: { provider: SNAPSHOT.providerId, model: SNAPSHOT.model },
          },
          committed,
        });
      },
    );

    it('rejects a Setup write when the resolver cannot validate the candidate', async () => {
      const h = makeHarness();
      h.container.__register(SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER, {
        resolveSetup: h.resolveSetup,
      });
      const commitSetupPair = jest.fn();
      h.container.__register(SETTINGS_TOKENS.WORKSPACE_SCOPE_RESOLVER, {
        commitSetupPair,
      });
      h.handlers.register();

      expect(
        await callRaw(h, 'wizard:set-setup-model', {
          provider: 'anthropic',
          model: 'sonnet',
        }),
      ).toMatchObject({ success: false, errorCode: 'SETUP_MODEL_INVALID' });
      expect(commitSetupPair).not.toHaveBeenCalled();
    });

    it('returns the strict blocked state and rejects invalid saves before writing', async () => {
      const h = makeHarness();
      h.resolveSetup.mockResolvedValue(INVALID_SETUP);
      const validateSetupPair = jest.fn().mockResolvedValue(INVALID_SETUP);
      h.container.__register(SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER, {
        resolveSetup: h.resolveSetup,
        validateSetupPair,
      });
      const commitSetupPair = jest.fn();
      h.container.__register(SETTINGS_TOKENS.WORKSPACE_SCOPE_RESOLVER, {
        commitSetupPair,
      });
      h.handlers.register();
      expect(await call(h, 'wizard:get-setup-model')).toEqual({
        state: INVALID_SETUP,
      });
      expect(
        await callRaw(h, 'wizard:set-setup-model', {
          provider: ' anthropic ',
          model: ' stale ',
        }),
      ).toMatchObject({ success: false, errorCode: 'SETUP_MODEL_INVALID' });
      expect(validateSetupPair).toHaveBeenCalledWith(WORKSPACE, {
        provider: 'anthropic',
        model: 'stale',
      });
      expect(commitSetupPair).not.toHaveBeenCalled();
    });

    it('clears Setup even if the effective workspace pair is blocked', async () => {
      const h = makeHarness();
      const blocked = { ...INVALID_SETUP, source: 'workspace' };
      h.resolveSetup.mockResolvedValue(blocked);
      const commitSetupPair = jest.fn().mockResolvedValue(null);
      h.container.__register(SETTINGS_TOKENS.WORKSPACE_SCOPE_RESOLVER, {
        commitSetupPair,
      });
      h.handlers.register();
      expect(
        await call(h, 'wizard:set-setup-model', { provider: ' ', model: '' }),
      ).toMatchObject({
        committed: null,
        state: blocked,
        commitSeq: expect.any(Number),
      });
      expect(commitSetupPair).toHaveBeenCalledWith({ provider: '', model: '' });
    });

    it('names the stored Setup provider ID in SETUP_MODEL_INVALID errors when known', async () => {
      const h = makeHarness();
      const validateSetupPair = jest
        .fn()
        .mockResolvedValueOnce({
          kind: 'invalid',
          source: 'setup',
          provider: 'anthropic',
          model: 'stale',
          cause: 'model-stale',
        } satisfies SetupResolution)
        .mockResolvedValueOnce({
          kind: 'invalid',
          source: 'setup',
          provider: null,
          model: 'stale',
          cause: 'provider-missing',
        } satisfies SetupResolution)
        .mockRejectedValueOnce(new Error('secret-token-value'));
      h.resolveSetup.mockResolvedValueOnce({
        kind: 'unavailable',
        source: 'workspace',
        provider: 'openrouter',
        model: 'gpt-4o',
        cause: 'provider-unavailable',
      } satisfies SetupResolution);
      h.container.__register(SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER, {
        resolveSetup: h.resolveSetup,
        validateSetupPair,
      });
      h.handlers.register();

      const setupNamed = await callRaw(h, 'wizard:set-setup-model', {
        provider: 'anthropic',
        model: 'stale',
      });
      expect(setupNamed).toMatchObject({
        success: false,
        errorCode: 'SETUP_MODEL_INVALID',
      });
      expect(setupNamed.error).toContain(
        'Setup provider anthropic: model-stale',
      );

      const providerMissing = await callRaw(h, 'wizard:set-setup-model', {
        provider: 'anthropic',
        model: 'stale',
      });
      expect(providerMissing).toMatchObject({
        success: false,
        errorCode: 'SETUP_MODEL_INVALID',
      });
      expect(providerMissing.error).toContain('(Setup: provider-missing)');
      expect(providerMissing.error).not.toContain('null');

      const thrownValidation = await callRaw(h, 'wizard:set-setup-model', {
        provider: 'ollama-cloud',
        model: 'qwen',
      });
      expect(thrownValidation).toMatchObject({
        success: false,
        errorCode: 'SETUP_MODEL_INVALID',
      });
      expect(thrownValidation.error).toContain('Setup provider ollama-cloud');
      expect(thrownValidation.error).not.toContain('secret-token-value');

      const workspaceUnavailable = await callRaw(
        h,
        'wizard:recommend-analysis-skills',
        { runId: 'run-1' },
      );
      expect(workspaceUnavailable).toMatchObject({
        success: false,
        errorCode: 'SETUP_MODEL_INVALID',
      });
      expect(workspaceUnavailable.error).toContain(
        'workspace provider openrouter: provider-unavailable',
      );
    });

    it('post-commit resolution failure still returns the committed receipt', async () => {
      const h = makeHarness();
      const pair = { provider: 'anthropic', model: 'model-a' };
      const validateSetupPair = jest
        .fn()
        .mockResolvedValue(setupResolution(pair));
      h.resolveSetup
        .mockRejectedValueOnce(new Error('raw resolver failure with secret'))
        .mockRejectedValueOnce(new Error('second resolver failure'));
      h.container.__register(SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER, {
        resolveSetup: h.resolveSetup,
        validateSetupPair,
      });
      const commitSetupPair = jest
        .fn()
        .mockResolvedValueOnce(pair)
        .mockResolvedValueOnce(null);
      h.container.__register(SETTINGS_TOKENS.WORKSPACE_SCOPE_RESOLVER, {
        commitSetupPair,
      });
      h.handlers.register();

      const setResult = await call<WizardSetSetupModelResult>(
        h,
        'wizard:set-setup-model',
        pair,
      );
      expect(setResult).toEqual({
        committed: pair,
        commitSeq: expect.any(Number),
        state: {
          kind: 'unavailable',
          source: 'setup',
          provider: pair.provider,
          model: pair.model,
          cause: 'provider-unavailable',
        },
      });
      expect(JSON.stringify(setResult)).not.toContain('secret');

      const clearResult = await call<WizardSetSetupModelResult>(
        h,
        'wizard:set-setup-model',
        { provider: '', model: '' },
      );
      expect(clearResult).toEqual({
        committed: null,
        commitSeq: setResult.commitSeq + 1,
        state: {
          kind: 'unavailable',
          source: 'workspace',
          provider: '',
          model: '',
          cause: 'provider-unavailable',
        },
      });
    });

    it('concurrent wizard:set-setup-model RPCs return distinct committed receipts and monotonic commitSeq matching disk read-back', async () => {
      const h = makeHarness();
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'setup-rpc-'));
      try {
        const manager = new PtahFileSettingsManager({}, dir);
        const store: IGlobalBatchSettingsStore = {
          readGlobal: (key) => manager.get(key),
          hasGlobal: (key) => manager.has(key),
          writeGlobal: async (key, value) => {
            await manager.set(key, value);
          },
          readGlobalMany: (keys) => manager.getMany(keys),
          writeGlobalBatch: (entries) => manager.setMany(entries),
          readSecret: async () => undefined,
          writeSecret: async () => undefined,
          deleteSecret: async () => undefined,
          watchGlobal: () => ({ dispose: jest.fn() }),
          watchSecret: () => ({ dispose: jest.fn() }),
          flushSync: () => manager.flushSync(),
        };
        const scope = new WorkspaceScopeResolver(store, {
          getActivePath: () => WORKSPACE,
          onDidChange: () => ({ dispose: jest.fn() }),
        });
        const first = { provider: 'anthropic', model: 'model-a' };
        const second = { provider: 'openrouter', model: 'model-b' };
        h.container.__register(SETTINGS_TOKENS.WORKSPACE_SCOPE_RESOLVER, scope);
        const validateSetupPair = jest.fn(
          async (_root: string, pair: ModelPair) => setupResolution(pair),
        );
        let finishFirstState: (state: SetupResolution) => void = () =>
          undefined;
        h.resolveSetup
          .mockImplementationOnce(
            () =>
              new Promise<SetupResolution>((resolve) => {
                finishFirstState = resolve;
              }),
          )
          .mockImplementation(async () => setupResolution(second));
        h.container.__register(SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER, {
          resolveSetup: h.resolveSetup,
          validateSetupPair,
        });
        h.handlers.register();
        const firstCall = call<WizardSetSetupModelResult>(
          h,
          'wizard:set-setup-model',
          first,
        );
        const secondCall = call<WizardSetSetupModelResult>(
          h,
          'wizard:set-setup-model',
          second,
        );
        const secondResult = await secondCall;
        finishFirstState(setupResolution(second));
        const firstResult = await firstCall;
        expect(firstResult.committed).toEqual(first);
        expect(secondResult.committed).toEqual(second);
        expect(secondResult.commitSeq).toBe(firstResult.commitSeq + 1);
        expect(firstResult.state).toEqual({ kind: 'set', pair: second });
        const reloaded = new PtahFileSettingsManager({}, dir);
        expect(reloaded.getMany(['setup.provider', 'setup.model'])).toEqual({
          'setup.provider': second.provider,
          'setup.model': second.model,
        });
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('wizard:generate-skill-draft', () => {
    const draft = {
      runId: 'run-1',
      proposalId: 'proposal-1',
      proposalName: 'Angular skill',
      items: [
        {
          itemId: 'framework-1',
          name: 'Angular',
          kind: 'framework',
          evidence: 'package.json',
          buildReasons: ['Project conventions'],
        },
      ],
    };

    it('sanitizes the input and delegates with the workspace root', async () => {
      const h = makeHarness();
      const result = {
        ok: false,
        category: 'empty-output',
        message: 'Empty draft.',
      };
      const generateDraft = jest.fn().mockResolvedValue(result);
      h.container.__register(SKILL_DRAFT_GENERATION_SERVICE, { generateDraft });
      h.handlers.register();
      expect(
        await call(h, 'wizard:generate-skill-draft', {
          ...draft,
          proposalName: ' Angular skill ',
          items: [
            {
              ...draft.items[0],
              evidence: 'package.json\u0000\r\n',
              buildReasons: ['Project\u202e conventions'],
            },
          ],
        }),
      ).toEqual(result);
      expect(generateDraft).toHaveBeenCalledWith(
        {
          ...draft,
          items: [
            { ...draft.items[0], buildReasons: ['Project  conventions'] },
          ],
        },
        WORKSPACE,
      );
    });

    it('returns a safe draft failure when the service rejects', async () => {
      const h = makeHarness();
      const generateDraft = jest
        .fn()
        .mockRejectedValue(new Error('private provider details'));
      h.container.__register(SKILL_DRAFT_GENERATION_SERVICE, { generateDraft });
      h.handlers.register();
      expect(await call(h, 'wizard:generate-skill-draft', draft)).toEqual({
        ok: false,
        category: 'provider-error',
        message: 'Could not generate the skill draft.',
      });
    });

    it.each([
      { ...draft, proposalName: 'a'.repeat(65) },
      { ...draft, items: [] },
      { ...draft, items: Array.from({ length: 31 }, () => draft.items[0]) },
      { ...draft, items: [{ ...draft.items[0], evidence: 'a'.repeat(2001) }] },
      {
        ...draft,
        items: [{ ...draft.items[0], buildReasons: ['a'.repeat(2001)] }],
      },
      {
        ...draft,
        items: [
          {
            ...draft.items[0],
            buildReasons: Array.from({ length: 11 }, (_, i) => `Reason ${i}`),
          },
        ],
      },
    ])('rejects a draft outside the input limits', async (params) => {
      const h = makeHarness();
      h.handlers.register();
      expect(
        await callRaw(h, 'wizard:generate-skill-draft', params),
      ).toMatchObject({
        success: false,
        errorCode: 'INVALID_PARAMS',
      });
      expect(h.container.resolve).not.toHaveBeenCalled();
    });
  });

  describe('wizard:recommend-analysis-skills', () => {
    it('uses the matching saved run and its structured stack', async () => {
      const h = makeHarness();
      const item = {
        kind: 'framework',
        name: 'Angular',
        evidence: 'package.json',
        sourcePhase: 'profile',
      };
      const analysisPair = {
        provider: 'analysis-provider',
        model: 'analysis-model',
      };
      const judge = {
        method: 'none',
        counts: { decision: 0, normal: 0, notJudged: 1 },
        items: [{ registry: 'search-failed' }],
      };
      const recommendAnalysis = jest.fn().mockResolvedValue({
        analysisPair,
        judge,
        skills: [],
        detectedItems: [item],
        unmatchedItems: [],
        searchFailures: [],
        summarySource: 'structured',
      });
      const writeSkillReview = jest
        .fn()
        .mockResolvedValue(
          '/fake/workspace/.ptah/analysis/demo/skill-review.json',
        );
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        loadByRunId: jest.fn().mockResolvedValue({
          manifest: { runId: 'run-1' },
          analysisPair,
          stackSummary: { source: 'structured', items: [item] },
        }),
        writeSkillReview,
      });
      h.container.__register(SKILL_RECOMMENDATION_SERVICE, {
        recommendAnalysis,
      });
      h.handlers.register();
      const entry = Date.now();
      const result = await call<WizardRecommendAnalysisSkillsResult>(
        h,
        'wizard:recommend-analysis-skills',
        { runId: 'run-1' },
      );
      expect(result).toMatchObject({
        detectedItems: [item],
        analysisPair,
        judge,
      });
      expect(recommendAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [item],
          summarySource: 'structured',
          analysisPair,
          resolved: SNAPSHOT,
        }),
      );
      const { rpcEntry } = recommendAnalysis.mock.calls[0][0];
      expect(rpcEntry).toBeGreaterThanOrEqual(entry);
      expect(h.resolveSetup.mock.invocationCallOrder[0]).toBeLessThan(
        recommendAnalysis.mock.invocationCallOrder[0],
      );
      expect(writeSkillReview).toHaveBeenCalledWith(WORKSPACE, 'run-1', result);
    });

    it('still returns the review when storing it fails', async () => {
      const h = makeHarness();
      const review = {
        analysisPair: null,
        judge: { method: 'none', counts: {}, items: [] },
        skills: [],
        detectedItems: [],
        unmatchedItems: [],
        searchFailures: [],
        summarySource: 'structured',
      };
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        loadByRunId: jest.fn().mockResolvedValue({
          stackSummary: { source: 'structured', items: [{ name: 'Angular' }] },
        }),
        writeSkillReview: jest.fn().mockRejectedValue(new Error('EACCES')),
      });
      h.container.__register(SKILL_RECOMMENDATION_SERVICE, {
        recommendAnalysis: jest.fn().mockResolvedValue(review),
      });
      h.handlers.register();
      const result = await call<WizardRecommendAnalysisSkillsResult>(
        h,
        'wizard:recommend-analysis-skills',
        { runId: 'run-1' },
      );
      expect(result).toEqual(review);
      expect(h.logger.warn).toHaveBeenCalledWith(
        'Could not store the skill review.',
        expect.any(Error),
      );
    });

    it('returns an empty explanation when the run is missing', async () => {
      const h = makeHarness();
      const writeSkillReview = jest.fn();
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        loadByRunId: jest.fn().mockResolvedValue(null),
        writeSkillReview,
      });
      h.handlers.register();
      const result = await call<{ skills: unknown[]; warning: string }>(
        h,
        'wizard:recommend-analysis-skills',
        { runId: 'missing' },
      );
      expect(result.skills).toEqual([]);
      expect(result.warning).toMatch(/not found/);
      expect(result).toMatchObject({
        analysisPair: null,
        judge: { method: 'none', items: [] },
      });
      expect(writeSkillReview).not.toHaveBeenCalled();
    });

    it('returns an empty result when the saved run has no stack summary', async () => {
      const h = makeHarness();
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        loadByRunId: jest
          .fn()
          .mockResolvedValue({ manifest: { runId: 'run-1' } }),
      });
      h.handlers.register();
      const result = await call<{
        skills: unknown[];
        detectedItems: unknown[];
        warning: string;
      }>(h, 'wizard:recommend-analysis-skills', { runId: 'run-1' });
      expect(result.skills).toEqual([]);
      expect(result.detectedItems).toEqual([]);
      expect(result.warning).not.toMatch(/raw error/i);
    });

    it('returns an empty result when no workspace is open', async () => {
      const h = makeHarness({ workspaceFolders: [] });
      h.handlers.register();
      const result = await call<{
        skills: unknown[];
        detectedItems: unknown[];
        warning: string;
      }>(h, 'wizard:recommend-analysis-skills', { runId: 'run-1' });
      expect(result.skills).toEqual([]);
      expect(result.detectedItems).toEqual([]);
      expect(result.warning).toMatch(/Open a workspace/);
      expect(result.warning).not.toMatch(/raw error/i);
    });

    it('maps a saved-analysis rejection to a safe typed error', async () => {
      const h = makeHarness();
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        loadByRunId: jest
          .fn()
          .mockRejectedValue(new Error('raw error: secret path')),
      });
      h.handlers.register();
      expect(
        await callRaw(h, 'wizard:recommend-analysis-skills', {
          runId: 'run-1',
        }),
      ).toMatchObject({
        success: false,
        errorCode: 'ANALYSIS_LOAD_FAILED',
        error: 'Could not read the saved analysis.',
      });
    });

    it.each([
      INVALID_SETUP,
      { ...INVALID_SETUP, kind: 'unavailable', cause: 'provider-unavailable' },
    ])('blocks storage and search when Setup is $kind', async (resolution) => {
      const h = makeHarness();
      h.resolveSetup.mockResolvedValue(resolution);
      h.handlers.register();
      expect(
        await callRaw(h, 'wizard:recommend-analysis-skills', {
          runId: 'run-1',
        }),
      ).toMatchObject({
        success: false,
        errorCode: 'SETUP_MODEL_INVALID',
      });
      expect(h.container.resolve).toHaveBeenCalledTimes(1);
    });

    it.each([
      { stall: 'Setup resolution', errorCode: 'SETUP_MODEL_INVALID' },
      { stall: 'saved-analysis load', errorCode: 'ANALYSIS_LOAD_FAILED' },
    ])(
      'times out $stall at the entry-anchored pre-search deadline',
      async ({ stall, errorCode }) => {
        jest.useFakeTimers();
        try {
          const h = makeHarness();
          const loadByRunId = jest
            .fn()
            .mockReturnValue(new Promise(() => undefined));
          h.container.__register(
            AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
            { loadByRunId },
          );
          h.resolveSetup.mockImplementation(
            () =>
              new Promise((resolve) => {
                if (stall === 'saved-analysis load') {
                  setTimeout(() => resolve(setupResolution(null)), 2_000);
                }
              }),
          );
          h.handlers.register();
          const pending = callRaw(h, 'wizard:recommend-analysis-skills', {
            runId: 'run-1',
          });
          await jest.advanceTimersByTimeAsync(6_000);
          expect(await pending).toMatchObject({ success: false, errorCode });
          expect(loadByRunId).toHaveBeenCalledTimes(
            stall === 'saved-analysis load' ? 1 : 0,
          );
        } finally {
          jest.useRealTimers();
        }
      },
    );

    it.each([
      [
        new Error('raw provider error'),
        'SKILLS_RECOMMEND_FAILED',
        'Could not load skill recommendations.',
      ],
      [
        new RpcUserError('Typed failure', 'INVALID_PARAMS'),
        'INVALID_PARAMS',
        'Typed failure',
      ],
    ])(
      'preserves typed recommendation errors and sanitizes unexpected failures',
      async (error, errorCode, message) => {
        const h = makeHarness();
        h.container.__register(
          AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
          {
            loadByRunId: jest.fn().mockResolvedValue({
              stackSummary: {
                source: 'structured',
                items: [{ name: 'Angular' }],
              },
            }),
          },
        );
        const recommendAnalysis = jest.fn().mockRejectedValue(error);
        h.container.__register(SKILL_RECOMMENDATION_SERVICE, {
          recommendAnalysis,
        });
        h.handlers.register();
        expect(
          await callRaw(h, 'wizard:recommend-analysis-skills', {
            runId: 'run-1',
          }),
        ).toMatchObject({
          success: false,
          errorCode,
          error: message,
        });
        expect(recommendAnalysis).toHaveBeenCalledWith(
          expect.objectContaining({ analysisPair: null }),
        );
      },
    );

    it('rejects invalid params before loading storage', async () => {
      const h = makeHarness();
      h.handlers.register();
      const result = await callRaw(h, 'wizard:recommend-analysis-skills', {
        runId: '',
      });
      expect(result.success).toBe(false);
      expect(h.container.resolve).not.toHaveBeenCalled();
    });
  });

  describe('wizard:get-skill-review', () => {
    it('returns the stored review of the run in the active workspace', async () => {
      const h = makeHarness();
      const review = { skills: [], judge: { method: 'none' } };
      const readSkillReview = jest.fn().mockResolvedValue({
        review,
        reviewedAt: '2026-11-27T10:00:00.000Z',
      });
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        readSkillReview,
      });
      h.handlers.register();
      const result = await call<WizardGetSkillReviewResult>(
        h,
        'wizard:get-skill-review',
        { runId: 'run-1' },
      );
      expect(result).toEqual({
        review,
        reviewedAt: '2026-11-27T10:00:00.000Z',
      });
      expect(readSkillReview).toHaveBeenCalledWith(WORKSPACE, 'run-1');
    });

    it('returns null fields for an unknown run', async () => {
      const h = makeHarness();
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        readSkillReview: jest.fn().mockResolvedValue(null),
      });
      h.handlers.register();
      expect(
        await call<WizardGetSkillReviewResult>(h, 'wizard:get-skill-review', {
          runId: 'unknown',
        }),
      ).toEqual({ review: null, reviewedAt: null });
    });

    it('returns null fields without reading when no workspace is open', async () => {
      const h = makeHarness({ workspaceFolders: [] });
      h.handlers.register();
      expect(
        await call<WizardGetSkillReviewResult>(h, 'wizard:get-skill-review', {
          runId: 'run-1',
        }),
      ).toEqual({ review: null, reviewedAt: null });
      expect(h.container.resolve).not.toHaveBeenCalled();
    });

    it.each([{ runId: '' }, { runId: 'run-1', workspacePath: '/other' }, {}])(
      'rejects invalid params %j before reading storage',
      async (params) => {
        const h = makeHarness();
        h.handlers.register();
        expect(
          await callRaw(h, 'wizard:get-skill-review', params),
        ).toMatchObject({ success: false, errorCode: 'INVALID_PARAMS' });
        expect(h.container.resolve).not.toHaveBeenCalled();
      },
    );
  });

  describe('wizard:load-analysis', () => {
    it('links a completed loaded analysis without changing the load result', async () => {
      const h = makeHarness();
      const loaded = {
        isMultiPhase: true,
        manifest: {
          lifecycle: 'completed',
          phases: { 'project-profile': { file: '01-project-profile.md' } },
        },
        phaseContents: {},
        analysisDir: '/fake/workspace/.ptah/analysis/demo',
      };
      const loadMultiPhase = jest.fn().mockResolvedValue(loaded);
      const loadByRunId = jest.fn();
      const link = jest.fn().mockResolvedValue({ written: true });
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        loadMultiPhase,
        loadByRunId,
      });
      h.container.__register(
        AGENT_GENERATION_TOKENS.ANALYSIS_CLAUDE_MD_LINKER,
        { link },
      );
      h.handlers.register();
      expect(
        await call(h, 'wizard:load-analysis', { filename: 'demo' }),
      ).toEqual(loaded);
      expect(loadMultiPhase).toHaveBeenCalledWith(WORKSPACE, 'demo');
      expect(loadByRunId).not.toHaveBeenCalled();
      expect(link).toHaveBeenCalledWith(WORKSPACE);
    });

    it('falls back to the exact manifest ID in the requested open workspace', async () => {
      const workspacePath = await fs.mkdtemp(
        path.join(os.tmpdir(), 'setup-load-'),
      );
      try {
        const h = makeHarness({ workspaceFolders: [WORKSPACE, workspacePath] });
        const loaded = {
          isMultiPhase: true,
          manifest: { runId: 'run-1', slug: 'demo', lifecycle: 'paused' },
          phaseContents: {},
          analysisDir: workspacePath + '/.ptah/analysis/demo',
        };
        const loadMultiPhase = jest
          .fn()
          .mockRejectedValue(new Error('Missing slug'));
        const loadByRunId = jest.fn().mockResolvedValue(loaded);
        h.container.__register(
          AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
          {
            loadMultiPhase,
            loadByRunId,
          },
        );
        h.handlers.register();

        expect(
          await call(h, 'wizard:load-analysis', {
            filename: 'run-1',
            workspacePath,
          }),
        ).toEqual(loaded);
        expect(loadMultiPhase).toHaveBeenCalledWith(workspacePath, 'run-1');
        expect(loadByRunId).toHaveBeenCalledTimes(1);
        expect(loadByRunId).toHaveBeenCalledWith(workspacePath, 'run-1');
      } finally {
        await fs.rm(workspacePath, { recursive: true, force: true });
      }
    });

    it.each(['dir/run-1', 'run.1', '../run-1'])(
      'keeps %s out of the manifest-ID lookup',
      async (filename) => {
        const h = makeHarness();
        const loadByRunId = jest.fn();
        h.container.__register(
          AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE,
          {
            loadMultiPhase: jest
              .fn()
              .mockRejectedValue(new Error('Missing slug')),
            loadByRunId,
          },
        );
        h.handlers.register();

        expect(
          await callRaw(h, 'wizard:load-analysis', { filename }),
        ).toMatchObject({
          success: false,
          errorCode: 'ANALYSIS_LOAD_FAILED',
        });
        expect(loadByRunId).not.toHaveBeenCalled();
      },
    );

    it('rejects a workspace that is outside the open folders before reading storage', async () => {
      const h = makeHarness();
      h.handlers.register();

      expect(
        await callRaw(h, 'wizard:load-analysis', {
          filename: 'run-1',
          workspacePath: '/fake/closed-workspace',
        }),
      ).toMatchObject({ success: false, errorCode: 'UNAUTHORIZED_WORKSPACE' });
      expect(h.container.resolve).not.toHaveBeenCalled();
    });

    it('rejects a fallback result with a different manifest ID', async () => {
      const h = makeHarness();
      const loadByRunId = jest.fn().mockResolvedValue({
        manifest: { runId: 'run-10', lifecycle: 'paused' },
      });
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        loadMultiPhase: jest.fn().mockRejectedValue(new Error('Missing slug')),
        loadByRunId,
      });
      h.handlers.register();

      expect(
        await callRaw(h, 'wizard:load-analysis', { filename: 'run-1' }),
      ).toMatchObject({ success: false, errorCode: 'ANALYSIS_LOAD_FAILED' });
      expect(loadByRunId).toHaveBeenCalledWith(WORKSPACE, 'run-1');
    });

    it('maps a missing slug and manifest ID to ANALYSIS_LOAD_FAILED', async () => {
      const h = makeHarness();
      const loadByRunId = jest.fn().mockResolvedValue(null);
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        loadMultiPhase: jest.fn().mockRejectedValue(new Error('private path')),
        loadByRunId,
      });
      h.handlers.register();
      expect(
        await callRaw(h, 'wizard:load-analysis', { filename: 'demo' }),
      ).toMatchObject({
        success: false,
        errorCode: 'ANALYSIS_LOAD_FAILED',
        error: 'Could not read the saved analysis.',
      });
      expect(loadByRunId).toHaveBeenCalledWith(WORKSPACE, 'demo');
    });

    it('throws when no workspace is open', async () => {
      const h = makeHarness({ workspaceFolders: [] });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:load-analysis', {
        filename: 'x.json',
      });
      expect(response.success).toBe(false);
      expect(response.error).toMatch(/No workspace folder/);
    });

    it('strips path segments from filename before delegating (defense-in-depth)', async () => {
      const h = makeHarness();
      const loadMock = jest.fn().mockResolvedValue({
        isMultiPhase: true,
        manifest: {
          slug: 'x',
          analyzedAt: '',
          model: '',
          totalDurationMs: 0,
          phases: {},
        },
        phaseContents: {},
        analysisDir: '',
      });
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        loadMultiPhase: loadMock,
      });
      h.handlers.register();

      await call(h, 'wizard:load-analysis', {
        filename: '../../etc/passwd',
      });

      // The handler calls path.basename() before forwarding — ensures the
      // storage layer never sees the traversal-y path.
      expect(loadMock).toHaveBeenCalledWith(WORKSPACE, 'passwd');
    });
  });

  // -------------------------------------------------------------------------
  // THOTH wizard memory seeding
  //
  // The seeding hook lives inside `wizard:deep-analyze` between
  // `phaseContents` assembly and `return response`. Driving it through the
  // RPC requires mocking license/MCP gating + the multi-phase service +
  // storage service. Builders are also exercised via this RPC path so all
  // fixtures are real LLM-shape markdown blobs (mirroring this workspace's
  // own `.ptah/analysis/<slug>/` outputs).
  // -------------------------------------------------------------------------

  describe('seedWizardMemory (wizard:deep-analyze hook)', () => {
    // Phase fixtures matching the multi-phase markdown shape.
    const PROJECT_PROFILE_FIXTURE = `# Acme Web Platform

**Frameworks**: NestJS, Angular, RxJS
**Monorepo**: Nx 22
**Tech Stack**: TypeScript, PostgreSQL, Redis, Docker

## Architecture

The Acme platform is a hexagonal monorepo with strict ports-and-adapters separation between the core domain and the runtime adapters.

Some additional paragraph here.
`;

    const QUALITY_AUDIT_FIXTURE = `# Code Quality Audit

## Overall Quality Score
Score: 78 / 100

## Code Conventions
- Use \`unknown\` in catch clauses; never \`any\`
- Validate external input with zod at all RPC boundaries
- Inject by token through tsyringe, never by class
- Prefer Observable + BehaviorSubject over manual EventEmitters
- Always use prepared statements for SQLite

## File-Level Findings
Lots of details here.
`;

    const KEY_FILES_FIXTURE = `# Project Profile

## File Structure

\`\`\`text
acme-platform/
├── apps/
│   ├── api/
│   │   └── src/main.ts
│   ├── web/
│   │   └── src/index.ts
│   └── worker/
│       └── src/server.ts
├── libs/
│   ├── shared/
│   └── domain/
├── package.json
├── tsconfig.json
├── nx.json
└── docker-compose.yml
\`\`\`

## Key Files

- \`apps/api/src/users.controller.ts\`
- \`apps/api/src/auth.service.ts\`
- \`apps/web/src/app/profile.component.ts\`
- \`libs/domain/src/lib/user.entity.ts\`
- \`apps/api/src/__tests__/auth.spec.ts\`
`;

    const MANIFEST = {
      version: 3 as const,
      runId: 'run-1',
      slug: 'acme-platform',
      analyzedAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
      lifecycle: 'completed' as const,
      model: 'sonnet',
      totalDurationMs: 1234,
      phases: {
        'project-profile': {
          status: 'completed' as const,
          file: '01-project-profile.md',
          durationMs: 100,
        },
        'architecture-assessment': {
          status: 'completed' as const,
          file: '02-architecture-assessment.md',
          durationMs: 100,
        },
        'quality-audit': {
          status: 'completed' as const,
          file: '03-quality-audit.md',
          durationMs: 100,
        },
        'elevation-plan': {
          status: 'completed' as const,
          file: '04-elevation-plan.md',
          durationMs: 100,
        },
      },
    };

    /**
     * Pull the upsert request payload for a given subject out of a writer
     * mock's call history. Throws (failing the test with a descriptive
     * error) when the call is missing — keeps test bodies free of
     * `!` non-null assertions.
     */
    function callForSubject(
      writer: { upsert: jest.Mock },
      subject: string,
    ): {
      content: string;
      tier: string;
      kind: string;
      pinned: boolean;
      salience: number;
      decayRate: number;
      subject: string;
    } {
      const found = writer.upsert.mock.calls.find(
        ([req]) =>
          (req as { subject: string } | undefined)?.subject === subject,
      );
      if (!found) {
        throw new Error(`No upsert call found for subject='${subject}'`);
      }
      return found[0] as ReturnType<typeof callForSubject>;
    }

    /** Wire the deep-analyze RPC up with a registered writer + happy gating. */
    function seedHarness(
      opts: {
        writer?: { upsert: jest.Mock };
        registerWriter?: boolean;
        fingerprintSource?: 'git' | 'package' | 'path';
        fingerprintFn?: () => Promise<{
          fp: string;
          source: 'git' | 'package' | 'path';
        }>;
        analyzeResult?: {
          isErr: () => boolean;
          value?: unknown;
          error?: Error;
        };
        phaseContents?: Record<string, string>;
      } = {},
    ): {
      h: Harness;
      writer: { upsert: jest.Mock };
      analyzeMock: jest.Mock;
    } {
      const h = makeHarness();
      const writer = opts.writer ?? { upsert: jest.fn() };
      const registerWriter = opts.registerWriter ?? true;
      const phaseContents = opts.phaseContents ?? {
        'project-profile': PROJECT_PROFILE_FIXTURE,
        'architecture-assessment': '## Architecture\n\nHexagonal.\n',
        'quality-audit': QUALITY_AUDIT_FIXTURE,
        'elevation-plan': KEY_FILES_FIXTURE,
      };
      const analyzeMock = jest.fn().mockResolvedValue(
        opts.analyzeResult ?? {
          isErr: () => false,
          value: MANIFEST,
        },
      );

      // MCP gating service. Token name per vscode-core/src/di/tokens.ts.
      h.container.__register(Symbol.for('CodeExecutionMCP'), {
        getPort: () => 9999,
      });

      // Multi-phase service.
      h.container.__register(
        AGENT_GENERATION_TOKENS.MULTI_PHASE_ANALYSIS_SERVICE,
        { analyzeWorkspace: analyzeMock },
      );

      // Storage service — returns the per-phase fixture content and builds
      // the wire response exactly as the real `toResponse` does.
      h.container.__register(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE, {
        getSlugDir: jest.fn().mockReturnValue('/fake/slug/dir'),
        readPhaseFile: jest
          .fn()
          .mockImplementation(async (_dir: string, file: string) => {
            // Map manifest file → phase id → fixture.
            const phaseByFile: Record<string, string> = {
              '01-project-profile.md': 'project-profile',
              '02-architecture-assessment.md': 'architecture-assessment',
              '03-quality-audit.md': 'quality-audit',
              '04-elevation-plan.md': 'elevation-plan',
            };
            const phaseId = phaseByFile[file];
            return phaseId ? (phaseContents[phaseId] ?? null) : null;
          }),
        toResponse: jest.fn(
          (
            slugDir: string,
            manifest: typeof MANIFEST,
            contents: Record<string, string>,
          ) => ({
            isMultiPhase: true,
            manifest,
            phaseContents: contents,
            analysisDir: slugDir,
          }),
        ),
      });

      // FileSystemProvider — only consulted by deriveWorkspaceFingerprint,
      // which is itself mocked. Register a stub anyway.
      h.container.__register(Symbol.for('PlatformFileSystemProvider'), {
        readFile: jest.fn().mockResolvedValue(''),
      });

      // Memory writer port registration (test 12 omits this).
      if (registerWriter) {
        h.container.__register(Symbol.for('PlatformMemoryWriter'), writer);
      }

      // Mock fingerprint outcome.
      const mc = jest.requireMock('@ptah-extension/memory-curator') as {
        deriveWorkspaceFingerprint: jest.Mock;
      };
      mc.deriveWorkspaceFingerprint.mockReset();
      if (opts.fingerprintFn) {
        mc.deriveWorkspaceFingerprint.mockImplementation(opts.fingerprintFn);
      } else {
        mc.deriveWorkspaceFingerprint.mockResolvedValue({
          fp: '0123456789abcdef',
          source: opts.fingerprintSource ?? 'git',
        });
      }

      return { h, writer, analyzeMock };
    }

    // -- Test 11 ----------------------------------------------------------
    it('[seed-success-path] writes 3 entries and emits "Seeded 3 memory entries" info log', async () => {
      const upsert = jest
        .fn()
        .mockResolvedValueOnce({ status: 'inserted', id: 'a' })
        .mockResolvedValueOnce({ status: 'inserted', id: 'b' })
        .mockResolvedValueOnce({ status: 'inserted', id: 'c' });
      const { h, writer } = seedHarness({ writer: { upsert } });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:deep-analyze', {});

      expect(response.success).toBe(true);
      expect(writer.upsert).toHaveBeenCalledTimes(3);
      const seedLog = h.logger.info.mock.calls.find(([msg]) =>
        String(msg).startsWith('[SetupWizard] Seeded 3 memory entries'),
      );
      expect(seedLog).toBeDefined();
      expect(seedLog?.[1]).toMatchObject({
        inserted: 3,
        replaced: 0,
        unchanged: 0,
        fingerprintSource: 'git',
      });
    });

    // -- Test 12 ----------------------------------------------------------
    it('[seed-skipped-no-writer] logs skip line when MEMORY_WRITER token is unregistered', async () => {
      const { h, writer } = seedHarness({ registerWriter: false });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:deep-analyze', {});

      expect(response.success).toBe(true);
      expect(writer.upsert).not.toHaveBeenCalled();
      const skipLog = h.logger.info.mock.calls.find(
        ([msg]) =>
          String(msg) ===
          '[SetupWizard] Memory seeding skipped (store unavailable)',
      );
      expect(skipLog).toBeDefined();
    });

    // -- Test 13 ----------------------------------------------------------
    it('[seed-non-fatal-on-throw] continues after a per-entry failure and logs warn with subject', async () => {
      const upsert = jest
        .fn()
        .mockResolvedValueOnce({ status: 'inserted', id: 'a' })
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ status: 'inserted', id: 'c' });
      const { h, writer } = seedHarness({ writer: { upsert } });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:deep-analyze', {});

      expect(response.success).toBe(true);
      expect(writer.upsert).toHaveBeenCalledTimes(3);
      const warnCall = h.logger.warn.mock.calls.find(
        ([msg, ctx]) =>
          msg === '[SetupWizard] Memory seeding failed (non-fatal)' &&
          (ctx as { subject?: string } | undefined)?.subject ===
            'code-conventions',
      );
      expect(warnCall).toBeDefined();
    });

    // -- Test 14 ----------------------------------------------------------
    it('[content-builder-project-profile] extracts Type / Frameworks / Source lines from real markdown', async () => {
      const upsert = jest
        .fn()
        .mockResolvedValue({ status: 'inserted', id: 'x' });
      const { h, writer } = seedHarness({ writer: { upsert } });
      h.handlers.register();

      await callRaw(h, 'wizard:deep-analyze', {});

      const projectProfileCall = callForSubject(writer, 'project-profile');
      const content = projectProfileCall.content;
      expect(content).toContain('## Project Profile');
      expect(content).toContain('Type: Acme Web Platform');
      expect(content).toMatch(/^Frameworks: NestJS, Angular, RxJS/m);
      expect(content).toContain('Monorepo: Nx 22');
      expect(content).toMatch(/^Tech stack: TypeScript/m);
      expect(content).toContain('Architecture patterns: ');
      expect(content).toContain(
        'Source: .ptah/analysis/acme-platform/01-project-profile.md',
      );
    });

    // -- Test 15 ----------------------------------------------------------
    it('[content-builder-code-conventions] extracts bullets from quality-audit; missing-section yields fallback', async () => {
      // Happy path — bullets from quality-audit fixture.
      {
        const upsert = jest
          .fn()
          .mockResolvedValue({ status: 'inserted', id: 'x' });
        const { h, writer } = seedHarness({ writer: { upsert } });
        h.handlers.register();

        await callRaw(h, 'wizard:deep-analyze', {});

        const content = callForSubject(writer, 'code-conventions').content;
        expect(content).toContain('## Code Conventions');
        expect(content).toContain('Use `unknown` in catch clauses');
        // The "validate input with zod" bullet — contains 'z', guards against
        // the \z regex regression (truncation at first 'z' in section body).
        expect(content).toContain('Validate external input with zod');
        // Bullets 3–5 appear after 'z' in the fixture; asserting them catches
        // any future \z-class regex regression immediately.
        expect(content).toContain('Inject by token through tsyringe');
        expect(content).toContain('Prefer Observable');
        expect(content).toContain('Always use prepared statements');
        // Source line uses actual slug from manifest, not literal '<slug>'.
        expect(content).toContain(
          'Source: .ptah/analysis/acme-platform/03-quality-audit.md',
        );
      }

      // EOF-anchor guard — ## Code Conventions is the LAST section in the
      // document (no following heading). This fixture would return null with
      // the old \z anchor; with the fixed $ anchor all bullets are extracted.
      {
        const terminalSectionFixture = `# Quality Audit

## Overall Score
Score: 90 / 100

## Code Conventions
- Use \`unknown\` in catch clauses; never \`any\`
- Validate external input with zod at boundaries
- Inject by token through tsyringe, never by class`;

        const upsert = jest
          .fn()
          .mockResolvedValue({ status: 'inserted', id: 'x' });
        const { h, writer } = seedHarness({
          writer: { upsert },
          phaseContents: {
            'project-profile': PROJECT_PROFILE_FIXTURE,
            'architecture-assessment': '## Architecture\n\nHexagonal.\n',
            'quality-audit': terminalSectionFixture,
            'elevation-plan': '',
          },
        });
        h.handlers.register();

        await callRaw(h, 'wizard:deep-analyze', {});

        const content = callForSubject(writer, 'code-conventions').content;
        expect(content).toContain('## Code Conventions');
        // All three bullets must be extracted even though Code Conventions is
        // the terminal section with no trailing heading.
        expect(content).toContain('Use `unknown` in catch clauses');
        expect(content).toContain('Validate external input with zod');
        expect(content).toContain('Inject by token through tsyringe');
      }

      // Fallback — quality-audit + architecture-assessment both lack the
      // ## Code Conventions section.
      {
        const upsert = jest
          .fn()
          .mockResolvedValue({ status: 'inserted', id: 'x' });
        const { h, writer } = seedHarness({
          writer: { upsert },
          phaseContents: {
            'project-profile': PROJECT_PROFILE_FIXTURE,
            'architecture-assessment': '## Architecture\n\nNothing.\n',
            'quality-audit': '## Findings\nNo conventions section.\n',
            'elevation-plan': '',
          },
        });
        h.handlers.register();

        await callRaw(h, 'wizard:deep-analyze', {});

        const content = callForSubject(writer, 'code-conventions').content;
        expect(content).toContain('(not detected — see analysis files)');
      }
    });

    // -- Test 16 ----------------------------------------------------------
    it('[content-builder-key-files] categorises paths, caps at 2 KB, falls back to (none detected)', async () => {
      // Happy path — KEY_FILES_FIXTURE provides paths.
      {
        const upsert = jest
          .fn()
          .mockResolvedValue({ status: 'inserted', id: 'x' });
        const { h, writer } = seedHarness({ writer: { upsert } });
        h.handlers.register();

        await callRaw(h, 'wizard:deep-analyze', {});

        const content = callForSubject(writer, 'key-files').content;
        expect(content).toContain('## Key File Locations');
        expect(content).toContain('Source: .ptah/analysis/acme-platform/');
        expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(2048);
        // At least entry points + configs should be detected.
        expect(content).toMatch(/Entry points: /);
        expect(content).toMatch(/Configs: /);
      }

      // 2 KB cap & per-category truncation: build a fixture with 30 paths
      // categorised as Components.
      {
        const manyPaths = Array.from(
          { length: 30 },
          (_, i) => `src/app/components/widget-${i}.component.ts`,
        );
        const huge =
          '## Key Files\n' +
          manyPaths.map((p) => `- \`${p}\``).join('\n') +
          '\n';
        const upsert = jest
          .fn()
          .mockResolvedValue({ status: 'inserted', id: 'x' });
        const { h, writer } = seedHarness({
          writer: { upsert },
          phaseContents: {
            'project-profile': PROJECT_PROFILE_FIXTURE,
            'architecture-assessment': '',
            'quality-audit': '',
            'elevation-plan': huge,
          },
        });
        h.handlers.register();

        await callRaw(h, 'wizard:deep-analyze', {});

        const content = callForSubject(writer, 'key-files').content;
        expect(content).toMatch(/\+14 more/); // 30 - 16 = 14 hidden
        expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(2048);
      }

      // Empty fixture → (none detected).
      {
        const upsert = jest
          .fn()
          .mockResolvedValue({ status: 'inserted', id: 'x' });
        const { h, writer } = seedHarness({
          writer: { upsert },
          phaseContents: {
            'project-profile': '# Empty\n',
            'architecture-assessment': '',
            'quality-audit': '',
            'elevation-plan': '',
          },
        });
        h.handlers.register();

        await callRaw(h, 'wizard:deep-analyze', {});

        const content = callForSubject(writer, 'key-files').content;
        expect(content).toBe('## Key File Locations\n(none detected)');
      }
    });

    // -- Test 17 ----------------------------------------------------------
    it('[key-files-tier-and-pinning] writer call for key-files carries tier=recall, kind=entity, pinned=false', async () => {
      const upsert = jest
        .fn()
        .mockResolvedValue({ status: 'inserted', id: 'x' });
      const { h, writer } = seedHarness({ writer: { upsert } });
      h.handlers.register();

      await callRaw(h, 'wizard:deep-analyze', {});

      const req = callForSubject(writer, 'key-files');
      expect(req).toMatchObject({
        subject: 'key-files',
        tier: 'recall',
        kind: 'entity',
        pinned: false,
        salience: 0.6,
        decayRate: 0.01,
      });
    });

    // -- Test 18 ----------------------------------------------------------
    it('[fingerprint-fallback-logs-warning] emits the path-fallback info log exactly once when source=path', async () => {
      const upsert = jest
        .fn()
        .mockResolvedValue({ status: 'inserted', id: 'x' });
      const { h } = seedHarness({
        writer: { upsert },
        fingerprintSource: 'path',
      });
      h.handlers.register();

      await callRaw(h, 'wizard:deep-analyze', {});

      const fallbackLogs = h.logger.info.mock.calls.filter(
        ([msg]) =>
          String(msg) ===
          '[SetupWizard] Workspace fingerprint falling back to path; memories will not survive moves',
      );
      expect(fallbackLogs).toHaveLength(1);
    });

    // -- Test 19 ----------------------------------------------------------
    it('[seeding-runs-before-response-return] all 3 upserts complete before the response is returned', async () => {
      const events: string[] = [];
      const upsert = jest
        .fn()
        .mockImplementation(async (req: { subject: string }) => {
          events.push(`upsert:${req.subject}`);
          return { status: 'inserted', id: req.subject };
        });
      const { h } = seedHarness({ writer: { upsert } });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:deep-analyze', {});
      events.push('response-returned');

      expect(response.success).toBe(true);
      // The three upserts MUST appear before the response-returned marker.
      expect(events).toEqual([
        'upsert:project-profile',
        'upsert:code-conventions',
        'upsert:key-files',
        'response-returned',
      ]);
    });

    it('[resume-flag] forwards resume: true to MultiPhaseAnalysisService and answers with the storage response', async () => {
      const upsert = jest
        .fn()
        .mockResolvedValue({ status: 'inserted', id: 'x' });
      const { h, analyzeMock } = seedHarness({ writer: { upsert } });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:deep-analyze', {
        resume: true,
      });

      expect(response.success).toBe(true);
      const [, options] = analyzeMock.mock.calls[0] as [
        string,
        { resume?: boolean },
      ];
      expect(options.resume).toBe(true);
      const data = response.data as {
        manifest: { lifecycle: string; runId: string };
        analysisDir: string;
      };
      expect(data.manifest.lifecycle).toBe('completed');
      expect(data.manifest.runId).toBe('run-1');
      expect(data.analysisDir).toBe('/fake/slug/dir');
    });

    it('[fresh-run-default] forwards resume: false when the flag is omitted', async () => {
      const upsert = jest
        .fn()
        .mockResolvedValue({ status: 'inserted', id: 'x' });
      const { h, analyzeMock } = seedHarness({ writer: { upsert } });
      h.handlers.register();

      await callRaw(h, 'wizard:deep-analyze', {});

      const [, options] = analyzeMock.mock.calls[0] as [
        string,
        { resume?: boolean },
      ];
      expect(options.resume).toBe(false);
    });

    // -- Test 20 ----------------------------------------------------------
    it.each([false, true])(
      'passes one Setup snapshot for deep analysis with resume=%s',
      async (resume) => {
        const { h, analyzeMock } = seedHarness();
        h.handlers.register();
        const response = await callRaw(h, 'wizard:deep-analyze', {
          model: 'chat-picker-model',
          resume,
        });
        expect(response.success).toBe(true);
        expect(h.resolveSetup).toHaveBeenCalledTimes(1);
        expect(analyzeMock).toHaveBeenCalledWith(
          WORKSPACE,
          expect.objectContaining({
            setupSnapshot: SNAPSHOT,
            resume,
          }),
        );
        expect(analyzeMock.mock.calls[0][1]).not.toHaveProperty('model');
      },
    );

    it('rejects deep analysis before launching when Setup is invalid', async () => {
      const { h, analyzeMock } = seedHarness();
      h.resolveSetup.mockResolvedValue(INVALID_SETUP);
      h.handlers.register();
      expect(await callRaw(h, 'wizard:deep-analyze')).toMatchObject({
        success: false,
        errorCode: 'SETUP_MODEL_INVALID',
      });
      expect(analyzeMock).not.toHaveBeenCalled();
    });

    it('[seeding-not-fired-on-analysis-failure] writer is never called when analyzeWorkspace returns Err', async () => {
      const upsert = jest.fn();
      const { h } = seedHarness({
        writer: { upsert },
        analyzeResult: {
          isErr: () => true,
          error: new Error('analysis failed'),
        },
      });
      h.handlers.register();

      const response = await callRaw(h, 'wizard:deep-analyze', {});

      expect(response.success).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });
  });
});
