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
      expect.stringContaining('runtime cap'),
      expect.objectContaining({
        origin: expect.objectContaining({ kind: 'peer', name: 'Ptah host' }),
      }),
    );
    expect(
      h.registry.get(child.childSessionId)?.terminalStatus,
    ).toBeUndefined();
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
  });

  it('replaces an idle child in the same worktree and signals its parent once', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxRuntimeMinutes': 5 } });
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(5 * 60_000);
    await flush();
    const predecessor = h.registry.get(child.childSessionId);
    const successor = h.registry.resolveLatest(child.childSessionId);
    expect(predecessor?.terminalStatus).toBe('handed-off');
    expect(successor?.childSessionId).not.toBe(child.childSessionId);
    expect(successor).toMatchObject({
      parentSessionId: PARENT,
      branch: child.branch,
      worktreePath: child.worktreePath,
      succeeds: child.childSessionId,
    });
    expect(h.registry.liveCount()).toBe(1);
    expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
    expect(h.notifier.signalSessionChild.mock.calls[0][1]).toMatchObject({
      status: 'handed-off',
    });
  });

  it('waits for a busy turn boundary without interrupting', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxRuntimeMinutes': 5 } });
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    h.phases.set(child.childSessionId, 'generating');
    jest.advanceTimersByTime(5 * 60_000);
    expect(
      h.registry.get(child.childSessionId)?.terminalStatus,
    ).toBeUndefined();
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
    h.turnEnded(child.childSessionId);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe(
      'handed-off',
    );
  });

  it('adopts running lanes before starting the successor', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxRuntimeMinutes': 5 } });
    // Generating: the first-turn watchdog re-arms once and leaves it running.
    const child = await h.startChild();
    h.agents.adoptLanes.mockReturnValueOnce(['lane-1']);
    h.phases.set(child.childSessionId, 'generating');
    jest.advanceTimersByTime(5 * 60_000);
    h.turnEnded(child.childSessionId);
    await flush();
    const successor = h.registry.resolveLatest(child.childSessionId);
    expect(h.agents.adoptLanes).toHaveBeenCalledWith(
      [child.childSessionId],
      successor?.childSessionId,
    );
    expect(h.agents.settleLaneAdoption).toHaveBeenCalledWith(
      ['lane-1'],
      'kept',
    );
  });

  it('interrupts at grace expiry and continues in a successor', async () => {
    const h = makeHarness({
      config: {
        'agentSessions.maxRuntimeMinutes': 5,
        'agentSessions.handoffGraceMinutes': 1,
      },
    });
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    h.phases.set(child.childSessionId, 'generating');
    jest.advanceTimersByTime(6 * 60_000);
    await flush();
    expect(h.adapter.interruptSession).toHaveBeenCalledWith(
      child.childSessionId,
      'parent-stop',
    );
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe(
      'handed-off',
    );
    expect(h.host.startChildSession.mock.calls[1][0].prompt).toContain(
      'interrupted mid-step',
    );
  });

  it('uses the safety net when no succession is allowed', async () => {
    const h = makeHarness({
      config: {
        'agentSessions.maxRuntimeMinutes': 5,
        'agentSessions.maxSuccessions': 0,
      },
    });
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(5 * 60_000);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe(
      'timed-out',
    );
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
  });

  it('applies the chain limit to the successor', async () => {
    const h = makeHarness({
      config: {
        'agentSessions.maxRuntimeMinutes': 5,
        'agentSessions.maxSuccessions': 1,
      },
    });
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(5 * 60_000);
    await flush();
    const successor = h.registry.resolveLatest(child.childSessionId);
    expect(successor?.successionCount).toBe(1);
    if (!successor) return;
    h.phases.set(successor.childSessionId, 'idle');
    jest.advanceTimersByTime(5 * 60_000);
    await flush();
    expect(h.registry.get(successor.childSessionId)?.terminalStatus).toBe(
      'timed-out',
    );
  });

  it('uses the safety net after a successor start failure without rolling back the worktree', async () => {
    const h = makeHarness({ config: { 'agentSessions.maxRuntimeMinutes': 5 } });
    const child = await h.startChild();
    h.markRan(child.childSessionId);
    (h.host.startChildSession as jest.Mock).mockResolvedValueOnce({
      started: false,
      error: 'provider failed',
    });
    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(5 * 60_000);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe(
      'timed-out',
    );
    expect(h.registry.get(child.childSessionId)?.endReason).toContain(
      'work is kept',
    );
    expect(h.provisioner.rollback).not.toHaveBeenCalled();
    expect(h.agents.adoptLanes).toHaveBeenCalledWith(expect.any(Array), PARENT);
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
