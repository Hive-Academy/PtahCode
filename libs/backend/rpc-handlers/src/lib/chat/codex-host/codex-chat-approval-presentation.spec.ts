import 'reflect-metadata';
import {
  buildSystemAbortPermissionMessage,
  type PermissionPromptLifecycleEvent,
  type SessionApprovalRouter,
} from '@ptah-extension/agent-sdk';
import type { CodexApprovalRequest } from '@ptah-extension/codex-runtime';
import { MESSAGE_TYPES, SessionId } from '@ptah-extension/shared';
import {
  createCodexChatApprovalPresentation,
  type CodexApprovalPresentationPorts,
} from './codex-chat-approval-presentation';

jest.mock('@ptah-extension/agent-sdk', () => {
  const abort = jest.requireActual<
    typeof import('../../../../../agent-sdk/src/lib/system-abort-permission-message')
  >('../../../../../agent-sdk/src/lib/system-abort-permission-message');
  return {
    UNROUTABLE_PERMISSION_TIMEOUT_MS: abort.UNROUTABLE_PERMISSION_TIMEOUT_MS,
    buildSystemAbortPermissionMessage: abort.buildSystemAbortPermissionMessage,
    presentCodexApproval: jest.requireActual<
      typeof import('../../../../../agent-sdk/src/lib/codex-app-server/codex-tool-presentation')
    >('../../../../../agent-sdk/src/lib/codex-app-server/codex-tool-presentation').presentCodexApproval,
  };
});

