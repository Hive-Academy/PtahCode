import { makeHarness, PARENT } from './session-spawner.service.spec';

// The spawner looks for the handoff file with real file I/O, which fake timers
// and a microtask flush cannot settle. The file is absent in every case here.
jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  access: jest.fn(async () => {
    throw new Error('ENOENT');
  }),
}));

const flush = async (): Promise<void> => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

describe('SessionSpawnerService succession', () => {
  it.each(['user-stop', 'parent-stop', 'workspace-close', 'host-shutdown'] as const)(
    'ends %s without a successor and records how to find the work', async (cause) => {
      const h = makeHarness();
      const child = await h.startChild();
      h.active.delete(child.childSessionId);
      h.sessionEnd.notifyAll({ sessionId: child.childSessionId, workspaceRoot: child.worktreePath, cause });
      jest.advanceTimersByTime(30_000);
      await flush();
      expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('ended');
      expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
      expect(h.agents.adoptLanes).toHaveBeenCalledWith(expect.any(Array), PARENT);
      expect(h.logger.info).toHaveBeenCalledWith(expect.stringContaining(child.worktreePath));
      expect(h.logger.info).toHaveBeenCalledWith(expect.stringContaining(child.branch));
      expect(h.logger.info).toHaveBeenCalledWith(expect.stringContaining(child.childSessionId));
    },
  );

  it.each(['stream-exit', 'provider-error', 'config-reinit', 'compaction-abort', 'unknown'] as const)(
    'starts a recovery successor for %s', async (cause) => {
      const h = makeHarness();
      const child = await h.startChild();
      h.active.delete(child.childSessionId);
      h.sessionEnd.notifyAll({ sessionId: child.childSessionId, workspaceRoot: child.worktreePath, cause });
      jest.advanceTimersByTime(30_000);
      await flush();
      expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('handed-off');
      expect(h.registry.resolveLatest(child.childSessionId)?.worktreePath).toBe(child.worktreePath);
      expect(h.host.startChildSession.mock.calls[1][0].prompt).toContain(`previous session ended unexpectedly (${cause})`);
      if (cause === 'unknown') expect(h.lines.join('\n')).toContain('unknown cause');
    },
  );

  it('ends after recovery successor start fails and moves lanes to parent', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.active.delete(child.childSessionId);
    (h.host.startChildSession as jest.Mock).mockResolvedValueOnce({ started: false, error: 'provider failed' });
    h.sessionEnd.notifyAll({ sessionId: child.childSessionId, workspaceRoot: child.worktreePath, cause: 'provider-error' });
    jest.advanceTimersByTime(30_000);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('ended');
    expect(h.registry.get(child.childSessionId)?.endReason).toContain('automatic successor failed: provider failed');
    expect(h.agents.adoptLanes).toHaveBeenCalledWith(expect.any(Array), PARENT);
    expect(h.provisioner.rollback).not.toHaveBeenCalled();
  });

  it('ends an unexpected session when its succession limit is zero', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxSuccessions': 0 } });
    const child = await h.startChild();
    h.active.delete(child.childSessionId);
    h.sessionEnd.notifyAll({ sessionId: child.childSessionId, workspaceRoot: child.worktreePath,
      cause: 'stream-exit' });
    jest.advanceTimersByTime(30_000);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('ended');
    expect(h.registry.get(child.childSessionId)?.endReason).toContain('max successions reached');
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
  });

  it('warns before the cap without ending or interrupting the child', async () => {
    const h = makeHarness({ config: {
      'agentSessions.maxRuntimeMinutes': 5,
      'agentSessions.runtimeWarnLeadMinutes': 1,
    } });
    const child = await h.startChild();
    h.phases.set(child.childSessionId, 'generating');
    jest.advanceTimersByTime(4 * 60_000);
    await flush();
    expect(h.adapter.sendMessageToSession).toHaveBeenCalledWith(
      child.childSessionId, expect.stringContaining('runtime cap'),
      expect.objectContaining({ origin: expect.objectContaining({ kind: 'peer', name: 'Ptah host' }) }),
    );
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBeUndefined();
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
  });

  it('replaces an idle child in the same worktree and signals its parent once', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxRuntimeMinutes': 5 } });
    const child = await h.startChild();
    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(5 * 60_000);
    await flush();
    const predecessor = h.registry.get(child.childSessionId);
    const successor = h.registry.resolveLatest(child.childSessionId);
    expect(predecessor?.terminalStatus).toBe('handed-off');
    expect(successor?.childSessionId).not.toBe(child.childSessionId);
    expect(successor).toMatchObject({
      parentSessionId: PARENT, branch: child.branch,
      worktreePath: child.worktreePath, succeeds: child.childSessionId,
    });
    expect(h.registry.liveCount()).toBe(1);
    expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
    expect(h.notifier.signalSessionChild.mock.calls[0][1]).toMatchObject({ status: 'handed-off' });
  });

  it('waits for a busy turn boundary without interrupting', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxRuntimeMinutes': 5 } });
    const child = await h.startChild();
    h.phases.set(child.childSessionId, 'generating');
    jest.advanceTimersByTime(5 * 60_000);
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBeUndefined();
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
    h.turnEnded(child.childSessionId);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('handed-off');
  });

  it('adopts running lanes before starting the successor', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxRuntimeMinutes': 5 } });
    const child = await h.startChild();
    h.agents.adoptLanes.mockReturnValueOnce(['lane-1']);
    h.phases.set(child.childSessionId, 'generating');
    jest.advanceTimersByTime(5 * 60_000);
    h.turnEnded(child.childSessionId);
    await flush();
    const successor = h.registry.resolveLatest(child.childSessionId);
    expect(h.agents.adoptLanes).toHaveBeenCalledWith([child.childSessionId], successor?.childSessionId);
    expect(h.agents.settleLaneAdoption).toHaveBeenCalledWith(['lane-1'], 'kept');
  });

  it('interrupts at grace expiry and continues in a successor', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxRuntimeMinutes': 5,
      'agentSessions.handoffGraceMinutes': 1 } });
    const child = await h.startChild();
    h.phases.set(child.childSessionId, 'generating');
    jest.advanceTimersByTime(6 * 60_000);
    await flush();
    expect(h.adapter.interruptSession).toHaveBeenCalledWith(child.childSessionId, 'parent-stop');
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('handed-off');
    expect(h.host.startChildSession.mock.calls[1][0].prompt).toContain('interrupted mid-step');
  });

  it('uses the safety net when no succession is allowed', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxRuntimeMinutes': 5,
      'agentSessions.maxSuccessions': 0 } });
    const child = await h.startChild();
    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(5 * 60_000);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('timed-out');
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
  });

  it('applies the chain limit to the successor', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxRuntimeMinutes': 5,
      'agentSessions.maxSuccessions': 1 } });
    const child = await h.startChild();
    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(5 * 60_000);
    await flush();
    const successor = h.registry.resolveLatest(child.childSessionId);
    expect(successor?.successionCount).toBe(1);
    if (!successor) return;
    h.phases.set(successor.childSessionId, 'idle');
    jest.advanceTimersByTime(5 * 60_000);
    await flush();
    expect(h.registry.get(successor.childSessionId)?.terminalStatus).toBe('timed-out');
  });

  it('uses the safety net after a successor start failure without rolling back the worktree', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxRuntimeMinutes': 5 } });
    const child = await h.startChild();
    (h.host.startChildSession as jest.Mock).mockResolvedValueOnce({ started: false, error: 'provider failed' });
    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(5 * 60_000);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('timed-out');
    expect(h.registry.get(child.childSessionId)?.endReason).toContain('work is kept');
    expect(h.provisioner.rollback).not.toHaveBeenCalled();
    expect(h.agents.adoptLanes).toHaveBeenCalledWith(expect.any(Array), PARENT);
  });

  it('allows a child to request succession and forwards the old id', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    const result = await h.spawner.succeed({ callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`, prompt: 'Continue the parser' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const status = h.spawner.status({ callerSessionId: PARENT, childSessionId: child.childSessionId });
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.children[0].childSessionId).toBe(result.successor.childSessionId);
    expect(await h.spawner.send({ callerSessionId: PARENT, childSessionId: child.childSessionId,
      mode: 'queue', message: 'continue' })).toMatchObject({ delivered: true });
    expect(result.successor.succeeds).toBe(child.childSessionId);
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('handed-off');
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
    h.turnEnded(child.childSessionId);
    await flush();
    expect(h.adapter.interruptSession).toHaveBeenCalledWith(child.childSessionId, 'parent-stop');
    expect(await h.spawner.stop({ callerSessionId: PARENT, childSessionId: child.childSessionId }))
      .toMatchObject({ ok: true, child: { childSessionId: result.successor.childSessionId, status: 'stopped' } });
  });

  it('retires a tool-driven predecessor after the fallback timer', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    const result = await h.spawner.succeed({ callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`, prompt: 'continue' });
    expect(result.ok).toBe(true);
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(h.adapter.interruptSession).toHaveBeenCalledWith(child.childSessionId, 'parent-stop');
  });

  it('refuses a caller outside a live child', async () => {
    const h = makeHarness();
    expect(await h.spawner.succeed({ callerSessionId: PARENT,
      handoffPath: '/tmp/HANDOFF.md', prompt: 'continue' })).toMatchObject({
        ok: false, refusal: 'not-a-live-child',
      });
  });

  it('keeps a tool-driven predecessor live when successor start fails', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    (h.host.startChildSession as jest.Mock).mockResolvedValueOnce({ started: false, error: 'unavailable' });
    const result = await h.spawner.succeed({ callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`, prompt: 'continue' });
    expect(result).toMatchObject({ ok: false, refusal: 'session-start-failed' });
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBeUndefined();
    expect(h.registry.liveCount()).toBe(1);
    expect(h.provisioner.rollback).not.toHaveBeenCalled();
    expect(h.agents.settleLaneAdoption).toHaveBeenCalledWith([], 'reverted');
  });

  const endDuringFailedHandoff = async (cause: 'provider-error' | 'user-stop') => {
    const h = makeHarness();
    const child = await h.startChild();
    let settleStart: (outcome: { started: false; error: string }) => void = () => undefined;
    (h.host.startChildSession as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => { settleStart = resolve; }));
    const handoff = h.spawner.succeed({ callerSessionId: child.childSessionId,
      handoffPath: `${child.worktreePath}/HANDOFF.md`, prompt: 'continue' });
    await flush();
    h.active.delete(child.childSessionId);
    h.sessionEnd.notifyAll({ sessionId: child.childSessionId, workspaceRoot: child.worktreePath, cause });
    settleStart({ started: false, error: 'unavailable' });
    expect(await handoff).toMatchObject({ ok: false, refusal: 'session-start-failed' });
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBeUndefined();
    jest.advanceTimersByTime(30_000);
    await flush();
    return { h, child };
  };

  it('recovers a child whose session ended during a failed handoff', async () => {
    const { h, child } = await endDuringFailedHandoff('provider-error');
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('handed-off');
    expect(h.host.startChildSession).toHaveBeenCalledTimes(3);
    expect(h.host.startChildSession.mock.calls[2][0].prompt)
      .toContain('previous session ended unexpectedly (provider-error)');
  });

  it('keeps a user stop during a failed handoff as a stop', async () => {
    const { h, child } = await endDuringFailedHandoff('user-stop');
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('ended');
    expect(h.host.startChildSession).toHaveBeenCalledTimes(2);
    expect(h.agents.adoptLanes).toHaveBeenLastCalledWith(expect.any(Array), PARENT);
  });
});
