import {
  SessionApprovalRouter,
  type ProviderSessionApprovalReply,
} from './session-approval-router';

const address = { sessionId: 'session', threadId: 'thread', requestId: '7' };
const reply: ProviderSessionApprovalReply = {
  sessionId: 'session',
  contextId: 'context',
  threadId: 'thread',
  requestId: 7,
  decision: 'accept',
};

function setup() {
  const claude = { handleResponse: jest.fn() };
  const cancelled = jest.fn();
  const sink = {
    sessionId: 'session',
    contextId: 'context',
    respond: jest.fn().mockReturnValue(true),
    cancel: jest.fn().mockReturnValue(true),
  };
  return {
    claude,
    cancelled,
    sink,
    router: new SessionApprovalRouter(claude, cancelled),
  };
}

describe('SessionApprovalRouter provider-session owner', () => {
  it('routes a correlated reply to the owning sink once', () => {
    const h = setup();
    h.router.register(address, { kind: 'provider-session', sink: h.sink });
    expect(
      h.router.respond(address, { kind: 'provider-session', response: reply }),
    ).toBe(true);
    expect(h.sink.respond).toHaveBeenCalledWith(reply);
    expect(h.claude.handleResponse).not.toHaveBeenCalled();
    expect(
      h.router.respond(address, { kind: 'provider-session', response: reply }),
    ).toBe(false);
  });

  it.each([
    ['session', { sessionId: 'other' }],
    ['thread', { threadId: 'other' }],
    ['request', { requestId: 8 }],
    ['context', { contextId: 'other' }],
  ] as const)('rejects a reply with a different %s', (_field, change) => {
    const h = setup();
    h.router.register(address, { kind: 'provider-session', sink: h.sink });
    expect(
      h.router.respond(address, {
        kind: 'provider-session',
        response: { ...reply, ...change },
      }),
    ).toBe(false);
    expect(h.sink.respond).not.toHaveBeenCalled();
  });

  it('rejects a reply of another owner kind', () => {
    const h = setup();
    h.router.register(address, { kind: 'provider-session', sink: h.sink });
    expect(
      h.router.respond(address, {
        kind: 'codex',
        response: { ...reply, processGeneration: 1, turnId: 'turn' },
      }),
    ).toBe(false);
    expect(
      h.router.respond(address, {
        kind: 'claude',
        response: { id: '7', decision: 'allow' },
      }),
    ).toBe(false);
    expect(h.sink.respond).not.toHaveBeenCalled();
  });

  it('keeps ownership when the sink refuses the reply', () => {
    const h = setup();
    h.sink.respond.mockReturnValueOnce(false);
    h.router.register(address, { kind: 'provider-session', sink: h.sink });
    expect(
      h.router.respond(address, { kind: 'provider-session', response: reply }),
    ).toBe(false);
    expect(
      h.router.respond(address, { kind: 'provider-session', response: reply }),
    ).toBe(true);
  });

  it('refuses registration for a sink of another session', () => {
    const h = setup();
    expect(() =>
      h.router.register(address, {
        kind: 'provider-session',
        sink: { ...h.sink, sessionId: 'other' },
      }),
    ).toThrow('Approval session mismatch');
  });

  it('settles the sink and presents one cancellation', () => {
    const h = setup();
    h.router.register(address, { kind: 'provider-session', sink: h.sink });
    h.router.cancelPrompt(address, 'session-ended' as never);
    expect(h.sink.cancel).toHaveBeenCalledWith('thread', '7');
    expect(h.cancelled).toHaveBeenCalledWith({
      sessionId: 'session',
      requestId: '7',
      reason: 'session-ended',
    });
    expect(
      h.router.respond(address, { kind: 'provider-session', response: reply }),
    ).toBe(false);
  });
});
