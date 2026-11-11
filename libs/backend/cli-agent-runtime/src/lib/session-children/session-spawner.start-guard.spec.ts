/**
 * Start guards of a child session (TASK_2026_932 E / E2): a failed first turn
 * is reported as a failed start, the first-turn watchdog, the early
 * `starting` record and the implicit idempotency of a retried start.
 */
import { makeHarness, PARENT } from './session-spawner.service.spec';
import { SESSION_CHILD_FIRST_TURN_TIMEOUT_MS } from './session-child-first-turn.watchdog';
import type { SessionChildStartResult } from './session-spawner.port';

// The succession path looks for a handoff file with real file I/O, which fake
// timers and a microtask flush cannot settle. The file is absent here.
jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  access: jest.fn(async () => {
    throw new Error('ENOENT');
  }),
}));

const CHILD_SDK_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';

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
  it('fails a child with no SDK id, no turn and no running turn after the timeout', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    jest.advanceTimersByTime(SESSION_CHILD_FIRST_TURN_TIMEOUT_MS - 1);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBeUndefined();

    jest.advanceTimersByTime(1);
    await flush();
    const record = h.registry.get(child.childSessionId);
    expect(record?.terminalStatus).toBe('failed');
    expect(record?.endCause).toBe('first-turn-not-started');
    expect(record?.endReason).toContain('turn phase none');
    expect(record?.endReason).toContain('lifecycle record present: no');
    expect(record?.endReason).toContain('SDK session id absent');
    expect(failedSettles(h)).toHaveLength(1);
    expect(h.adapter.interruptSession).toHaveBeenCalled();
  });

  it('records the lifecycle record and phase as evidence', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.lifecycleIds.set(child.childSessionId, '');
    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(SESSION_CHILD_FIRST_TURN_TIMEOUT_MS);
    await flush();
    const reason = h.registry.get(child.childSessionId)?.endReason;
    expect(reason).toContain('turn phase idle');
    expect(reason).toContain('lifecycle record present: yes');
  });

  it('leaves a child alone once its SDK id is bound', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.idResolved.notifyAll({ tabId: child.childSessionId, realSessionId: CHILD_SDK_ID, timestamp: 1 });
    jest.advanceTimersByTime(SESSION_CHILD_FIRST_TURN_TIMEOUT_MS);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBeUndefined();
    expect(failedSettles(h)).toHaveLength(0);
  });

  it('leaves a child alone while it awaits permission', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.emitPermission({
      phase: 'requested',
      requestId: 'req-1',
      routingHint: child.childSessionId,
      toolName: 'Bash',
      description: 'run tests',
    } as never);
    jest.advanceTimersByTime(SESSION_CHILD_FIRST_TURN_TIMEOUT_MS);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBeUndefined();
  });

  it('re-arms once while the child generates, then fails it when it stops', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.phases.set(child.childSessionId, 'generating');
    jest.advanceTimersByTime(SESSION_CHILD_FIRST_TURN_TIMEOUT_MS);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBeUndefined();
    expect(h.lines.join('\n')).toContain('watchdog re-armed once');

    h.phases.set(child.childSessionId, 'idle');
    jest.advanceTimersByTime(SESSION_CHILD_FIRST_TURN_TIMEOUT_MS);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBe('failed');
  });

  it('re-arms only one time and leaves a child that still generates running', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    h.phases.set(child.childSessionId, 'generating');
    jest.advanceTimersByTime(SESSION_CHILD_FIRST_TURN_TIMEOUT_MS * 3);
    await flush();
    expect(h.registry.get(child.childSessionId)?.terminalStatus).toBeUndefined();
    expect(h.lines.join('\n')).toContain('left running');
    expect(failedSettles(h)).toHaveLength(0);
  });

  it('clears the watchdog when the parent stops the child', async () => {
    const h = makeHarness();
    const child = await h.startChild();
    await h.spawner.stop({ callerSessionId: PARENT, childSessionId: child.childSessionId });
    jest.advanceTimersByTime(SESSION_CHILD_FIRST_TURN_TIMEOUT_MS);
    await flush();
    const record = h.registry.get(child.childSessionId);
    expect(record?.endCause).not.toBe('first-turn-not-started');
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
