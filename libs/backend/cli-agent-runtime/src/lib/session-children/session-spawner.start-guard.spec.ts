/**
 * Start guards of a child session (TASK_2026_932 E / E2): a failed first turn
 * is reported as a failed start, the first-turn watchdog, the early
 * `starting` record and the implicit idempotency of a retried start.
 */
import { join } from 'node:path';
import {
  denySessionSpawnerHandoffAccess,
  sessionSpawnerFsKind,
} from './__fixtures__/session-spawner-fs-access';
import { mutableMemoryProbe } from '../__fixtures__/memory-probe';
import { makeHarness, PARENT } from './session-spawner.service.spec';
import { formatWatchdogRetry } from '@ptah-extension/shared';
import { ProviderTurnEndError } from '@ptah-extension/agent-sdk';
import { SESSION_CHILD_FIRST_TURN_TIMEOUT_MS } from './session-child-first-turn.watchdog';
import { SESSION_CHILD_STOP_START_WAIT_MS } from './session-start-stop-wait';
import type { SessionChildStartResult } from './session-spawner.port';

// The succession path looks for a handoff file with real file I/O, which fake
// timers and a microtask flush cannot settle. The file is absent here.
denySessionSpawnerHandoffAccess();

const CHILD_SDK_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const PARENT_SDK_ID = '22222222-3333-4444-8555-666666666666';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

type Harness = ReturnType<typeof makeHarness>;

function failedSettles(h: Harness): unknown[] {
  return h.notifier.signalSessionChild.mock.calls.filter(
    ([, settle]) => (settle as { status?: string }).status === 'failed',
  );
}

function listed(h: Harness) {
  const result = h.spawner.status({ callerSessionId: PARENT });
  if (!result.ok) throw new Error(`status refused: ${result.reason}`);
  return result.children;
}

