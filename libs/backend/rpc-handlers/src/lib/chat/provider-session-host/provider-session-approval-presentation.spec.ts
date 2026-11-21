import 'reflect-metadata';
import type {
  ProviderSessionApprovalPrompt,
  SessionApprovalRouter,
} from '@ptah-extension/agent-sdk';
import {
  MESSAGE_TYPES,
  SessionId,
  attentionRequestKey,
} from '@ptah-extension/shared';
import { createProviderSessionApprovalPresentation } from './provider-session-approval-presentation';

jest.mock('@ptah-extension/agent-sdk', () => {
  const abort = jest.requireActual<
    typeof import('../../../../../agent-sdk/src/lib/system-abort-permission-message')
  >('../../../../../agent-sdk/src/lib/system-abort-permission-message');
  return {
    UNROUTABLE_PERMISSION_TIMEOUT_MS: abort.UNROUTABLE_PERMISSION_TIMEOUT_MS,
  };
});

/** Cases copied from codex-chat-approval-presentation.spec.ts, provider-session shaped. */
describe('Provider-session approval presentation', () => {
  const sessionId = SessionId.from('22222222-2222-4222-8222-222222222222');
  const now = 1_700_000_000_000;

  beforeEach(() => jest.useFakeTimers({ now }));
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function prompt(requestId = 'req-5'): ProviderSessionApprovalPrompt {
    return {
      sessionId,
      threadId: 'native-thread',
      contextId: 'context',
      request: {
        requestId,
        toolCallId: 'tool-call-5',
        title: 'Run pwd',
        kind: 'execute',
        input: { command: 'pwd' },
      },
    };
  }

  function harness(tab = 'tab-1') {
    const broadcastMessage = jest
      .fn<Promise<void>, [string, unknown]>()
      .mockResolvedValue(undefined);
    const resolveAttention = jest.fn<void, [string, number]>();
    const respond = jest
      .fn<boolean, Parameters<SessionApprovalRouter['respond']>>()
      .mockReturnValue(true);
    const logger = { warn: jest.fn(), error: jest.fn() };
    const ports = createProviderSessionApprovalPresentation({
      logger,
      approvals: { respond },
      tabId: () => tab,
      webviewManager: { broadcastMessage },
      hostAttention: { resolve: resolveAttention },
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (timer) => clearTimeout(timer),
    });
    const present = (value = prompt()) => {
      ports.presentation.present(value);
      const payload = broadcastMessage.mock.calls.at(-1)?.[1];
      if (typeof payload !== 'object' || payload === null || !('id' in payload))
        throw new Error('Missing permission request id');
      if (typeof payload.id !== 'string')
        throw new Error('Invalid permission request id');
      return payload.id;
    };
    return { ports, present, respond, broadcastMessage, resolveAttention, logger };
  }

  const address = { sessionId, threadId: 'native-thread', requestId: 'req-5' };

  it('sends a routed card with the request title, tool input and deadline', () => {
    const h = harness();
    const wireId = h.present();
    expect(h.broadcastMessage).toHaveBeenCalledWith(
      MESSAGE_TYPES.PERMISSION_REQUEST,
      {
        id: wireId,
        sessionId,
        tabId: 'tab-1',
        toolName: 'execute',
        toolInput: { command: 'pwd' },
        description: 'Run pwd',
        toolUseId: 'tool-call-5',
        timestamp: now,
        timeoutAt: now + 60_000,
      },
    );
  });

  it('omits the tab when it is the session id', () => {
    const h = harness(sessionId);
    h.present();
    const payload = h.broadcastMessage.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('tabId');
  });

  it('declines an unanswered card at 60 seconds as a timeout', () => {
    const h = harness();
    const wireId = h.present();
    jest.advanceTimersByTime(60_000);
    expect(h.respond).toHaveBeenCalledWith(address, {
      kind: 'provider-session',
      response: {
        sessionId,
        contextId: 'context',
        threadId: 'native-thread',
        requestId: 'req-5',
        decision: 'decline',
        reason:
          'Permission request timed out after 60000ms without an answer from the UI. This was a timeout, not a user denial.',
      },
    });
    expect(h.resolveAttention).toHaveBeenCalledWith(
      attentionRequestKey('permission', wireId),
      now,
    );
    expect(h.ports.handlePermissionResponse({ id: wireId, decision: 'allow' })).toBe(false);
  });

  it('accepts a response and clears the timer', () => {
    const h = harness();
    const wireId = h.present();
    expect(jest.getTimerCount()).toBe(1);
    expect(h.ports.handlePermissionResponse({ id: wireId, decision: 'allow' })).toBe(true);
    expect(h.respond).toHaveBeenCalledWith(
      address,
      expect.objectContaining({
        kind: 'provider-session',
        response: expect.objectContaining({ decision: 'accept', contextId: 'context' }),
      }),
    );
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60_000);
    expect(h.respond).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['always_allow', 'acceptForSession'],
    ['deny_with_message', 'decline'],
    ['deny', 'cancel'],
  ] as const)('maps %s to %s and keeps the reason', (decision, expected) => {
    const h = harness();
    const wireId = h.present();
    h.ports.handlePermissionResponse({ id: wireId, decision, reason: 'because' });
    expect(h.respond).toHaveBeenCalledWith(address, {
      kind: 'provider-session',
      response: expect.objectContaining({ decision: expected, reason: 'because' }),
    });
  });

  it.each(['rejected', 'throws'] as const)(
    'consumes a %s reply and auto-resolves the card',
    (failure) => {
      const h = harness();
      const wireId = h.present();
      if (failure === 'throws') {
        h.respond.mockImplementationOnce(() => {
          throw new Error('private request');
        });
      } else {
        h.respond.mockReturnValueOnce(false);
      }
      expect(h.ports.handlePermissionResponse({ id: wireId, decision: 'allow' })).toBe(true);
      expect(h.broadcastMessage).toHaveBeenLastCalledWith(
        MESSAGE_TYPES.PERMISSION_AUTO_RESOLVED,
        { id: wireId, sessionId, toolName: 'execute' },
      );
      expect(h.logger.warn).toHaveBeenCalledWith(expect.any(String), {
        code:
          failure === 'throws'
            ? 'approval-response-failed'
            : 'approval-response-rejected',
      });
      expect(jest.getTimerCount()).toBe(0);
      expect(h.ports.handlePermissionResponse({ id: wireId, decision: 'allow' })).toBe(false);
    },
  );

  it('withdraws a cancelled prompt by its native request id', () => {
    const h = harness();
    const wireId = h.present();
    h.ports.presentation.cancelPrompt({
      sessionId,
      requestId: 'req-5',
      reason: 'turn-ended',
    });
    expect(h.broadcastMessage).toHaveBeenLastCalledWith(
      MESSAGE_TYPES.PERMISSION_PROMPT_CANCELLED,
      { sessionId, requestId: wireId, reason: 'turn-ended' },
    );
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60_000);
    expect(h.respond).not.toHaveBeenCalled();
  });

  it('ignores a cancellation for another request', () => {
    const h = harness();
    h.present();
    h.ports.presentation.cancelPrompt({ sessionId, requestId: 'other', reason: 'timeout' });
    expect(jest.getTimerCount()).toBe(1);
  });

  it('replaces the card of a repeated request', () => {
    const h = harness();
    const first = h.present();
    const second = h.present();
    expect(second).not.toBe(first);
    expect(h.broadcastMessage).toHaveBeenCalledWith(
      MESSAGE_TYPES.PERMISSION_AUTO_RESOLVED,
      { id: first, sessionId, toolName: 'execute' },
    );
    expect(jest.getTimerCount()).toBe(1);
    expect(h.ports.handlePermissionResponse({ id: first, decision: 'allow' })).toBe(false);
  });

  it('declines when the card cannot be delivered', async () => {
    const h = harness();
    h.broadcastMessage.mockRejectedValueOnce(new Error('renderer gone'));
    h.present();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.logger.error).toHaveBeenCalled();
    expect(h.respond).toHaveBeenCalledWith(
      address,
      expect.objectContaining({ response: expect.objectContaining({ decision: 'decline' }) }),
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  it('names a request without a kind as a neutral tool', () => {
    const h = harness();
    const base = prompt();
    h.present({ ...base, request: { requestId: 'req-5', title: 'Do it', input: 'raw' } });
    expect(h.broadcastMessage).toHaveBeenCalledWith(
      MESSAGE_TYPES.PERMISSION_REQUEST,
      expect.objectContaining({ toolName: 'tool', toolInput: {} }),
    );
  });
});
