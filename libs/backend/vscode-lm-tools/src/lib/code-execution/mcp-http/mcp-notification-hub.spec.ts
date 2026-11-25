import { EventEmitter } from 'node:events';
import type { McpCallerBinding } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  MAX_STREAMS_PER_BINDING,
  McpNotificationHub,
  notificationBindingKey,
} from './mcp-notification-hub';

class FakeStream extends EventEmitter {
  destroyed = false;
  readonly frames: string[] = [];
  readonly end = jest.fn(() => {
    this.destroyed = true;
  });
  write(chunk: string): boolean {
    this.frames.push(chunk);
    return true;
  }
  close(): void {
    this.destroyed = true;
    this.emit('close');
  }
}

const LIST_CHANGED =
  'data: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}\n\n';

function createLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as jest.Mocked<Logger>;
}

const laneA: McpCallerBinding = {
  kind: 'agent',
  agentId: 'lane-a',
  capability: 'privileged',
};
const laneB: McpCallerBinding = {
  kind: 'agent',
  agentId: 'lane-b',
  capability: 'privileged',
};

describe('McpNotificationHub', () => {
  let hub: McpNotificationHub;

  beforeEach(() => {
    jest.useFakeTimers();
    hub = new McpNotificationHub({ logger: createLogger() });
  });

  afterEach(() => {
    hub.closeAll();
    jest.useRealTimers();
  });

  it('writes one list_changed per stream after a 500 ms debounce', () => {
    const a = new FakeStream();
    const b = new FakeStream();
    hub.register(laneA, a);
    hub.register(laneB, b);

    hub.notifyToolsChanged();
    jest.advanceTimersByTime(300);
    hub.notifyToolsChanged();
    jest.advanceTimersByTime(499);
    expect(a.frames).toEqual([]);

    jest.advanceTimersByTime(1);
    expect(a.frames).toEqual([LIST_CHANGED]);
    expect(b.frames).toEqual([LIST_CHANGED]);
  });

  it('releases a stream on close and stops writing to it', () => {
    const a = new FakeStream();
    hub.register(laneA, a);
    expect(hub.streamCount).toBe(1);

    a.close();
    expect(hub.streamCount).toBe(0);
    hub.notifyToolsChanged();
    jest.advanceTimersByTime(500);
    expect(a.frames).toEqual([]);
  });

  it('runs one keep-alive only while streams are open', () => {
    expect(hub.keepAliveActive).toBe(false);
    const a = new FakeStream();
    const b = new FakeStream();
    hub.register(laneA, a);
    hub.register(laneB, b);
    expect(hub.keepAliveActive).toBe(true);
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(25_000);
    expect(a.frames).toEqual([': keep-alive\n\n']);
    expect(b.frames).toEqual([': keep-alive\n\n']);

    a.close();
    expect(hub.keepAliveActive).toBe(true);
    b.close();
    expect(hub.keepAliveActive).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keys streams by binding and ends the oldest past the per-binding cap', () => {
    const streams = Array.from(
      { length: MAX_STREAMS_PER_BINDING + 1 },
      () => new FakeStream(),
    );
    for (const stream of streams) hub.register(laneA, stream);
    const other = new FakeStream();
    hub.register(laneB, other);

    expect(streams[0]?.end).toHaveBeenCalledTimes(1);
    expect(other.end).not.toHaveBeenCalled();
    expect(hub.streamCount).toBe(MAX_STREAMS_PER_BINDING + 1);
  });

  it('distinguishes bindings by identity fields', () => {
    expect(notificationBindingKey(laneA)).not.toBe(
      notificationBindingKey(laneB),
    );
    expect(notificationBindingKey({ ...laneA })).toBe(
      notificationBindingKey(laneA),
    );
  });

  it('drops a stream whose write throws and keeps the others', () => {
    const broken = new FakeStream();
    broken.write = () => {
      throw new Error('socket gone');
    };
    const ok = new FakeStream();
    hub.register(laneA, broken);
    hub.register(laneB, ok);

    hub.notifyToolsChanged();
    jest.advanceTimersByTime(500);
    expect(ok.frames).toEqual([LIST_CHANGED]);
    expect(hub.streamCount).toBe(1);
  });

  it('closeAll ends every stream and clears both timers', () => {
    const a = new FakeStream();
    hub.register(laneA, a);
    hub.notifyToolsChanged();

    hub.closeAll();
    expect(a.end).toHaveBeenCalled();
    expect(hub.streamCount).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});
