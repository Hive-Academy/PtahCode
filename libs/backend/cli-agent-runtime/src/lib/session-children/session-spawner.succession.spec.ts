import { denySessionSpawnerHandoffAccess } from './__fixtures__/session-spawner-fs-access';
import { SessionAdmissionRefusedError } from '@ptah-extension/agent-sdk';
import { makeHarness, PARENT } from './session-spawner.service.spec';

// The spawner looks for the handoff file with real file I/O, which fake timers
// and a microtask flush cannot settle. The file is absent in every case here.
denySessionSpawnerHandoffAccess();

const flush = async (): Promise<void> => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

const requestHandoff = (
  h: ReturnType<typeof makeHarness>,
  childSessionId: string,
) => h.spawner.succeed({
  callerSessionId: childSessionId,
  handoffPath: 'HANDOFF.md',
  prompt: 'Continue the task',
});

describe('SessionSpawnerService succession', () => {
  it('closes only the retired predecessor after stop resolves', async () => {
    const closer = { close: jest.fn().mockResolvedValue({ kind: 'closed' }) };
    const h = makeHarness({
      config: { 'agentSessions.maxRuntimeMinutes': 5 },
      closer,
    });
    let finishStop: (() => void) | undefined;
    h.adapter.interruptSession.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishStop = resolve;
        }),
    );
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(5 * 60_000);
    await flush();
    await requestHandoff(h, child.childSessionId);
    h.turnEnded(child.childSessionId);
    await flush();
    const successor = h.registry.resolveLatest(child.childSessionId);
    expect(closer.close).not.toHaveBeenCalled();
    expect(h.registry.liveCount()).toBe(1);
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe(
      'handed-off',
    );
    expect(
      h.registry.get(successor!.childSessionId)?.terminalStatus,
    ).toBeUndefined();
    expect(h.active.has(successor!.childSessionId)).toBe(true);
    expect(h.adapter.interruptSession).toHaveBeenCalledWith(
      child.childSessionId,
      'parent-stop',
    );
    expect(h.adapter.interruptSession).not.toHaveBeenCalledWith(
      successor!.childSessionId,
      expect.anything(),
    );
    finishStop?.();
    await flush();
    expect(closer.close).toHaveBeenCalledTimes(1);
    expect(closer.close).toHaveBeenCalledWith(
      child.childSessionId,
      h.registry.get(child.childSessionId)?.sdkSessionId,
    );
    expect(closer.close).not.toHaveBeenCalledWith(
      successor!.childSessionId,
      expect.anything(),
    );
  });

  it.each([{ kind: 'blocked', code: 'unsent-input' }, { kind: 'absent' }])(
    'keeps succession when close returns $kind',
    async (result) => {
      const closer = { close: jest.fn().mockResolvedValue(result) };
      const h = makeHarness({
        config: { 'agentSessions.maxRuntimeMinutes': 5 },
        closer,
      });
      const child = await h.startChild();
      h.markRan(child.childSessionId);
      h.phases.set(child.childSessionId, 'idle');
      jest.advanceTimersByTime(5 * 60_000);
      await flush();
      await requestHandoff(h, child.childSessionId);
      h.turnEnded(child.childSessionId);
      await flush();
      expect(h.registry.liveCount()).toBe(1);
      expect(closer.close).toHaveBeenCalledTimes(1);
      expect(h.lines.join('\n')).toContain(result.kind);
      if (result.kind === 'blocked')
        expect(h.lines.join('\n')).toContain(result.code);
    },
  );

  it.each(['absent', 'throws'] as const)(
    'keeps succession when closer is %s',
    async (mode) => {
      const closer =
        mode === 'throws'
          ? { close: jest.fn().mockRejectedValue(new Error('close failed')) }
          : undefined;
      const h = makeHarness({
        config: { 'agentSessions.maxRuntimeMinutes': 5 },
        ...(closer ? { closer } : {}),
      });
      const child = await h.startChild();
      h.markRan(child.childSessionId);
      h.phases.set(child.childSessionId, 'idle');
      jest.advanceTimersByTime(5 * 60_000);
      await flush();
      await requestHandoff(h, child.childSessionId);
      h.turnEnded(child.childSessionId);
      await flush();
      expect(h.registry.liveCount()).toBe(1);
      expect(h.lines.join('\n')).toContain(
        mode === 'throws' ? 'predecessor close failed' : 'closer absent',
      );
    },
  );

  it.each([
    'user-stop',
    'parent-stop',
    'workspace-close',
    'host-shutdown',
  ] as const)(
    'ends %s without a successor and records how to find the work',
    async (cause) => {
      const h = makeHarness();
      const child = await h.startChild();
      h.markRan(child.childSessionId);
      h.active.delete(child.childSessionId);
      h.sessionEnd.notifyAll({
        sessionId: child.childSessionId,
        workspaceRoot: child.worktreePath,
        cause,
      });
      jest.advanceTimersByTime(30_000);
      await flush();
      expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe(
        'ended',
      );
      expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
      expect(h.agents.adoptLanes).toHaveBeenCalledWith(
        expect.any(Array),
        PARENT,
      );
      expect(h.logger.info).toHaveBeenCalledWith(
        expect.stringContaining(child.worktreePath),
      );
      expect(h.logger.info).toHaveBeenCalledWith(
        expect.stringContaining(child.branch),
      );
      expect(h.logger.info).toHaveBeenCalledWith(
        expect.stringContaining(child.childSessionId),
      );
    },
  );

  it.each([
    'stream-exit',
    'provider-error',
    'config-reinit',
    'compaction-abort',
    'unknown',
  ] as const)('starts a recovery successor for %s', async (cause) => {
    const closer = { close: jest.fn().mockResolvedValue({ kind: 'closed' }) };
    const h = makeHarness({ closer });
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    h.active.delete(child.childSessionId);
    h.sessionEnd.notifyAll({
      sessionId: child.childSessionId,
      workspaceRoot: child.worktreePath,
      cause,
    });
    jest.advanceTimersByTime(30_000);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe(
      'handed-off',
    );
    expect(closer.close).toHaveBeenCalledTimes(1);
    expect(closer.close).toHaveBeenCalledWith(
      child.childSessionId,
      h.registry.get(child.childSessionId)?.sdkSessionId,
    );
    expect(h.registry.resolveLatest(child.childSessionId)?.worktreePath).toBe(
      child.worktreePath,
    );
    expect(h.host.startChildSession.mock.calls[1][0].prompt).toContain(
      `previous session ended unexpectedly (${cause})`,
    );
    if (cause === 'unknown')
      expect(h.lines.join('\n')).toContain('unknown cause');
  });

  it('ends after recovery successor start fails and moves lanes to parent', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    h.active.delete(child.childSessionId);
    (h.host.startChildSession as jest.Mock).mockResolvedValueOnce({
      started: false,
      error: 'provider failed',
    });
    h.sessionEnd.notifyAll({
      sessionId: child.childSessionId,
      workspaceRoot: child.worktreePath,
      cause: 'provider-error',
    });
    jest.advanceTimersByTime(30_000);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('ended');
    expect(h.registry.get(child.childSessionId)?.endReason).toContain(
      'automatic successor failed: provider failed',
    );
    expect(h.agents.adoptLanes).toHaveBeenCalledWith(expect.any(Array), PARENT);
    expect(h.provisioner.rollback).not.toHaveBeenCalled();
  });

  it('ends an unexpected session when its succession limit is zero', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxSuccessions': 0 } });
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    h.active.delete(child.childSessionId);
    h.sessionEnd.notifyAll({
      sessionId: child.childSessionId,
      workspaceRoot: child.worktreePath,
      cause: 'stream-exit',
    });
    jest.advanceTimersByTime(30_000);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('ended');
    expect(h.registry.get(child.childSessionId)?.endReason).toContain(
      'max successions reached',
    );
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
  });

  it('warns before the cap without ending or interrupting the child', async () => {
    const h = makeHarness({
      config: {
        'agentSessions.maxRuntimeMinutes': 5,
        'agentSessions.runtimeWarnLeadMinutes': 1,
      },
    });
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    h.phases.set(child.childSessionId, 'generating');
    jest.advanceTimersByTime(4 * 60_000);
    await flush();
    expect(h.adapter.sendMessageToSession).toHaveBeenCalledWith(
      child.childSessionId,
      expect.stringContaining('approaching its 5-minute runtime cap'),
      expect.objectContaining({
        origin: expect.objectContaining({ kind: 'peer', name: 'Ptah host' }),
      }),
    );
    expect(
      h.registry.get(child.childSessionId)?.terminalStatus,
    ).toBeUndefined();
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
  });

  it('skips the warning for an idle child without pending work', async () => {
    const h = makeHarness({
      config: {
        'agentSessions.maxRuntimeMinutes': 5,
        'agentSessions.runtimeWarnLeadMinutes': 1,
      },
    });
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(4 * 60_000);
    await flush();
    expect(h.adapter.sendMessageToSession).not.toHaveBeenCalled();
    expect(h.lines.join('\n')).toContain(
      'runtime warning skipped: idle without pending work',
    );
  });

  it.each(['idle', 'generating'] as const)('pauses a live %s child at grace without interrupting', async (phase) => {
    const h = makeHarness({
      config: {
        'agentSessions.maxRuntimeMinutes': 5,
        'agentSessions.handoffGraceMinutes': 1,
      },
    });
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    const sdkSessionId = h.registry.get(child.childSessionId)?.sdkSessionId;
    h.phases.set(child.childSessionId, phase);
    jest.advanceTimersByTime(5 * 60_000);
    jest.advanceTimersByTime(60_000);
    await flush();

    expect(h.spawner.status({ callerSessionId: PARENT })).toMatchObject({
      children: [{ status: 'paused', notice: { action: 'paused', reason: 'runtime-cap' } }],
    });
    const record = h.registry.get(child.childSessionId);
    expect(record?.terminalStatus).toBeUndefined();
    const disposition = { phase: 'paused', notice: record?.notice };
    expect(h.dispositions.lookup({ tabId: child.childSessionId })).toEqual(disposition);
    expect(h.dispositions.lookup({ sdkSessionId })).toEqual(disposition);
    expect(h.adapter.sendMessageToSession.mock.calls.filter(([target]) => target === PARENT))
      .toEqual([[PARENT, expect.stringMatching(/Ptah budget monitor paused new work.*ptah_session_send/), expect.anything()]]);
    expect(h.active.has(child.childSessionId)).toBe(true);
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
    expect(h.adapter.interruptCurrentTurn).not.toHaveBeenCalled();
    expect(h.adapter.endSession).not.toHaveBeenCalled();
    expect(h.agents.adoptLanes).not.toHaveBeenCalled();
    expect(h.provisioner.rollback).not.toHaveBeenCalled();
    expect(h.notifier.signalSessionChild).not.toHaveBeenCalled();
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);

    h.turnEnded(child.childSessionId);
    await flush();
    expect(h.notifier.signalSessionChild).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ status: 'completed' }));
    expect(h.registry.get(child.childSessionId)?.paused).toBe(true);
    expect(await requestHandoff(h, child.childSessionId)).toMatchObject({ ok: true });
    expect(h.host.startChildSession).toHaveBeenCalledTimes(2);
  });

  it.each([5, 6])('resumes and re-arms the cap on a parent send at minute %s', async (minute) => {
    const h = makeHarness({
      config: { 'agentSessions.maxRuntimeMinutes': 5, 'agentSessions.handoffGraceMinutes': 1 },
    });
    const child = await h.startChild();
    const id = child.childSessionId;
    h.markRan(id);
    const sdkSessionId = h.registry.get(id)?.sdkSessionId;
    jest.advanceTimersByTime(minute * 60_000);
    await flush();
    expect(h.registry.get(id)?.paused).toEqual(minute === 6 ? true : undefined);

    expect(await h.spawner.send({
      callerSessionId: PARENT, childSessionId: id, message: 'Continue with the tests', mode: 'queue',
    })).toMatchObject({ delivered: true });
    expect(h.adapter.sendMessageToSession).toHaveBeenCalledWith(
      id, 'Continue with the tests', expect.anything(),
    );
    expect(h.registry.get(id)?.paused).toBeUndefined();
    expect(h.registry.get(id)?.notice).toBeUndefined();
    expect(h.dispositions.lookup({ tabId: id })).toBeUndefined();
    expect(h.dispositions.lookup({ sdkSessionId })).toBeUndefined();

    jest.advanceTimersByTime(6 * 60_000 - 1);
    expect(h.registry.get(id)?.paused).toBeUndefined();
    jest.advanceTimersByTime(1);
    await flush();
    expect(h.registry.get(id)?.paused).toBe(true);
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
  });

  describe('a failed send keeps the pause', () => {
    async function pausedChild() {
      const h = makeHarness({
        config: { 'agentSessions.maxRuntimeMinutes': 5, 'agentSessions.handoffGraceMinutes': 1 },
      });
      const child = await h.startChild();
      const id = child.childSessionId;
      h.markRan(id);
      const sdkSessionId = h.registry.get(id)?.sdkSessionId;
      jest.advanceTimersByTime(6 * 60_000);
      await flush();
      expect(h.registry.get(id)?.paused).toBe(true);
      return { h, id, sdkSessionId };
    }

    function expectStillPaused(
      h: ReturnType<typeof makeHarness>,
      id: string,
      sdkSessionId: string | undefined,
    ) {
      expect(h.registry.get(id)?.paused).toBe(true);
      expect(h.registry.get(id)?.notice).toMatchObject({ reason: 'runtime-cap' });
      expect(h.dispositions.lookup({ tabId: id })).toMatchObject({ phase: 'paused' });
      expect(h.dispositions.lookup({ sdkSessionId })).toMatchObject({ phase: 'paused' });
    }

    it('after a refused if-idle send, with no second parent notice and no fresh cap', async () => {
      const { h, id, sdkSessionId } = await pausedChild();
      const notices = () => h.adapter.sendMessageToSession.mock.calls.filter(([t]) => t === PARENT).length;
      const before = notices();
      h.adapter.sendMessageToSession.mockRejectedValueOnce(
        new SessionAdmissionRefusedError('busy', id),
      );

      await expect(h.spawner.send({
        callerSessionId: PARENT, childSessionId: id, message: 'm', mode: 'if-idle',
      })).resolves.toMatchObject({ delivered: false, reason: 'busy' });

      expectStillPaused(h, id, sdkSessionId);
      expect(notices()).toBe(before);
      // No fresh runtime allowance: a later cap timer must not fire a second pause cycle.
      jest.advanceTimersByTime(30 * 60_000);
      await flush();
      expectStillPaused(h, id, sdkSessionId);
      expect(notices()).toBe(before);
      expect(h.adapter.interruptSession).not.toHaveBeenCalled();
    });

    it('after a steer whose interrupt fails', async () => {
      const { h, id, sdkSessionId } = await pausedChild();
      h.phases.set(id, 'generating');
      h.adapter.interruptCurrentTurn.mockResolvedValueOnce(false);
      const sends = h.adapter.sendMessageToSession.mock.calls.length;

      await expect(h.spawner.send({
        callerSessionId: PARENT, childSessionId: id, message: 'stop', mode: 'steer',
      })).resolves.toMatchObject({ delivered: false, reason: 'interrupt-failed' });

      expect(h.adapter.sendMessageToSession.mock.calls.length).toBe(sends);
      expectStillPaused(h, id, sdkSessionId);
    });

    it('resumes once when a concurrent send is accepted even if another one fails', async () => {
      const { h, id, sdkSessionId } = await pausedChild();
      let release: (() => void) | undefined;
      h.adapter.sendMessageToSession.mockImplementationOnce(
        () => new Promise<void>((resolve) => { release = resolve; }),
      );
      h.adapter.sendMessageToSession.mockRejectedValueOnce(
        new SessionAdmissionRefusedError('busy', id),
      );
      const first = h.spawner.send({
        callerSessionId: PARENT, childSessionId: id, message: 'a', mode: 'queue',
      });
      const second = h.spawner.send({
        callerSessionId: PARENT, childSessionId: id, message: 'b', mode: 'if-idle',
      });
      await expect(second).resolves.toMatchObject({ delivered: false });
      release?.();
      await expect(first).resolves.toMatchObject({ delivered: true });

      expect(h.registry.get(id)?.paused).toBeUndefined();
      expect(h.dispositions.lookup({ tabId: id })).toBeUndefined();
      expect(h.dispositions.lookup({ sdkSessionId })).toBeUndefined();
    });
  });

  it.each(['end', 'dispose', 'sdk-resume'] as const)('clears both disposition aliases on %s', async (action) => {
    const h = makeHarness({
      config: { 'agentSessions.maxRuntimeMinutes': 5, 'agentSessions.handoffGraceMinutes': 1 },
    });
    const child = await h.startChild();
    const id = child.childSessionId;
    h.markRan(id);
    const sdkSessionId = h.registry.get(id)?.sdkSessionId;
    if (!sdkSessionId) throw new Error('child SDK id was not bound');
    jest.advanceTimersByTime(6 * 60_000);
    await flush();
    expect(h.dispositions.lookup({ tabId: id })?.phase).toBe('paused');
    expect(h.dispositions.lookup({ sdkSessionId })?.phase).toBe('paused');

    if (action === 'dispose') h.spawner.dispose();
    else if (action === 'end') {
      h.active.delete(id);
      h.sessionEnd.notifyAll({ sessionId: sdkSessionId, workspaceRoot: child.worktreePath, cause: 'tab-close' });
    } else {
      h.idResolved.notifyAll({ tabId: id, realSessionId: sdkSessionId, timestamp: Date.now() });
    }
    expect(h.dispositions.lookup({ tabId: id })).toBeUndefined();
    expect(h.dispositions.lookup({ sdkSessionId })).toBeUndefined();
    expect(h.registry.get(id)?.notice).toBeUndefined();
    if (action === 'sdk-resume') {
      jest.advanceTimersByTime(6 * 60_000);
      expect(h.registry.get(id)?.paused).toBe(true);
    }
  });

  it('rechecks cap grace while a child handoff is in flight', async () => {
    const h = makeHarness({
      config: { 'agentSessions.maxRuntimeMinutes': 5, 'agentSessions.handoffGraceMinutes': 1 },
    });
    const child = await h.startChild();
    const id = child.childSessionId;
    h.markRan(id);
    let failStart: () => void = () => undefined;
    h.host.startChildSession.mockImplementationOnce(() =>
      new Promise((_resolve, reject) => { failStart = () => reject(new Error('start failed')); }),
    );
    jest.advanceTimersByTime(5 * 60_000);
    const pending = requestHandoff(h, id);
    await flush();
    expect(h.host.startChildSession).toHaveBeenCalledTimes(2);
    const schedule = jest.spyOn(global, 'setTimeout');
    try {
      jest.advanceTimersByTime(60_000);
      await flush();
      expect(schedule).toHaveBeenCalledWith(expect.any(Function), 60_000);
      expect(h.registry.get(id)?.paused).toBeUndefined();
      expect(h.adapter.sendMessageToSession.mock.calls.filter(([target]) => target === PARENT)).toHaveLength(0);
    } finally {
      schedule.mockRestore();
      failStart();
    }
    expect(await pending).toMatchObject({ refusal: 'session-start-failed' });
  });

  it('logs a dropped pause notice and carries it only on paused completions', async () => {
    const h = makeHarness({
      config: { 'agentSessions.maxRuntimeMinutes': 5, 'agentSessions.handoffGraceMinutes': 1 },
    });
    const child = await h.startChild();
    const id = child.childSessionId;
    h.markRan(id);
    h.active.delete(PARENT);
    jest.advanceTimersByTime(6 * 60_000);
    await flush();
    expect(h.lines.join('\n')).toContain('parent notice dropped: verified parent is inactive');
    h.notifier.signalSessionChild.mockImplementation(async (_subject, { turn }) => ({
      delivered: false,
      reason: 'parent-session-not-active',
      envelope: { childSessionId: id, turn, verdict: 'unverified', text: 'turn completed' },
    }));
    h.turnEnded(id);
    await flush();
    expect(h.registry.get(id)?.heldCompletion?.envelope.notice).toMatchObject({ action: 'paused' });

    h.active.add(PARENT);
    await h.spawner.send({ callerSessionId: PARENT, childSessionId: id, message: 'Resume', mode: 'queue' });
    h.turnEnded(id, { timestamp: 2_000 });
    await flush();
    expect(h.registry.get(id)?.heldCompletion?.envelope.turn).toBe(2);
    expect(h.registry.get(id)?.heldCompletion?.envelope.notice).toBeUndefined();
  });

  it('keeps a successor reachable when its succession allowance is exhausted', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxSuccessions': 1 } });
    const child = await h.startChild();
    const first = await requestHandoff(h, child.childSessionId);
    if (!first.ok) throw new Error(first.detail);
    const id = first.successor.childSessionId;
    expect(await requestHandoff(h, id)).toMatchObject({ refusal: 'max-successions-reached' });
    expect(await requestHandoff(h, id)).toMatchObject({ refusal: 'max-successions-reached' });
    await flush();
    expect(h.registry.get(id)).toMatchObject({
      paused: true, notice: { reason: 'succession-limit', measured: 1, limit: 1 },
    });
    expect(h.registry.get(id)?.notice?.unit).toBeUndefined();
    expect(h.registry.get(id)?.terminalStatus).toBeUndefined();
    expect(h.adapter.sendMessageToSession.mock.calls.filter(([target]) => target === PARENT)).toHaveLength(1);
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
  });

  it('escalates a failed successor start and keeps the predecessor live', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    (h.host.startChildSession as jest.Mock).mockResolvedValueOnce({ started: false, error: 'provider failed' });
    expect(await requestHandoff(h, child.childSessionId)).toMatchObject({ refusal: 'session-start-failed' });
    await flush();
    expect(h.registry.get(child.childSessionId)).toMatchObject({
      paused: true, notice: { reason: 'successor-start-failed' },
    });
    expect(h.registry.get(child.childSessionId)?.notice?.measured).toBeUndefined();
    expect(h.registry.get(child.childSessionId)?.notice?.unit).toBeUndefined();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBeUndefined();
    expect(h.active.has(child.childSessionId)).toBe(true);
    expect(h.adapter.sendMessageToSession).toHaveBeenCalledWith(PARENT,
      expect.stringContaining('the successor could not start'), expect.anything());
    expect(h.provisioner.rollback).not.toHaveBeenCalled();
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
  });

  it('keeps the setting sources and reason of the predecessor on the successor', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    const result = await h.spawner.succeed({
      callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`,
      prompt: 'Continue the parser',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.successor).toMatchObject({
      effort: 'high',
      modelSource: 'default',
      effortSource: 'ranking',
      settingReason: { rule: 'router-unavailable', input: 'effort floor high' },
    });
  });

  it('allows a child to request succession and forwards the old id', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    const result = await h.spawner.succeed({
      callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`,
      prompt: 'Continue the parser',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(h.adapter.claimHeldPeerMessages).toHaveBeenCalledWith(
      child.childSessionId,
    );
    expect(h.adapter.sendMessageToSession).not.toHaveBeenCalled();
    const status = h.spawner.status({
      callerSessionId: PARENT,
      childSessionId: child.childSessionId,
    });
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.children[0].childSessionId).toBe(
      result.successor.childSessionId,
    );
    expect(
      await h.spawner.send({
        callerSessionId: PARENT,
        childSessionId: child.childSessionId,
        mode: 'queue',
        message: 'continue',
      }),
    ).toMatchObject({ delivered: true });
    expect(result.successor.succeeds).toBe(child.childSessionId);
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe(
      'handed-off',
    );
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
    h.turnEnded(child.childSessionId);
    await flush();
    expect(h.adapter.interruptSession).toHaveBeenCalledWith(
      child.childSessionId,
      'parent-stop',
    );
    expect(
      await h.spawner.stop({
        callerSessionId: PARENT,
        childSessionId: child.childSessionId,
      }),
    ).toMatchObject({
      ok: false,
      reason: 'handed-off',
      requestedSessionId: child.childSessionId,
      successorId: result.successor.childSessionId,
    });
    expect(
      await h.spawner.stop({
        callerSessionId: PARENT,
        childSessionId: child.childSessionId,
        followHandoff: true,
      }),
    ).toMatchObject({
      ok: true,
      requestedSessionId: child.childSessionId,
      followed: true,
      alreadyEnded: false,
      child: {
        childSessionId: result.successor.childSessionId,
        status: 'stopped',
      },
    });
  });

  it('replays held messages in order after the successor prompt and never stops successor', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    const origin = { kind: 'peer' as const, from: 'parent' };
    h.adapter.claimHeldPeerMessages.mockReturnValue([
      { content: 'one', origin },
      { content: 'two', origin },
    ]);
    const result = await h.spawner.succeed({
      callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`,
      prompt: 'continue',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(h.adapter.claimHeldPeerMessages).toHaveBeenCalledWith(
      child.childSessionId,
    );
    expect(
      h.adapter.sendMessageToSession.mock.calls.map((call) => call[1]),
    ).toEqual(['one', 'two']);
    expect(
      h.adapter.sendMessageToSession.mock.calls.every(
        (call) => call[0] === result.successor.childSessionId,
      ),
    ).toBe(true);
    expect(h.adapter.sendMessageToSession.mock.calls[0][2]).toMatchObject({
      origin,
    });
    expect(h.host.startChildSession).toHaveBeenCalledTimes(2);
    expect(h.host.startChildSession.mock.invocationCallOrder[1]).toBeLessThan(
      h.adapter.claimHeldPeerMessages.mock.invocationCallOrder[0],
    );
    expect(
      h.adapter.claimHeldPeerMessages.mock.invocationCallOrder[0],
    ).toBeLessThan(h.adapter.sendMessageToSession.mock.invocationCallOrder[0]);
    expect(h.adapter.interruptSession).not.toHaveBeenCalledWith(
      result.successor.childSessionId,
      expect.anything(),
    );
  });

  it('keeps replaying after a failed held message and records the loss on the successor', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    const origin = { kind: 'peer' as const, from: 'parent' };
    h.adapter.claimHeldPeerMessages.mockReturnValue([
      { content: 'one', origin },
      { content: 'two\n  lost   message', origin, files: ['a.txt'] },
      { content: 'three', origin },
    ]);
    h.adapter.sendMessageToSession.mockImplementation(
      async (_id: string, content: string) => {
        if (content.startsWith('two')) throw new Error('send failed');
        return undefined;
      },
    );
    const result = await h.spawner.succeed({
      callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`,
      prompt: 'continue',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const successorId = result.successor.childSessionId;
    const calls = h.adapter.sendMessageToSession.mock.calls;
    expect(calls.map((call) => call[1])).toEqual([
      'one',
      'two\n  lost   message',
      'three',
    ]);
    expect(calls.every((call) => call[0] === successorId)).toBe(true);
    const expected = [{ index: 2, preview: 'two lost message [1 file(s)]' }];
    expect(h.registry.get(successorId)?.undeliveredHeldMessages).toEqual(
      expected,
    );
  });

  it('replays held message files and images unchanged to the successor', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    const origin = { kind: 'peer' as const, from: 'parent' };
    const files = ['/tmp/a.txt', '/tmp/b.txt'];
    const images = [{ data: 'AAAA', mediaType: 'image/png' }];
    h.adapter.claimHeldPeerMessages.mockReturnValue([
      { content: 'with attachments', origin, files, images },
    ]);
    const result = await h.spawner.succeed({
      callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`,
      prompt: 'continue',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [id, content, options] = h.adapter.sendMessageToSession.mock.calls[0];
    expect(id).toBe(result.successor.childSessionId);
    expect(content).toBe('with attachments');
    expect(options).toMatchObject({ origin, files, images });
    expect(h.registry.get(id)?.undeliveredHeldMessages).toBeUndefined();
  });

  it('passes the parent live SDK id in the host descriptor and stores it on the successor after parent reparent without SDK id (Defect A)', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    const newParentTab = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';
    const newParentSdk = '88888888-9999-4aaa-8bbb-cccccccccccc';
    // Parent hands off: reparent clears parentSdkSessionId before the new parent's SDK id resolves.
    h.registry.reparent(child.childSessionId, newParentTab, undefined);
    expect(
      h.registry.get(child.childSessionId)?.parentSdkSessionId,
    ).toBeUndefined();
    // Later, the new parent's SDK id resolves in lifecycle.
    h.lifecycleIds.set(newParentTab, newParentSdk);

    const result = await h.spawner.succeed({
      callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`,
      prompt: 'continue after parent handoff',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const secondCallInput = h.host.startChildSession.mock.calls[1][0];
    expect(secondCallInput.descriptor).toMatchObject({
      parentTabId: newParentTab,
      parentSessionId: newParentSdk,
    });
    expect(
      h.registry.get(result.successor.childSessionId)?.parentSdkSessionId,
    ).toBe(newParentSdk);
  });

  it('retires a tool-driven predecessor after the fallback timer', async () => {
    const closer = { close: jest.fn().mockResolvedValue({ kind: 'closed' }) };
    const h = makeHarness({ closer });
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    const result = await h.spawner.succeed({
      callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`,
      prompt: 'continue',
    });
    expect(result.ok).toBe(true);
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
    expect(closer.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(h.adapter.interruptSession).toHaveBeenCalledWith(
      child.childSessionId,
      'parent-stop',
    );
    expect(closer.close).toHaveBeenCalledTimes(1);
    expect(closer.close).toHaveBeenCalledWith(
      child.childSessionId,
      h.registry.get(child.childSessionId)?.sdkSessionId,
    );
  });

  it('refuses a caller outside a live child', async () => {
    const h = makeHarness();
    expect(
      await h.spawner.succeed({
        callerSessionId: PARENT,
        handoffPath: '/tmp/HANDOFF.md',
        prompt: 'continue',
      }),
    ).toMatchObject({
      ok: false,
      refusal: 'not-a-live-child',
    });
  });

  it('keeps a tool-driven predecessor live when successor start fails', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    (h.host.startChildSession as jest.Mock).mockResolvedValueOnce({
      started: false,
      error: 'unavailable',
    });
    const result = await h.spawner.succeed({
      callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`,
      prompt: 'continue',
    });
    expect(result).toMatchObject({
      ok: false,
      refusal: 'session-start-failed',
    });
    expect(
      h.registry.get(child.childSessionId)?.terminalStatus,
    ).toBeUndefined();
    expect(h.registry.liveCount()).toBe(1);
    expect(h.provisioner.rollback).not.toHaveBeenCalled();
    expect(h.agents.settleLaneAdoption).toHaveBeenCalledWith([], 'reverted');
    expect(h.adapter.claimHeldPeerMessages).not.toHaveBeenCalled();
  });

  it('keeps the predecessor when clear_finished runs during a succession that then fails (review M2)', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    let settleStart: (outcome: {
      started: false;
      error: string;
    }) => void = () => undefined;
    (h.host.startChildSession as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleStart = resolve;
        }),
    );
    const handoff = h.spawner.succeed({
      callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`,
      prompt: 'continue',
    });
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe(
      'handed-off',
    );

    const cleared = h.spawner.clearFinished({ callerSessionId: PARENT });
    expect(cleared).toMatchObject({ ok: true, cleared: [] });
    expect(cleared.ok && cleared.skipped).toContainEqual({
      childSessionId: child.childSessionId,
      reason: 'live',
    });

    settleStart({ started: false, error: 'unavailable' });
    expect(await handoff).toMatchObject({
      ok: false,
      refusal: 'session-start-failed',
    });
    expect(
      h.registry.get(child.childSessionId)?.terminalStatus,
    ).toBeUndefined();
    expect(h.registry.liveCount()).toBe(1);
  });

  const endDuringFailedHandoff = async (
    cause: 'provider-error' | 'user-stop',
  ) => {
    const h = makeHarness();
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    let settleStart: (outcome: {
      started: false;
      error: string;
    }) => void = () => undefined;
    (h.host.startChildSession as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleStart = resolve;
        }),
    );
    const handoff = h.spawner.succeed({
      callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`,
      prompt: 'continue',
    });
    await flush();
    h.active.delete(child.childSessionId);
    h.sessionEnd.notifyAll({
      sessionId: child.childSessionId,
      workspaceRoot: child.worktreePath,
      cause,
    });
    settleStart({ started: false, error: 'unavailable' });
    expect(await handoff).toMatchObject({
      ok: false,
      refusal: 'session-start-failed',
    });
    expect(
      h.registry.get(child.childSessionId)?.terminalStatus,
    ).toBeUndefined();
    jest.advanceTimersByTime(30_000);
    await flush();
    return { h, child };
  };

  it('does not start a successor that a parent stop ended during the MCP root retain', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    let releaseRetain: (value: { registered: boolean }) => void = () =>
      undefined;
    h.registrar.retainRoot.mockImplementationOnce(
      () =>
        new Promise<{ registered: boolean }>((resolve) => {
          releaseRetain = resolve;
        }),
    );
    const starts = (h.host.startChildSession as jest.Mock).mock.calls.length;
    const pending = h.spawner.succeed({
      callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`,
      prompt: 'continue',
    });
    await flush();
    const successorId = h.registry.get(child.childSessionId)?.succeededBy;
    expect(successorId).toBeDefined();
    const stopped = await h.spawner.stop({
      callerSessionId: PARENT,
      childSessionId: child.childSessionId,
      followHandoff: true,
    });
    expect(stopped.ok).toBe(true);
    releaseRetain({ registered: true });
    const result = await pending;
    expect(result.ok).toBe(false);
    expect((h.host.startChildSession as jest.Mock).mock.calls.length).toBe(
      starts,
    );
    // The stop stays a stop: the predecessor is not made live again.
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe(
      'handed-off',
    );
    expect(h.registry.get(successorId as string)?.terminalStatus).toBe(
      'stopped',
    );
  });

  it('recovers a child whose session ended during a failed handoff', async () => {
    const { h, child } = await endDuringFailedHandoff('provider-error');
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe(
      'handed-off',
    );
    expect(h.host.startChildSession).toHaveBeenCalledTimes(3);
    expect(h.host.startChildSession.mock.calls[2][0].prompt).toContain(
      'previous session ended unexpectedly (provider-error)',
    );
  });

  it('keeps a user stop during a failed handoff as a stop', async () => {
    const { h, child } = await endDuringFailedHandoff('user-stop');
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('ended');
    expect(h.host.startChildSession).toHaveBeenCalledTimes(2);
    expect(h.agents.adoptLanes).toHaveBeenLastCalledWith(
      expect.any(Array),
      PARENT,
    );
  });
});

describe('SessionSpawnerService cap-reached predecessor retirement (review P2-B m8)', () => {
  /** A child at the cap (5 min) or paused (6 min) that hands off mid-turn. */
  async function handOffAtCap(minutes: 5 | 6) {
    const closer = { close: jest.fn().mockResolvedValue({ kind: 'closed' }) };
    const h = makeHarness({
      config: { 'agentSessions.maxRuntimeMinutes': 5, 'agentSessions.handoffGraceMinutes': 1 },
      closer,
    });
    const child = await h.startChild();
    const id = child.childSessionId;
    h.markRan(id);
    h.phases.set(id, 'generating');
    jest.advanceTimersByTime(minutes * 60_000);
    await flush();
    expect(h.registry.get(id)?.paused).toEqual(minutes === 6 ? true : undefined);
    const result = await requestHandoff(h, id);
    if (!result.ok) throw new Error(result.detail);
    await flush();
    return { h, id, closer, worktreePath: child.worktreePath, successorId: result.successor.childSessionId };
  }

  it.each([5, 6] as const)('keeps the mid-turn predecessor (minute %s) without a retire timer', async (minutes) => {
    const { h, id } = await handOffAtCap(minutes);
    jest.advanceTimersByTime(30 * 60_000);
    await flush();
    expect(h.registry.get(id)?.terminalStatus).toBe('handed-off');
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
    expect(h.adapter.interruptCurrentTurn).not.toHaveBeenCalled();
    expect(h.adapter.endSession).not.toHaveBeenCalled();
    expect(h.lines.join('\n')).toContain(`${id} paused at the cap; retires at its turn end`);
  });

  it.each([5, 6] as const)('releases the predecessor (minute %s) when its session ends', async (minutes) => {
    const { h, id, closer, worktreePath } = await handOffAtCap(minutes);
    const sdkSessionId = h.registry.get(id)?.sdkSessionId;
    h.active.delete(id);
    h.sessionEnd.notifyAll({ sessionId: id, workspaceRoot: worktreePath, cause: 'stream-exit' });
    await flush();
    expect(closer.close).toHaveBeenCalledWith(id, sdkSessionId);
    expect(h.registrar.releaseRoot).toHaveBeenCalledTimes(1);
    expect(h.dispositions.lookup({ tabId: id })).toBeUndefined();
    expect(h.spawner.clearFinished({ callerSessionId: PARENT, childSessionIds: [id] }))
      .toMatchObject({ skipped: [] });
    // The end is the predecessor's own: no successor, interrupt or second close.
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(h.host.startChildSession).toHaveBeenCalledTimes(2);
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
    expect(closer.close).toHaveBeenCalledTimes(1);
  });

  it('retires the predecessor with parent-stop at its turn end', async () => {
    const { h, id, closer, successorId } = await handOffAtCap(6);
    h.phases.set(id, 'idle');
    h.turnEnded(id);
    await flush();
    expect(h.adapter.interruptSession).toHaveBeenCalledWith(id, 'parent-stop');
    expect(h.adapter.interruptSession).not.toHaveBeenCalledWith(successorId, expect.anything());
    expect(closer.close).toHaveBeenCalledTimes(1);
    expect(h.active.has(successorId)).toBe(true);
  });

  it('retires at once a predecessor whose turn already ended when the handoff returned', async () => {
    const closer = { close: jest.fn().mockResolvedValue({ kind: 'closed' }) };
    const h = makeHarness({
      config: { 'agentSessions.maxRuntimeMinutes': 5, 'agentSessions.handoffGraceMinutes': 1 },
      closer,
    });
    const child = await h.startChild();
    const id = child.childSessionId;
    h.markRan(id);
    h.phases.set(id, 'idle');
    jest.advanceTimersByTime(6 * 60_000);
    await flush();
    expect(await requestHandoff(h, id)).toMatchObject({ ok: true });
    await flush();
    expect(h.adapter.interruptSession).toHaveBeenCalledWith(id, 'parent-stop');
    expect(closer.close).toHaveBeenCalledTimes(1);
    expect(h.registrar.releaseRoot).toHaveBeenCalledTimes(1);
  });

  it('ends the predecessor with parent-stop on the successor acknowledgement once it is idle', async () => {
    const { h, id, closer, successorId } = await handOffAtCap(6);
    expect(h.spawner.retireAcknowledgedPredecessor(successorId)).toBe('awaiting-turn-end');
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();

    // The turn-state phase reached idle, but no turn-end event retired it.
    h.phases.set(id, 'idle');
    expect(h.spawner.retireAcknowledgedPredecessor(successorId)).toBe('retired');
    await flush();
    expect(h.adapter.interruptSession).toHaveBeenCalledWith(id, 'parent-stop');
    expect(h.adapter.interruptSession).not.toHaveBeenCalledWith(successorId, expect.anything());
    expect(closer.close).toHaveBeenCalledWith(id, h.registry.get(id)?.sdkSessionId);
    expect(h.registrar.releaseRoot).toHaveBeenCalledTimes(1);
    expect(h.spawner.retireAcknowledgedPredecessor(successorId)).toBe('none');
    expect(h.spawner.retireAcknowledgedPredecessor(id)).toBe('none');
  });

  it('waits for the turn of a queued follow-up before it retires an idle predecessor', async () => {
    const { h, id, closer, successorId } = await handOffAtCap(6);
    h.phases.set(id, 'idle');
    const queued: string[] = ['follow-up'];
    Object.assign(h.adapter, { listQueuedFollowUps: jest.fn(() => queued) });
    expect(h.spawner.retireAcknowledgedPredecessor(successorId)).toBe('awaiting-turn-end');
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();

    // The follow-up turn ran and ended: now the predecessor is idle.
    queued.length = 0;
    expect(h.spawner.retireAcknowledgedPredecessor(successorId)).toBe('retired');
    await flush();
    expect(h.adapter.interruptSession).toHaveBeenCalledWith(id, 'parent-stop');
    expect(closer.close).toHaveBeenCalledTimes(1);
  });
});

it('measures a runtime-cap pause from the cap start and reports the cap as its limit (review P2-B m9)', async () => {
  const h = makeHarness({
    config: { 'agentSessions.maxRuntimeMinutes': 5, 'agentSessions.handoffGraceMinutes': 2 },
  });
  const child = await h.startChild();
  h.markRan(child.childSessionId);
  jest.advanceTimersByTime(7 * 60_000);
  await flush();
  expect(h.registry.get(child.childSessionId)?.notice).toMatchObject({
    reason: 'runtime-cap', measured: 7 * 60_000, limit: 5 * 60_000, unit: 'milliseconds',
  });
  expect(h.adapter.sendMessageToSession).toHaveBeenCalledWith(PARENT,
    expect.stringContaining('runtime reached 7 minutes'), expect.anything());
});
