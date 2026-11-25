/**
 * AgentMonitorStore — lane stop, turn timer and resumed-lane identity
 * (TASK_2026_2325 live test: D9 "stopped 10 s before the process exits",
 * D10 "timer counts idle time between turns", D3 "a resume drops the user
 * to the Orchestrator").
 */

import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { createMockRpcService } from '@ptah-extension/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import { ClaudeRpcService, VSCodeService } from '@ptah-extension/core';
import type { AgentProcessInfo } from '@ptah-extension/shared';
import {
  AgentMonitorStore,
  STOP_EXIT_FALLBACK_MS,
  reopenedTurnStart,
  settleStopRequest,
} from './agent-monitor.store';

const mockTabManager = {
  activeTab: signal(null),
  activeTabSessionId: computed(() => null),
  tabs: signal([]),
};
const mockVSCodeService = { config: signal({ panelId: '' }), postMessage: jest.fn() };

function processInfo(overrides: Record<string, unknown> = {}): AgentProcessInfo {
  return {
    agentId: 'lane-1',
    cli: 'claude',
    task: 'Ping',
    workingDirectory: 'w',
    status: 'running',
    startedAt: '2026-11-25T12:00:00.000Z',
    parentSessionId: 'session-1',
    ...overrides,
  } as AgentProcessInfo;
}

describe('AgentMonitorStore stop, turn timer and resume identity', () => {
  let store: AgentMonitorStore;
  const card = (id = 'lane-1') => store.agents().find((agent) => agent.agentId === id);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AgentMonitorStore,
        { provide: TabManagerService, useValue: mockTabManager },
        { provide: VSCodeService, useValue: mockVSCodeService },
        { provide: ClaudeRpcService, useValue: createMockRpcService() },
      ],
    });
    store = TestBed.inject(AgentMonitorStore);
  });

  afterEach(() => jest.useRealTimers());

  it('keeps a user stop pending until the process exit that follows the stamped stop', () => {
    store.onAgentSpawned(processInfo());
    store.markStopRequested('lane-1');
    expect(card()).toMatchObject({ stopRequestedAt: expect.any(Number), stoppedByUser: true });

    // The host stamps `stopped` and emits it while the process still runs.
    store.onAgentExited(processInfo({ status: 'stopped', completedAt: '2026-11-25T12:12:53.000Z' }));
    expect(card()).toMatchObject({ status: 'stopped', stopAcknowledged: true });
    expect(card()?.stopRequestedAt).toBeDefined();

    // The process's own exit, about 10 s later.
    store.onAgentExited(processInfo({ status: 'stopped', completedAt: '2026-11-25T12:12:53.000Z' }));
    expect(card()?.stopRequestedAt).toBeUndefined();
    expect(card()?.stoppedByUser).toBe(true);
  });

  it('follows the host contract: stamped stop without exitCode, then the process exit with one', () => {
    store.onAgentSpawned(processInfo());
    store.markStopRequested('lane-1');
    store.onAgentExited(processInfo({ status: 'stopped' }));
    expect(card()?.stopRequestedAt).toBeDefined();
    store.onAgentExited(processInfo({ status: 'stopped', exitCode: 1 }));
    expect(card()).toMatchObject({ status: 'stopped', exitCode: 1, stoppedByUser: true });
    expect(card()?.stopRequestedAt).toBeUndefined();
  });

  it('ends the pending stop on an exit that carries the process exit code', () => {
    store.onAgentSpawned(processInfo());
    store.markStopRequested('lane-1');
    store.onAgentExited(processInfo({ status: 'stopped', exitCode: 1 }));
    expect(card()?.stopRequestedAt).toBeUndefined();
  });

  it('ends the stop at once on the single exit of a lane stopped while starting', () => {
    store.onAgentSpawned(processInfo({ status: 'starting' }));
    store.markStopRequested('lane-1');
    store.onAgentExited(processInfo({ status: 'stopped' }));
    expect(card()?.stopRequestedAt).toBeUndefined();
    expect(card()).toMatchObject({ status: 'stopped', stoppedByUser: true });
  });

  it('arms the fallback at Stop, so a lost or missing exit cannot leave the card stopping (S2)', () => {
    jest.useFakeTimers();
    store.onAgentSpawned(processInfo());
    store.markStopRequested('lane-1');
    // No exit event at all (lost, or a stop the host settles without one).
    jest.advanceTimersByTime(STOP_EXIT_FALLBACK_MS - 1);
    expect(card()?.stopRequestedAt).toBeDefined();
    jest.advanceTimersByTime(1);
    expect(card()?.stopRequestedAt).toBeUndefined();
    // The lane still runs: the stop never took, so it is not a user stop.
    expect(card()?.stoppedByUser).toBeUndefined();
  });

  it('keeps the fallback across the stamped exit and ends there if the process exit never comes', () => {
    jest.useFakeTimers();
    store.onAgentSpawned(processInfo());
    store.markStopRequested('lane-1');
    store.onAgentExited(processInfo({ status: 'stopped' }));
    jest.advanceTimersByTime(STOP_EXIT_FALLBACK_MS);
    expect(card()?.stopRequestedAt).toBeUndefined();
    expect(card()?.stoppedByUser).toBe(true);
  });

  it('ends a stop of a lane whose turn already ended (the host only releases the process)', () => {
    jest.useFakeTimers();
    store.onAgentSpawned(processInfo());
    store.markStopRequested('lane-1');
    store.onAgentExited(processInfo({ status: 'completed', exitCode: 0 }));
    expect(card()?.stopRequestedAt).toBeUndefined();
    store.confirmStopRequest('lane-1');
    expect(card()?.status).toBe('completed');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('drops the pending stop and the user-stop mark, and keeps the reason, when the Stop fails (S1)', () => {
    jest.useFakeTimers();
    store.onAgentSpawned(processInfo());
    store.markStopRequested('lane-1');
    store.cancelStopRequest('lane-1', 'Agent not found: lane-1');
    expect(card()?.stopRequestedAt).toBeUndefined();
    expect(card()?.stoppedByUser).toBeUndefined();
    expect(card()?.stopError).toBe('Agent not found: lane-1');
    expect(jest.getTimerCount()).toBe(0);
    // The next Stop clears the old reason.
    store.markStopRequested('lane-1');
    expect(card()?.stopError).toBeUndefined();
  });

  it('ignores Stop on a lane that is not live', () => {
    store.onAgentSpawned(processInfo());
    store.onAgentExited(processInfo({ status: 'completed' }));
    store.markStopRequested('lane-1');
    expect(card()?.stopRequestedAt).toBeUndefined();
    expect(card()?.stoppedByUser).toBeUndefined();
  });

  it('times the current turn of a warm lane, not the record start', () => {
    store.onAgentSpawned(processInfo());
    expect(card()?.turnStartedAt).toBe(Date.parse('2026-11-25T12:00:00.000Z'));
    store.onAgentExited(processInfo({ status: 'completed', turnSeq: 1 }));
    // A continuation turn re-opens the same record; the host stamps lastActivityAt.
    store.onAgentSpawned(processInfo({ turnSeq: 2, lastActivityAt: '2026-11-25T12:12:45.000Z' }));
    expect(card()?.startedAt).toBe(Date.parse('2026-11-25T12:00:00.000Z'));
    expect(card()?.turnStartedAt).toBe(Date.parse('2026-11-25T12:12:45.000Z'));
  });

  it('follows a resumed lane to the card that replaced it', () => {
    store.onAgentSpawned(processInfo({ cliSessionId: 'cli-1' }));
    store.onAgentExited(processInfo({ status: 'stopped', cliSessionId: 'cli-1' }));
    store.onAgentSpawned(processInfo({ agentId: 'lane-2', cliSessionId: 'cli-1', resumedFromAgentId: 'lane-1' }));
    expect(card('lane-1')).toBeUndefined();
    expect(store.currentAgentId('lane-1')).toBe('lane-2');
    expect(store.currentAgentId('unknown')).toBe('unknown');
  });
});

