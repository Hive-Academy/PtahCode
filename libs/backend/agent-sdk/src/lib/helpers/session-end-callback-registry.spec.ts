import 'reflect-metadata';
import { Logger } from '@ptah-extension/vscode-core';
import {
  SESSION_END_CAUSES,
  SessionEndCallbackRegistry,
  parseSessionEndCause,
} from './session-end-callback-registry';

describe('session end cause boundary', () => {
  it.each(SESSION_END_CAUSES)('accepts %s', (cause) => {
    expect(parseSessionEndCause(cause)).toBe(cause);
  });

  it.each(['invalid', 1, undefined])('maps invalid value %s to unknown', (value) => {
    expect(parseSessionEndCause(value)).toBe('unknown');
  });

  it('delivers normalized causes to subscribers', () => {
    const logger = Object.setPrototypeOf({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    }, Logger.prototype) as Logger;
    const registry = new SessionEndCallbackRegistry(logger);
    const callback = jest.fn();
    registry.register(callback);
    const data = { sessionId: 'session', workspaceRoot: '/workspace' };
    registry.notifyAll(data);
    registry.notifyAll({ ...data, cause: 'invalid' });
    registry.notifyAll({ ...data, cause: 'user-stop' });
    registry.notifyAll({
      ...data, cause: 'provider-no-response', startedAt: 123, zeroOutwardEvents: true,
    });
    registry.notifyAll({ ...data, cause: 'provider-input-closed', zeroOutwardEvents: false });
    expect(callback.mock.calls.map(([payload]) => payload.cause)).toEqual([
      'unknown', 'unknown', 'user-stop', 'provider-no-response', 'provider-input-closed',
    ]);
    expect(callback.mock.calls[3][0]).toMatchObject({ startedAt: 123, zeroOutwardEvents: true });
    expect(callback.mock.calls[4][0]).toMatchObject({ zeroOutwardEvents: false });
  });
});
