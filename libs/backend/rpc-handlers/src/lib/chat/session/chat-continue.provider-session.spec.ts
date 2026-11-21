import { createFakeDriverLockCoordinator } from '../../../test-utils/fake-driver-lock-coordinator';
/**
 * chat:continue refuses a stored provider-session session up front with
 * PROVIDER_SESSION_UNAVAILABLE, before the driver lock or any resume call
 * (review FM-4). P6 replaces the refusal with the provider-session path.
 * Harness derived from chat-continue-codex-resume-once.spec.ts; only the
 * prepared execution differs.
 */

import 'reflect-metadata';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

import type { ChatContinueParams, SessionId } from '@ptah-extension/shared';
import { ChatSessionService } from './chat-session.service';

// A real folder: the merged session-folder check resolves it on disk.
const OPEN_FOLDER = mkdtempSync(join(tmpdir(), 'ptah-ps-continue-'));
afterAll(() => rmSync(OPEN_FOLDER, { recursive: true, force: true }));
const SESSION_ID = 'b5399ba8-e06d-417c-bac4-aba5add0555c' as SessionId;
const TAB_ID = 'f69cb197-0798-40bc-ac0c-6f7591e0a894';
const FILES = ['src/main.ts'];
const IMAGES = [{ data: 'aGVsbG8=', mediaType: 'image/png' }];

interface Harness {
  service: ChatSessionService;
  resumeSession: jest.Mock;
  sendMessageToSession: jest.Mock;
  routeFollowUpSlashCommand: jest.Mock;
  streamEventsToWebview: jest.Mock;
  admitUserTurn: jest.Mock;
  startStream: () => void;
  completeStream: () => void;
}

function emptyStream() {
  return (async function* () {
    /* no events */
  })();
}

function harness(
  runtime: 'codex-app-server' | 'claude-sdk',
  live: boolean,
  streaming = live,
): Harness {
  const resumeSession = jest.fn().mockResolvedValue(emptyStream());
  const sendMessageToSession = jest.fn().mockResolvedValue(undefined);
  const routeFollowUpSlashCommand = jest.fn().mockResolvedValue(null);
  const admitUserTurn = jest.fn();
  let streamAttached = streaming;
  const streamEventsToWebview = jest.fn(() => {
    streamAttached = true;
    if (runtime === 'codex-app-server') streamAttached = false;
    return Promise.resolve();
  });
  const prepare = jest.fn(async (config: object) => ({
    runtime: 'provider-session' as const,
    seed: {
      providerId: 'antigravity-cli',
      profile: 'antigravity' as const,
      consumer: 'chat' as const,
      workspacePath: OPEN_FOLDER,
      workspaceId: OPEN_FOLDER,
    },
    workspacePath: OPEN_FOLDER,
    cwd: OPEN_FOLDER,
    config,
  }));
  const service: ChatSessionService = Object.assign(
    Object.create(ChatSessionService.prototype),
    {
      driverLock: createFakeDriverLockCoordinator(),
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      ptahCli: {
        handleContinue: async () => ({ error: '__NOT_PTAH_CLI__' }),
      },
      sessionMetadataStore: { get: async () => null },
      subagentRegistry: {
        isResumeStateHydrated: () => true,
        getInterruptedBySession: () => [],
      },
      historyRead: { resolveSessionFolder: async () => OPEN_FOLDER },
      sdkContext: {
        isMcpServerRunning: () => false,
        resolveEnhancedPromptsContent: async () => undefined,
      },
      codeExecutionMcp: { getPort: () => 0 },
      sdkAdapter: {
        isSessionActive: () => live,
        resumeSession,
        sendMessageToSession,
        interruptSession: jest.fn().mockResolvedValue(undefined),
        interruptCurrentTurn: jest.fn().mockResolvedValue(true),
      },
      streamBroadcaster: {
        isStreaming: () => streamAttached,
        streamEventsToWebview,
      },
      sessionRuntimeRouter: {
        acceptsFollowUpWithoutStream: () =>
          runtime === 'codex-app-server' && live,
      },
      runtimeProfile:
        runtime === 'codex-app-server'
          ? {
              prepare,
              publishRuntimeNotices: jest.fn().mockResolvedValue(undefined),
            }
          : undefined,
      workspaceProviderProfileResolver: {
        resolveStoredModel: (_workspace: string, model: string) =>
          model || 'default',
        resolveProviderProfileForWorkspace: async () => undefined,
      },
      outputStyleActivation: { resolveSessionFields: async () => ({}) },
      modelSettings: { selectedModel: { get: () => 'default' } },
      workspaceProvider: createMockWorkspaceProvider({
        folders: [OPEN_FOLDER],
      }),
      platformInfo: {
        type: 'cli',
        extensionPath: join(tmpdir(), 'ptah-app'),
        globalStoragePath: join(tmpdir(), 'ptah-storage'),
      },
      slashCommandRouter: { routeFollowUpSlashCommand },
      subagentContextInjector: {
        injectInterruptedAgentsContext: async (prompt: string) => ({
          prompt,
          injected: false,
          commit: async () => undefined,
          release: () => undefined,
        }),
      },
      sentryService: { captureException: jest.fn() },
      hostRouting: { admitUserTurn },
    },
  );
  return {
    service,
    resumeSession,
    sendMessageToSession,
    routeFollowUpSlashCommand,
    streamEventsToWebview,
    admitUserTurn,
    startStream: () => {
      streamAttached = true;
    },
    completeStream: () => {
      streamAttached = false;
    },
  };
}

function params(prompt: string): ChatContinueParams {
  return {
    prompt,
    sessionId: SESSION_ID,
    tabId: TAB_ID,
    workspacePath: OPEN_FOLDER,
    files: FILES,
    images: IMAGES,
  };
}

describe('chat:continue with a stored provider-session session', () => {
  it('refuses with PROVIDER_SESSION_UNAVAILABLE before any resume', async () => {
    const h = harness('codex-app-server', false);

    const result = await h.service.continueSession(params('follow up'));

    expect(result).toMatchObject({
      success: false,
      sessionId: SESSION_ID,
      errorCode: 'PROVIDER_SESSION_UNAVAILABLE',
      error: 'Provider-session chat is not available on this host.',
    });
    expect(h.resumeSession).not.toHaveBeenCalled();
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
    expect(h.streamEventsToWebview).not.toHaveBeenCalled();
  });
});