describe('SessionSpawnerService memory admission', () => {
  let memory = mutableMemoryProbe();
  beforeEach(() => { memory = mutableMemoryProbe(); });

  function queuedHarness() {
    const h = makeHarness({ memoryProbe: memory.probe, config: {
      'agentOrchestration.minFreeMemoryGb': 1,
      'agentOrchestration.spawnQueueTimeoutMs': 60_000,
      'agentSessions.maxConcurrent': 1,
    } });
    return h;
  }

  it('returns the same queued child on a retried branch', async () => {
    const h = queuedHarness();
    const first = await h.spawner.start(h.request());
    const retry = await h.spawner.start(h.request());
    expect(retry).toMatchObject({ ok: true, alreadyExists: true, child: { status: 'queued' } });
    if (!first.ok || !retry.ok) throw new Error('expected queued child');
    expect(retry.child.childSessionId).toBe(first.child.childSessionId);
    h.spawner.dispose();
  });

  it('does not start after stop wins the dequeue microtask race', async () => {
    const h = queuedHarness();
    const first = await h.spawner.start(h.request());
    if (!first.ok) throw new Error('expected queued child');
    memory.setBytes(2 * 1024 ** 3);
    jest.advanceTimersByTime(1000);
    const stopped = h.spawner.stop({ callerSessionId: PARENT, childSessionId: first.child.childSessionId });
    await stopped;
    await flush();
    expect(h.provisioner.create).not.toHaveBeenCalled();
    expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
    expect(await h.spawner.start(h.request({ branch: 'feat/other' }))).toMatchObject({ ok: true });
    h.spawner.dispose();
  });

  it('records a model refusal after memory admission', async () => {
    const h = queuedHarness();
    h.host.resolveChildModel.mockResolvedValueOnce({ accepted: false, code: 'invalid-model', message: 'missing model' });
    const first = await h.spawner.start(h.request({ model: 'missing' }));
    if (!first.ok) throw new Error('expected queued child');
    memory.setBytes(2 * 1024 ** 3);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(listed(h)[0].status).toBe('failed');
    expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
    h.spawner.dispose();
  });

  it('queues, holds the cap, and starts after memory becomes available', async () => {
    const h = queuedHarness();
    const start = await h.spawner.start(h.request());
    expect(start.ok && start.child.status).toBe('queued');
    if (!start.ok) throw new Error('expected queued child');
    const created = jest.fn();
    h.spawner.onQueuedStart(start.child.childSessionId, created);
    expect(h.provisioner.create).not.toHaveBeenCalled();
    expect(listed(h)[0].status).toBe('queued');
    expect(await h.spawner.start(h.request({ branch: 'feat/other' }))).toMatchObject({ ok: false, refusal: 'cap-reached' });
    memory.setBytes(2 * 1024 ** 3);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(h.provisioner.create).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledTimes(1);
    expect(listed(h)[0].status).not.toBe('queued');
    h.spawner.dispose();
  });

  it('releases the worktree claim of a queued attach after it starts or fails', async () => {
    const TASK = 'TASK_2026_2288_5a47';
    const h = queuedHarness();
    memory.setBytes(2 * 1024 ** 3);
    const first = await h.spawner.start(h.request());
    if (!first.ok) throw new Error('first start failed');
    h.registry.markEnded(first.child.childSessionId, 'failed', 'ended by the watchdog');
    h.active.delete(first.child.childSessionId);
    sessionSpawnerFsKind.current = (path) =>
      String(path).endsWith(join('specs', TASK, 'task.md')) ? 'file' : undefined;
    const claims = (): number =>
      (h.spawner as unknown as { attachClaims: Set<string> }).attachClaims.size;
    const attach = () => h.request({ taskId: TASK, attachToSessionId: first.child.childSessionId });
    try {
      for (const failAttach of [false, true]) {
        memory.setBytes(0);
        if (failAttach) {
          h.provisioner.attach.mockResolvedValueOnce({ ok: false, refusal: 'worktree-failed', detail: 'gone' } as never);
        }
        const queued = await h.spawner.start(attach());
        expect(queued.ok && queued.child.status).toBe('queued');
        memory.setBytes(2 * 1024 ** 3);
        jest.advanceTimersByTime(1000);
        await flush();
        expect(h.provisioner.attach).toHaveBeenCalled();
        expect(claims()).toBe(0);
        if (queued.ok && !failAttach) {
          h.registry.markEnded(queued.child.childSessionId, 'failed', 'ended');
          h.active.delete(queued.child.childSessionId);
        }
      }
    } finally {
      sessionSpawnerFsKind.current = null;
      h.spawner.dispose();
    }
  });

  it('times out visibly, signals once, and releases its cap', async () => {
    const h = queuedHarness();
    const start = await h.spawner.start(h.request());
    if (!start.ok) throw new Error('expected queued start');
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(listed(h)[0].status).toBe('timed-out');
    expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
    const next = await h.spawner.start(h.request({ branch: 'feat/other' }));
    expect(next.ok && next.child.status).toBe('queued');
    h.spawner.dispose();
  });

  it('records provisioning failure after admission and signals once', async () => {
    const h = queuedHarness();
    h.provisioner.create.mockRejectedValueOnce(new Error('disk full'));
    const start = await h.spawner.start(h.request());
    if (!start.ok) throw new Error('expected queued start');
    memory.setBytes(2 * 1024 ** 3);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(listed(h)[0].status).toBe('failed');
    expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
    h.spawner.dispose();
  });

  it('cancels a queued admission once, including a repeated stop', async () => {
    const h = queuedHarness();
    const start = await h.spawner.start(h.request());
    if (!start.ok) throw new Error('expected queued start');
    const query = { callerSessionId: PARENT, childSessionId: start.child.childSessionId };
    expect(await h.spawner.stop(query)).toMatchObject({ ok: true, alreadyEnded: false });
    expect(await h.spawner.stop(query)).toMatchObject({ ok: true, alreadyEnded: true });
    await flush();
    expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    h.spawner.dispose();
  });

  it('cancels a queued admission when its handoff predecessor ends', async () => {
    const h = queuedHarness();
    const start = await h.spawner.start(h.request());
    if (!start.ok) throw new Error('expected queued start');
    h.sessionEnd.notifyAll({ sessionId: PARENT, workspaceRoot: start.child.worktreePath, cause: 'normal' });
    await flush();
    expect(listed(h)[0].status).toBe('stopped');
    expect(h.registry.get(start.child.childSessionId)?.endReason).toContain('parent session ended');
    expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    h.spawner.dispose();
  });

  it.each(['normal', 'succeed'] as const)(
    'cancels after dequeue while provisioning when the parent ends (%s)', async (cause) => {
      const h = queuedHarness();
      const release = holdProvisioner(h);
      const start = await h.spawner.start(h.request());
      if (!start.ok) throw new Error('expected queued start');
      memory.setBytes(2 * 1024 ** 3);
      jest.advanceTimersByTime(1000);
      await flush();
      expect(h.provisioner.create).toHaveBeenCalledTimes(1);
      h.sessionEnd.notifyAll({ sessionId: PARENT, workspaceRoot: start.child.worktreePath, cause });
      release();
      await flush();
      expect(h.host.startChildSession).not.toHaveBeenCalled();
      expect(h.provisioner.rollback).toHaveBeenCalledTimes(1);
      expect(listed(h)[0].status).toBe('stopped');
      expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
      const next = await h.spawner.start(h.request({ branch: 'feat/other' }));
      expect(next).toMatchObject({ ok: true });
      h.spawner.dispose();
    },
  );

  it('cancels at MCP retention before the host starts, using the parent SDK id', async () => {
    const h = queuedHarness();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    h.registrar.retainRoot.mockImplementationOnce(async () => {
      await gate;
      return { registered: true };
    });
    const start = await h.spawner.start(h.request());
    if (!start.ok) throw new Error('expected queued start');
    memory.setBytes(2 * 1024 ** 3);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(h.registrar.retainRoot).toHaveBeenCalledTimes(1);
    h.sessionEnd.notifyAll({ sessionId: PARENT_SDK_ID, workspaceRoot: start.child.worktreePath, cause: 'normal' });
    release();
    await flush();
    expect(h.host.startChildSession).not.toHaveBeenCalled();
    expect(h.provisioner.rollback).toHaveBeenCalledTimes(1);
    expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
    expect(listed(h)[0].status).toBe('stopped');
    expect(await h.spawner.start(h.request({ branch: 'feat/next' }))).toMatchObject({ ok: true });
    h.spawner.dispose();
  });

  it('interrupts a host start completed after the parent SDK session ends', async () => {
    const h = queuedHarness();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    h.host.startChildSession.mockImplementationOnce(async (input) => {
      await gate;
      h.active.add(input.tabId);
      return { started: true as const, uiAnnounced: true };
    });
    const start = await h.spawner.start(h.request());
    if (!start.ok) throw new Error('expected queued start');
    memory.setBytes(2 * 1024 ** 3);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
    h.sessionEnd.notifyAll({ sessionId: PARENT_SDK_ID, workspaceRoot: start.child.worktreePath, cause: 'succeed' });
    release();
    await flush();
    expect(h.adapter.interruptSession).toHaveBeenCalledWith(start.child.childSessionId, expect.anything());
    expect(h.provisioner.rollback).toHaveBeenCalledTimes(1);
    expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
    expect(listed(h)[0].status).toBe('stopped');
    expect(await h.spawner.start(h.request({ branch: 'feat/next' }))).toMatchObject({ ok: true });
    h.spawner.dispose();
  });

  it('joins a retried start after admission and reports status as starting', async () => {
    const h = queuedHarness();
    const release = holdProvisioner(h);
    const start = await h.spawner.start(h.request());
    if (!start.ok) throw new Error('expected queued start');
    memory.setBytes(2 * 1024 ** 3);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(listed(h)[0].status).toBe('starting');
    expect(listed(h)[0].waitingForMemory).not.toBe(true);
    let settled = false;
    const retry = h.spawner.start(h.request()).then((result) => { settled = true; return result; });
    await flush();
    expect(settled).toBe(false);
    release();
    await flush();
    expect(await retry).toMatchObject({ ok: true, alreadyExists: true });
    h.spawner.dispose();
  });

  it('stops an admitted start after provisioning settles', async () => {
    const h = queuedHarness();
    const release = holdProvisioner(h);
    const start = await h.spawner.start(h.request());
    if (!start.ok) throw new Error('expected queued start');
    memory.setBytes(2 * 1024 ** 3);
    jest.advanceTimersByTime(1000);
    await flush();
    const stopped = h.spawner.stop({ callerSessionId: PARENT, childSessionId: start.child.childSessionId });
    release();
    expect(await stopped).toMatchObject({ ok: true, child: { status: 'stopped' } });
    expect(h.provisioner.rollback).toHaveBeenCalledTimes(1);
    expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
    h.spawner.dispose();
  });

  it('bounds a stop while admitted provisioning is hung', async () => {
    const h = queuedHarness();
    const release = holdProvisioner(h);
    const start = await h.spawner.start(h.request());
    if (!start.ok) throw new Error('expected queued start');
    memory.setBytes(2 * 1024 ** 3);
    jest.advanceTimersByTime(1000);
    await flush();
    const stopped = h.spawner.stop({ callerSessionId: PARENT, childSessionId: start.child.childSessionId });
    jest.advanceTimersByTime(SESSION_CHILD_STOP_START_WAIT_MS);
    expect(await stopped).toMatchObject({ ok: false, reason: 'starting' });
    release();
    await flush();
    expect(listed(h)[0].status).toBe('stopped');
    expect(h.notifier.signalSessionChild).toHaveBeenCalledTimes(1);
    h.spawner.dispose();
  });

  it('stops a live child when a queued-start listener calls stop', async () => {
    const h = queuedHarness();
    const start = await h.spawner.start(h.request());
    if (!start.ok) throw new Error('expected queued start');
    let stopped: ReturnType<typeof h.spawner.stop> | undefined;
    h.spawner.onQueuedStart(start.child.childSessionId, () => {
      stopped = h.spawner.stop({ callerSessionId: PARENT, childSessionId: start.child.childSessionId });
    });
    memory.setBytes(2 * 1024 ** 3);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(stopped).toBeDefined();
    expect(await stopped).toMatchObject({ ok: true, child: { status: 'stopped' } });
    expect(h.adapter.interruptSession).toHaveBeenCalled();
    h.spawner.dispose();
  });

  it('carries a failed queued rollback into the terminal record and completion', async () => {
    const h = queuedHarness();
    h.host.startChildSession.mockRejectedValueOnce(new Error('host failed'));
    h.provisioner.rollback.mockResolvedValueOnce([
      { step: 'remove-worktree', ok: false, detail: 'locked' },
      { step: 'delete-branch', ok: true },
    ]);
    const start = await h.spawner.start(h.request());
    if (!start.ok) throw new Error('expected queued start');
    memory.setBytes(2 * 1024 ** 3);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(h.registry.get(start.child.childSessionId)?.rollback).toEqual(expect.arrayContaining([
      { step: 'remove-worktree', ok: false, detail: 'locked' },
    ]));
    expect(h.notifier.signalSessionChild.mock.calls[0][0]).toEqual(expect.objectContaining({
      rollback: expect.arrayContaining([expect.objectContaining({ step: 'remove-worktree', ok: false })]),
    }));
    expect(listed(h)[0]).not.toHaveProperty('rollback');
    h.spawner.dispose();
  });

  it('clears admission timers on service disposal', async () => {
    const h = queuedHarness();
    await h.spawner.start(h.request());
    h.spawner.dispose();
    await flush();
    expect(jest.getTimerCount()).toBe(0);
  });
});

