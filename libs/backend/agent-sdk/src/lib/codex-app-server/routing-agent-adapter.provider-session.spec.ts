/**
 * Until the provider-session chat arm lands, the router refuses a
 * provider-session session or provider instead of serving it on the Claude
 * SDK. The registry lookup is mocked: no entry carries `providerSession` yet.
 */
jest.mock('@ptah-extension/shared', () => {
  const actual = jest.requireActual('@ptah-extension/shared');
  return {
    ...actual,
    isProviderSessionProviderId: (id: string) => id === 'antigravity-cli',
  };
});

import {
  SessionId,
  type IAgentAdapter,
  type SessionRuntimeIdentity,
} from '@ptah-extension/shared';
import {
  ChatRuntimeAdmissionError,
  PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE,
  RoutingAgentAdapter,
  type NativeChatAdapter,
  type RuntimeAdmissionPort,
} from './routing-agent-adapter';

const SESSION = SessionId.from('cccccccc-1111-4222-8333-444444444444');

function adapters() {
  const legacy = {
    startChatSession: jest.fn(),
    resumeSession: jest.fn(),
  } as unknown as jest.Mocked<IAgentAdapter>;
  const native = {
    owns: jest.fn(() => false),
    startChatSession: jest.fn(),
    resumeSession: jest.fn(),
  } as unknown as jest.Mocked<NativeChatAdapter>;
  return { legacy, native };
}

function router(
  identity: SessionRuntimeIdentity | undefined,
  servingProviderId: string | undefined,
) {
  const { legacy, native } = adapters();
  const admission: RuntimeAdmissionPort = {
    servingProviderId: jest.fn(async () => servingProviderId),
  };
  const unit = new RoutingAgentAdapter(
    {
      lookup: () => (identity ? { persisted: identity } : undefined),
    },
    legacy,
    native,
    admission,
    { nativeCodex: true },
  );
  return { unit, legacy, native };
}

describe('RoutingAgentAdapter with provider sessions (not yet admitted)', () => {
  it('refuses a new chat whose serving provider is a provider session', async () => {
    const { unit, legacy, native } = router(undefined, 'antigravity-cli');
    const attempt = unit.startChatSession({ tabId: 'tab-1' } as never);
    await expect(attempt).rejects.toBeInstanceOf(ChatRuntimeAdmissionError);
    await expect(attempt).rejects.toThrow(
      PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE,
    );
    expect(legacy.startChatSession).not.toHaveBeenCalled();
    expect(native.startChatSession).not.toHaveBeenCalled();
  });

  it('refuses a prepared Claude start whose provider is a provider session', async () => {
    const { unit, legacy } = router(undefined, 'antigravity-cli');
    await expect(
      unit.startChatSession({ tabId: 'tab-1', runtime: 'claude-sdk' } as never),
    ).rejects.toThrow(PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE);
    expect(legacy.startChatSession).not.toHaveBeenCalled();
  });

  it('refuses to resume a stored provider-session binding', () => {
    const { unit, legacy } = router(
      {
        version: 1,
        sessionId: SESSION,
        providerId: 'antigravity-cli',
        workspaceId: '/ws',
        runtime: 'provider-session',
        providerSession: { profile: 'antigravity' },
      },
      undefined,
    );
    expect(() => unit.resumeSession(SESSION, {} as never)).toThrow(
      PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE,
    );
    expect(legacy.resumeSession).not.toHaveBeenCalled();
  });

  it('still starts an ordinary Claude chat on the legacy adapter', async () => {
    const { unit, legacy } = router(undefined, 'openrouter');
    await unit.startChatSession({ tabId: 'tab-1' } as never);
    expect(legacy.startChatSession).toHaveBeenCalledTimes(1);
  });
});
