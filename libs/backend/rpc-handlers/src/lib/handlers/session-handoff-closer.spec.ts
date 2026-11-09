import 'reflect-metadata';
import { SessionHandoffCloser } from './session-handoff-closer';
import type { Logger } from '@ptah-extension/vscode-core';

describe('SessionHandoffCloser', () => {
  it('resolves only the matching request', async () => {
    const broadcaster = { broadcastMessage: jest.fn().mockResolvedValue(undefined) };
    const logger = { warn: jest.fn(), error: jest.fn() } as Pick<Logger, 'warn' | 'error'> as Logger;
    const closer = new SessionHandoffCloser(logger, broadcaster);
    const pending = closer.close('tab', 'sdk');
    const payload = broadcaster.broadcastMessage.mock.calls[0][1] as { requestId: string };
    expect(closer.complete('unknown', true)).toBe(false);
    expect(closer.complete(payload.requestId, true)).toBe(true);
    await expect(pending).resolves.toBe(true);
  });
  it('times out without a result', async () => {
    jest.useFakeTimers();
    const closer = new SessionHandoffCloser({ warn: jest.fn(), error: jest.fn() } as Pick<Logger, 'warn' | 'error'> as Logger, { broadcastMessage: jest.fn().mockResolvedValue(undefined) });
    closer.timeoutMs = 10;
    const pending = closer.close('tab', null);
    jest.advanceTimersByTime(10);
    await expect(pending).resolves.toBe(false);
    jest.useRealTimers();
  });
});