/** A `provisioner.create` that waits until the test releases it. */
function holdProvisioner(h: Harness): () => void {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const real = h.provisioner.create.getMockImplementation();
  h.provisioner.create.mockImplementationOnce(async (root: string, branch: string) => {
    await gate;
    if (!real) throw new Error('provisioner mock has no implementation');
    return real(root, branch);
  });
  return release;
}

describe('SessionSpawnerService — failed first turn on session end', () => {
  it.each(['provider-error', 'stream-exit', 'unknown'] as const)(
    'fails a child that ends with 0 turns and no SDK id (%s) and never starts a successor',
    async (cause) => {
      const h = makeHarness();
      const child = await h.startChild();
      h.active.delete(child.childSessionId);
      h.sessionEnd.notifyAll({
        sessionId: child.childSessionId,
        workspaceRoot: child.worktreePath,
        cause,
      });
      jest.advanceTimersByTime(30_000);
      await flush();

      const record = h.registry.get(child.childSessionId);
      expect(record?.terminalStatus).toBe('failed');
      expect(record?.endCause).toBe('first-turn-not-started');
      expect(record?.endReason).toContain(`session ended: ${cause}`);
      expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
      expect(failedSettles(h)).toHaveLength(1);
      const [snapshot] = listed(h);
      expect(snapshot.outcome).toMatchObject({
        kind: 'failed',
        cause: 'first-turn-not-started',
        reason: 'first turn did not start',
      });
    },
  );

  it('still routes a child that ran a turn to an automatic successor', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.idResolved.notifyAll({ tabId: child.childSessionId, realSessionId: CHILD_SDK_ID, timestamp: 1 });
    h.active.delete(child.childSessionId);
    h.sessionEnd.notifyAll({
      sessionId: child.childSessionId,
      workspaceRoot: child.worktreePath,
      cause: 'provider-error',
    });
    jest.advanceTimersByTime(30_000);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('handed-off');
  });
});

