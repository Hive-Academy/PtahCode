/**
 * ChatFollowUpQueueService (TASK_2026_884) — the chat side of the
 * backend-owned follow-up queue: item → tab bindings, the
 * `CHAT_QUEUED_MESSAGE_STATE` push (hidden tabs included), ownership, and
 * delegation to the adapter's optional queue operations.
 */

import 'reflect-metadata';

import {
  MESSAGE_TYPES,
  type FlatStreamEventUnion,
  type FollowUpQueueOperations,
  type IAgentAdapter,
  type QueuedFollowUpSnapshot,
  type QueuedFollowUpStateChange,
  type SessionId,
  type SteerQueuedFollowUpResult,
} from '@ptah-extension/shared';
import type { SessionIdResolvedRegistryCallback } from '@ptah-extension/agent-sdk';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { RpcUserError, type Logger } from '@ptah-extension/vscode-core';

import { ChatFollowUpQueueService } from './chat-follow-up-queue.service';
import { ChatStreamDeliveryCoordinator } from '../streaming/chat-stream-delivery-coordinator.service';
import type { WebviewManager } from '../streaming/chat-stream-broadcaster.service';

const SESSION = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const TAB_A = '11111111-2222-4333-8444-555555555555';
const TAB_B = '22222222-3333-4444-8555-666666666666';
const ID_1 = '33333333-4444-4555-8666-777777777777';
const ID_2 = '44444444-5555-4666-8777-888888888888';

interface Sent {
  readonly type: string;
  readonly payload: unknown;
}

/** In-memory provider queue implementing the optional operations. */
class FakeQueueAdapter implements Required<FollowUpQueueOperations> {
  readonly held: QueuedFollowUpSnapshot[] = [];
  private listener: ((change: QueuedFollowUpStateChange) => void) | null = null;
  unsubscribed = false;
  steerResult: SteerQueuedFollowUpResult = { ok: true };

  onQueuedFollowUpState(
    listener: (change: QueuedFollowUpStateChange) => void,
  ): () => void {
    this.listener = listener;
    return () => {
      this.unsubscribed = true;
      this.listener = null;
    };
  }

  async withdrawQueuedFollowUp(
    sessionId: SessionId,
    clientMessageId: string,
  ): Promise<boolean> {
    const index = this.held.findIndex(
      (item) => item.clientMessageId === clientMessageId,
    );
    if (index < 0) return false;
    this.held.splice(index, 1);
    this.emit({ sessionId, clientMessageId, state: 'withdrawn' });
    return true;
  }

  listQueuedFollowUps(): readonly QueuedFollowUpSnapshot[] {
    return this.held;
  }

  async steerQueuedFollowUp(): Promise<SteerQueuedFollowUpResult> {
    return this.steerResult;
  }

  hold(clientMessageId: string, content = 'follow-up'): void {
    this.held.push({ clientMessageId, content });
    this.emit({
      sessionId: SESSION as SessionId,
      clientMessageId,
      state: 'queued',
    });
  }

  emit(change: QueuedFollowUpStateChange): void {
    this.listener?.(change);
  }
}

function build(
  options: {
    adapter?: Partial<FollowUpQueueOperations>;
    registeredTab?: string;
    codexOwner?: string;
  } = {},
) {
  const sent: Sent[] = [];
  const webviewManager: WebviewManager = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    broadcastMessage: jest.fn(async (type: string, payload: unknown) => {
      sent.push({ type, payload });
    }),
  };
  const fake = new FakeQueueAdapter();
  const adapter = (options.adapter ?? fake) as IAgentAdapter;
  // One record object per registration, as the lifecycle manager keeps it.
  let record =
    options.registeredTab !== undefined
      ? { tabId: options.registeredTab, realSessionId: SESSION }
      : undefined;
  const reregister = (tabId: string, realSessionId = SESSION) => {
    record = { tabId, realSessionId };
  };
  const registrations = {
    find: jest.fn((id: string) =>
      record?.realSessionId === id ? record : undefined,
    ),
  };
  const logger = createMockLogger();
  // Fan-out twin of the adapter's "Session ID resolved" callback.
  const resolvedListeners: SessionIdResolvedRegistryCallback[] = [];
  const sessionIdResolved = {
    register: (listener: SessionIdResolvedRegistryCallback) => {
      resolvedListeners.push(listener);
      return () => undefined;
    },
  };
  const resolve = (
    tabId: string,
    realSessionId = SESSION,
    previousSessionId?: string,
  ) => {
    for (const listener of resolvedListeners) {
      listener({
        tabId,
        realSessionId,
        timestamp: 0,
        ...(previousSessionId === undefined ? {} : { previousSessionId }),
      });
    }
  };
  const service = new ChatFollowUpQueueService(
    logger as unknown as Logger,
    webviewManager,
    adapter,
    registrations as never,
    options.codexOwner === undefined ? null : () => options.codexOwner,
    sessionIdResolved,
  );
  const states = () =>
    sent.filter(
      (entry) => entry.type === MESSAGE_TYPES.CHAT_QUEUED_MESSAGE_STATE,
    );
  return {
    service,
    fake,
    sent,
    states,
    logger,
    webviewManager,
    reregister,
    resolve,
  };
}

