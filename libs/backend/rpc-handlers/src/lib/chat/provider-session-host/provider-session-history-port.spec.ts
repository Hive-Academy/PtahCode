import 'reflect-metadata';
import { SessionId, type FlatStreamEventUnion } from '@ptah-extension/shared';
import { createProviderSessionHistoryPort } from './provider-session-history-port';
import {
  ProviderSessionHistoryError,
  type ProviderSessionPoolRequest,
} from './provider-session-pool';

jest.mock('@ptah-extension/agent-sdk', () => ({
  ProviderSessionChatAdapterError: jest.requireActual<
    typeof import('../../../../../agent-sdk/src/lib/provider-session/provider-session-chat-adapter-error')
  >('../../../../../agent-sdk/src/lib/provider-session/provider-session-chat-adapter-error')
    .ProviderSessionChatAdapterError,
}));

const id = SessionId.from('22222222-2222-4222-8222-222222222222');

function stored(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: id,
    workspaceId: '/Work/Repo',
    providerSessionExecution: {
      version: 1,
      sessionId: id,
      runtime: 'provider-session',
      providerId: 'antigravity-cli',
      workspaceId: '/work/repo',
      providerSession: { profile: 'antigravity' },
    },
    providerSessionThread: { nativeSessionId: 'native-1', processGeneration: 1 },
    ...overrides,
  };
}

function harness(metadata: unknown = stored()) {
  const events = [{ id: 'e1' } as FlatStreamEventUnion];
  const request = { profile: 'antigravity' } as ProviderSessionPoolRequest;
  const deps = {
    metadata: { get: jest.fn(async () => metadata) },
    pool: { acquireForHistory: jest.fn(async () => ({ events })) },
    openRequests: { request: jest.fn(async () => request) },
  };
  const port = createProviderSessionHistoryPort(
    deps as unknown as Parameters<typeof createProviderSessionHistoryPort>[0],
  );
  return { port, deps, events, request };
}

describe('provider-session history port', () => {
  it('loads the stored native session through the pool and returns its replay', async () => {
    const h = harness();
    const signal = new AbortController().signal;
    await expect(h.port.read(id, signal)).resolves.toEqual({
      events: h.events,
      stats: null,
    });
    // The caller's spelling of the workspace, not the normalized key.
    expect(h.deps.openRequests.request).toHaveBeenCalledWith({
      sessionId: id,
      profile: 'antigravity',
      workspacePath: '/Work/Repo',
      nativeSessionId: 'native-1',
    });
    expect(h.deps.pool.acquireForHistory).toHaveBeenCalledWith(id, h.request, signal);
  });

  it.each([
    ['no metadata', null],
    ['no thread mapping', stored({ providerSessionThread: undefined })],
    ['no provider-session binding', stored({ providerSessionExecution: undefined })],
    ['no workspace', stored({ workspaceId: '' })],
  ])('rejects with %s before any open', async (_label, metadata) => {
    const h = harness(metadata);
    await expect(h.port.read(id)).rejects.toBeInstanceOf(ProviderSessionHistoryError);
    expect(h.deps.openRequests.request).not.toHaveBeenCalled();
    expect(h.deps.pool.acquireForHistory).not.toHaveBeenCalled();
  });

  it('rejects a session id that is not a chat session id', async () => {
    const h = harness();
    await expect(h.port.read('not-a-uuid')).rejects.toMatchObject({
      reason: 'history-unavailable',
    });
    expect(h.deps.metadata.get).not.toHaveBeenCalled();
  });

  it('propagates a pool refusal for the router to map', async () => {
    const h = harness();
    h.deps.pool.acquireForHistory.mockRejectedValueOnce(
      new ProviderSessionHistoryError('busy'),
    );
    await expect(h.port.read(id)).rejects.toMatchObject({ reason: 'busy' });
  });
});
