import {
  HandoffWatchdogRecovery,
  WATCHDOG_RECOVERY_PROMPT,
  WATCHDOG_RECOVERY_SENDER,
  type HandoffWatchdogRecoveryDeps,
} from './handoff-watchdog-recovery';
import type {
  WatchdogRecoveryInput,
  WatchdogRecoveryOutcome,
} from './child-chat-session-host.port';

const SUCCESSOR_TAB = 'tab-successor';
const SUCCESSOR_SDK = 'sdk-successor';

function harness(overrides: Partial<HandoffWatchdogRecoveryDeps> = {}) {
  const scheduled: Array<() => void> = [];
  const recover = jest.fn(
    async (_input: WatchdogRecoveryInput): Promise<WatchdogRecoveryOutcome> => ({
      recovered: true,
    }),
  );
  const log = jest.fn();
  const deps: HandoffWatchdogRecoveryDeps = {
    findSuccessor: jest.fn(async (id: string) =>
      id === SUCCESSOR_TAB || id === SUCCESSOR_SDK
        ? { successorTabId: SUCCESSOR_TAB, successorSdkId: SUCCESSOR_SDK }
        : undefined,
    ),
    isSessionChild: () => false,
    recover: () => recover,
    log,
    schedule: (run) => scheduled.push(run),
    now: () => 1_000,
    ...overrides,
  };
  const recovery = new HandoffWatchdogRecovery(deps);
  /** Run the scheduled retries and let their promises settle. */
  const flush = async (): Promise<void> => {
    for (const run of scheduled.splice(0)) run();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { recovery, recover, log, deps, flush, scheduled };
}

describe('HandoffWatchdogRecovery (TASK_2026_2288 C)', () => {
  it('retries a handoff successor one time after a watchdog stop (incident 2026-11-20)', async () => {
    const h = harness();
    h.recovery.onSessionEnd({ sessionId: SUCCESSOR_SDK, cause: 'no-activity-timeout' });
    await h.flush();

    expect(h.recover).toHaveBeenCalledTimes(1);
    expect(h.recover).toHaveBeenCalledWith({
      sessionId: SUCCESSOR_SDK,
      tabId: SUCCESSOR_TAB,
      prompt: WATCHDOG_RECOVERY_PROMPT,
      senderName: WATCHDOG_RECOVERY_SENDER,
      // The watchdog end time, not the timer time: a later stop cancels it.
      endedAt: 1_000,
    });
    // The prompt says it is automatic, so the model does not take it as user input.
    expect(WATCHDOG_RECOVERY_PROMPT).toContain('not a message from the user');
  });

  it('cuts off stops at the teardown start, so a tab close during the interrupt cancels', async () => {
    // Teardown started at 400; the end hook runs at 1_000 after the interrupt.
    // A tab close at 700 must count as "after the watchdog end".
    const h = harness();
    h.recovery.onSessionEnd({
      sessionId: SUCCESSOR_SDK,
      cause: 'no-activity-timeout',
      startedAt: 400,
    });
    await h.flush();
    expect(h.recover).toHaveBeenCalledWith(expect.objectContaining({ endedAt: 400 }));
  });

  it('waits for the teardown before it resumes', () => {
    const h = harness();
    h.recovery.onSessionEnd({ sessionId: SUCCESSOR_SDK, cause: 'no-activity-timeout' });
    expect(h.recover).not.toHaveBeenCalled();
    expect(h.scheduled).toHaveLength(1);
  });

  it('never retries the same successor twice', async () => {
    const h = harness();
    h.recovery.onSessionEnd({ sessionId: SUCCESSOR_SDK, cause: 'no-activity-timeout' });
    await h.flush();
    h.recovery.onSessionEnd({ sessionId: SUCCESSOR_TAB, cause: 'no-activity-timeout' });
    await h.flush();

    expect(h.recover).toHaveBeenCalledTimes(1);
    expect(h.log).toHaveBeenCalledWith(expect.stringContaining('no second automatic retry'));
  });

  it.each(['user-stop', 'tab-close', 'provider-error', 'stream-exit', 'unknown'] as const)(
    'does not retry an end with cause %s',
    async (cause) => {
      const h = harness();
      h.recovery.onSessionEnd({ sessionId: SUCCESSOR_SDK, cause });
      await h.flush();
      expect(h.scheduled).toHaveLength(0);
      expect(h.recover).not.toHaveBeenCalled();
    },
  );

  it('leaves a session child to the spawner, which reports to the parent', async () => {
    const h = harness({ isSessionChild: (id) => id === SUCCESSOR_TAB });
    h.recovery.onSessionEnd({ sessionId: SUCCESSOR_SDK, cause: 'no-activity-timeout' });
    await h.flush();
    expect(h.recover).not.toHaveBeenCalled();
  });

  it('does not retry a session that is not a handoff successor', async () => {
    const h = harness();
    h.recovery.onSessionEnd({ sessionId: 'plain-session', cause: 'no-activity-timeout' });
    await h.flush();
    expect(h.recover).not.toHaveBeenCalled();
  });

  it('logs when the host cannot retry', async () => {
    const h = harness({ recover: () => null });
    h.recovery.onSessionEnd({ sessionId: SUCCESSOR_SDK, cause: 'no-activity-timeout' });
    await h.flush();
    expect(h.log).toHaveBeenCalledWith(expect.stringContaining('cannot retry'));
  });

  it('logs a refused retry and a failed lookup without throwing', async () => {
    const refused = harness();
    refused.recover.mockResolvedValueOnce({ recovered: false, reason: 'already-active' });
    refused.recovery.onSessionEnd({ sessionId: SUCCESSOR_SDK, cause: 'no-activity-timeout' });
    await refused.flush();
    expect(refused.log).toHaveBeenCalledWith(expect.stringContaining('already-active'));

    const broken = harness({
      findSuccessor: () => Promise.reject(new Error('store unreadable')),
    });
    broken.recovery.onSessionEnd({ sessionId: SUCCESSOR_SDK, cause: 'no-activity-timeout' });
    await broken.flush();
    expect(broken.recover).not.toHaveBeenCalled();
    expect(broken.log).toHaveBeenCalledWith(expect.stringContaining('store unreadable'));
  });
});
