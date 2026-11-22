import type { Logger } from '@ptah-extension/vscode-core';
import type { IAgentAdapter, ParentDeliveryView } from '@ptah-extension/shared';
import { SdkError, SessionActivityRegistry } from '@ptah-extension/agent-sdk';
import { FakeStateStorage } from './__fixtures__/fake-state-storage';
import {
  ParentEnvelopeStoreService,
  type NewParentDeliveryEnvelope,
} from './parent-envelope-store.service';
import { ParentDeliveryDrainerService, type ParentDeliveryEvent } from './parent-delivery-drainer.service';
import { PARENT_ENVELOPE_INDEX_KEY } from './parent-envelope.schema';
import { SessionChildRegistry } from '../../session-children/session-child.registry';
import type { SessionHandoffAckStore } from '../../session-children/session-handoff-ack.store';

const parent = '11111111-2222-4333-8444-555555555555';
const other = '99999999-2222-4333-8444-555555555555';

function logger(): Logger {
  const log: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'> = {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  };
  return log as Logger;
}

function report(key: string, parentSessionId = parent): NewParentDeliveryEnvelope {
  return { id: `lane-delivery:${key}`, dedupeKey: key, parentSessionId, agentId: 'lane',
    kind: 'report', body: `body ${key}`, createdAt: Date.now() };
}

interface Harness {
  readonly storage: FakeStateStorage;
  readonly store: ParentEnvelopeStoreService;
  readonly drainer: ParentDeliveryDrainerService;
  readonly send: jest.Mock<Promise<void>, Parameters<IAgentAdapter['sendMessageToSession']>>;
  readonly events: ParentDeliveryEvent[];
  readonly log: Logger;
  readonly state: { active: boolean };
}

const drainers: ParentDeliveryDrainerService[] = [];

async function harness(
  storage = new FakeStateStorage(),
  activity: SessionActivityRegistry | null = null,
): Promise<Harness> {
  const log = logger();
  const store = new ParentEnvelopeStoreService(log, storage);
  await store.ready;
  const send = jest.fn<Promise<void>, Parameters<IAgentAdapter['sendMessageToSession']>>(
    async () => undefined);
  const events: ParentDeliveryEvent[] = [];
  const state = { active: true };
  const adapter: Pick<IAgentAdapter, 'isSessionActive' | 'sendMessageToSession'> = {
    isSessionActive: () => state.active,
    sendMessageToSession: send,
  };
  const drainer = new ParentDeliveryDrainerService(log, store, adapter as IAgentAdapter, activity,
    { emit: (event) => events.push(event) });
  drainers.push(drainer);
  return { storage, store, send, events, log, state, drainer };
}

afterEach(() => {
  for (const drainer of drainers.splice(0)) drainer.dispose();
  jest.useRealTimers();
});

