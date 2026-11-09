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
    expect(closer.complete('unknown', 'closed')).toBe(false);
    expect(closer.complete(payload.requestId, 'closed')).toBe(true);
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
  it('keeps an absent reply pending until timeout', async () => {
    jest.useFakeTimers();
    try {
      const broadcaster = { broadcastMessage: jest.fn().mockResolvedValue(undefined) };
      const closer = new SessionHandoffCloser({ warn: jest.fn(), error: jest.fn() } as Pick<Logger, 'warn' | 'error'> as Logger, broadcaster);
      closer.timeoutMs = 10;
      const pending = closer.close('tab', null);
      const { requestId } = broadcaster.broadcastMessage.mock.calls[0][1] as { requestId: string };
      expect(closer.complete(requestId, 'absent')).toBe(true);
      jest.advanceTimersByTime(10);
      await expect(pending).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
  it('accepts a closed reply after an absent reply', async () => {
    const broadcaster = { broadcastMessage: jest.fn().mockResolvedValue(undefined) };
    const closer = new SessionHandoffCloser({ warn: jest.fn(), error: jest.fn() } as Pick<Logger, 'warn' | 'error'> as Logger, broadcaster);
    const pending = closer.close('tab', null);
    const { requestId } = broadcaster.broadcastMessage.mock.calls[0][1] as { requestId: string };
    expect(closer.complete(requestId, 'absent')).toBe(true);
    expect(closer.complete(requestId, 'closed')).toBe(true);
    await expect(pending).resolves.toBe(true);
  });
  it('cleans up a synchronous broadcast failure', async () => {
    const logger = { warn: jest.fn(), error: jest.fn() } as Pick<Logger, 'warn' | 'error'> as Logger;
    const closer = new SessionHandoffCloser(logger, { broadcastMessage: () => { throw new Error('failed'); } });
    await expect(closer.close('tab', null)).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });
});