describe('Codex chat approval presentation', () => {
  const sessionId = SessionId.from('22222222-2222-4222-8222-222222222222');
  // A request can only reach `present()` with a real, webview-backed chat
  // session (`sessionId` is always a validated `SessionId` on this path), so
  // the truly-unroutable branch — neither `tabId` nor `sessionId` parses as a
  // UUID — is unreachable from a real chat session after the routability fix.
  // This constant forces that branch purely to exercise its timeout mechanics;
  // it does not represent a reachable production state.
  const forcedInvalidSessionId = 'not-a-real-session' as unknown as SessionId;
  const now = 1_700_000_000_000;
  const choices = ['deny', 'allowOnce', 'allowWithInput', 'alwaysAllow'] as const;

  beforeEach(() => jest.useFakeTimers({ now }));
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function request(sid: SessionId = sessionId): CodexApprovalRequest {
    return {
      contextId: 'context', processGeneration: 2,
      threadId: sid, turnId: 'turn', requestId: 5,
      toolId: 'native-item-5', kind: 'command',
      normalizedHome: '/workspace', workspaceId: '/workspace',
      providerId: 'openai-codex', message: 'Run command',
      details: { command: 'pwd' },
    };
  }

  function harness(tab = 'gw-conversation', expiresAt?: number, sid: SessionId = sessionId) {
    const broadcastMessage = jest.fn<Promise<void>, [string, unknown]>()
      .mockResolvedValue(undefined);
    const publish = jest.fn<void, [PermissionPromptLifecycleEvent]>();
    const resolveAttention = jest.fn<void, [string, number]>();
    const respond = jest.fn<boolean, Parameters<SessionApprovalRouter['respond']>>()
      .mockReturnValue(true);
    const approvals: CodexApprovalPresentationPorts['approvals'] = { respond };
    const { Logger } = jest.createMockFromModule<
      typeof import('@ptah-extension/vscode-core')
    >('@ptah-extension/vscode-core');
    const ports = createCodexChatApprovalPresentation({
      logger: Logger.prototype,
      approvals,
      tabId: () => tab,
      webviewManager: { broadcastMessage },
      promptLifecycle: { publish },
      hostAttention: { resolve: resolveAttention },
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (timer) => clearTimeout(timer),
    });
    const present = () => {
      ports.presentation.present(sid, { ...request(sid), expiresAt }, [...choices]);
      const payload = broadcastMessage.mock.calls[0][1];
      if (typeof payload !== 'object' || payload === null || !('id' in payload)) {
        throw new Error('Missing permission request id');
      }
      if (typeof payload.id !== 'string') throw new Error('Invalid permission request id');
      return payload.id;
    };
    return { ports, present, respond, publish, broadcastMessage, resolveAttention,
      logger: Logger.prototype, sessionId: sid };
  }

  it('denies an unanswered card at 60 seconds and publishes timed-out', () => {
    // Forces the truly-unroutable branch (neither tabId nor sessionId parses
    // as a UUID) to prove the 60-second timeout fallback still works when
    // that branch is reached, even though real chat sessions always carry a
    // valid SessionId and so cannot trigger it today — see
    // `forcedInvalidSessionId` above.
    const h = harness('gw-conversation', undefined, forcedInvalidSessionId);
    const wireId = h.present();
    jest.advanceTimersByTime(60_000);
    expect(h.respond).toHaveBeenCalledWith(
      { sessionId: forcedInvalidSessionId, threadId: forcedInvalidSessionId, requestId: '5' },
      expect.objectContaining({ kind: 'codex', response: expect.objectContaining({
        decision: 'decline',
        reason: buildSystemAbortPermissionMessage('Bash',
          'Permission request timed out after 60000ms with no answer from the UI — denying to prevent a permanent hang.'),
      }) }),
    );
    expect(h.publish).toHaveBeenLastCalledWith({
      phase: 'resolved', requestId: wireId, routingHint: 'gw-conversation',
      toolName: 'Bash', outcome: 'timed-out',
    });
    expect(h.ports.handlePermissionResponse({ id: wireId, decision: 'allow' })).toBe(false);
  });

  it('routes a card inline with no timeout when tabId is empty but sessionId is a valid UUID', () => {
    // Reproduces the bug: ports.tabId() returns '' (the empty lifecycle().tabId
    // case), which is non-UUID, but sessionId is a real webview-backed session.
    // The fix must still take the routable branch, broadcast sessionId, and
    // (matching Claude's inline "No timeout" card) never auto-decline it.
    const h = harness('');
    const wireId = h.present();
    expect(h.broadcastMessage).toHaveBeenCalledWith(
      MESSAGE_TYPES.PERMISSION_REQUEST,
      expect.objectContaining({ id: wireId, sessionId, timeoutAt: 0 }),
    );
    expect(h.publish).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60_000);
    expect(h.respond).not.toHaveBeenCalled();
    expect(h.ports.handlePermissionResponse({ id: wireId, decision: 'allow' })).toBe(true);
  });

  it('denies a routable card at its earlier native deadline after renderer loss', () => {
    const h = harness(sessionId, now + 2_000);
    const wireId = h.present();
    expect(h.broadcastMessage).toHaveBeenCalledWith(
      MESSAGE_TYPES.PERMISSION_REQUEST,
      expect.objectContaining({ id: wireId, timeoutAt: now + 2_000 }),
    );
    jest.advanceTimersByTime(2_000);
    expect(h.respond).toHaveBeenCalledWith(
      { sessionId, threadId: sessionId, requestId: '5' },
      expect.objectContaining({ response: expect.objectContaining({
        decision: 'decline',
        reason: 'Permission request timed out after 2000ms without an answer from the UI. This was a timeout, not a user denial.',
      }) }),
    );
    expect(h.ports.handlePermissionResponse({ id: wireId, decision: 'allow' })).toBe(false);
  });

  it('accepts a response on a routable card with no timer set', () => {
    // A valid webview session is always routable now, so this never reaches
    // the notifications-only lifecycle surface — promptLifecycle is only for
    // the unroutable fallback and must stay untouched here. No expiresAt and
    // routable means no auto-decline timer at all (the "No timeout" card).
    const h = harness();
    const wireId = h.present();
    expect(jest.getTimerCount()).toBe(0);
    expect(h.ports.handlePermissionResponse({ id: wireId, decision: 'allow' })).toBe(true);
    expect(h.respond).toHaveBeenCalledWith(
      { sessionId, threadId: sessionId, requestId: '5' },
      expect.objectContaining({ response: expect.objectContaining({ decision: 'accept' }) }),
    );
    expect(h.publish).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60_000);
    expect(h.respond).toHaveBeenCalledTimes(1);
  });

  it.each(['rejected', 'throws'] as const)(
    'consumes a %s reply on a routable card without the notification lifecycle', (failure) => {
      const h = harness();
      const wireId = h.present();
      if (failure === 'throws') {
        h.respond.mockImplementationOnce(() => { throw new Error('private request'); });
      } else {
        h.respond.mockReturnValueOnce(false);
      }
      expect(h.ports.handlePermissionResponse({ id: wireId, decision: 'allow' })).toBe(true);
      expect(h.broadcastMessage).toHaveBeenLastCalledWith(
        MESSAGE_TYPES.PERMISSION_AUTO_RESOLVED,
        { id: wireId, sessionId, toolName: 'command' },
      );
      expect(h.publish).not.toHaveBeenCalled();
      expect(h.logger.warn).toHaveBeenCalledWith(expect.any(String), {
        code: failure === 'throws' ? 'approval-response-failed' : 'approval-response-rejected',
      });
      expect(jest.getTimerCount()).toBe(0);
      expect(h.ports.handlePermissionResponse({ id: wireId, decision: 'allow' })).toBe(false);
    },
  );

  it('takes a dismissed prompt out of the timer queue', () => {
    // A native expiresAt gives this routable card an actual timer to clear;
    // with no expiresAt a routable card has no timer at all (see above).
    const h = harness(sessionId, now + 60_000);
    h.present();
    expect(jest.getTimerCount()).toBe(1);
    h.ports.presentation.dismiss(sessionId, request());
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60_000);
    expect(h.respond).not.toHaveBeenCalled();
  });
});
