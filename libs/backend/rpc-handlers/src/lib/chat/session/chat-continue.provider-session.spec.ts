import { createFakeDriverLockCoordinator } from '../../../test-utils/fake-driver-lock-coordinator';
/**
 * chat:continue on a stored provider session takes the native resume path
 * (P6, B-1): the resume starts the turn with prompt and attachments, a queued
 * follow-up is committed before and accepted after the resume, the Claude
 * plugin roots are not passed, Codex model notices are not published, and a
 * coded adapter failure keeps its PROVIDER_SESSION_* code. Harness derived
 * from chat-continue-codex-resume-once.spec.ts; only the prepared execution
 * differs.
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
import { ProviderSessionChatAdapterError } from '@ptah-extension/agent-sdk';
import { ChatSessionService } from './chat-session.service';

// A real folder: the merged session-folder check resolves it on disk.
const OPEN_FOLDER = mkdtempSync(join(tmpdir(), 'ptah-ps-continue-'));
afterAll(() => rmSync(OPEN_FOLDER, { recursive: true, force: true }));
const SESSION_ID = 'b5399ba8-e06d-417c-bac4-aba5add0555c' as SessionId;
const TAB_ID = 'f69cb197-0798-40bc-ac0c-6f7591e0a894';
const CLIENT_ID = 'client-message-1';
const FILES = ['src/main.ts'];
const IMAGES = [{ data: 'aGVsbG8=', mediaType: 'image/png' }];

function emptyStream() {
  return (async function* () {
    /* no events */
  })();
}

/** Every queue method is a spy that answers `undefined`. */
function fakeFollowUpQueue(): Record<string, jest.Mock> {
  const methods: Record<string, jest.Mock> = {};
  return new Proxy(methods, {
    get: (target, key: string) => (target[key] ??= jest.fn()),
  });
}

function harness(options: { metadata?: object | null } = {}) {
  const resumeSession = jest.fn().mockResolvedValue(emptyStream());
  const sendMessageToSession = jest.fn().mockResolvedValue(undefined);
  const routeFollowUpSlashCommand = jest.fn().mockResolvedValue(null);
  const admitUserTurn = jest.fn();
  const publishRuntimeNotices = jest.fn().mockResolvedValue(undefined);
  const upgradeLegacyPluginConfigAncestorRoots = jest.fn();
  const followUpQueue = fakeFollowUpQueue();
  const streamEventsToWebview = jest.fn(() => Promise.resolve());
  const prepare = jest.fn(async (config: object) => ({
    runtime: 'provider-session' as const,
    seed: {
      providerId: 'antigravity-cli',
      profile: 'antigravity' as const,
      consumer: 'chat' as const,
      workspacePath: OPEN_FOLDER,
      workspaceId: OPEN_FOLDER,
      model: 'gemini-pro',
    },
    workspacePath: OPEN_FOLDER,
    cwd: OPEN_FOLDER,
    config,
  }));
  const service: ChatSessionService = Object.assign(
    Object.create(ChatSessionService.prototype),
    {
      driverLock: createFakeDriverLockCoordinator(),
      followUpQueue,
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      ptahCli: {
        hasSession: () => false,
        handleContinue: async () => ({ error: '__NOT_PTAH_CLI__' }),
      },
      sessionMetadataStore: {
        get: async () => options.metadata ?? null,
        upgradeLegacyPluginConfigAncestorRoots,
      },
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
        isSessionActive: () => false,
        resumeSession,
        sendMessageToSession,
        interruptSession: jest.fn().mockResolvedValue(undefined),
        interruptCurrentTurn: jest.fn().mockResolvedValue(true),
      },
      streamBroadcaster: {
        isStreaming: () => false,
        streamEventsToWebview,
      },
      sessionRuntimeRouter: { acceptsFollowUpWithoutStream: () => false },
      runtimeProfile: { prepare, publishRuntimeNotices },
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
    streamEventsToWebview,
    admitUserTurn,
    publishRuntimeNotices,
    upgradeLegacyPluginConfigAncestorRoots,
    followUpQueue,
  };
}

function params(
  prompt: string,
  extra: Partial<ChatContinueParams> = {},
): ChatContinueParams {
  return {
    prompt,
    sessionId: SESSION_ID,
    tabId: TAB_ID,
    workspacePath: OPEN_FOLDER,
    files: FILES,
    images: IMAGES,
    ...extra,
  };
}