describe('ParentDeliveryDrainerService', () => {
  it('runs another pass for an envelope enqueued while a send is in flight', async () => {
    const h = await harness();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    h.send.mockImplementationOnce(() => gate);
    await h.drainer.enqueue(report('first'));
    await h.drainer.enqueue(report('second'));
    release();
    await h.drainer.drain(parent);
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.store.find('second')?.state).toBe('delivered');
  });

  it('sends with a stable clientMessageId to the recorded parent only', async () => {
    const h = await harness();
    await h.drainer.enqueue(report('stable'));
    await h.drainer.drain(parent);
    expect(h.send).toHaveBeenCalledWith(parent, 'body stable',
      expect.objectContaining({ clientMessageId: 'lane-delivery:stable' }));
    expect(h.send.mock.calls.every(([session]) => session === parent)).toBe(true);
  });

  it('continues after a post-send callback and sink throw', async () => {
    const h = await harness();
    const drainer = new ParentDeliveryDrainerService(h.log, h.store,
      { isSessionActive: () => true, sendMessageToSession: h.send } as Pick<IAgentAdapter,
        'isSessionActive' | 'sendMessageToSession'> as IAgentAdapter, null,
      { emit: () => { throw new Error('sink failed'); } });
    await drainer.enqueue(report('first'), () => { throw new Error('callback failed'); });
    await drainer.enqueue(report('second'));
    await drainer.drain(parent);
    expect(h.store.find('first')?.state).toBe('delivered');
    expect(h.store.find('second')?.state).toBe('delivered');
  });

  it('holds an inactive parent as parent-offline and drains once on activity', async () => {
    const activity = new SessionActivityRegistry(logger());
    const h = await harness(new FakeStateStorage(), activity);
    h.state.active = false;
    const accepted = jest.fn();
    await h.drainer.enqueue(report('offline'), accepted);
    await h.drainer.drain(parent);
    expect(h.store.find('offline')).toMatchObject({ state: 'pending', waitingReason: 'parent-offline' });
    expect(h.send).not.toHaveBeenCalled();
    h.state.active = true;
    activity.notifyAll({ sessionId: parent, workspaceRoot: '/ws', role: 'user', timestamp: Date.now() });
    await h.drainer.drain(parent);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(accepted).toHaveBeenCalledTimes(1);
  });

  it('drains a tab envelope after the real parent session resolves', async () => {
    const h = await harness();
    await h.drainer.enqueue(report('tab', 'tab-1'));
    await h.drainer.drain('tab-1');
    expect(h.send).not.toHaveBeenCalled();
    await h.drainer.resolveParentSessionId('tab-1', parent);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.store.find('tab')?.parentSessionId).toBe(parent);
  });

  it('never calls the adapter when the sending write fails', async () => {
    const h = await harness();
    h.state.active = false;
    await h.drainer.enqueue(report('fail-closed'));
    await h.drainer.drain(parent);
    h.storage.failWrites = (key, value) => key === PARENT_ENVELOPE_INDEX_KEY &&
      JSON.stringify(value).includes('"sending"');
    h.state.active = true;
    await h.drainer.drain(parent);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.store.find('fail-closed')?.state).toBe('pending');
  });

  it('retries a not-accepted failure with backoff on the drainer timer', async () => {
    jest.useFakeTimers();
    const h = await harness();
    h.send.mockRejectedValueOnce(new SdkError(`Session not found: ${parent}`));
    await h.drainer.enqueue(report('backoff'));
    await h.drainer.drain(parent);
    expect(h.store.find('backoff')).toMatchObject({ state: 'blocked-retryable' });
    await jest.advanceTimersByTimeAsync(4_000);
    expect(h.send).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_500);
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls.map(([, , options]) => options?.clientMessageId))
      .toEqual(['lane-delivery:backoff', 'lane-delivery:backoff']);
    expect(h.store.find('backoff')?.state).toBe('delivered');
  });

  it('keeps a timeout uncertain when the parent ends after the send threw', async () => {
    jest.useFakeTimers();
    const h = await harness();
    h.send.mockImplementationOnce(async () => {
      h.state.active = false;
      throw new Error('timed out');
    });
    await h.drainer.enqueue(report('ended'));
    await h.drainer.drain(parent);
    expect(h.store.find('ended')?.state).toBe('outcome-unknown');
    h.state.active = true;
    await jest.advanceTimersByTimeAsync(15 * 60_000);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('marks an uncertain failure outcome-unknown and never retries it automatically', async () => {
    jest.useFakeTimers();
    const h = await harness();
    h.send.mockRejectedValueOnce(new Error('timed out'));
    await h.drainer.enqueue(report('uncertain'));
    await h.drainer.drain(parent);
    expect(h.store.find('uncertain')?.state).toBe('outcome-unknown');
    await jest.advanceTimersByTimeAsync(15 * 60_000);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(await h.drainer.retry('lane-delivery:uncertain')).toEqual({ refused: 'confirmation-required' });
    await h.drainer.retry('lane-delivery:uncertain', { confirmDuplicateRisk: true });
    await h.drainer.drain(parent);
    expect(h.send).toHaveBeenCalledTimes(2);
  });

  it('keeps no timer for a blocked entry whose parent goes offline', async () => {
    jest.useFakeTimers();
    const h = await harness();
    h.send.mockRejectedValueOnce(new SdkError(`Session not found: ${parent}`));
    await h.drainer.enqueue(report('gone'));
    await h.drainer.drain(parent);
    expect(h.store.find('gone')?.nextRetryAt).toBeDefined();
    h.state.active = false;
    await jest.advanceTimersByTimeAsync(6_000);
    expect(h.store.find('gone')).toMatchObject({ state: 'pending', waitingReason: 'parent-offline' });
    expect(h.store.find('gone')?.nextRetryAt).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not-accepted', new SdkError(`Session not found: ${parent}`)],
    ['uncertain', new Error('timed out')],
  ])('keeps a cancel made during an in-flight send that then fails (%s)', async (_label, error) => {
    const h = await harness();
    let reject: (reason: Error) => void = () => undefined;
    let started = false;
    h.send.mockImplementationOnce(() => {
      started = true;
      return new Promise<void>((_resolve, fail) => { reject = fail; });
    });
    await h.drainer.enqueue(report('cancel-race'));
    const draining = h.drainer.drain(parent);
    while (!started) await new Promise<void>((resolve) => setImmediate(resolve));
    expect(await h.drainer.cancel('lane-delivery:cancel-race')).toMatchObject({ state: 'cancelled' });
    reject(error);
    await draining;
    expect(h.store.find('cancel-race')).toMatchObject({ state: 'cancelled' });
    expect(h.store.find('cancel-race')?.nextRetryAt).toBeUndefined();
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('skips an entry cancelled after the drain snapshot but before markSending', async () => {
    const h = await harness();
    await h.drainer.enqueue(report('cancel-first'));
    const original = h.store.markSending.bind(h.store);
    const markSending = jest.spyOn(h.store, 'markSending').mockImplementationOnce(async (id: string) => {
      await h.store.cancel(id);
      return original(id);
    });
    await h.drainer.drain(parent);
    expect(markSending).toHaveBeenCalledTimes(1);
    await expect(markSending.mock.results[0]?.value).resolves.toBeUndefined();
    expect(h.store.find('cancel-first')).toMatchObject({ state: 'cancelled' });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('does not resend when the delivered write fails after adapter acceptance', async () => {
    const h = await harness();
    await h.drainer.enqueue(report('accepted'));
    h.storage.failWrites = (key, value) => key === PARENT_ENVELOPE_INDEX_KEY &&
      JSON.stringify(value).includes('"delivered"');
    await h.drainer.drain(parent);
    await h.drainer.drain(parent);
    expect(h.send).toHaveBeenCalledTimes(1);
    h.storage.failWrites = () => false;
    const restarted = await harness(h.storage);
    await restarted.drainer.drain(parent);
    expect(restarted.store.find('accepted')?.state).toBe('outcome-unknown');
    expect(restarted.send).not.toHaveBeenCalled();
  });

  it.each(['intent', 'metadata-deleted', 'purged'] as const)(
    'never drains a frozen parent (%s)', async (phase) => {
      const h = await harness();
      h.state.active = false;
      await h.drainer.enqueue(report('frozen'));
      await h.store.markIntent(parent);
      if (phase !== 'intent') await h.store.markMetadataDeleted(parent);
      if (phase === 'purged') await h.store.markPurged(parent);
      h.state.active = true;
      await h.drainer.drain(parent);
      expect(h.send).not.toHaveBeenCalled();
    });

  it('runs retry-tick listeners on its one timer until unregistered or disposed', async () => {
    jest.useFakeTimers();
    const h = await harness();
    const backfill = jest.spyOn(h.store, 'backfillCompletionKeys');
    const listener = jest.fn();
    const unregister = h.drainer.onRetryTick(listener);
    h.storage.failWrites = (key) => key === PARENT_ENVELOPE_INDEX_KEY;
    expect(await h.drainer.enqueue(report('tick'))).toEqual({ refused: 'storage-unavailable' });
    h.storage.failWrites = () => false;
    await jest.advanceTimersByTimeAsync(5_000);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(backfill).toHaveBeenCalled();
    unregister();
    h.storage.failWrites = (key) => key === PARENT_ENVELOPE_INDEX_KEY;
    await h.drainer.enqueue(report('tick-3'));
    h.storage.failWrites = () => false;
    await jest.advanceTimersByTimeAsync(5_000);
    expect(listener).toHaveBeenCalledTimes(1);
    h.drainer.onRetryTick(listener);
    h.drainer.dispose();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reschedules the tick while a listener still has work', async () => {
    jest.useFakeTimers();
    const h = await harness();
    const listener = jest.fn().mockRejectedValueOnce(new Error('still unsaved'))
      .mockResolvedValue(undefined);
    h.drainer.onRetryTick(listener);
    h.storage.failWrites = (key) => key === PARENT_ENVELOPE_INDEX_KEY;
    await h.drainer.enqueue(report('tick'));
    h.storage.failWrites = () => false;
    await jest.advanceTimersByTimeAsync(5_000);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(listener).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('publishes and clears a view-only unsaved delivery through the sink', async () => {
    const h = await harness();
    const view: ParentDeliveryView = {
      deliveryId: 'lane-delivery:unsaved', agentId: 'lane', parentSessionId: other,
      kind: 'completion', state: 'not-saved', createdAt: 1, updatedAt: 1, attempts: 0,
      lastError: 'storage-unavailable',
    };
    h.drainer.publishUnsaved(view);
    h.drainer.clearUnsaved('lane-delivery:unsaved');
    h.drainer.clearUnsaved('lane-delivery:unsaved');
    expect(h.events).toEqual([view, { ...view, removed: true }]);
    expect(h.store.list()).toEqual([]);
  });
});

describe('ParentDeliveryDrainerService accepted callbacks', () => {
  it('keeps the accepted callback of a blocked row until it is delivered', async () => {
    const start = Date.now();
    let clock = start;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      const h = await harness();
      const accepted = jest.fn();
      h.send.mockRejectedValueOnce(new SdkError(`Session not found: ${parent}`));
      await h.drainer.enqueue(report('blocked'), accepted);
      await h.drainer.drain(parent);
      expect(h.store.find('blocked')?.state).toBe('blocked-retryable');
      await h.drainer.enqueue(report('later'));
      await h.drainer.drain(parent);
      clock = start + 60_000;
      await h.drainer.drain(parent);
      expect(h.store.find('blocked')?.state).toBe('delivered');
      expect(accepted).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });
});

describe('ParentDeliveryDrainerService child session reports', () => {
  const child = '33333333-2222-4333-8444-555555555555';
  const successor = '77777777-2222-4333-8444-555555555555';

  function sessionReport(key: string, parentSessionId = parent): NewParentDeliveryEnvelope {
    return { ...report(key, parentSessionId), agentId: child, originName: 'auth-fix',
      originKind: 'session' };
  }

  function registryWith(
    owner: { parentSessionId: string; parentSdkSessionId?: string } | null,
  ): SessionChildRegistry {
    const registry = new SessionChildRegistry();
    if (!owner) return registry;
    const reservation = registry.reserveSlot(3);
    if (!reservation) throw new Error('expected a slot');
    registry.add({
      childSessionId: child, parentSessionId: owner.parentSessionId,
      ...(owner.parentSdkSessionId ? { parentSdkSessionId: owner.parentSdkSessionId } : {}),
      label: 'auth-fix', task: 'fix auth', branch: 'feat/auth-fix', baseRef: 'abc',
      workspaceRoot: '/ws', worktreePath: '/ws-wt/auth-fix', deliverables: [],
      subagentPtahTools: 'available', startedAt: '2026-10-01T10:00:00.000Z',
      turnsSettled: 0, reportsDelivered: 0, reportsRefused: 0,
    }, reservation);
    return registry;
  }

  function acks(records: readonly object[]): SessionHandoffAckStore {
    return { records: jest.fn().mockResolvedValue(records) } as unknown as SessionHandoffAckStore;
  }

  async function sessionDrainer(
    registry: SessionChildRegistry,
    ackStore: SessionHandoffAckStore | null = null,
  ): Promise<{ h: Harness; drainer: ParentDeliveryDrainerService }> {
    const h = await harness();
    const adapter: Pick<IAgentAdapter, 'isSessionActive' | 'sendMessageToSession'> = {
      isSessionActive: () => h.state.active, sendMessageToSession: h.send,
    };
    const drainer = new ParentDeliveryDrainerService(h.log, h.store, adapter as IAgentAdapter,
      null, null, registry, ackStore);
    drainers.push(drainer);
    return { h, drainer };
  }

  it('sends a session envelope with a ptah-session origin and its name', async () => {
    const { h, drainer } = await sessionDrainer(registryWith({ parentSessionId: parent }));
    await drainer.enqueue(sessionReport('s1'));
    await drainer.drain(parent);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledWith(parent, 'body s1', expect.objectContaining({
      clientMessageId: 'lane-delivery:s1',
      origin: { kind: 'peer', from: `ptah-session:${child}`, name: 'auth-fix' },
    }));
    expect(h.store.find('s1')?.state).toBe('delivered');
  });

  it('keeps the ptah-agent origin for a lane envelope', async () => {
    const { h, drainer } = await sessionDrainer(registryWith({ parentSessionId: parent }));
    await drainer.enqueue({ ...report('lane1'), originName: 'codex · lane' });
    await drainer.drain(parent);
    expect(h.send).toHaveBeenCalledWith(parent, 'body lane1', expect.objectContaining({
      origin: { kind: 'peer', from: 'ptah-agent:lane', name: 'codex · lane' },
    }));
  });

  it('cancels a session envelope whose child now has another owner and never sends it', async () => {
    const { h, drainer } = await sessionDrainer(registryWith({ parentSessionId: other }));
    await drainer.enqueue(sessionReport('changed'));
    await drainer.drain(parent);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.store.find('changed')?.state).toBe('cancelled');
    expect(h.log.warn).toHaveBeenCalled();
  });

  it('defers a session envelope with backoff when the child is not in the registry', async () => {
    const { h, drainer } = await sessionDrainer(registryWith(null));
    await drainer.enqueue(sessionReport('unknown'));
    await drainer.drain(parent);
    expect(h.send).not.toHaveBeenCalled();
    const entry = h.store.find('unknown');
    expect(entry).toMatchObject({ state: 'blocked-retryable', lastError: 'waiting-for-binding' });
    expect((entry?.nextRetryAt ?? 0) - (entry?.updatedAt ?? 0)).toBe(5_000);
    await expect(h.store.getBody('lane-delivery:unknown')).resolves.toBe('body unknown');
  });

  it('defers a session envelope when no registry is wired', async () => {
    const h = await harness();
    await h.drainer.enqueue(sessionReport('no-registry'));
    await h.drainer.drain(parent);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.store.find('no-registry')).toMatchObject({
      state: 'blocked-retryable', lastError: 'waiting-for-binding',
    });
  });

  it('grows the binding wait instead of re-arming a zero-delay timer', async () => {
    const start = Date.now();
    let clock = start;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      const { h, drainer } = await sessionDrainer(registryWith(null));
      await drainer.enqueue(sessionReport('wait'));
      await drainer.drain(parent);
      await drainer.drain(parent);
      expect(h.store.find('wait')?.nextRetryAt).toBe(start + 5_000);
      clock = start + 6_000;
      await drainer.drain(parent);
      expect(h.store.find('wait')?.nextRetryAt).toBe(clock + 30_000);
      expect(h.send).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });

  it('cancels a session envelope whose binding stays unknown for 24 hours', async () => {
    const { h, drainer } = await sessionDrainer(registryWith(null));
    await drainer.enqueue({ ...sessionReport('stale'), createdAt: Date.now() - 25 * 3_600_000 });
    await drainer.drain(parent);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.store.find('stale')).toMatchObject({
      state: 'cancelled', lastError: 'binding-unavailable',
    });
  });

  it('delivers to a successor reachable only from the recorded SDK alias', async () => {
    const sdkAlias = '88888888-2222-4333-8444-555555555555';
    const ackStore = acks([{ predecessorTabId: null, predecessorSdkId: sdkAlias,
      successorTabId: successor, successorSdkId: null, workspaceRoot: '/ws',
      handoffPath: '/ws/h.md', state: 'recorded' }]);
    const { h, drainer } = await sessionDrainer(
      registryWith({ parentSessionId: other, parentSdkSessionId: sdkAlias }), ackStore);
    await drainer.enqueue(sessionReport('alias', successor));
    await drainer.drain(successor);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.store.find('alias')?.state).toBe('delivered');
  });

  it('keeps the body and defers when the handoff lineage read fails, then delivers', async () => {
    const start = Date.now();
    let clock = start;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      const ackStore = acks([{ predecessorTabId: other, predecessorSdkId: null,
        successorTabId: successor, successorSdkId: null, workspaceRoot: '/ws',
        handoffPath: '/ws/h.md', state: 'recorded' }]);
      const records = ackStore.records as jest.Mock;
      records.mockRejectedValueOnce(new Error('ack store unreadable'));
      const { h, drainer } = await sessionDrainer(registryWith({ parentSessionId: other }), ackStore);
      await drainer.enqueue(sessionReport('lookup', successor));
      await drainer.drain(successor);
      expect(h.send).not.toHaveBeenCalled();
      expect(h.store.find('lookup')).toMatchObject({
        state: 'blocked-retryable', lastError: 'owner-lookup-failed',
      });
      await expect(h.store.getBody('lane-delivery:lookup')).resolves.toBe('body lookup');
      clock = start + 6_000;
      await drainer.drain(successor);
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(h.store.find('lookup')?.state).toBe('delivered');
    } finally {
      now.mockRestore();
    }
  });

  it.each(['markSending', 'getBody'] as const)(
    'cancels without sending when the child is reparented during %s',
    async (method) => {
      const registry = registryWith({ parentSessionId: parent });
      const { h, drainer } = await sessionDrainer(registry);
      const original = h.store[method].bind(h.store);
      jest.spyOn(h.store, method).mockImplementation(async (id: string) => {
        registry.reparent(child, other, undefined);
        return original(id) as never;
      });
      await drainer.enqueue(sessionReport('moved'));
      await drainer.drain(parent);
      expect(h.send).not.toHaveBeenCalled();
      expect(h.store.find('moved')).toMatchObject({
        state: 'cancelled', lastError: 'owner-changed',
      });
    });

  it('does not send a report that was cancelled during the final owner lookup', async () => {
    const ackStore = acks([{ predecessorTabId: other, predecessorSdkId: null,
      successorTabId: successor, successorSdkId: null, workspaceRoot: '/ws',
      handoffPath: '/ws/h.md', state: 'recorded' }]);
    const { h, drainer } = await sessionDrainer(registryWith({ parentSessionId: other }), ackStore);
    await drainer.enqueue(sessionReport('cancelled-late', successor));
    (ackStore.records as jest.Mock).mockImplementation(async () => {
      await h.store.cancel('lane-delivery:cancelled-late', 'user');
      return [{ predecessorTabId: other, predecessorSdkId: null, successorTabId: successor,
        successorSdkId: null, workspaceRoot: '/ws', handoffPath: '/ws/h.md', state: 'recorded' }];
    });
    await drainer.drain(successor);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.store.find('cancelled-late')?.state).toBe('cancelled');
  });

  it('retries a stale-owner cancel whose write failed after its retry floor', async () => {
    const start = Date.now();
    let clock = start;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const timer = jest.spyOn(global, 'setTimeout');
    try {
      const { h, drainer } = await sessionDrainer(registryWith({ parentSessionId: other }));
      const cancel = jest.spyOn(h.store, 'cancel').mockRejectedValueOnce(new Error('disk full'));
      await drainer.enqueue(sessionReport('retry-cancel'));
      await drainer.drain(parent);
      expect(timer).toHaveBeenCalledWith(expect.any(Function), 5_000);
      expect(h.log.error).toHaveBeenCalledWith(
        '[ParentDeliveryDrainer] Could not cancel stale child report', expect.any(Error));
      await drainer.drain(parent);
      expect(cancel).toHaveBeenCalledTimes(1);
      clock = start + 6_000;
      await drainer.drain(parent);
      expect(cancel).toHaveBeenCalledTimes(2);
      expect(h.send).not.toHaveBeenCalled();
      expect(h.store.find('retry-cancel')).toMatchObject({
        state: 'cancelled', lastError: 'owner-changed',
      });
    } finally {
      timer.mockRestore();
      now.mockRestore();
    }
  });

  it('never re-arms a zero-delay timer while a due deferral write keeps failing', async () => {
    jest.useFakeTimers();
    const { h, drainer } = await sessionDrainer(registryWith(null));
    await drainer.enqueue(sessionReport('hot'));
    await drainer.drain(parent);
    expect(h.store.find('hot')).toMatchObject({ lastError: 'waiting-for-binding' });
    const deferred = jest.spyOn(h.store, 'markDeferred').mockRejectedValue(new Error('disk full'));
    const timer = jest.spyOn(global, 'setTimeout');
    // The 5 s deferral comes due; its next write fails on every attempt.
    await jest.advanceTimersByTimeAsync(5_000);
    expect(deferred).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(4_000);
    expect(deferred).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(deferred).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(29_000);
    expect(deferred).toHaveBeenCalledTimes(2);
    const delays = timer.mock.calls.map((call) => call[1]);
    expect(delays.length).toBeGreaterThan(0);
    expect(delays.every((delay) => typeof delay === 'number' && delay > 0)).toBe(true);
    expect(h.send).not.toHaveBeenCalled();
    timer.mockRestore();
  });

  it('releases a never-sent claim on the next pass after its release write failed', async () => {
    const start = Date.now();
    let clock = start;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      const edge = { predecessorTabId: other, predecessorSdkId: null, successorTabId: successor,
        successorSdkId: null, workspaceRoot: '/ws', handoffPath: '/ws/h.md', state: 'recorded' };
      const ackStore = acks([edge]);
      // The second read (after the claim) omits the edge, as a failed shard would.
      (ackStore.records as jest.Mock).mockResolvedValueOnce([edge]).mockResolvedValueOnce([]);
      const { h, drainer } = await sessionDrainer(registryWith({ parentSessionId: other }), ackStore);
      const blocked = jest.spyOn(h.store, 'markBlocked')
        .mockRejectedValueOnce(new Error('index write failed'));
      await drainer.enqueue(sessionReport('claim', successor));
      await drainer.drain(successor);
      expect(h.send).not.toHaveBeenCalled();
      expect(h.store.find('claim')?.state).toBe('sending');
      clock = start + 6_000;
      await drainer.drain(successor);
      expect(blocked).toHaveBeenCalledTimes(2);
      expect(h.send).not.toHaveBeenCalled();
      expect(h.store.find('claim')).toMatchObject({
        state: 'blocked-retryable', lastError: 'owner-lineage-unverified',
      });
      clock = start + 12_000;
      await drainer.drain(successor);
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(h.store.find('claim')?.state).toBe('delivered');
    } finally {
      now.mockRestore();
    }
  });

  it('releases a claimed row whose stale-owner cancel is refused as parent-session-deleted', async () => {
    const registry = registryWith({ parentSessionId: parent });
    const { h, drainer } = await sessionDrainer(registry);
    const original = h.store.getBody.bind(h.store);
    jest.spyOn(h.store, 'getBody').mockImplementationOnce(async (id: string) => {
      registry.reparent(child, other, undefined);
      return original(id);
    });
    jest.spyOn(h.store, 'cancel').mockResolvedValueOnce({ refused: 'parent-session-deleted' });
    await drainer.enqueue(sessionReport('refused'));
    await drainer.drain(parent);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.store.find('refused')).toMatchObject({
      state: 'blocked-retryable', lastError: 'owner-changed',
    });
  });

  it('releases a claimed row whose stale-owner cancel write failed', async () => {
    const registry = registryWith({ parentSessionId: parent });
    const { h, drainer } = await sessionDrainer(registry);
    const original = h.store.getBody.bind(h.store);
    jest.spyOn(h.store, 'getBody').mockImplementationOnce(async (id: string) => {
      registry.reparent(child, other, undefined);
      return original(id);
    });
    jest.spyOn(h.store, 'cancel').mockRejectedValueOnce(new Error('disk full'));
    await drainer.enqueue(sessionReport('claimed'));
    await drainer.drain(parent);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.store.find('claimed')).toMatchObject({
      state: 'blocked-retryable', lastError: 'owner-changed',
    });
  });

  it('sends when the recorded parent tab id owns the child', async () => {
    const { h, drainer } = await sessionDrainer(
      registryWith({ parentSessionId: parent, parentSdkSessionId: other }));
    await drainer.enqueue(sessionReport('tab'));
    await drainer.drain(parent);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('sends when the recorded parent SDK id owns the child', async () => {
    const { h, drainer } = await sessionDrainer(
      registryWith({ parentSessionId: 'tab-1', parentSdkSessionId: parent }));
    await drainer.enqueue(sessionReport('sdk'));
    await drainer.drain(parent);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('sends to the kept handoff successor of the recorded owner', async () => {
    const { h, drainer } = await sessionDrainer(
      registryWith({ parentSessionId: other }),
      acks([{ predecessorTabId: other, predecessorSdkId: null, successorTabId: successor,
        successorSdkId: null, workspaceRoot: '/ws', handoffPath: '/ws/h.md', state: 'recorded' }]));
    await drainer.enqueue(sessionReport('succ', successor));
    await drainer.drain(successor);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledWith(successor, 'body succ', expect.anything());
  });

  it('defers, not cancels, when the handoff lineage points to a different successor', async () => {
    const { h, drainer } = await sessionDrainer(
      registryWith({ parentSessionId: other }),
      acks([{ predecessorTabId: other, predecessorSdkId: null, successorTabId: successor,
        successorSdkId: null, workspaceRoot: '/ws', handoffPath: '/ws/h.md', state: 'recorded' }]));
    await drainer.enqueue(sessionReport('wrong', parent));
    await drainer.drain(parent);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.store.find('wrong')).toMatchObject({
      state: 'blocked-retryable', lastError: 'owner-lineage-unverified',
    });
  });

  it('keeps a successor report when a partial lineage read omits the handoff edge', async () => {
    const { h, drainer } = await sessionDrainer(registryWith({ parentSessionId: other }), acks([]));
    await drainer.enqueue(sessionReport('partial', successor));
    await drainer.drain(successor);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.store.find('partial')).toMatchObject({
      state: 'blocked-retryable', lastError: 'owner-lineage-unverified',
    });
    await expect(h.store.getBody('lane-delivery:partial')).resolves.toBe('body partial');
  });

  it('cancels when a committed edge hands the recipient off to the current owner', async () => {
    const { h, drainer } = await sessionDrainer(
      registryWith({ parentSessionId: other }),
      acks([{ predecessorTabId: parent, predecessorSdkId: null, successorTabId: other,
        successorSdkId: null, workspaceRoot: '/ws', handoffPath: '/ws/h.md', state: 'recorded' }]));
    await drainer.enqueue(sessionReport('handed-off', parent));
    await drainer.drain(parent);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.store.find('handed-off')).toMatchObject({
      state: 'cancelled', lastError: 'owner-changed',
    });
  });

  it('cancels an unverified-lineage report after 24 hours', async () => {
    const { h, drainer } = await sessionDrainer(registryWith({ parentSessionId: other }), acks([]));
    await drainer.enqueue({ ...sessionReport('old', successor), createdAt: Date.now() - 25 * 3_600_000 });
    await drainer.drain(successor);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.store.find('old')).toMatchObject({ state: 'cancelled', lastError: 'owner-changed' });
  });
});
