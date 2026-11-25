/**
 * AgentMonitorMessageHandler specs — routes AGENT_MONITOR_* messages to
 * AgentMonitorStore and AgentDeliveryStore. This is a routing layer plus the delivery hydration trigger; tests assert each supported
 * message type dispatches to the correct store method and unknown types are
 * silently ignored.
 */

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MESSAGE_TYPES } from '@ptah-extension/shared';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  AgentMonitorMessageHandler,
  parseAgentMonitorActionNotice,
  parseAgentMonitorReparented,
  parseSessionActivityOverdue,
} from './agent-monitor-message-handler.service';
import { SessionOverdueStore } from './session-overdue.store';
import { AgentDeliveryStore, AgentMonitorStore } from '@ptah-extension/chat-streaming';

type StoreSlice = Pick<
  AgentMonitorStore,
  | 'onAgentSpawned'
  | 'onAgentOutput'
  | 'onAgentOutputBatch'
  | 'onAgentExited'
  | 'onAgentExpired'
  | 'onPermissionRequest'
  | 'reparentAgents'
  | 'onAgentActionNotice'
>;
type DeliverySlice = Pick<AgentDeliveryStore, 'onMessageReceipt' | 'onParentDelivery' | 'hydrate' | 'onSteerAvailability'>;

describe('AgentMonitorMessageHandler', () => {
  let handler: AgentMonitorMessageHandler;
  let store: jest.Mocked<StoreSlice>;
  let delivery: jest.Mocked<DeliverySlice>;
  let overdue: { apply: jest.Mock };
  const activeSession = signal<string | null>(null);

  beforeEach(() => {
    activeSession.set(null);
    delivery = {
      onMessageReceipt: jest.fn(),
      onParentDelivery: jest.fn(),
      hydrate: jest.fn().mockResolvedValue(undefined),
      onSteerAvailability: jest.fn(),
    };
    overdue = { apply: jest.fn() };
    store = {
      onAgentSpawned: jest.fn(),
      onAgentOutput: jest.fn(),
      onAgentOutputBatch: jest.fn(),
      onAgentExited: jest.fn(),
      onAgentExpired: jest.fn(),
      onPermissionRequest: jest.fn(),
      reparentAgents: jest.fn(),
      onAgentActionNotice: jest.fn(),
    } as jest.Mocked<StoreSlice>;

    TestBed.configureTestingModule({
      providers: [
        AgentMonitorMessageHandler,
        { provide: AgentMonitorStore, useValue: store },
        { provide: AgentDeliveryStore, useValue: delivery },
        { provide: SessionOverdueStore, useValue: overdue },
        { provide: TabManagerService, useValue: { activeTabSessionId: activeSession } },
      ],
    });
    handler = TestBed.inject(AgentMonitorMessageHandler);
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('declares the nine AGENT_MONITOR_* message types and the overdue notice', () => {
    expect(handler.handledMessageTypes).toEqual([
      MESSAGE_TYPES.AGENT_MONITOR_SPAWNED,
      MESSAGE_TYPES.AGENT_MONITOR_OUTPUT,
      MESSAGE_TYPES.AGENT_MONITOR_EXITED,
      MESSAGE_TYPES.AGENT_MONITOR_EXPIRED,
      MESSAGE_TYPES.AGENT_MONITOR_PERMISSION_REQUEST,
      MESSAGE_TYPES.AGENT_MONITOR_REPARENTED,
      MESSAGE_TYPES.AGENT_MONITOR_ACTION_NOTICE,
      MESSAGE_TYPES.AGENT_MONITOR_MESSAGE_RECEIPT,
      MESSAGE_TYPES.AGENT_MONITOR_PARENT_DELIVERY,
      MESSAGE_TYPES.SESSION_ACTIVITY_OVERDUE,
    ]);
  });

  describe('session:activity-overdue (TASK_2026_2310)', () => {
    const valid = {
      sessionId: 'session-1',
      tabId: 'tab-1',
      overdue: true,
      operations: ['Bash'],
      text: 'Ptah: no activity for 10 minutes.',
    };

    it('routes a valid payload to SessionOverdueStore', () => {
      handler.handleMessage({ type: MESSAGE_TYPES.SESSION_ACTIVITY_OVERDUE, payload: valid });
      expect(overdue.apply).toHaveBeenCalledWith(valid);
    });

    it('routes a clear without a tab id', () => {
      const clear = { sessionId: 'session-1', overdue: false, operations: [], text: '' };
      handler.handleMessage({ type: MESSAGE_TYPES.SESSION_ACTIVITY_OVERDUE, payload: clear });
      expect(overdue.apply).toHaveBeenCalledWith(clear);
    });

    it('drops a malformed payload with a warning', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      handler.handleMessage({
        type: MESSAGE_TYPES.SESSION_ACTIVITY_OVERDUE,
        payload: { ...valid, overdue: 'yes' },
      });
      expect(overdue.apply).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it.each([
      ['null', null],
      ['an array', [valid]],
      ['an empty sessionId', { ...valid, sessionId: '' }],
      ['a non-string tabId', { ...valid, tabId: 7 }],
      ['a non-boolean overdue', { ...valid, overdue: 1 }],
      ['non-array operations', { ...valid, operations: 'Bash' }],
      ['a non-string operation', { ...valid, operations: ['Bash', 3] }],
      ['a missing text', { ...valid, text: undefined }],
    ])('parseSessionActivityOverdue rejects %s', (_label, payload) => {
      expect(parseSessionActivityOverdue(payload)).toBeNull();
    });

    it('parseSessionActivityOverdue copies only the contract fields', () => {
      expect(parseSessionActivityOverdue({ ...valid, extra: 'x' })).toEqual(valid);
    });
  });

  it('routes valid parent delivery and rejects malformed payloads', () => {
    const payload = { agentId: '11111111-1111-4111-8111-111111111111', kind: 'report', state: 'pending' };
    handler.handleMessage({ type: MESSAGE_TYPES.AGENT_MONITOR_PARENT_DELIVERY, payload });
    expect(delivery.onParentDelivery).toHaveBeenCalledWith(payload);
    handler.handleMessage({ type: MESSAGE_TYPES.AGENT_MONITOR_PARENT_DELIVERY, payload: { ...payload, state: 'unknown' } });
    expect(delivery.onParentDelivery).toHaveBeenCalledTimes(1);
  });

  it('refuses the removed parent expired state', () => {
    handler.handleMessage({ type: MESSAGE_TYPES.AGENT_MONITOR_PARENT_DELIVERY,
      payload: { agentId: '11111111-1111-4111-8111-111111111111', kind: 'completion', state: 'expired' } });
    expect(delivery.onParentDelivery).not.toHaveBeenCalled();
  });

  it('hydrates delivery state on renderer start and on each session selection', () => {
    TestBed.tick();
    expect(delivery.hydrate).toHaveBeenCalledWith(undefined);
    activeSession.set('session-b');
    TestBed.tick();
    expect(delivery.hydrate).toHaveBeenLastCalledWith('session-b');
    expect(delivery.hydrate).toHaveBeenCalledTimes(2);
  });

  it('routes validated receipt updates without exposing message text', () => {
    const receipt = { id: 'message-1', agentId: '11111111-1111-4111-8111-111111111111', state: 'accepted', mode: 'queue-next-turn', delivery: 'queue', createdAt: 1, updatedAt: 1 };
    handler.handleMessage({ type: MESSAGE_TYPES.AGENT_MONITOR_MESSAGE_RECEIPT, payload: { receipt } });
    expect(delivery.onMessageReceipt).toHaveBeenCalledWith(receipt);
    handler.handleMessage({ type: MESSAGE_TYPES.AGENT_MONITOR_MESSAGE_RECEIPT, payload: { receipt: { ...receipt, message: 'private' } } });
    expect(delivery.onMessageReceipt).toHaveBeenCalledTimes(1);
  });

  describe('agent-monitor:action-notice (TASK_2026_2297_920a)', () => {
    const notice = {
      actor: 'ptah-budget',
      action: 'paused',
      reason: 'weighted-budget',
      nextStep: 'review-live-agent',
    };

    it('applies a valid payload to the store', () => {
      const payload = { agentId: 'lane-1', notice, text: 'Ptah paused lane-1.' };
      handler.handleMessage({ type: MESSAGE_TYPES.AGENT_MONITOR_ACTION_NOTICE, payload });
      expect(store.onAgentActionNotice).toHaveBeenCalledWith(payload);
    });

    it('applies a release of the notice', () => {
      const payload = { agentId: 'lane-1', notice: null, text: '' };
      handler.handleMessage({ type: MESSAGE_TYPES.AGENT_MONITOR_ACTION_NOTICE, payload });
      expect(store.onAgentActionNotice).toHaveBeenCalledWith(payload);
    });

    it.each([
      ['undefined', undefined],
      ['an array', []],
      ['an empty agent id', { agentId: '', notice, text: 't' }],
      ['a missing text', { agentId: 'lane-1', notice }],
      ['a missing notice', { agentId: 'lane-1', text: 't' }],
      ['an unknown action', { agentId: 'lane-1', notice: { ...notice, action: 'killed' }, text: 't' }],
      ['an empty reason', { agentId: 'lane-1', notice: { ...notice, reason: '' }, text: 't' }],
    ])('drops %s with a shape-only warning', (_label, payload) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        expect(parseAgentMonitorActionNotice(payload)).toBeNull();
        handler.handleMessage({ type: MESSAGE_TYPES.AGENT_MONITOR_ACTION_NOTICE, payload });
        expect(store.onAgentActionNotice).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('agent-monitor:action-notice payload rejected'),
          expect.any(String),
        );
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('agent-monitor:reparented (TASK_2026_876)', () => {
    it('applies a valid payload to the store', () => {
      handler.handleMessage({
        type: MESSAGE_TYPES.AGENT_MONITOR_REPARENTED,
        payload: { agentIds: ['lane-1', 'lane-2'], parentSessionId: 'tab-b' },
      });
      expect(store.reparentAgents).toHaveBeenCalledWith(
        ['lane-1', 'lane-2'],
        'tab-b',
      );
    });

    it.each([
      ['undefined', undefined],
      ['an array', []],
      ['a missing parent', { agentIds: ['lane-1'] }],
      ['an empty parent', { agentIds: ['lane-1'], parentSessionId: '' }],
      ['non-array agentIds', { agentIds: 'lane-1', parentSessionId: 'tab-b' }],
      ['an empty agent id', { agentIds: ['lane-1', ''], parentSessionId: 'tab-b' }],
      ['a numeric agent id', { agentIds: [1], parentSessionId: 'tab-b' }],
    ])('drops %s with a shape-only warning', (_label, payload) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        expect(parseAgentMonitorReparented(payload)).toBeNull();
        handler.handleMessage({
          type: MESSAGE_TYPES.AGENT_MONITOR_REPARENTED,
          payload,
        });
        expect(store.reparentAgents).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('agent-monitor:reparented payload rejected'),
          expect.any(String),
        );
        expect(JSON.stringify(warn.mock.calls)).not.toContain('tab-b');
      } finally {
        warn.mockRestore();
      }
    });
  });

  it('routes AGENT_MONITOR_EXPIRED → store.onAgentExpired with the id', () => {
    handler.handleMessage({
      type: MESSAGE_TYPES.AGENT_MONITOR_EXPIRED,
      payload: { agentId: 'a1' },
    });
    expect(store.onAgentExpired).toHaveBeenCalledWith('a1');
  });

  it('routes AGENT_MONITOR_SPAWNED → store.onAgentSpawned', () => {
    const payload = { agentId: 'a1' };
    handler.handleMessage({
      type: MESSAGE_TYPES.AGENT_MONITOR_SPAWNED,
      payload,
    });
    expect(store.onAgentSpawned).toHaveBeenCalledWith(payload);
    expect(store.onAgentOutput).not.toHaveBeenCalled();
    expect(store.onAgentExited).not.toHaveBeenCalled();
    expect(store.onPermissionRequest).not.toHaveBeenCalled();
  });

  it('coalesces AGENT_MONITOR_OUTPUT deltas into one batch per flush', () => {
    jest.useFakeTimers();
    const first = { agentId: 'a1', stdoutDelta: 'hel' };
    const second = { agentId: 'a1', stdoutDelta: 'lo' };
    handler.handleMessage({
      type: MESSAGE_TYPES.AGENT_MONITOR_OUTPUT,
      payload: first,
    });
    handler.handleMessage({
      type: MESSAGE_TYPES.AGENT_MONITOR_OUTPUT,
      payload: second,
    });
    expect(store.onAgentOutputBatch).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);

    expect(store.onAgentOutputBatch).toHaveBeenCalledTimes(1);
    expect(store.onAgentOutputBatch).toHaveBeenCalledWith([first, second]);
    expect(store.onAgentOutput).not.toHaveBeenCalled();
  });

  it('reports a steer-availability change at once and still batches the delta', () => {
    jest.useFakeTimers();
    const plain = { agentId: 'a1', stdoutDelta: 'x' };
    const changed = { agentId: 'a1', stdoutDelta: '', steerAvailable: false };
    handler.handleMessage({ type: MESSAGE_TYPES.AGENT_MONITOR_OUTPUT, payload: plain });
    expect(delivery.onSteerAvailability).not.toHaveBeenCalled();
    handler.handleMessage({ type: MESSAGE_TYPES.AGENT_MONITOR_OUTPUT, payload: changed });
    expect(delivery.onSteerAvailability).toHaveBeenCalledWith('a1');
    expect(store.onAgentOutputBatch).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(store.onAgentOutputBatch).toHaveBeenCalledWith([plain, changed]);
  });

  it('applies pending output before any other agent event', () => {
    jest.useFakeTimers();
    const output = { agentId: 'a1', stdoutDelta: 'last words' };
    const exited = { agentId: 'a1' };
    handler.handleMessage({
      type: MESSAGE_TYPES.AGENT_MONITOR_OUTPUT,
      payload: output,
    });
    handler.handleMessage({
      type: MESSAGE_TYPES.AGENT_MONITOR_EXITED,
      payload: exited,
    });

    expect(store.onAgentOutputBatch).toHaveBeenCalledWith([output]);
    expect(store.onAgentOutputBatch.mock.invocationCallOrder[0]).toBeLessThan(
      store.onAgentExited.mock.invocationCallOrder[0],
    );
    jest.advanceTimersByTime(100);
    expect(store.onAgentOutputBatch).toHaveBeenCalledTimes(1);
  });

  it('routes AGENT_MONITOR_EXITED → store.onAgentExited', () => {
    const payload = { agentId: 'a1', exitCode: 0 };
    handler.handleMessage({
      type: MESSAGE_TYPES.AGENT_MONITOR_EXITED,
      payload,
    });
    expect(store.onAgentExited).toHaveBeenCalledWith(payload);
  });

  it('routes AGENT_MONITOR_PERMISSION_REQUEST → store.onPermissionRequest', () => {
    const payload = { agentId: 'a1', requestId: 'r1' };
    handler.handleMessage({
      type: MESSAGE_TYPES.AGENT_MONITOR_PERMISSION_REQUEST,
      payload,
    });
    expect(store.onPermissionRequest).toHaveBeenCalledWith(payload);
  });

  it('silently ignores unknown message types', () => {
    handler.handleMessage({ type: 'SOMETHING_ELSE', payload: { a: 1 } });
    expect(store.onAgentSpawned).not.toHaveBeenCalled();
    expect(store.onAgentOutput).not.toHaveBeenCalled();
    expect(store.onAgentExited).not.toHaveBeenCalled();
    expect(store.onPermissionRequest).not.toHaveBeenCalled();
  });

  it('tolerates missing payload (passes undefined through)', () => {
    handler.handleMessage({ type: MESSAGE_TYPES.AGENT_MONITOR_SPAWNED });
    expect(store.onAgentSpawned).toHaveBeenCalledWith(undefined);
  });
});
