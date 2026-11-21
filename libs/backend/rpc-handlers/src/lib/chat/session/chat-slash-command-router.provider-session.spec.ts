import 'reflect-metadata';
/**
 * Follow-up slash commands on a provider session (P6, B-1): `/compact` is
 * refused as unsupported before any reservation or adapter call; other
 * commands relaunch through the adapter with the seed model and no Codex
 * notice; a coded adapter failure keeps its PROVIDER_SESSION_* code. The
 * Codex cases live unchanged in chat-slash-command-router.native.spec.ts.
 */
// The CLI runtime barrel reaches the ESM TreeSitter bundle during this CJS Jest run.
jest.mock('@ptah-extension/workspace-intelligence', () => ({
  ProjectType: {}, Framework: {}, MonorepoType: {}, FileType: {},
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
import type { SessionId, SessionRuntimeIdentity } from '@ptah-extension/shared';
import {
  ChatSlashCommandRouterService,
  PROVIDER_SESSION_COMPACT_UNSUPPORTED,
} from './chat-slash-command-router.service';
import type { ResolvedChatExecution } from './chat-runtime-profile.service';

const sessionId = 'provider-session' as SessionId;
const identity: SessionRuntimeIdentity = {
  version: 1,
  sessionId,
  runtime: 'provider-session',
  providerId: 'antigravity-cli',
  workspaceId: '/workspace',
  providerSession: { profile: 'antigravity' },
};
const execution: ResolvedChatExecution = {
  runtime: 'provider-session',
  seed: {
    providerId: 'antigravity-cli',
    profile: 'antigravity',
    consumer: 'chat',
    workspacePath: '/workspace',
    workspaceId: '/workspace',
    model: 'gemini-pro',
  },
  workspacePath: '/workspace',
  cwd: '/workspace',
  config: {},
};

function harness(commandName: string) {
  const prepare = jest.fn().mockResolvedValue(execution);
  const publishRuntimeNotices = jest.fn().mockResolvedValue(undefined);
  const compact = jest.fn().mockResolvedValue(undefined);
  const executeSlashCommand = jest.fn().mockResolvedValue([]);
  const resumeSession = jest.fn().mockResolvedValue([]);
  const streamEventsToWebview = jest.fn();
  const admitManualCompact = jest.fn().mockReturnValue({
    decision: { action: 'send' },
    reservationId: 'reservation',
  });
  const requestManualCompact = jest.fn(() => ({ action: 'send' }));
  const releaseManualReservation = jest.fn();
  const service: ChatSlashCommandRouterService = Object.assign(
    Object.create(ChatSlashCommandRouterService.prototype),
    {
      logger: { info: jest.fn(), warn: jest.fn() },
      modelSettings: { selectedModel: { get: () => 'default' } },
      sdkAdapter: {
        executeSlashCommand,
        resumeSession,
        interruptSession: jest.fn(),
        isSessionActive: () => false,
      },
      nativeAdapter: null,
      webviewManager: { broadcastMessage: jest.fn() },
      slashCommandInterceptor: {
        intercept: () => ({
          action: 'new-query',
          commandName,
          rawCommand: '/' + commandName,
        }),
      },
      sdkContext: {
        isMcpServerRunning: () => false,
        resolveEnhancedPromptsContent: async () => 'instructions',
      },
      streamBroadcaster: { streamEventsToWebview },
      workspaceProviderProfileResolver: {
        resolveProviderProfileForWorkspace: jest.fn(() => {
          throw new Error('Old resolver must not run');
        }),
      },
      metadata: { get: async () => ({ providerSessionExecution: identity }) },
      runtimeProfile: { prepare, publishRuntimeNotices },
      runtimeControls: { compact },
      manualCompactAdmission: {
        requestManualCompact,
        admitManualCompact,
        releaseManualReservation,
      },
    },
  );
  const route = () =>
    service.routeFollowUpSlashCommand(
      '/' + commandName,
      sessionId,
      'tab',
      '/workspace',
      { prompt: '/' + commandName, sessionId, tabId: 'tab' },
    );
  return {
    route,
    prepare,
    publishRuntimeNotices,
    compact,
    executeSlashCommand,
    resumeSession,
    streamEventsToWebview,
    admitManualCompact,
    releaseManualReservation,
  };
}

describe('provider-session slash routing', () => {
  it('refuses /compact as unsupported before any reservation or adapter call', async () => {
    const h = harness('compact');

    await expect(h.route()).resolves.toEqual({
      success: false,
      sessionId,
      errorCode: 'PROVIDER_SESSION_UNSUPPORTED_OPTION',
      error: PROVIDER_SESSION_COMPACT_UNSUPPORTED,
    });
    expect(h.prepare).toHaveBeenCalledWith(
      expect.any(Object),
      identity,
      true,
    );
    expect(h.admitManualCompact).not.toHaveBeenCalled();
    expect(h.compact).not.toHaveBeenCalled();
    expect(h.resumeSession).not.toHaveBeenCalled();
    expect(h.executeSlashCommand).not.toHaveBeenCalled();
  });

  it('relaunches another command with the seed model and no Codex notice', async () => {
    const h = harness('review');

    await expect(h.route()).resolves.toEqual({ success: true, sessionId });

    expect(h.executeSlashCommand).toHaveBeenCalledTimes(1);
    const [, command, options] = h.executeSlashCommand.mock.calls[0];
    expect(command).toBe('/review');
    expect(options.sessionConfig.model).toBe('gemini-pro');
    expect(options).not.toHaveProperty('providerProfile');
    expect(h.streamEventsToWebview).toHaveBeenCalledTimes(1);
    expect(h.publishRuntimeNotices).not.toHaveBeenCalled();
  });

  it.each([
    ['busy', 'PROVIDER_SESSION_BUSY'],
    ['unavailable', 'PROVIDER_SESSION_UNAVAILABLE'],
    ['runtime-failed', 'PROVIDER_SESSION_RUNTIME_FAILED'],
  ] as const)('maps a %s adapter failure to %s', async (code, errorCode) => {
    const h = harness('review');
    h.executeSlashCommand.mockRejectedValue(
      new ProviderSessionChatAdapterError(code, 'slash', {
        cause: new Error('/home/dev/private'),
      }),
    );

    const result = await h.route();

    expect(result).toMatchObject({ success: false, sessionId, errorCode });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(h.streamEventsToWebview).not.toHaveBeenCalled();
  });
});
