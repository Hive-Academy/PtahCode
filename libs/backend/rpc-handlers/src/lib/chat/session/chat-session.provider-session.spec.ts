import { createFakeDriverLockCoordinator } from '../../../test-utils/fake-driver-lock-coordinator';
/**
 * chat:start on a provider session (P6, B-1): the start uses the plain native
 * config (no Claude plugin roots, no Codex lineage wrapper), clears the
 * pending lineage like Codex, publishes no Codex model notice, and maps a
 * coded adapter failure through `providerSessionFailure`. Harness trimmed
 * from chat-session.native.spec.ts; the Codex cases there are unchanged.
 */
import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMockWorkspaceProvider } from '@ptah-extension/platform-core/testing';
jest.mock('@ptah-extension/workspace-intelligence', () => ({
  ProjectType: {},
  Framework: {},
  MonorepoType: {},
  FileType: {},
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

import { ProviderSessionChatAdapterError } from '@ptah-extension/agent-sdk';
import type { AgentSessionStartConfig } from '@ptah-extension/shared';
import { ChatSessionService } from './chat-session.service';
import type { ResolvedChatExecution } from './chat-runtime-profile.service';

const workspace = mkdtempSync(join(tmpdir(), 'ptah-ps-start-'));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

const execution: ResolvedChatExecution = {
  runtime: 'provider-session',
  seed: {
    providerId: 'antigravity-cli',
    profile: 'antigravity',
    consumer: 'chat',
    workspacePath: workspace,
    workspaceId: workspace,
    model: 'gemini-pro',
  },
  workspacePath: workspace,
  cwd: workspace,
  config: {},
};

function harness() {
  const pendingLineage = new Map<
    string,
    { executionRoot: string; roots: readonly string[] }
  >();
  const withCodexStartLineage = jest.fn(
    <T>(_roots: readonly string[], launch: () => Promise<T>) => launch(),
  );
  const prepare = jest.fn().mockResolvedValue(execution);
  const publishRuntimeNotices = jest.fn().mockResolvedValue(undefined);
  const startChatSession = jest.fn().mockResolvedValue([]);
  const resolveProviderProfileForWorkspace = jest.fn(() => {
    throw new Error('Legacy auth resolution forbidden');
  });
  const service: ChatSessionService = Object.assign(
    Object.create(ChatSessionService.prototype),
    {
      driverLock: createFakeDriverLockCoordinator(),
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      },
      sentryService: { captureException: jest.fn() },
      modelSettings: { selectedModel: { get: () => 'default' } },
      sdkContext: {
        resolveEnhancedPromptsContent: async () => 'instructions',
        isMcpServerRunning: () => false,
      },
      runtimeProfile: { prepare, publishRuntimeNotices },
      sdkAdapter: { startChatSession, isSessionActive: () => false },
      workspaceProviderProfileResolver: { resolveProviderProfileForWorkspace },
      sessionMetadataStore: { get: async () => null, withCodexStartLineage },
      workspaceProvider: createMockWorkspaceProvider({ folders: [workspace] }),
      platformInfo: {
        extensionPath: resolve('/ps-options-app'),
        globalStoragePath: resolve('/ps-options-storage'),
      },
      pendingLineage,
      codeExecutionMcp: { getPort: () => undefined },
      outputStyleActivation: { resolveSessionFields: async () => ({}) },
      streamBroadcaster: { streamEventsToWebview: jest.fn() },
      buildMcpServersOverride: async () => undefined,
    },
  );
  return {
    service,
    prepare,
    publishRuntimeNotices,
    startChatSession,
    resolveProviderProfileForWorkspace,
    pendingLineage,
    withCodexStartLineage,
  };
}

function startChild(h: ReturnType<typeof harness>) {
  const child = mkdtempSync(join(workspace, 'child-'));
  return h.service.startAgentChildSession({
    tabId: 'tab',
    workspaceRoot: workspace,
    worktreePath: child,
    prompt: 'hello',
    sessionName: 'Child',
  });
}

describe('chat:start on a provider session', () => {
  it('starts with the plain native config and the seed model, with no Codex lineage or notice', async () => {
    const h = harness();

    await expect(startChild(h)).resolves.toEqual({ success: true });

    expect(h.startChatSession).toHaveBeenCalledTimes(1);
    const started = h.startChatSession.mock
      .calls[0][0] as AgentSessionStartConfig;
    expect(started).toMatchObject({
      runtime: 'provider-session',
      model: 'gemini-pro',
      prompt: 'hello',
    });
    expect(started.pluginConfigAncestorRoots).toBeUndefined();
    expect(started).not.toHaveProperty('providerProfile');
    expect(h.withCodexStartLineage).not.toHaveBeenCalled();
    expect(h.publishRuntimeNotices).not.toHaveBeenCalled();
    expect(h.resolveProviderProfileForWorkspace).not.toHaveBeenCalled();
  });

  it('clears pending lineage after the native start owns its stream', async () => {
    const h = harness();

    await startChild(h);

    expect(h.pendingLineage.has('tab')).toBe(false);
  });

  it('returns the coded PROVIDER_SESSION_LIMIT failure and clears lineage', async () => {
    const h = harness();
    h.startChatSession.mockRejectedValue(
      new ProviderSessionChatAdapterError('limit', 'open'),
    );

    await expect(startChild(h)).resolves.toEqual({
      success: false,
      error: 'Too many provider sessions are open. Close one and try again.',
      errorCode: 'PROVIDER_SESSION_LIMIT',
    });
    expect(h.pendingLineage.has('tab')).toBe(false);
  });

  it('returns the auth-required result with the sign-in hint', async () => {
    const h = harness();
    h.startChatSession.mockRejectedValue(
      new ProviderSessionChatAdapterError('auth-required', 'open', {
        providerId: 'antigravity-cli',
        signInHint: 'Run agy once and sign in.',
      }),
    );

    await expect(startChild(h)).resolves.toEqual({
      success: false,
      error: 'Run agy once and sign in.',
      errorCode: 'AUTH_REQUIRED',
      providerId: 'antigravity-cli',
    });
  });
});
