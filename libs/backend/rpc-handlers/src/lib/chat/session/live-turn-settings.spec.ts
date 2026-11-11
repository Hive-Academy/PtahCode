import type { Logger } from '@ptah-extension/vscode-core';
import type { SessionId } from '@ptah-extension/shared';
import {
  applyLiveTurnSettings,
  LIVE_TURN_SETTINGS_TIMEOUT_MS,
} from './live-turn-settings';

const SESSION = 'session-1' as SessionId;

function makeAdapter() {
  return {
    setSessionModel: jest.fn().mockResolvedValue(undefined),
    setSessionEffort: jest.fn().mockResolvedValue(undefined),
  };
}

function makeLogger(): Logger {
  return {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

describe('applyLiveTurnSettings', () => {
  it('applies the model and the effort of the turn to the live session', async () => {
    const adapter = makeAdapter();
    await applyLiveTurnSettings(adapter, makeLogger(), SESSION, {
      model: 'claude-opus-5-5',
      effort: 'high',
    });
    expect(adapter.setSessionModel).toHaveBeenCalledWith(
      SESSION,
      'claude-opus-5-5',
    );
    expect(adapter.setSessionEffort).toHaveBeenCalledWith(SESSION, 'high');
  });

  it('does nothing when the turn carries no model and no effort', async () => {
    const adapter = makeAdapter();
    await applyLiveTurnSettings(adapter, makeLogger(), SESSION, {});
    expect(adapter.setSessionModel).not.toHaveBeenCalled();
    expect(adapter.setSessionEffort).not.toHaveBeenCalled();
  });

  it('logs a warning and still applies the effort when the model fails', async () => {
    const adapter = makeAdapter();
    adapter.setSessionModel.mockRejectedValue(new Error('not available'));
    const logger = makeLogger();
    await expect(
      applyLiveTurnSettings(adapter, logger, SESSION, {
        model: 'haiku',
        effort: 'low',
      }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(adapter.setSessionEffort).toHaveBeenCalledWith(SESSION, 'low');
  });

  it('logs a warning when the effort fails and the model call still ran', async () => {
    const adapter = makeAdapter();
    adapter.setSessionEffort.mockRejectedValue(new Error('down'));
    const logger = makeLogger();
    await expect(
      applyLiveTurnSettings(adapter, logger, SESSION, {
        model: 'haiku',
        effort: 'low',
      }),
    ).resolves.toBeUndefined();
    expect(adapter.setSessionModel).toHaveBeenCalledWith(SESSION, 'haiku');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('sends only the model when the turn has no effort', async () => {
    const adapter = makeAdapter();
    await applyLiveTurnSettings(adapter, makeLogger(), SESSION, {
      model: 'haiku',
    });
    expect(adapter.setSessionModel).toHaveBeenCalledTimes(1);
    expect(adapter.setSessionEffort).not.toHaveBeenCalled();
  });

  describe('a control request that never settles', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('stops waiting after the timeout and logs a warning', async () => {
      const adapter = makeAdapter();
      adapter.setSessionModel.mockReturnValue(new Promise(() => undefined));
      const logger = makeLogger();
      const done = applyLiveTurnSettings(adapter, logger, SESSION, {
        model: 'haiku',
        effort: 'low',
      });
      await jest.advanceTimersByTimeAsync(LIVE_TURN_SETTINGS_TIMEOUT_MS);
      await expect(done).resolves.toBeUndefined();
      expect(adapter.setSessionEffort).toHaveBeenCalledWith(SESSION, 'low');
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });
});
