import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockWorkspaceProvider } from '@ptah-extension/platform-core/testing';
import type {
  ProviderSessionChatBinding,
  SessionApprovalRouter,
} from '@ptah-extension/agent-sdk';
import type { ResolvedExecutionProfile } from '@ptah-extension/auth-providers';
import type {
  ProviderApprovalSink,
  ProviderSession,
} from '@ptah-extension/provider-session-contracts';
import {
  MESSAGE_TYPES,
  SessionId,
  type FlatStreamEventUnion,
  type ProviderSessionSeed,
} from '@ptah-extension/shared';
import {
  createProviderSessionChatHostPorts,
  type ProviderSessionChatHostPortsDeps,
} from './provider-session-chat-host-ports';
import type {
  ProviderSessionOpenInput,
  ProviderSessionOpenRequests,
} from './provider-session-open-request';
import type { ProviderSessionPoolRequest } from './provider-session-pool';

jest.mock('@ptah-extension/agent-sdk', () => {
  const abort = jest.requireActual<
    typeof import('../../../../../agent-sdk/src/lib/system-abort-permission-message')
  >('../../../../../agent-sdk/src/lib/system-abort-permission-message');
  return {
    SDK_TOKENS: { RUNTIME_HOST_CAPABILITIES: Symbol.for('caps') },
    UNROUTABLE_PERMISSION_TIMEOUT_MS: abort.UNROUTABLE_PERMISSION_TIMEOUT_MS,
    ProviderSessionChatAdapterError: jest.requireActual<
      typeof import('../../../../../agent-sdk/src/lib/provider-session/provider-session-chat-adapter-error')
    >('../../../../../agent-sdk/src/lib/provider-session/provider-session-chat-adapter-error')
      .ProviderSessionChatAdapterError,
  };
});
jest.mock('@ptah-extension/auth-providers', () => ({
  AUTH_PROVIDERS_TOKENS: {
    SDK_WORKSPACE_PROVIDER_PROFILE_RESOLVER: Symbol.for('profiles'),
  },
}));

