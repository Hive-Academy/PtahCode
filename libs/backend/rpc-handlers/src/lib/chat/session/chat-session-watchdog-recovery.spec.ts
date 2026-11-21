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

import { SessionAdmissionRefusedError } from '@ptah-extension/agent-sdk';
import { ChatSessionService } from './chat-session.service';
import { ChatFollowUpQueueService } from '../follow-up/chat-follow-up-queue.service';

const INPUT = {
  sessionId: 'sdk-successor',
  tabId: 'tab-successor',
  prompt: 'Ptah recovery: continue',
  senderName: 'Ptah recovery',
  endedAt: 1_000,
} as const;

function deferred<T = void>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Let pending microtasks (gate hand-offs, awaits) run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

type Service = {
  recoverAfterWatchdogStop: ChatSessionService['recoverAfterWatchdogStop'];
  withActivationGate<T>(
    keys: readonly string[],
    owner: 'user' | 'recovery',
    run: () => Promise<T>,
  ): Promise<T>;
  withUserActivation<T>(
    intent: UserIntent,
    sessionId: string,
    tabId: string,
    run: () => Promise<T>,
  ): Promise<T | { error: { cancelled?: true } }>;
  beginUserIntent(keys: readonly string[]): UserIntent;
  abortSession: ChatSessionService['abortSession'];
};

type UserIntent = { stopped: boolean; readonly end: () => void };

/** The real follow-up queue with a settable clock. */
class ClockedQueue extends ChatFollowUpQueueService {
  clock = 0;
  protected override now(): number {
    return this.clock;
  }
}

function realQueue(): ClockedQueue {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return new ClockedQueue(
    logger as never,
    { sendMessage: jest.fn(async () => true) } as never,
    {} as never,
  );
}

/** The follow-up queue's stop receipt retention (10 minutes). */
const RECEIPT_RETENTION_MS = 10 * 60 * 1000;

/**
 * A receiver on the real prototype: the gate, the recovery steps and the
 * activation body run for real; the SDK, the account gate and the driver lock
 * are stubs. `live` models a registered record with a stream attached; a
 * launch sets it. `stopAt` models the follow-up queue's stop timestamps.
 */
function receiver(overrides: Record<string, unknown> = {}) {
  const state = {
    live: false,
    launches: 0,
    now: 0,
    stopAt: new Map<string, number>(),
  };
  const sendMessageToSession = jest.fn(async () => undefined);
  const resolveSessionFolder = jest.fn(async (_id: string) => '/work/tree');
  const gateAccount = jest.fn(async (): Promise<void> => undefined);
  const interruptSession = jest.fn(async () => {
    state.live = false;
  });
  const autoResumeIfInactive = jest.fn(async () => {
    if (state.live) return { justResumed: false };
    state.live = true;
    state.launches += 1;
    return { justResumed: true };
  });
  const self = Object.assign(Object.create(ChatSessionService.prototype), {
    followUpQueue: {
      stoppedSince: (id: string, at: number) => {
        const stoppedAt = state.stopAt.get(id);
        return stoppedAt !== undefined && stoppedAt >= at;
      },
      advanceStopGeneration: (id: string) => {
        state.stopAt.set(id, state.now);
      },
    },
    // `chat:abort` returns right after it records the stop.
    ptahCli: { handleAbort: jest.fn(async () => ({ success: true })) },
    hasLiveSessionStream: jest.fn(() => state.live),
    historyRead: { resolveSessionFolder },
    gateAccount,
    driverLock: {
      beginDrive: jest.fn(async () => 'attempt'),
      abandonDrive: jest.fn(async () => undefined),
      settleDrive: jest.fn(async () => undefined),
    },
    autoResumeIfInactive,
    sdkAdapter: { sendMessageToSession, interruptSession },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ...overrides,
  }) as Service;
  /**
   * What `continueSession` does: the intent at RPC entry, then (after the
   * preflight, here none) its auto-resume inside the user activation.
   */
  const userContinue = async (
    intent = self.beginUserIntent([INPUT.sessionId, INPUT.tabId]),
  ) => {
    try {
      return await self.withUserActivation(intent, INPUT.sessionId, INPUT.tabId, () =>
        autoResumeIfInactive(),
      );
    } finally {
      intent.end();
    }
  };
  /** A real `chat:abort` of `id` at time `at`, for any source (tab close too). */
  const abort = (id: string, at: number) => {
    state.now = at;
    void self.abortSession({ sessionId: id as never });
  };
  return {
    self,
    state,
    recover: (input: Parameters<Service['recoverAfterWatchdogStop']>[0] = INPUT) =>
      self.recoverAfterWatchdogStop(input),
    userContinue,
    abort,
    autoResumeIfInactive,
    sendMessageToSession,
    interruptSession,
    resolveSessionFolder,
    gateAccount,
  };
}

