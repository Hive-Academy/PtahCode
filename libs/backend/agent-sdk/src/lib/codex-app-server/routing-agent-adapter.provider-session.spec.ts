/**
 * The provider-session arm of the router: a session or serving provider of
 * that runtime routes to the provider-session adapter when it is bound and
 * the host lists its profile; otherwise it is refused, never served on the
 * Claude SDK. The registry lookup is mocked: no entry carries
 * `providerSession` yet.
 */
jest.mock('@ptah-extension/shared', () => {
  const actual = jest.requireActual('@ptah-extension/shared');
  return {
    ...actual,
    getProviderSessionProfile: (id: string) =>
      id === 'antigravity-cli' ? 'antigravity' : undefined,
  };
});

import {
  SessionId,
  type IAgentAdapter,
  type RuntimeHostCapabilities,
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
const STORED: SessionRuntimeIdentity = {
  version: 1,
  sessionId: SESSION,
  providerId: 'antigravity-cli',
  workspaceId: '/ws',
  runtime: 'provider-session',
  providerSession: { profile: 'antigravity' },
};

function nativeAdapter(): jest.Mocked<NativeChatAdapter> {
  return {
    owns: jest.fn(() => false),
    startChatSession: jest.fn(async () => 'started'),
    resumeSession: jest.fn(async () => 'resumed'),
    endSession: jest.fn(),
    dispose: jest.fn(),
    reset: jest.fn(async () => undefined),
    setSessionIdResolvedCallback: jest.fn(),
    setResultStatsCallback: jest.fn(),
    onQueuedFollowUpState: jest.fn(() => jest.fn()),
    resolveLiveSessionId: jest.fn((id: string) => id as SessionId),
    listSessionModels: jest.fn(async () => [{ id: 'gemini' }]),
  } as unknown as jest.Mocked<NativeChatAdapter>;
}

interface RouterOptions {
  identity?: SessionRuntimeIdentity;
  servingProviderId?: string;
  capabilities?: RuntimeHostCapabilities;
  codex?: boolean;
  providerSessions?: boolean;
}

function router(options: RouterOptions = {}) {
  const legacy = {
    startChatSession: jest.fn(async () => 'legacy'),
    resumeSession: jest.fn(),
    getSupportedModels: jest.fn(async () => []),
    dispose: jest.fn(),
    reset: jest.fn(async () => undefined),
    setSessionIdResolvedCallback: jest.fn(),
    setResultStatsCallback: jest.fn(),
  } as unknown as jest.Mocked<IAgentAdapter>;
  const codex = options.codex === false ? null : nativeAdapter();
  const providerSessions =
    options.providerSessions === false ? null : nativeAdapter();
  const admission: RuntimeAdmissionPort = {
    servingProviderId: jest.fn(async () => options.servingProviderId),
  };
  const unit = new RoutingAgentAdapter(
    {
      lookup: () =>
        options.identity ? { persisted: options.identity } : undefined,
    },
    legacy,
    codex,
    admission,
    options.capabilities ?? {
      nativeCodex: true,
      providerSessions: ['antigravity'],
    },
    providerSessions,
  );
  return { unit, legacy, codex, providerSessions };
}

describe('RoutingAgentAdapter provider-session arm', () => {
  it('starts a new chat for a provider-session provider on its adapter', async () => {
    const h = router({ servingProviderId: 'antigravity-cli' });
    await expect(
      h.unit.startChatSession({ tabId: 'tab-1' } as never),
    ).resolves.toBe('started');
    expect(h.providerSessions?.startChatSession).toHaveBeenCalledTimes(1);
    expect(h.legacy.startChatSession).not.toHaveBeenCalled();
    expect(h.codex?.startChatSession).not.toHaveBeenCalled();
  });

  it('starts a prepared provider-session chat when admission agrees', async () => {
    const h = router({ servingProviderId: 'antigravity-cli' });
    await h.unit.startChatSession({
      tabId: 'tab-1',
      runtime: 'provider-session',
    } as never);
    expect(h.providerSessions?.startChatSession).toHaveBeenCalledTimes(1);
  });

  it('refuses a prepared Claude start whose provider is a provider session', async () => {
    const h = router({ servingProviderId: 'antigravity-cli' });
    await expect(
      h.unit.startChatSession({ tabId: 'tab-1', runtime: 'claude-sdk' } as never),
    ).rejects.toBeInstanceOf(ChatRuntimeAdmissionError);
    expect(h.legacy.startChatSession).not.toHaveBeenCalled();
    expect(h.providerSessions?.startChatSession).not.toHaveBeenCalled();
  });

  it.each([
    ['the adapter is not bound', { providerSessions: false }],
    [
      'the host does not list the profile',
      { capabilities: { nativeCodex: true } },
    ],
  ] as const)('refuses a new chat when %s', async (_case, options) => {
    const h = router({ servingProviderId: 'antigravity-cli', ...options });
    const attempt = h.unit.startChatSession({ tabId: 'tab-1' } as never);
    await expect(attempt).rejects.toBeInstanceOf(ChatRuntimeAdmissionError);
    await expect(attempt).rejects.toThrow(
      PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE,
    );
    expect(h.legacy.startChatSession).not.toHaveBeenCalled();
  });

  it('refuses a prepared provider-session start without the adapter', async () => {
    const h = router({
      servingProviderId: 'antigravity-cli',
      providerSessions: false,
    });
    await expect(
      h.unit.startChatSession({
        tabId: 'tab-1',
        runtime: 'provider-session',
      } as never),
    ).rejects.toThrow(PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE);
  });

  it.each([
    ['a gateway turn', { consumer: 'gateway' }, {}],
    [
      'a host that lists no profile',
      {},
      { capabilities: { nativeCodex: true, providerSessions: [] } },
    ],
  ] as const)(
    'refuses a prepared provider-session start for %s before admission',
    async (_case, config, options) => {
      const h = router({ servingProviderId: undefined, ...options });
      await expect(
        h.unit.startChatSession({
          tabId: 'tab-1',
          runtime: 'provider-session',
          ...config,
        } as never),
      ).rejects.toThrow(PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE);
      expect(h.providerSessions?.startChatSession).not.toHaveBeenCalled();
    },
  );

  it('refuses a gateway turn for a provider-session provider (A9)', async () => {
    const h = router({ servingProviderId: 'antigravity-cli' });
    await expect(
      h.unit.startChatSession({ tabId: 'tab-1', consumer: 'gateway' } as never),
    ).rejects.toThrow(PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE);
  });

  it('resumes a stored provider-session binding on its adapter', async () => {
    const h = router({ identity: STORED });
    await expect(h.unit.resumeSession(SESSION, {} as never)).resolves.toBe(
      'resumed',
    );
    expect(h.legacy.resumeSession).not.toHaveBeenCalled();
  });

  it('refuses to resume a stored binding without the adapter', () => {
    const h = router({ identity: STORED, providerSessions: false });
    expect(() => h.unit.resumeSession(SESSION, {} as never)).toThrow(
      PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE,
    );
    expect(h.legacy.resumeSession).not.toHaveBeenCalled();
  });

  it('refuses to resume a stored binding whose profile the host does not list', () => {
    const h = router({
      identity: STORED,
      capabilities: { nativeCodex: true, providerSessions: [] },
    });
    expect(() => h.unit.resumeSession(SESSION, {} as never)).toThrow(
      PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE,
    );
  });

  it('routes an owned live session to the provider-session adapter', async () => {
    const h = router();
    h.providerSessions?.owns.mockReturnValue(true);
    await expect(h.unit.listSessionModels(SESSION)).resolves.toEqual([
      { id: 'gemini' },
    ]);
    expect(h.legacy.getSupportedModels).not.toHaveBeenCalled();
  });

  it('still starts an ordinary Claude chat on the legacy adapter', async () => {
    const h = router({ servingProviderId: 'openrouter' });
    await expect(
      h.unit.startChatSession({ tabId: 'tab-1' } as never),
    ).resolves.toBe('legacy');
  });

  it('works with no Codex adapter bound (nullable native)', async () => {
    const h = router({
      servingProviderId: 'antigravity-cli',
      codex: false,
      capabilities: { nativeCodex: false, providerSessions: ['antigravity'] },
    });
    await h.unit.startChatSession({ tabId: 'tab-1' } as never);
    expect(h.providerSessions?.startChatSession).toHaveBeenCalledTimes(1);
    await expect(
      router({ servingProviderId: 'openai-codex', codex: false }).unit
        .startChatSession({ tabId: 'tab-1' } as never),
    ).rejects.toThrow('native Codex runtime');
  });

  it('fans lifecycle calls out to every bound adapter and skips nulls', async () => {
    const both = router();
    both.unit.dispose();
    await both.unit.reset();
    const stats = jest.fn();
    both.unit.setResultStatsCallback(stats);
    const unsubscribe = both.unit.onQueuedFollowUpState(jest.fn());
    unsubscribe();
    for (const adapter of [both.codex, both.providerSessions, both.legacy]) {
      expect(adapter?.dispose).toHaveBeenCalledTimes(1);
      expect(adapter?.reset).toHaveBeenCalledTimes(1);
      expect(adapter?.setResultStatsCallback).toHaveBeenCalledWith(stats);
    }
    expect(both.providerSessions?.onQueuedFollowUpState).toHaveBeenCalledTimes(1);

    const legacyOnly = router({ codex: false, providerSessions: false });
    expect(() => legacyOnly.unit.dispose()).not.toThrow();
    await expect(legacyOnly.unit.reset()).resolves.toBeUndefined();
    expect(() => legacyOnly.unit.setResultStatsCallback(stats)).not.toThrow();
    expect(legacyOnly.legacy.dispose).toHaveBeenCalledTimes(1);
  });

  it('confirms a live provider-session id through its adapter', () => {
    const h = router({ codex: false });
    expect(h.unit.resolveLiveSessionId(SESSION)).toBe(SESSION);
  });
});