describe('provider-session chat host ports', () => {
  let workspace: string;
  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'ptah-provider-session-host-'));
  });
  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });
  const id = SessionId.from('22222222-2222-4222-8222-222222222222');

  function seed(): ProviderSessionSeed {
    return {
      providerId: 'grok-cli',
      profile: 'grok',
      consumer: 'chat',
      workspacePath: workspace,
      workspaceId: workspace,
      model: 'grok-4',
    };
  }

  function harness(stored?: unknown) {
    const execution: ResolvedExecutionProfile = {
      runtime: 'provider-session',
      seed: seed(),
    };
    const resolveExecutionProfile = jest.fn().mockResolvedValue(execution);
    const broadcastMessage = jest.fn().mockResolvedValue(undefined);
    const live = { nativeSessionId: 'native-1' } as ProviderSession;
    const poolRequest = { profile: 'grok' } as ProviderSessionPoolRequest;
    const pool = {
      acquire: jest.fn(async () => live),
      release: jest.fn(async () => undefined),
      releaseAll: jest.fn(async () => undefined),
      holds: jest.fn(() => true),
    };
    const openRequests: jest.Mocked<ProviderSessionOpenRequests> = {
      request: jest.fn(async (_input: ProviderSessionOpenInput) => poolRequest),
      attachApprovals: jest.fn(),
      detachApprovals: jest.fn(),
      detachAll: jest.fn(),
    };
    const metadata = {
      get: jest.fn(async () => stored),
      updateProviderSessionExecution: jest.fn(async () => undefined),
    };
    const drained: FlatStreamEventUnion[] = [];
    const streamEventsToWebview = jest.fn(
      async (_id: SessionId, stream: AsyncIterable<FlatStreamEventUnion>) => {
        for await (const event of stream) drained.push(event);
      },
    );
    const respond = jest
      .fn<boolean, Parameters<SessionApprovalRouter['respond']>>()
      .mockReturnValue(true);
    const deps: ProviderSessionChatHostPortsDeps = {
      resolver: { resolveExecutionProfile },
      workspaceProvider: createMockWorkspaceProvider({ folders: [workspace] }),
      platformInfo: {
        extensionPath: join(tmpdir(), 'ptah-test-extension'),
        globalStoragePath: join(tmpdir(), 'ptah-test-storage'),
      },
      hostCapabilities: { nativeCodex: false, providerSessions: ['grok'] },
      webviewManager: { broadcastMessage },
      logger: { warn: jest.fn(), error: jest.fn() },
      info: {
        id: 'ptah-cli',
        name: 'Grok',
        version: '1.0.0',
        description: 'Provider-session test provider',
        vendor: 'xAI',
        capabilities: {
          streaming: true,
          fileAttachments: false,
          contextManagement: true,
          sessionPersistence: true,
          multiTurn: true,
          codeGeneration: true,
          imageAnalysis: false,
          functionCalling: true,
        },
      },
      pool,
      openRequests,
      metadata: metadata as unknown as ProviderSessionChatHostPortsDeps['metadata'],
      approvals: { respond },
      broadcaster: { streamEventsToWebview },
    };
    const ports = createProviderSessionChatHostPorts(deps);
    const approvals: ProviderApprovalSink = { request: jest.fn() };
    return {
      ports,
      pool,
      openRequests,
      metadata,
      resolveExecutionProfile,
      broadcastMessage,
      streamEventsToWebview,
      drained,
      live,
      poolRequest,
      approvals,
      respond,
    };
  }

  const storedSession = (overrides: Record<string, unknown> = {}) => ({
    sessionId: id,
    workspaceId: workspace,
    providerSessionExecution: {
      version: 1,
      sessionId: id,
      runtime: 'provider-session',
      providerId: 'grok-cli',
      workspaceId: workspace,
      providerSession: { profile: 'grok' },
    },
    providerSessionThread: { nativeSessionId: 'native-1', processGeneration: 1 },
    ...overrides,
  });

  it('prepares a new session from the resolved credential-free seed', async () => {
    const h = harness();
    await expect(
      h.ports.prepare({ projectPath: workspace, model: 'grok-4' }),
    ).resolves.toEqual({ seed: seed() });
    expect(h.metadata.get).not.toHaveBeenCalled();
    expect(h.resolveExecutionProfile).toHaveBeenCalledWith(
      expect.objectContaining({ workspacePath: workspace, existingIdentity: undefined }),
    );
  });

  it('prepares a resume with the stored native id and binding', async () => {
    const stored = storedSession();
    const h = harness(stored);
    await expect(h.ports.prepare({ projectPath: workspace }, id)).resolves.toEqual({
      seed: seed(),
      resume: { nativeSessionId: 'native-1' },
    });
    expect(h.resolveExecutionProfile).toHaveBeenCalledWith(
      expect.objectContaining({ existingIdentity: stored.providerSessionExecution }),
    );
  });

  it.each([
    ['no metadata', undefined],
    ['no thread mapping', storedSession({ providerSessionThread: undefined })],
    ['a Codex binding', storedSession({ providerSessionExecution: undefined })],
  ])('refuses a resume with %s as resume-failed', async (_label, stored) => {
    const h = harness(stored);
    await expect(h.ports.prepare({ projectPath: workspace }, id)).rejects.toMatchObject({
      name: 'ProviderSessionChatAdapterError',
      code: 'resume-failed',
    });
    expect(h.resolveExecutionProfile).not.toHaveBeenCalled();
  });

  it('refuses a preparation that resolves to another runtime', async () => {
    const h = harness();
    h.resolveExecutionProfile.mockResolvedValueOnce({
      runtime: 'claude-sdk',
      model: 'sonnet',
    });
    await expect(h.ports.prepare({ projectPath: workspace })).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('acquires through the pool with the session approvals relayed first', async () => {
    const h = harness();
    const signal = new AbortController().signal;
    await expect(
      h.ports.acquire(
        {
          sessionId: id,
          tabId: 'tab-1',
          seed: seed(),
          resume: { nativeSessionId: 'native-1', onFailure: 'error' },
          approvals: h.approvals,
        },
        signal,
      ),
    ).resolves.toBe(h.live);
    expect(h.openRequests.request).toHaveBeenCalledWith({
      sessionId: id,
      profile: 'grok',
      workspacePath: workspace,
      nativeSessionId: 'native-1',
      model: 'grok-4',
    });
    expect(h.openRequests.attachApprovals).toHaveBeenCalledWith(id, h.approvals);
    expect(h.openRequests.attachApprovals.mock.invocationCallOrder[0]).toBeLessThan(
      h.pool.acquire.mock.invocationCallOrder[0],
    );
    expect(h.pool.acquire).toHaveBeenCalledWith(id, h.poolRequest, signal);
    expect(h.ports.tabId(id)).toBe('tab-1');
  });

  it('leaves no tab or sink behind when the first acquire fails (M-2)', async () => {
    const h = harness();
    h.pool.acquire.mockRejectedValueOnce(new Error('auth required'));
    await expect(
      h.ports.acquire(
        { sessionId: id, tabId: 'tab-1', seed: seed(), approvals: h.approvals },
        new AbortController().signal,
      ),
    ).rejects.toThrow('auth required');
    expect(h.openRequests.detachApprovals).toHaveBeenCalledWith(id);
    expect(h.ports.tabId(id)).toBe(id);
  });

  it('keeps the routing of a session whose re-acquire fails', async () => {
    const h = harness();
    const request = { sessionId: id, tabId: 'tab-1', seed: seed(), approvals: h.approvals };
    await h.ports.acquire(request, new AbortController().signal);
    h.pool.acquire.mockRejectedValueOnce(new Error('respawn failed'));
    await expect(h.ports.acquire(request, new AbortController().signal)).rejects.toThrow();
    expect(h.openRequests.detachApprovals).not.toHaveBeenCalled();
    expect(h.ports.tabId(id)).toBe('tab-1');
  });

  it('asks the pool whether it still holds a process', () => {
    const h = harness();
    h.pool.holds.mockReturnValueOnce(false);
    expect(h.ports.holds(id, h.live)).toBe(false);
    expect(h.pool.holds).toHaveBeenCalledWith(id, h.live);
  });

  it('releases to the pool and forgets the tab and sink, except for a broken session', async () => {
    const h = harness();
    await h.ports.acquire(
      { sessionId: id, tabId: 'tab-1', seed: seed(), approvals: h.approvals },
      new AbortController().signal,
    );
    await h.ports.release(id, 'broken');
    expect(h.pool.release).toHaveBeenCalledWith(id, 'broken');
    expect(h.openRequests.detachApprovals).not.toHaveBeenCalled();
    expect(h.ports.tabId(id)).toBe('tab-1');
    await h.ports.release(id, 'tab-closed');
    expect(h.openRequests.detachApprovals).toHaveBeenCalledWith(id);
    expect(h.ports.tabId(id)).toBe(id);
  });

  it('forgets the sink even when the pool release fails', async () => {
    const h = harness();
    h.pool.release.mockRejectedValueOnce(new Error('close failed'));
    await expect(h.ports.release(id, 'session-ended')).rejects.toThrow('close failed');
    expect(h.openRequests.detachApprovals).toHaveBeenCalledWith(id);
  });

  it('releases every session and clears the routing state', async () => {
    const h = harness();
    await h.ports.acquire(
      { sessionId: id, tabId: 'tab-1', seed: seed(), approvals: h.approvals },
      new AbortController().signal,
    );
    await h.ports.releaseAll();
    expect(h.pool.releaseAll).toHaveBeenCalled();
    expect(h.openRequests.detachAll).toHaveBeenCalled();
    expect(h.ports.tabId(id)).toBe(id);
  });

  it('saves the binding through updateProviderSessionExecution', async () => {
    const h = harness();
    const binding: ProviderSessionChatBinding = {
      execution: storedSession()
        .providerSessionExecution as ProviderSessionChatBinding['execution'],
      thread: { nativeSessionId: 'native-1', processGeneration: 2 },
    };
    await h.ports.identity.save(id, binding, 'Title');
    const [sessionId, updater, thread, title] =
      h.metadata.updateProviderSessionExecution.mock.calls[0] as unknown as [
        SessionId,
        () => unknown,
        () => unknown,
        string,
      ];
    expect(sessionId).toBe(id);
    expect(updater()).toBe(binding.execution);
    expect(thread()).toEqual(binding.thread);
    expect(title).toBe('Title');
  });

  it('publishes turn streams and notices to the session tab', async () => {
    const h = harness();
    await h.ports.acquire(
      { sessionId: id, tabId: 'tab-1', seed: seed(), approvals: h.approvals },
      new AbortController().signal,
    );
    const event = { id: 'e1', eventType: 'message_start' } as FlatStreamEventUnion;
    async function* stream() {
      yield event;
    }
    await h.ports.publish(id, stream());
    expect(h.streamEventsToWebview).toHaveBeenCalledWith(id, expect.anything(), 'tab-1');
    expect(h.drained).toEqual([event]);
    await h.ports.publishNotice(id, [event]);
    expect(h.broadcastMessage).toHaveBeenCalledWith(MESSAGE_TYPES.CHAT_CHUNK, {
      tabId: 'tab-1',
      sessionId: id,
      event,
    });
  });

  it('answers a permission reply through the provider-session router reply', () => {
    const h = harness();
    h.ports.presentation.present({
      sessionId: id,
      threadId: 'native-1',
      contextId: 'ctx',
      request: { requestId: 'r1', title: 'Edit file' },
    });
    const payload = h.broadcastMessage.mock.calls[0][1] as { id: string };
    expect(h.ports.handlePermissionResponse({ id: payload.id, decision: 'allow' })).toBe(true);
    expect(h.respond).toHaveBeenCalledWith(
      { sessionId: id, threadId: 'native-1', requestId: 'r1' },
      {
        kind: 'provider-session',
        response: {
          sessionId: id,
          contextId: 'ctx',
          threadId: 'native-1',
          requestId: 'r1',
          decision: 'accept',
        },
      },
    );
  });
});
