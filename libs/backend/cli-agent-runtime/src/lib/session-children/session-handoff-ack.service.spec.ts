import 'reflect-metadata';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { container as rootContainer } from 'tsyringe';
import type { IStateStorage } from '@ptah-extension/platform-core';
import { CLI_AGENT_RUNTIME_TOKENS } from '../di/tokens';
import { SessionHandoffAckStore } from './session-handoff-ack.store';
import { SessionHandoffService } from './session-handoff.service';
import type { HandoffCloseResult } from './session-handoff.port';

describe('SessionHandoffService acknowledgement recovery', () => {
  const predecessorSessionId = '11111111-2222-4333-8444-555555555555';
  const successorSessionId = '33333333-4444-4555-8666-777777777777';
  let root: string;
  let handoffPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ptah-handoff-ack-'));
    handoffPath = join(root, 'HANDOFF.md');
    writeFileSync(handoffPath, '# Handoff\n');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function harness() {
    const values = new Map<string, unknown>();
    const storage: IStateStorage = {
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key, value) => { values.set(key, value); },
      keys: () => [...values.keys()],
    };
    const lifecycle = { find: jest.fn(), endSession: jest.fn(async () => undefined) };
    const closer = { close: jest.fn<Promise<HandoffCloseResult>, []>(async () => ({ kind: 'closed' })) };
    const request = { predecessorSessionId, callerSessionId: successorSessionId, handoffPath };
    const makeStore = () => new SessionHandoffAckStore(storage);
    const makeService = (store: SessionHandoffAckStore) => {
      const scope = rootContainer.createChildContainer();
      scope.register(CLI_AGENT_RUNTIME_TOKENS.HANDOFF_PREDECESSOR_CLOSER, { useValue: closer });
      return new SessionHandoffService(
        { isChild: jest.fn(() => false) } as never,
        lifecycle as never,
        { getWorkspaceFolders: jest.fn(() => [root]) } as never,
        { appendLine: jest.fn() } as never,
        { adoptLanes: jest.fn() } as never,
        null,
        scope,
        null,
        { forceIdle: jest.fn() },
        null,
        null,
        null,
        store,
      );
    };
    return { closer, lifecycle, request, makeStore, makeService };
  }

  async function record(store: SessionHandoffAckStore): Promise<void> {
    await store.record({
      predecessorTabId: predecessorSessionId,
      predecessorSdkId: null,
      successorTabId: successorSessionId,
      successorSdkId: null,
      workspaceRoot: root,
      handoffPath,
      state: 'recorded',
    });
  }

  async function armAndFlush(service: SessionHandoffService, request: {
    predecessorSessionId: string; callerSessionId: string; handoffPath: string;
  }): Promise<void> {
    expect(await service.acknowledge(request)).toMatchObject({ status: 'retryable-failure' });
    service.onCallerTurnFlushed({ tabId: predecessorSessionId, sessionId: predecessorSessionId });
  }

  it('keeps closePending after the closer fails and retries only the close', async () => {
    const h = harness();
    const store = h.makeStore();
    await record(store);
    const service = h.makeService(store);
    await armAndFlush(service, h.request);
    h.closer.close.mockResolvedValueOnce({ kind: 'timeout' });

    expect(await service.acknowledge(h.request)).toMatchObject({ status: 'retryable-failure' });
    expect(await store.findByPredecessor(predecessorSessionId)).toMatchObject({ state: 'closePending' });
    expect(h.lifecycle.endSession).toHaveBeenCalledTimes(1);

    expect(await service.acknowledge(h.request)).toMatchObject({ status: 'closed' });
    expect(h.lifecycle.endSession).toHaveBeenCalledTimes(1);
    expect(h.closer.close).toHaveBeenCalledTimes(2);
    expect(await store.findByPredecessor(predecessorSessionId)).toMatchObject({ state: 'closeCompleted' });
  });

  it('resumes closePending through a new service and store instance', async () => {
    const h = harness();
    const firstStore = h.makeStore();
    await record(firstStore);
    const first = h.makeService(firstStore);
    await armAndFlush(first, h.request);
    h.closer.close.mockResolvedValueOnce({ kind: 'timeout' });
    expect(await first.acknowledge(h.request)).toMatchObject({ status: 'retryable-failure' });

    const resumedStore = h.makeStore();
    expect(await resumedStore.findByPredecessor(predecessorSessionId)).toMatchObject({ state: 'closePending' });
    const resumed = h.makeService(resumedStore);
    await armAndFlush(resumed, h.request);
    expect(await resumed.acknowledge(h.request)).toMatchObject({ status: 'closed' });
    expect(await resumedStore.findByPredecessor(predecessorSessionId)).toMatchObject({ state: 'closeCompleted' });
    expect(h.closer.close).toHaveBeenCalledTimes(2);
  });

  it('does not call the closer for a repeated ack after closeCompleted', async () => {
    const h = harness();
    const store = h.makeStore();
    await record(store);
    const service = h.makeService(store);
    await armAndFlush(service, h.request);
    expect(await service.acknowledge(h.request)).toMatchObject({ status: 'closed' });
    expect(await service.acknowledge(h.request)).toMatchObject({ status: 'already-closed' });
    expect(h.closer.close).toHaveBeenCalledTimes(1);
  });

  it('retries after close succeeded but closeCompleted persistence failed', async () => {
    const h = harness();
    const store = h.makeStore();
    await record(store);
    const service = h.makeService(store);
    await armAndFlush(service, h.request);
    const original = store.compareAndSet.bind(store);
    jest.spyOn(store, 'compareAndSet').mockRejectedValueOnce(new Error('disk unavailable')).mockImplementation(original);
    expect(await service.acknowledge(h.request)).toMatchObject({ status: 'retryable-failure' });
    expect(await service.acknowledge(h.request)).toMatchObject({ status: 'closed' });
    expect(await store.findByPredecessor(predecessorSessionId)).toMatchObject({ state: 'closeCompleted' });
  });

  it('deduplicates concurrent aliases by recorded predecessor', async () => {
    const h = harness();
    const store = h.makeStore();
    await record(store);
    const service = h.makeService(store);
    await armAndFlush(service, h.request);
    const [first, second] = await Promise.all([
      service.acknowledge(h.request),
      service.acknowledge({ ...h.request, handoffPath: join(root, '.', 'HANDOFF.md') }),
    ]);
    expect(first.status).toBe('closed');
    expect(second.status).toBe('closed');
    expect(h.closer.close).toHaveBeenCalledTimes(1);
  });
  it('accepts the recorded normalized path after the handoff file is removed', async () => {
    const h = harness();
    const store = h.makeStore();
    await record(store);
    const service = h.makeService(store);
    rmSync(handoffPath);
    expect(await service.acknowledge(h.request)).toMatchObject({ status: 'retryable-failure' });
  });
  it.each([
    [{ kind: 'blocked', code: 'unsent-input' }, 'refused', 'unsent input'],
    [{ kind: 'blocked', code: 'queued-message' }, 'refused', 'queued message'],
    [{ kind: 'blocked', code: 'streaming' }, 'retryable-failure', 'streaming'],
    [{ kind: 'absent' }, 'refused', 'not found'],
    [{ kind: 'timeout' }, 'retryable-failure', 'timeout'],
  ] as const)('returns the actual close cause %j', async (closeResult, status, phrase) => {
    const h = harness();
    const store = h.makeStore();
    await record(store);
    const service = h.makeService(store);
    await armAndFlush(service, h.request);
    h.closer.close.mockResolvedValueOnce(closeResult);
    const result = await service.acknowledge(h.request);
    expect(result.status).toBe(status);
    expect(result.reason).toContain(phrase);
    expect(result.reason).not.toContain('predecessor tab close failed; retry later');
  });
});