describe('ChatSessionService.recoverAfterWatchdogStop (TASK_2026_2288 C)', () => {
  it('happy path: resumes once and admits the prompt only onto an idle session', async () => {
    const r = receiver();
    await expect(r.recover()).resolves.toEqual({ recovered: true });

    expect(r.state.launches).toBe(1);
    expect(r.resolveSessionFolder).toHaveBeenCalledWith(INPUT.sessionId);
    expect(r.sendMessageToSession).toHaveBeenCalledTimes(1);
    expect(r.sendMessageToSession).toHaveBeenCalledWith(INPUT.sessionId, INPUT.prompt, {
      origin: { kind: 'peer', from: 'ptah', name: 'Ptah recovery' },
      admission: 'require-idle',
    });
  });

  it('a user continue already in its preflight when recovery starts: no activation, no prompt', async () => {
    const r = receiver();
    const intent = r.self.beginUserIntent([INPUT.sessionId, INPUT.tabId]);
    await expect(r.recover()).resolves.toEqual({
      recovered: false,
      reason: 'already-active',
    });
    intent.end();
    expect(r.autoResumeIfInactive).not.toHaveBeenCalled();
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('a user continue that enters its preflight during recovery: recovery sends no prompt', async () => {
    const r = receiver();
    const folder = deferred<string>();
    r.resolveSessionFolder.mockImplementationOnce(() => folder.promise);
    const recovery = r.recover();
    await settle();
    // chat:continue starts: account, folder and MCP preflight, not yet at the gate.
    const intent = r.self.beginUserIntent([INPUT.sessionId, INPUT.tabId]);
    folder.resolve('/work/tree');
    await expect(recovery).resolves.toEqual({
      recovered: false,
      reason: 'already-active',
    });
    intent.end();
    expect(r.state.launches).toBe(0);
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('a continue that waits at the gate behind recovery, then the tab closes: no launch', async () => {
    const r = receiver();
    const folder = deferred<string>();
    r.resolveSessionFolder.mockImplementationOnce(() => folder.promise);
    const recovery = r.recover();
    await settle();
    const waiting = r.userContinue();
    await settle();
    r.abort(INPUT.tabId, INPUT.endedAt + 50); // tab close while both wait
    folder.resolve('/work/tree');
    await expect(recovery).resolves.toEqual({
      recovered: false,
      reason: 'stopped',
    });
    await expect(waiting).resolves.toEqual({
      error: { success: false, cancelled: true, sessionId: INPUT.sessionId },
    });
    expect(r.state.launches).toBe(0);
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('a continue that waits at the gate with no stop still activates once', async () => {
    const r = receiver();
    const folder = deferred<string>();
    r.resolveSessionFolder.mockImplementationOnce(() => folder.promise);
    const recovery = r.recover();
    await settle();
    const waiting = r.userContinue();
    folder.resolve('/work/tree');
    await expect(recovery).resolves.toEqual({
      recovered: false,
      reason: 'already-active',
    });
    await expect(waiting).resolves.toEqual({ justResumed: true });
    expect(r.state.launches).toBe(1);
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('finds the session already active: no activation and no prompt', async () => {
    const r = receiver();
    r.state.live = true;
    await expect(r.recover()).resolves.toEqual({
      recovered: false,
      reason: 'already-active',
    });
    expect(r.autoResumeIfInactive).not.toHaveBeenCalled();
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('a user continue that starts during the recovery activation: one activation, no prompt', async () => {
    const r = receiver();
    const launch = deferred();
    const realResume = r.autoResumeIfInactive.getMockImplementation();
    r.autoResumeIfInactive.mockImplementationOnce(async () => {
      await launch.promise;
      return (realResume as () => Promise<{ justResumed: boolean }>)();
    });

    const recovering = r.recover();
    await settle();
    expect(r.autoResumeIfInactive).toHaveBeenCalledTimes(1);
    const continuing = r.userContinue();
    await settle();
    // The user's activation waits on the gate; it does not run beside recovery.
    expect(r.autoResumeIfInactive).toHaveBeenCalledTimes(1);
    launch.resolve();

    await expect(recovering).resolves.toEqual({
      recovered: false,
      reason: 'already-active',
    });
    await expect(continuing).resolves.toEqual({ justResumed: false });
    expect(r.state.launches).toBe(1);
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('a user continue that starts during folder preparation: recovery never activates', async () => {
    const r = receiver();
    const folder = deferred<string>();
    r.resolveSessionFolder.mockReturnValueOnce(folder.promise);

    const recovering = r.recover();
    await settle();
    const continuing = r.userContinue();
    folder.resolve('/work/tree');

    await expect(recovering).resolves.toEqual({
      recovered: false,
      reason: 'already-active',
    });
    await expect(continuing).resolves.toEqual({ justResumed: true });
    expect(r.state.launches).toBe(1);
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('a turn that starts between activation and prompt admission: the prompt is dropped', async () => {
    const r = receiver();
    r.sendMessageToSession.mockRejectedValueOnce(new SessionAdmissionRefusedError('busy', INPUT.sessionId));
    await expect(r.recover()).resolves.toEqual(
      expect.objectContaining({ recovered: false, reason: 'already-active' }),
    );
    // One attempt with `require-idle`: refused means nothing was queued.
    expect(r.sendMessageToSession).toHaveBeenCalledTimes(1);
    expect(r.sendMessageToSession).toHaveBeenCalledWith(
      INPUT.sessionId,
      INPUT.prompt,
      expect.objectContaining({ admission: 'require-idle' }),
    );
  });

  it('watchdog end, tab close during the teardown interrupt, timer fires: no resume, no prompt', async () => {
    // `endedAt` is the teardown start (1_000). The tab close lands at 1_200,
    // during the interrupt, before the end hook ran.
    const r = receiver();
    r.abort(INPUT.tabId, 1_200);
    await expect(r.recover()).resolves.toEqual({ recovered: false, reason: 'stopped' });
    expect(r.autoResumeIfInactive).not.toHaveBeenCalled();
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('a stop before the watchdog end does not cancel the recovery', async () => {
    const r = receiver();
    r.abort(INPUT.tabId, 900);
    await expect(r.recover()).resolves.toEqual({ recovered: true });
  });

  it('tab close during folder preparation: no launch, no prompt', async () => {
    const r = receiver();
    const folder = deferred<string>();
    r.resolveSessionFolder.mockReturnValueOnce(folder.promise);
    const recovering = r.recover();
    await settle();
    r.abort(INPUT.sessionId, 2_000);
    folder.resolve('/work/tree');

    await expect(recovering).resolves.toEqual({ recovered: false, reason: 'stopped' });
    expect(r.autoResumeIfInactive).not.toHaveBeenCalled();
    expect(r.state.live).toBe(false);
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('tab close during account preparation: no launch, no prompt', async () => {
    const r = receiver();
    const account = deferred();
    r.gateAccount.mockReturnValueOnce(account.promise);
    const recovering = r.recover();
    await settle();
    r.abort(INPUT.tabId, 2_000);
    account.resolve();

    await expect(recovering).resolves.toEqual({ recovered: false, reason: 'stopped' });
    expect(r.autoResumeIfInactive).not.toHaveBeenCalled();
    expect(r.state.live).toBe(false);
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('tab close while the resume launches: the relaunched session is ended again', async () => {
    const r = receiver();
    const realResume = r.autoResumeIfInactive.getMockImplementation();
    r.autoResumeIfInactive.mockImplementationOnce(async () => {
      const result = await (realResume as () => Promise<{ justResumed: boolean }>)();
      r.abort(INPUT.tabId, 2_000);
      return result;
    });

    await expect(r.recover()).resolves.toEqual({ recovered: false, reason: 'stopped' });
    expect(r.interruptSession).toHaveBeenCalledWith(INPUT.sessionId, 'user-stop');
    expect(r.state.live).toBe(false);
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('reports a thrown resume and a failed send', async () => {
    const thrown = receiver();
    thrown.resolveSessionFolder.mockRejectedValueOnce(new Error('no folder'));
    await expect(thrown.recover()).resolves.toEqual({
      recovered: false,
      reason: 'resume-failed',
      detail: 'no folder',
    });

    const unsent = receiver();
    unsent.sendMessageToSession.mockRejectedValueOnce(new Error('queue closed'));
    await expect(unsent.recover()).resolves.toEqual({
      recovered: false,
      reason: 'send-failed',
      detail: 'queue closed',
    });
  });

  it('a real stop during the gate wait after an old stop receipt expired: the continue does not launch', async () => {
    const queue = realQueue();
    const r = receiver({ followUpQueue: queue });
    const recoveryInput = { ...INPUT, endedAt: RECEIPT_RETENTION_MS - 10 };
    // An old stop of the session, at t=0.
    void r.self.abortSession({ sessionId: INPUT.sessionId as never });
    const folder = deferred<string>();
    r.resolveSessionFolder.mockImplementationOnce(() => folder.promise);
    queue.clock = recoveryInput.endedAt;
    const recovery = r.recover(recoveryInput);
    await settle();
    // The continue enters while the old receipt is still retained.
    queue.clock = RECEIPT_RETENTION_MS - 1;
    const waiting = r.userContinue();
    await settle();
    // The old receipt expires; the fresh stop rewrites generation 1.
    queue.clock = RECEIPT_RETENTION_MS + 5;
    void r.self.abortSession({ sessionId: INPUT.sessionId as never });
    expect(queue.stopGeneration(INPUT.sessionId)).toBe(1);
    folder.resolve('/work/tree');

    await expect(recovery).resolves.toEqual(
      expect.objectContaining({ recovered: false }),
    );
    await expect(waiting).resolves.toEqual({
      error: { success: false, cancelled: true, sessionId: INPUT.sessionId },
    });
    expect(r.state.launches).toBe(0);
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('a tab close during the continue preflight, recovery holds the gate: no launch after recovery stands down', async () => {
    const r = receiver();
    const folder = deferred<string>();
    r.resolveSessionFolder.mockImplementationOnce(() => folder.promise);
    const recovery = r.recover();
    await settle();
    // chat:continue enters: intent first, then its preflight (folder, account).
    const intent = r.self.beginUserIntent([INPUT.sessionId, INPUT.tabId]);
    r.abort(INPUT.tabId, INPUT.endedAt + 50); // tab close during the preflight
    // The preflight ends and the continue reaches the gate recovery holds.
    const waiting = r.userContinue(intent);
    await settle();
    folder.resolve('/work/tree');

    await expect(recovery).resolves.toEqual(
      expect.objectContaining({ recovered: false }),
    );
    await expect(waiting).resolves.toEqual({
      error: { success: false, cancelled: true, sessionId: INPUT.sessionId },
    });
    expect(r.state.launches).toBe(0);
    expect(r.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('a stop before the continue entered does not cancel it', async () => {
    const r = receiver();
    r.abort(INPUT.tabId, 500);
    await expect(r.userContinue()).resolves.toEqual({ justResumed: true });
    expect(r.state.launches).toBe(1);
  });
});