describe('SessionSpawnerService — first-turn watchdog', () => {
  it.each(['idle', 'generating'] as const)('leaves an unbound %s child live while the end is uncertain', async (phase) => {
    const h = makeHarness();
    const child = await h.startChild();
    h.phases.set(child.childSessionId, phase);
    if (phase === 'idle') h.lifecycleIds.set(child.childSessionId, null);
    jest.advanceTimersByTime(SESSION_CHILD_FIRST_TURN_TIMEOUT_MS);
    await flush();

    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBeUndefined();
    expect(h.lines.join(' ')).toContain('awaiting a confirmed provider end');
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
    expect(failedSettles(h)).toHaveLength(0);
  });

  it('fails a child with no SDK id, no turn and no running turn', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.active.delete(child.childSessionId);
    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(SESSION_CHILD_FIRST_TURN_TIMEOUT_MS);
    await flush();

    expect(h.registry.get(child.childSessionId)).toMatchObject({
      terminalStatus: 'failed',
      endCause: 'first-turn-not-started',
      endReason: expect.stringContaining('no first turn after 120s'),
    });
    expect(failedSettles(h)).toHaveLength(1);
    expect(h.adapter.interruptSession).not.toHaveBeenCalled();
    expect(h.adapter.endSession).not.toHaveBeenCalled();
  });

  it('defers a watchdog-generated turn failure to the typed session end', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    const abortController = new AbortController();
    const reason = new ProviderTurnEndError('provider-no-response');
    abortController.abort(reason);
    h.lifecycle.find.mockImplementationOnce(() => ({
      realSessionId: null,
      permissionLevel: 'yolo',
      abortController,
    }));
    h.adapterEvents.emitTurnFailed({
      sessionId: child.childSessionId,
      cwd: child.worktreePath,
      lastAssistantMessage: null,
      error: 'unknown' as never,
      errorDetails: null,
      terminalReason: null,
      timestamp: Date.now(),
    });
    await flush();
    expect(failedSettles(h)).toHaveLength(0);

    h.active.delete(child.childSessionId);
    h.sessionEnd.notifyAll({
      sessionId: child.childSessionId,
      workspaceRoot: child.worktreePath,
      cause: reason.endCause,
      startedAt: reason.startedAt,
      zeroOutwardEvents: true,
    });
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(h.host.startChildSession).toHaveBeenCalledTimes(2);
    expect(failedSettles(h)).toHaveLength(0);
  });

  it.each([false, true])('settles an unbound retry once, with parent changed = %s', async (reparent) => {
    const h = makeHarness();
    const child = await h.startChild();
    const original = h.host.startChildSession.mock.calls[0][0];
    const end = (startedAt: number) => {
      h.active.delete(child.childSessionId);
      h.sessionEnd.notifyAll({
        sessionId: child.childSessionId,
        workspaceRoot: child.worktreePath,
        cause: 'provider-no-response',
        startedAt,
        zeroOutwardEvents: true,
      });
    };
    end(Date.now());
    jest.advanceTimersByTime(4_999);
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await flush();
    expect(h.host.startChildSession).toHaveBeenCalledTimes(2);
    expect(h.host.startChildSession.mock.calls[1][0]).toEqual({
      ...original,
      prompt: `${formatWatchdogRetry()}\n\n${original.prompt}`,
    });
    expect(h.host.recoverAfterWatchdogStop).not.toHaveBeenCalled();

    if (reparent) {
      h.registry.reparent(child.childSessionId, CHILD_SDK_ID, undefined);
    }
    end(Date.now());
    jest.advanceTimersByTime(30_000);
    await flush();
    expect(h.host.startChildSession).toHaveBeenCalledTimes(2);
    expect(failedSettles(h)).toHaveLength(1);
    expect(h.notifier.signalSessionChild).toHaveBeenCalledWith(
      expect.objectContaining({ parentSessionIds: expect.arrayContaining([reparent ? CHILD_SDK_ID : PARENT]) }),
      expect.objectContaining({ status: 'failed' }),
    );
    expect(h.registry.get(child.childSessionId)).toMatchObject({
      terminalStatus: 'failed',
      endReason: expect.stringContaining('could not recover the first turn'),
    });
  });

  it('reserves recovery for a bound child successor across the end-grace window', async () => {
    const h = makeHarness();
    const original = await h.startChild();
    const result = await h.spawner.succeed({
      callerSessionId: original.childSessionId,
      handoffPath: 'HANDOFF.md',
      prompt: 'Continue the work from the notes',
    });
    if (!result.ok) throw new Error(result.detail);
    const successor = result.successor;
    const id = successor.childSessionId;
    h.idResolved.notifyAll({ tabId: id, realSessionId: CHILD_SDK_ID, timestamp: 1 });
    let finish: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    h.host.recoverAfterWatchdogStop.mockImplementationOnce(async () => {
      await gate;
      h.active.add(id);
      return { recovered: true };
    });
    h.active.delete(id);
    h.sessionEnd.notifyAll({
      sessionId: CHILD_SDK_ID,
      workspaceRoot: successor.worktreePath,
      cause: 'provider-no-response',
      zeroOutwardEvents: true,
    });

    jest.advanceTimersByTime(30_000);
    await flush();
    expect(h.host.recoverAfterWatchdogStop).toHaveBeenCalledTimes(1);
    expect(h.host.recoverAfterWatchdogStop).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: CHILD_SDK_ID,
      tabId: id,
      prompt: expect.stringContaining('Continue the work from the notes'),
      senderName: 'Ptah recovery',
    }));
    expect(h.registry.get(id)?.terminalStatus).toBeUndefined();
    expect(h.host.startChildSession).toHaveBeenCalledTimes(2);
    expect(failedSettles(h)).toHaveLength(0);
    finish();
    await flush();
  });

  it.each(['stopped', 'already-active', 'resume-failed'] as const)(
    'rechecks end grace when a replay returns %s after 31 seconds',
    async (reason) => {
      const h = makeHarness();
      const child = await h.startChild();
      const id = child.childSessionId;
      h.idResolved.notifyAll({ tabId: id, realSessionId: CHILD_SDK_ID, timestamp: 1 });
      h.host.recoverAfterWatchdogStop.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => { setTimeout(resolve, 26_000); });
        return { recovered: false, reason };
      });
      h.active.delete(id);
      h.sessionEnd.notifyAll({
        sessionId: CHILD_SDK_ID,
        workspaceRoot: child.worktreePath,
        cause: 'provider-no-response',
        zeroOutwardEvents: true,
      });
      jest.advanceTimersByTime(31_000);
      await flush();

      expect(h.host.recoverAfterWatchdogStop).toHaveBeenCalledTimes(1);
      expect(h.registry.get(id)?.terminalStatus).toBeUndefined();
      jest.advanceTimersByTime(29_000);
      await flush();
      expect(h.registry.get(id)?.terminalStatus).toBeDefined();
      expect(failedSettles(h)).toHaveLength(reason === 'resume-failed' ? 1 : 0);
    },
  );

  it('settles a first turn with unclear progress and skips replay', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.active.delete(child.childSessionId);
    h.sessionEnd.notifyAll({
      sessionId: child.childSessionId,
      workspaceRoot: child.worktreePath,
      cause: 'provider-no-response',
    });
    jest.advanceTimersByTime(30_000);
    await flush();

    expect(h.host.recoverAfterWatchdogStop).not.toHaveBeenCalled();
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
    expect(failedSettles(h)).toHaveLength(1);
    expect(h.registry.get(child.childSessionId)?.endReason).toContain('could not safely retry');
  });

  it('lets explicit close cancel a reserved retry', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.active.delete(child.childSessionId);
    for (const cause of ['provider-no-response', 'tab-close'] as const) {
      h.sessionEnd.notifyAll({
        sessionId: child.childSessionId,
        workspaceRoot: child.worktreePath,
        cause,
        zeroOutwardEvents: true,
      });
    }
    jest.advanceTimersByTime(30_000);
    await flush();
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
    expect(failedSettles(h)).toHaveLength(0);
  });

  it('honors a tab close during the retry delay even without a second end callback', async () => {
    const wasStoppedSince = jest.fn((_id: string, _at: number) => false);
    const h = makeHarness({ wasStoppedSince });
    const child = await h.startChild();
    const startedAt = Date.now();
    h.active.delete(child.childSessionId);
    h.sessionEnd.notifyAll({
      sessionId: child.childSessionId,
      workspaceRoot: child.worktreePath,
      cause: 'provider-no-response',
      startedAt,
      zeroOutwardEvents: true,
    });
    jest.advanceTimersByTime(2_000);
    wasStoppedSince.mockReturnValue(true);
    jest.advanceTimersByTime(3_000);
    await flush();

    expect(wasStoppedSince).toHaveBeenCalledWith(child.childSessionId, startedAt);
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
  });

  it('cancels a reserved retry when a parent handoff changes ownership, even if it rolls back', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.active.delete(child.childSessionId);
    h.sessionEnd.notifyAll({
      sessionId: child.childSessionId,
      workspaceRoot: child.worktreePath,
      cause: 'provider-no-response',
      zeroOutwardEvents: true,
    });
    const formerOwner = h.registry.get(child.childSessionId);
    if (!formerOwner) throw new Error('expected registered child');
    h.registry.reparent(child.childSessionId, CHILD_SDK_ID, undefined);
    h.registry.reparent(child.childSessionId, formerOwner.parentSessionId, formerOwner.parentSdkSessionId);
    jest.advanceTimersByTime(5_000);
    await flush();

    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
  });

  it('clears the watchdog when the parent stops the child', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.active.delete(child.childSessionId);
    h.sessionEnd.notifyAll({
      sessionId: child.childSessionId,
      workspaceRoot: child.worktreePath,
      cause: 'provider-no-response',
      zeroOutwardEvents: true,
    });
    await h.spawner.stop({ callerSessionId: PARENT, childSessionId: child.childSessionId });
    jest.advanceTimersByTime(SESSION_CHILD_FIRST_TURN_TIMEOUT_MS);
    await flush();
    const record = h.registry.get(child.childSessionId);
    expect(record?.endCause).not.toBe('first-turn-not-started');
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
    expect(failedSettles(h)).toHaveLength(0);
  });

  it('clears the watchdog on dispose', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.spawner.dispose();
    jest.advanceTimersByTime(SESSION_CHILD_FIRST_TURN_TIMEOUT_MS);
    await flush();
    expect(h.registry.get(child.childSessionId)?.endCause).toBe('host-shutdown');
    expect(failedSettles(h)).toHaveLength(0);
  });
});