describe('chat:continue with a stored provider session', () => {
  it('resumes once with prompt, files and images, and sends nothing more', async () => {
    const h = harness();

    const result = await h.service.continueSession(params('follow up'));

    expect(result).toEqual({
      success: true,
      sessionId: SESSION_ID,
      settled: true,
    });
    expect(h.resumeSession).toHaveBeenCalledTimes(1);
    const [, config] = h.resumeSession.mock.calls[0];
    expect(config).toMatchObject({
      prompt: 'follow up',
      files: FILES,
      images: IMAGES,
      model: 'gemini-pro',
    });
    // Native runtimes never take Claude plugin-config roots.
    expect(config.pluginConfigAncestorRoots).toBeUndefined();
    expect(config.providerProfile).toBeUndefined();
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
    expect(h.streamEventsToWebview).toHaveBeenCalledTimes(1);
    expect(h.admitUserTurn).toHaveBeenCalledTimes(1);
    // Model-substitution notices are Codex-only.
    expect(h.publishRuntimeNotices).not.toHaveBeenCalled();
  });

  it('resumes an attachment-only follow-up as exactly one turn', async () => {
    const h = harness();

    await expect(h.service.continueSession(params(''))).resolves.toEqual({
      success: true,
      sessionId: SESSION_ID,
      settled: true,
    });
    expect(h.resumeSession).toHaveBeenCalledTimes(1);
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('commits a queued follow-up before the resume and accepts it after', async () => {
    const h = harness();

    const result = await h.service.continueSession(
      params('queued', { queueIntent: 'next-turn', clientMessageId: CLIENT_ID }),
    );

    expect(result).toMatchObject({
      success: true,
      sessionId: SESSION_ID,
      queueState: 'admitted',
    });
    const commit = h.followUpQueue['commitAdmission'];
    const accept = h.followUpQueue['acceptResumed'];
    expect(commit).toHaveBeenCalledWith(SESSION_ID, CLIENT_ID);
    expect(accept).toHaveBeenCalledWith(SESSION_ID, TAB_ID, CLIENT_ID);
    expect(commit.mock.invocationCallOrder[0]).toBeLessThan(
      h.resumeSession.mock.invocationCallOrder[0],
    );
    expect(h.resumeSession.mock.invocationCallOrder[0]).toBeLessThan(
      accept.mock.invocationCallOrder[0],
    );
    expect(h.followUpQueue['rejectAdmission']).not.toHaveBeenCalled();
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('maps a resume-failed adapter error to PROVIDER_SESSION_RESUME_FAILED and rejects the follow-up', async () => {
    const h = harness();
    h.resumeSession.mockRejectedValue(
      new ProviderSessionChatAdapterError('resume-failed', 'resume', {
        cause: new Error('C:/Users/dev/secret path'),
      }),
    );

    const result = await h.service.continueSession(
      params('queued', { queueIntent: 'next-turn', clientMessageId: CLIENT_ID }),
    );

    expect(result).toMatchObject({
      success: false,
      errorCode: 'PROVIDER_SESSION_RESUME_FAILED',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(h.followUpQueue['rejectAdmission']).toHaveBeenCalledWith(
      SESSION_ID,
      TAB_ID,
      CLIENT_ID,
      'SESSION_CHANGED',
    );
    expect(h.followUpQueue['acceptResumed']).not.toHaveBeenCalled();
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('maps a cancelled resume to a cancelled result with no error text', async () => {
    const h = harness();
    h.resumeSession.mockRejectedValue(
      new ProviderSessionChatAdapterError('cancelled', 'resume'),
    );

    const result = await h.service.continueSession(params('follow up'));

    expect(result).toMatchObject({ success: false, cancelled: true });
    expect(result).not.toHaveProperty('error');
  });

  it('does not upgrade legacy plugin lineage on a provider-session row', async () => {
    const h = harness({
      metadata: {
        sessionId: SESSION_ID,
        name: 'native',
        workspaceId: OPEN_FOLDER,
        workingDirectory: OPEN_FOLDER,
        createdAt: 1,
        lastActiveAt: 1,
        totalCost: 0,
        totalTokens: { input: 0, output: 0 },
        providerSessionExecution: {
          version: 1,
          sessionId: SESSION_ID,
          runtime: 'provider-session',
          providerId: 'antigravity-cli',
          workspaceId: OPEN_FOLDER,
          providerSession: { profile: 'antigravity' },
        },
      },
    });

    await h.service.continueSession(params('follow up'));

    expect(h.resumeSession).toHaveBeenCalledTimes(1);
    expect(h.upgradeLegacyPluginConfigAncestorRoots).not.toHaveBeenCalled();
  });
});
