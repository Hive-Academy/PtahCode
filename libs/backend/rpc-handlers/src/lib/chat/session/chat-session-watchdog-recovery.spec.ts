/**
 * `ChatSessionService.recoverAfterWatchdogStop` (TASK_2026_2288 C): the chat
 * side of the one automatic retry after a no-activity watchdog stop. The
 * method is exercised on a minimal receiver, so each collaborator it uses is
 * explicit here.
 */
import 'reflect-metadata';

// Same stub as chat-session-session-folder.spec: the barrel pulls a module
// that ts-jest's CJS transform cannot parse.
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

import { ChatSessionService } from './chat-session.service';

type Recover = ChatSessionService['recoverAfterWatchdogStop'];

const INPUT = {
  sessionId: 'sdk-successor',
  tabId: 'tab-successor',
  prompt: 'Ptah recovery: continue',
  senderName: 'Ptah recovery',
  endedAt: 1_000,
} as const;

function receiver(overrides: Record<string, unknown> = {}) {
  const sendMessageToSession = jest.fn(async () => undefined);
  const self = {
    followUpQueue: { stoppedSince: jest.fn(() => false) },
    hasLiveSessionStream: jest.fn(() => false),
    historyRead: {
      resolveSessionFolder: jest.fn(async () => '/work/tree'),
    },
    ensureSessionActiveForRewind: jest.fn(async () => ({ resumed: true })),
    sdkAdapter: { sendMessageToSession },
    logger: { info: jest.fn(), warn: jest.fn() },
    ...overrides,
  };
  const recover: Recover = (input) =>
    ChatSessionService.prototype.recoverAfterWatchdogStop.call(
      self as unknown as ChatSessionService,
      input,
    );
  return { self, recover, sendMessageToSession };
}

describe('ChatSessionService.recoverAfterWatchdogStop (TASK_2026_2288 C)', () => {
  it('resumes in the session folder and sends the prompt with a peer origin', async () => {
    const r = receiver();
    await expect(r.recover(INPUT)).resolves.toEqual({ recovered: true });

    expect(r.self.ensureSessionActiveForRewind).toHaveBeenCalledWith(
      INPUT.sessionId,
      INPUT.tabId,
      '/work/tree',
    );
    expect(r.sendMessageToSession).toHaveBeenCalledWith(
      INPUT.sessionId,
      INPUT.prompt,
      { origin: { kind: 'peer', from: 'ptah', name: 'Ptah recovery' } },
    );
  });

  it('leaves a session alone that is live again', async () => {
    const r = receiver({ hasLiveSessionStream: jest.fn(() => true) });
    await expect(r.recover(INPUT)).resolves.toEqual({
      recovered: false,
      reason: 'already-active',
    });
    expect(r.self.ensureSessionActiveForRewind).not.toHaveBeenCalled();
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('does not resume a session stopped after the watchdog end (tab close)', async () => {
    const r = receiver({
      followUpQueue: {
        stoppedSince: jest.fn((id: string, at: number) => id === INPUT.tabId && at === 1_000),
      },
    });
    await expect(r.recover(INPUT)).resolves.toEqual({ recovered: false, reason: 'stopped' });
    expect(r.self.ensureSessionActiveForRewind).not.toHaveBeenCalled();
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('sends nothing when the session is stopped during the resume', async () => {
    let stopped = false;
    const r = receiver({
      followUpQueue: { stoppedSince: jest.fn(() => stopped) },
      ensureSessionActiveForRewind: jest.fn(async () => {
        stopped = true;
        return { resumed: true };
      }),
    });
    await expect(r.recover(INPUT)).resolves.toEqual({ recovered: false, reason: 'stopped' });
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('sends nothing when the session became active during the resume', async () => {
    const r = receiver({
      ensureSessionActiveForRewind: jest.fn(async () => ({ alreadyActive: true })),
    });
    await expect(r.recover(INPUT)).resolves.toEqual({
      recovered: false,
      reason: 'already-active',
    });
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('reports a failed resume', async () => {
    const r = receiver({
      ensureSessionActiveForRewind: jest.fn(async () => ({
        resumed: false,
        error: 'auth required',
      })),
    });
    await expect(r.recover(INPUT)).resolves.toEqual({
      recovered: false,
      reason: 'resume-failed',
      detail: 'auth required',
    });
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('reports a thrown resume and a failed send', async () => {
    const thrown = receiver({
      historyRead: {
        resolveSessionFolder: jest.fn(async () => {
          throw new Error('no folder');
        }),
      },
    });
    await expect(thrown.recover(INPUT)).resolves.toEqual({
      recovered: false,
      reason: 'resume-failed',
      detail: 'no folder',
    });

    const unsent = receiver();
    unsent.sendMessageToSession.mockRejectedValueOnce(new Error('queue closed'));
    await expect(unsent.recover(INPUT)).resolves.toEqual({
      recovered: false,
      reason: 'send-failed',
      detail: 'queue closed',
    });
  });
});