describe('SessionSpawnerService — early starting record', () => {
  it('lists the start with its id as starting while the worktree is created', async () => {
    const h = makeHarness();
    const release = holdProvisioner(h);
    const pending = h.spawner.start(h.request());
    await flush();

    const [starting] = listed(h);
    expect(starting).toMatchObject({ status: 'starting', branch: 'feat/child-1', label: 'parser fix' });
    const byId = h.spawner.status({ callerSessionId: PARENT, childSessionId: starting.childSessionId });
    expect(byId.ok && byId.children[0].childSessionId).toBe(starting.childSessionId);

    release();
    const result = await pending;
    expect(result.ok && 'child' in result && result.child.childSessionId).toBe(starting.childSessionId);
    expect(listed(h)).toHaveLength(1);
    expect(h.registry.pendingOf([PARENT])).toHaveLength(0);
  });

  it('removes the starting record when the worktree is refused', async () => {
    const h = makeHarness();
    h.provisioner.create.mockResolvedValueOnce({
      ok: false,
      refusal: 'worktree-failed',
      detail: 'fatal: disk full',
    } as never);
    const result = await h.spawner.start(h.request());
    expect(result.ok).toBe(false);
    expect(listed(h)).toHaveLength(0);
  });

  it('removes the starting record when the host start fails', async () => {
    const h = makeHarness();
    h.host.startChildSession.mockResolvedValueOnce({ started: false, error: 'boom' } as never);
    const result = await h.spawner.start(h.request());
    expect(result.ok).toBe(false);
    expect(listed(h)).toHaveLength(0);
  });

  it('refuses a stop on a starting id with reason starting (review m5)', async () => {
    const h = makeHarness();
    const release = holdProvisioner(h);
    const pending = h.spawner.start(h.request());
    await flush();
    const [starting] = listed(h);

    const stop = await h.spawner.stop({
      callerSessionId: PARENT,
      childSessionId: starting.childSessionId,
    });
    expect(stop).toMatchObject({ ok: false, reason: 'starting' });
    expect(!stop.ok && stop.detail).toContain('nothing was stopped');

    release();
    expect((await pending).ok).toBe(true);
  });

  it('registers no starting record for invalid arguments', async () => {
    const h = makeHarness();
    const result = await h.spawner.start(h.request({ task: '  ' }));
    expect(result.ok).toBe(false);
    expect(listed(h)).toHaveLength(0);
  });
});