describe('settleStopRequest', () => {
  it('leaves cards without a pending stop alone', () => {
    expect(settleStopRequest({ status: 'running' }, { status: 'stopped' })).toEqual({ stopRequestedAt: undefined, stopAcknowledged: undefined });
  });

  it('ends a stop on any non-stopped terminal status', () => {
    expect(settleStopRequest({ stopRequestedAt: 1, status: 'running' }, { status: 'completed' }).stopRequestedAt).toBeUndefined();
    expect(settleStopRequest({ stopRequestedAt: 1, status: 'running' }, { status: 'failed' }).stopRequestedAt).toBeUndefined();
    expect(settleStopRequest({ stopRequestedAt: 1, status: 'starting' }, { status: 'stopped' }).stopRequestedAt).toBeUndefined();
    expect(settleStopRequest({ stopRequestedAt: 1, status: 'running' }, { status: 'stopped' }))
      .toEqual({ stopRequestedAt: 1, stopAcknowledged: true });
  });
});

describe('reopenedTurnStart', () => {
  const existing = { status: 'running' as const, turnSeq: 2, turnStartedAt: 50, startedAt: 10 };

  it('keeps the live turn start for a duplicate spawn of the same turn', () => {
    expect(reopenedTurnStart(existing, { turnSeq: 2 }, 999)).toBe(50);
  });

  it('starts a new turn at the host stamp, or now without one', () => {
    expect(reopenedTurnStart(existing, { turnSeq: 3, lastActivityAt: '1970-01-01T00:00:00.100Z' }, 999)).toBe(100);
    expect(reopenedTurnStart({ ...existing, status: 'completed' }, {}, 999)).toBe(999);
  });
});