describe('ChatFollowUpQueueService', () => {
  it("binds a Codex thread without moving another tab's queued follow-up", () => {
    const h = build();
    const claudeSession = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';
    h.resolve(TAB_B, claudeSession);
    h.service.bind(claudeSession, TAB_B, ID_1);
    h.fake.hold(ID_1);
    h.resolve(TAB_A, SESSION);
    expect(h.service.list(claudeSession, TAB_B)).toEqual([
      { clientMessageId: ID_1, content: 'follow-up' },
    ]);
    expect(h.service.list(SESSION, TAB_A)).toEqual([]);
  });

  it('keeps committed admissions pending until native resume accepts or rejects', () => {
    const h = build();
    h.service.beginAdmission(SESSION, TAB_A, ID_1);
    h.service.commitAdmission(SESSION, ID_1);
    h.service.abandonPending(SESSION, TAB_A, ID_1);
    expect(h.service.receipt(SESSION, TAB_A, ID_1)).toBe('pending');
    expect(h.service.isCommitted(SESSION, ID_1)).toBe(true);
    h.service.acceptResumed(SESSION, TAB_A, ID_1);
    expect(h.service.receipt(SESSION, TAB_A, ID_1)).toBe('delivered');
    h.service.endAdmission(SESSION, ID_1);
    h.service.beginAdmission(SESSION, TAB_A, ID_2);
    h.service.commitAdmission(SESSION, ID_2);
    h.service.abandonPending(SESSION, TAB_A, ID_2);
    expect(h.service.receipt(SESSION, TAB_A, ID_2)).toBe('pending');
    h.service.rejectAdmission(SESSION, TAB_A, ID_2, 'SESSION_CHANGED');
    expect(h.service.receipt(SESSION, TAB_A, ID_2)).toBe('rejected');
  });

  it('removes empty per-session receipt maps after many sessions expire', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const h = build();
    for (let index = 0; index < 100; index++) {
      h.service.rejectAdmission(
        `session-${index}`,
        TAB_A,
        ID_1,
        'SESSION_CHANGED',
      );
    }
    expect(h.service.receiptSessionCount()).toBe(100);
    jest.advanceTimersByTime(10 * 60 * 1000 + 1);
    for (let index = 0; index < 100; index++) {
      expect(
        h.service.receipt(`session-${index}`, TAB_A, ID_1),
      ).toBeUndefined();
    }
    expect(h.service.receiptSessionCount()).toBe(0);
    jest.useRealTimers();
  });
  it('caps terminal receipts and expires them after ten minutes', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const h = build();
    const ids = Array.from(
      { length: 250 },
      (_, index) =>
        `33333333-4444-4555-8666-${String(index).padStart(12, '0')}`,
    );
    for (const id of ids)
      h.service.rejectAdmission(SESSION, TAB_A, id, 'SESSION_CHANGED');
    expect(h.service.receipt(SESSION, TAB_A, ids[0])).toBeUndefined();
    expect(h.service.receipt(SESSION, TAB_A, ids[49])).toBeUndefined();
    expect(h.service.receipt(SESSION, TAB_A, ids[50])).toBe('rejected');
    jest.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(h.service.receipt(SESSION, TAB_A, ids[249])).toBeUndefined();
    jest.useRealTimers();
  });

  it('keeps the original tab receipt after ownership transfers inside retention', () => {
    const h = build();
    h.service.rejectAdmission(SESSION, TAB_A, ID_1, 'SESSION_CHANGED');
    h.service.beginAdmission(SESSION, TAB_B, ID_2);
    expect(h.service.receipt(SESSION, TAB_A, ID_1)).toBe('rejected');
    expect(h.service.receipt(SESSION, TAB_B, ID_1)).toBeUndefined();
  });
  it('rejects another tab for an idle Codex session with no held items', () => {
    const h = build({ codexOwner: TAB_A });
    expect(() => h.service.assertTabOwnsSession(SESSION, TAB_B)).toThrow(
      RpcUserError,
    );
    expect(() => h.service.assertTabOwnsSession(SESSION, TAB_A)).not.toThrow();
  });
  it('never infers admission from an absent held item without delivery', () => {
    const h = build();
    h.service.bind(SESSION, TAB_A, ID_1);
    expect(() => h.service.settleAccepted(SESSION, ID_1)).toThrow(RpcUserError);
    h.fake.emit({
      sessionId: SESSION as SessionId,
      clientMessageId: ID_1,
      state: 'delivered',
    });
    expect(h.service.settleAccepted(SESSION, ID_1)).toBe('admitted');
  });

  it('advances the Stop fence before another send may enter the provider queue', () => {
    const h = build();
    const captured = h.service.stopGeneration(SESSION);
    h.service.advanceStopGeneration(SESSION);
    expect(h.service.stopGeneration(SESSION)).not.toBe(captured);
  });
  it('pushes every state change to the queuing tab', () => {
    const h = build();
    h.service.bind(SESSION, TAB_A, ID_1);
    h.fake.hold(ID_1);
    h.fake.emit({
      sessionId: SESSION as SessionId,
      clientMessageId: ID_1,
      state: 'failed',
      reason: 'The session ended.',
    });

    expect(h.states().map((entry) => entry.payload)).toEqual([
      {
        sessionId: SESSION,
        tabId: TAB_A,
        clientMessageId: ID_1,
        state: 'queued',
      },
      {
        sessionId: SESSION,
        tabId: TAB_A,
        clientMessageId: ID_1,
        state: 'failed',
        reason: 'The session ended.',
      },
    ]);
  });

  it('delivers the state event for a HIDDEN tab with no reveal (regression)', async () => {
    // The pre-queue bug: a hidden tab got only a statusOnly terminal copy and
    // its follow-up waited for a reveal. The state push must reach it anyway.
    const h = build();
    const streams = new ChatStreamDeliveryCoordinator(
      { warn: jest.fn() } as unknown as Logger,
      h.webviewManager,
    );
    await streams.updateViewport({
      protocolVersion: 2,
      visibleTabIds: [TAB_B],
    });

    h.service.bind(SESSION, TAB_A, ID_1);
    h.fake.hold(ID_1);
    const terminal: FlatStreamEventUnion = {
      id: 'terminal-1',
      eventType: 'turn_state',
      sessionId: SESSION,
      timestamp: 2,
      messageId: `turn-state-${SESSION}`,
      phase: 'idle',
      revision: 2,
      backgroundTasks: [],
      sessionCrons: [],
      terminalReason: 'completed',
    };
    streams.publish(TAB_A, SESSION, terminal);
    await streams.flushBeforeTerminal(TAB_A);
    // The provider admits the held item as the next turn.
    h.fake.held.splice(0, 1);
    h.fake.emit({
      sessionId: SESSION as SessionId,
      clientMessageId: ID_1,
      state: 'delivered',
    });

    expect(h.states().map((entry) => entry.payload)).toEqual([
      {
        sessionId: SESSION,
        tabId: TAB_A,
        clientMessageId: ID_1,
        state: 'queued',
      },
      {
        sessionId: SESSION,
        tabId: TAB_A,
        clientMessageId: ID_1,
        state: 'delivered',
      },
    ]);
    expect(
      h.sent.some((entry) => entry.type === MESSAGE_TYPES.CHAT_STREAM_SNAPSHOT),
    ).toBe(false);
  });

  it('routes an unbound change to the live registration tab, never the active tab', () => {
    const h = build({ registeredTab: TAB_B });
    h.fake.emit({
      sessionId: SESSION as SessionId,
      clientMessageId: ID_1,
      state: 'delivered',
    });
    expect(h.states()).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ tabId: TAB_B }),
      }),
    ]);
  });

  it('drops a change with no binding and no registration', () => {
    const h = build();
    h.fake.emit({
      sessionId: SESSION as SessionId,
      clientMessageId: ID_1,
      state: 'delivered',
    });
    expect(h.states()).toEqual([]);
  });

  it('reports queued while held and admitted after delivery', () => {
    const h = build();
    h.service.bind(SESSION, TAB_A, ID_1);
    h.fake.hold(ID_1);
    expect(h.service.settleAccepted(SESSION, ID_1)).toBe('queued');

    h.service.bind(SESSION, TAB_A, ID_2);
    h.fake.emit({
      sessionId: SESSION as SessionId,
      clientMessageId: ID_2,
      state: 'delivered',
    });
    expect(h.service.settleAccepted(SESSION, ID_2)).toBe('admitted');
    expect(
      h.service.list(SESSION, TAB_A).map((i) => i.clientMessageId),
    ).toEqual([ID_1]);
  });

  it('refuses another tab: registration or held items owned elsewhere', () => {
    const registered = build({ registeredTab: TAB_A });
    expect(() =>
      registered.service.assertTabOwnsSession(SESSION, TAB_B),
    ).toThrow(RpcUserError);
    expect(() => registered.service.list(SESSION, TAB_B)).toThrow(RpcUserError);

    const held = build();
    held.service.bind(SESSION, TAB_A, ID_1);
    held.fake.hold(ID_1);
    expect(() => held.service.assertTabOwnsSession(SESSION, TAB_B)).toThrow(
      RpcUserError,
    );
    expect(() =>
      held.service.assertTabOwnsSession(SESSION, TAB_A),
    ).not.toThrow();
  });

  it('moves ownership to the tab that reopened a live session', () => {
    const h = build({ registeredTab: TAB_A });
    h.service.adoptTab(SESSION, TAB_B);
    expect(() => h.service.assertTabOwnsSession(SESSION, TAB_B)).not.toThrow();
    expect(h.service.list(SESSION, TAB_B)).toEqual([]);
    expect(h.service.ownerIdentity(SESSION)).toBe(TAB_B);
    // The registered tab still shows the same live session: it may queue.
    expect(() => h.service.assertTabOwnsSession(SESSION, TAB_A)).not.toThrow();

    // The registered tab opened it again: the adoption ends.
    h.service.adoptTab(SESSION, TAB_A);
    expect(h.service.ownerIdentity(SESSION)).toBe(TAB_A);
  });

  it('hands the held items of the earlier tab to the adopting tab', () => {
    const h = build({ registeredTab: TAB_A });
    h.service.bind(SESSION, TAB_A, ID_1);
    h.fake.hold(ID_1);
    expect(h.service.list(SESSION, TAB_A)).toHaveLength(1);

    h.service.adoptTab(SESSION, TAB_B);
    expect(h.service.list(SESSION, TAB_B)).toHaveLength(1);
    expect(h.logger.info).toHaveBeenCalled();
  });

  it('drops an adoption when the registration is replaced or retired', () => {
    const h = build({ registeredTab: TAB_A });
    h.service.adoptTab(SESSION, TAB_B);
    h.reregister(TAB_A);
    expect(h.service.ownerIdentity(SESSION)).toBe(TAB_A);

    h.service.adoptTab(SESSION, TAB_B);
    h.service.retireSession(SESSION);
    expect(() => h.service.assertTabOwnsSession(SESSION, TAB_B)).toThrow(
      RpcUserError,
    );
  });

  it('adopts nothing for a session that is not live', () => {
    const h = build();
    h.service.adoptTab(SESSION, TAB_B);
    h.service.bind(SESSION, TAB_A, ID_1);
    h.fake.hold(ID_1);
    expect(() => h.service.assertTabOwnsSession(SESSION, TAB_B)).toThrow(
      RpcUserError,
    );
  });

  describe('a tab that still shows the live session after another tab took its stream', () => {
    const OTHER_SESSION = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';
    const TAB_C = '55555555-6666-4777-8888-999999999999';

    // The 2026-11-11 log: tab A bound, chat:continue from tab B ends the dead
    // record and restarts under B, every pushed turn re-registers under B.
    function takenOver() {
      const h = build({ registeredTab: TAB_A });
      h.resolve(TAB_A);
      h.reregister(TAB_B);
      h.resolve(TAB_B);
      h.reregister(TAB_B);
      h.resolve(TAB_B);
      return h;
    }

    it('accepts queue admission, queued-list and withdraw from tab A without moving the stream', async () => {
      const h = takenOver();
      expect(() =>
        h.service.assertTabOwnsSession(SESSION, TAB_A),
      ).not.toThrow();
      h.service.bind(SESSION, TAB_A, ID_1);
      h.fake.hold(ID_1);
      expect(h.service.list(SESSION, TAB_A)).toEqual([
        { clientMessageId: ID_1, content: 'follow-up' },
      ]);
      expect(h.service.list(SESSION, TAB_B)).toEqual([]);
      expect(h.service.ownerIdentity(SESSION)).toBe(TAB_B);
      expect(h.states().at(-1)?.payload).toMatchObject({
        tabId: TAB_A,
        state: 'queued',
      });
      await expect(h.service.withdraw(SESSION, TAB_A, ID_1)).resolves.toBe(
        true,
      );
    });

    it('accepts tab A when the host saw it only as the registered tab', () => {
      const h = build({ registeredTab: TAB_A });
      expect(() => h.service.assertTabOwnsSession(SESSION, TAB_B)).toThrow(
        RpcUserError,
      );
      h.reregister(TAB_B);
      expect(() =>
        h.service.assertTabOwnsSession(SESSION, TAB_A),
      ).not.toThrow();
    });

    it('still refuses a tab bound to another session or never bound, and logs both tabs', () => {
      const h = takenOver();
      h.resolve(TAB_A, OTHER_SESSION);
      expect(() => h.service.assertTabOwnsSession(SESSION, TAB_A)).toThrow(
        RpcUserError,
      );
      expect(() => h.service.assertTabOwnsSession(SESSION, TAB_C)).toThrow(
        RpcUserError,
      );
      expect(h.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('follow-up refused'),
        expect.objectContaining({
          sessionId: SESSION,
          tabId: TAB_C,
          ownerTabId: TAB_B,
        }),
      );
    });

    it('moves every bound tab to the new id when a compaction rotates the session id', () => {
      const h = takenOver();
      // Tab B's record is rebound from SESSION to OTHER_SESSION.
      h.reregister(TAB_B, OTHER_SESSION);
      h.resolve(TAB_B, OTHER_SESSION, SESSION);
      expect(() =>
        h.service.assertTabOwnsSession(OTHER_SESSION, TAB_A),
      ).not.toThrow();
      expect(() =>
        h.service.assertTabOwnsSession(OTHER_SESSION, TAB_C),
      ).toThrow(RpcUserError);
    });

    it('does not let an old registration replace the newer binding of its tab', () => {
      const h = build({ registeredTab: TAB_A });
      h.resolve(TAB_A);
      // Tab A opened another conversation; its old stream is still registered.
      h.service.noteTabSession(OTHER_SESSION, TAB_A);
      expect(h.service.ownerIdentity(SESSION)).toBe(TAB_A);
      // Another tab takes the stream of the old session.
      h.reregister(TAB_B);
      h.resolve(TAB_B);
      expect(() => h.service.assertTabOwnsSession(SESSION, TAB_A)).toThrow(
        RpcUserError,
      );
    });

    it('keeps a tab in use when many other tabs bind after it', () => {
      const h = takenOver();
      for (let i = 0; i < 300; i += 1) {
        h.service.noteTabSession(OTHER_SESSION, `filler-${i}`);
        if (i % 100 === 0) h.service.assertTabOwnsSession(SESSION, TAB_A);
      }
      expect(() =>
        h.service.assertTabOwnsSession(SESSION, TAB_A),
      ).not.toThrow();
    });
  });

  it('accepts an unowned session from any tab', () => {
    const h = build();
    expect(() => h.service.assertTabOwnsSession(SESSION, TAB_B)).not.toThrow();
    expect(h.service.list(SESSION, TAB_B)).toEqual([]);
  });

  it('withdraws only the tab’s own held item', async () => {
    const h = build();
    h.service.bind(SESSION, TAB_A, ID_1);
    h.fake.hold(ID_1);

    await expect(h.service.withdraw(SESSION, TAB_A, ID_2)).resolves.toBe(false);
    await expect(h.service.withdraw(SESSION, TAB_A, ID_1)).resolves.toBe(true);
    expect(h.fake.held).toEqual([]);
    const pushed = h.states();
    expect(pushed[pushed.length - 1]?.payload).toMatchObject({
      state: 'withdrawn',
    });
  });

  it('delegates steer and unbinds a steered item', async () => {
    const h = build();
    h.service.bind(SESSION, TAB_A, ID_1);
    h.fake.hold(ID_1);
    h.fake.steerResult = { ok: false, code: 'TURN_CHANGED' };
    await expect(h.service.steer(SESSION, TAB_A, ID_1)).resolves.toEqual({
      ok: false,
      code: 'TURN_CHANGED',
    });
    h.fake.steerResult = { ok: true };
    await expect(h.service.steer(SESSION, TAB_A, ID_1)).resolves.toEqual({
      ok: true,
    });
    await expect(h.service.steer(SESSION, TAB_A, ID_1)).resolves.toEqual({
      ok: false,
      code: 'NOT_QUEUED',
    });
  });

  it('keeps a Claude promoted item bound until the delivered push', async () => {
    const h = build();
    h.service.bind(SESSION, TAB_A, ID_1);
    h.fake.hold(ID_1);
    h.fake.steerResult = { ok: true, mode: 'interrupt' };
    await expect(h.service.steer(SESSION, TAB_A, ID_1)).resolves.toEqual({
      ok: true,
      mode: 'interrupt',
    });
    expect(h.service.list(SESSION, TAB_A)).toHaveLength(1);
    h.fake.emit({
      sessionId: SESSION as SessionId,
      clientMessageId: ID_1,
      state: 'delivered',
    });
    await expect(h.service.steer(SESSION, TAB_A, ID_1)).resolves.toEqual({
      ok: false,
      code: 'NOT_QUEUED',
    });
  });

  it('answers empty / false / UNSUPPORTED when the adapter lacks the queue', async () => {
    const h = build({ adapter: {} });
    h.service.bind(SESSION, TAB_A, ID_1);
    expect(() => h.service.settleAccepted(SESSION, ID_1)).toThrow(RpcUserError);
    h.service.bind(SESSION, TAB_A, ID_1);
    expect(h.service.list(SESSION, TAB_A)).toEqual([]);
    await expect(h.service.withdraw(SESSION, TAB_A, ID_1)).resolves.toBe(false);
    await expect(h.service.steer(SESSION, TAB_A, ID_1)).resolves.toEqual({
      ok: false,
      code: 'UNSUPPORTED',
    });
    await expect(h.service.withdrawAllForStop(SESSION)).resolves.toEqual([]);
  });

  it('withdraws every held item FIFO and skips a raced claim', async () => {
    const h = build();
    h.service.bind(SESSION, TAB_A, ID_1);
    h.fake.hold(ID_1, 'first');
    h.service.bind(SESSION, TAB_A, ID_2);
    h.fake.hold(ID_2, 'second');
    const raced = jest
      .spyOn(h.fake, 'withdrawQueuedFollowUp')
      .mockImplementationOnce(async () => false);

    await expect(h.service.withdrawAllForStop(SESSION)).resolves.toEqual([
      { clientMessageId: ID_2, content: 'second', tabId: TAB_A },
    ]);
    expect(raced.mock.calls.map((call) => call[1])).toEqual([ID_1, ID_2]);
  });

  it('keeps stopping when one withdrawal throws', async () => {
    const h = build();
    h.service.bind(SESSION, TAB_A, ID_1);
    h.fake.hold(ID_1, 'first');
    h.service.bind(SESSION, TAB_A, ID_2);
    h.fake.hold(ID_2, 'second');
    jest
      .spyOn(h.fake, 'withdrawQueuedFollowUp')
      .mockRejectedValueOnce(new Error('transport closed'));

    await expect(h.service.withdrawAllForStop(SESSION)).resolves.toEqual([
      { clientMessageId: ID_2, content: 'second', tabId: TAB_A },
    ]);
    expect(h.logger.warn).toHaveBeenCalled();
  });

  it('never logs message text and releases the subscription on dispose', () => {
    const h = build();
    h.service.bind(SESSION, TAB_A, ID_1);
    h.fake.hold(ID_1, 'secret follow-up text');
    h.service.dispose();
    expect(h.fake.unsubscribed).toBe(true);
    const logged = JSON.stringify([
      h.logger.debug.mock.calls,
      h.logger.info.mock.calls,
      h.logger.warn.mock.calls,
    ]);
    expect(logged).not.toContain('secret follow-up text');
  });
});