describe('SessionSpawnerService — implicit start idempotency', () => {
  function existing(result: SessionChildStartResult) {
    if (!result.ok) throw new Error(`start refused: ${result.refusal}`);
    return result;
  }

  it('waits for the pending start and returns its child for a second start on the same branch', async () => {
    const h = makeHarness();
    const release = holdProvisioner(h);
    const first = h.spawner.start(h.request());
    await flush();

    let retrySettled = false;
    const retry = h.spawner.start(h.request()).then((result) => {
      retrySettled = true;
      return result;
    });
    await flush();
    expect(retrySettled).toBe(false);
    expect(h.provisioner.create).toHaveBeenCalledTimes(1);

    release();
    const done = existing(await first);
    const second = existing(await retry);
    expect(second.alreadyExists).toBe(true);
    expect(second.child).toEqual(done.child);
    expect(done.alreadyExists).toBeUndefined();
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
  });

  it('returns the real refusal to a second start when the pending start fails later (review M3)', async () => {
    const h = makeHarness();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.provisioner.create.mockImplementationOnce(async () => {
      await gate;
      return { ok: false, refusal: 'worktree-failed', detail: 'fatal: disk full' } as never;
    });
    const first = h.spawner.start(h.request());
    await flush();
    const retry = h.spawner.start(h.request());
    await flush();

    release();
    const [firstResult, retryResult] = await Promise.all([first, retry]);
    expect(firstResult.ok).toBe(false);
    expect(retryResult).toEqual(firstResult);
    expect(listed(h)).toHaveLength(0);
    expect(h.provisioner.create).toHaveBeenCalledTimes(1);
  });

  it('returns the live child for a second start on the same branch', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    const again = existing(await h.spawner.start(h.request()));
    expect(again.alreadyExists).toBe(true);
    expect(again.child.childSessionId).toBe(child.childSessionId);
    expect(h.provisioner.create).toHaveBeenCalledTimes(1);
    expect(h.host.startChildSession).toHaveBeenCalledTimes(1);
  });

  it('starts a new child on another branch', async () => {
    const h = makeHarness();
    await h.startChild();
    const other = existing(await h.spawner.start(h.request({ branch: 'feat/child-2' })));
    expect(other.alreadyExists).toBeUndefined();
    expect(h.provisioner.create).toHaveBeenCalledTimes(2);
  });

  it('starts again on the same branch after the child ended', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    await h.spawner.stop({ callerSessionId: PARENT, childSessionId: child.childSessionId });
    const again = existing(await h.spawner.start(h.request()));
    expect(again.alreadyExists).toBeUndefined();
    expect(again.child.childSessionId).not.toBe(child.childSessionId);
  });
});
