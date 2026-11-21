import 'reflect-metadata';
import { resolve } from 'node:path';
import type {
  ResolvedExecutionProfile,
  WorkspaceProviderProfileResolver,
} from '@ptah-extension/auth-providers';
import type { SessionId, SessionRuntimeIdentity } from '@ptah-extension/shared';
import { createMockWorkspaceProvider } from '@ptah-extension/platform-core/testing';
import {
  ChatRuntimeProfileService,
  refuseProviderSessionExecution,
  storedChatRuntimeIdentity,
  type ResolvedChatExecution,
} from './chat-runtime-profile.service';

jest.mock('@ptah-extension/agent-sdk', () => ({
  SDK_TOKENS: {
    RUNTIME_HOST_CAPABILITIES: Symbol.for('RuntimeHostCapabilities'),
  },
  legacyClaudeSessionRuntimeIdentity: (input: {
    sessionId: string;
    workspaceId: string;
    providerId?: string;
  }) => ({
    version: 1,
    sessionId: input.sessionId,
    runtime: 'claude-sdk',
    providerId: input.providerId ?? 'claude-cli',
    workspaceId: input.workspaceId,
  }),
}));
jest.mock('@ptah-extension/auth-providers', () => ({
  AUTH_PROVIDERS_TOKENS: {
    SDK_WORKSPACE_PROVIDER_PROFILE_RESOLVER: Symbol.for(
      'WorkspaceProviderProfileResolver',
    ),
  },
}));

const workspace = resolve('/projects/session');
const sessionId = 'stored-session' as SessionId;
const identity: SessionRuntimeIdentity = {
  version: 1,
  runtime: 'provider-session',
  sessionId,
  workspaceId: workspace,
  providerId: 'antigravity-cli',
  providerSession: { profile: 'antigravity' },
};
const providerSession: ResolvedExecutionProfile = {
  runtime: 'provider-session',
  seed: {
    providerId: 'antigravity-cli',
    profile: 'antigravity',
    consumer: 'chat',
    workspacePath: workspace,
    workspaceId: workspace,
  },
};

function harness() {
  const resolveExecutionProfile = jest
    .fn<
      ReturnType<WorkspaceProviderProfileResolver['resolveExecutionProfile']>,
      Parameters<WorkspaceProviderProfileResolver['resolveExecutionProfile']>
    >()
    .mockResolvedValue(providerSession);
  const broadcastMessage = jest
    .fn<Promise<void>, [string, unknown]>()
    .mockResolvedValue(undefined);
  const capabilities = {
    nativeCodex: true,
    providerSessions: ['antigravity'] as const,
  };
  const service = new ChatRuntimeProfileService(
    { resolveExecutionProfile },
    createMockWorkspaceProvider({ folders: [workspace] }),
    {
      extensionPath: resolve('/application'),
      globalStoragePath: resolve('/storage'),
    },
    { broadcastMessage },
    capabilities,
  );
  return { service, resolveExecutionProfile, broadcastMessage, capabilities };
}

describe('ChatRuntimeProfileService provider-session branch', () => {
  it('returns the seed with the session workspace, cwd and config', async () => {
    const h = harness();
    const config = {
      workspaceId: workspace,
      projectPath: workspace,
      model: 'gemini-3-pro',
      tabId: 'tab',
    };

    const execution = await h.service.prepare(config, identity);

    expect(execution).toEqual({
      ...providerSession,
      workspacePath: workspace,
      cwd: workspace,
      config,
    });
    expect(h.resolveExecutionProfile).toHaveBeenCalledWith({
      workspacePath: workspace,
      requestedModel: 'gemini-3-pro',
      requestedModelIsStored: false,
      existingIdentity: identity,
      consumer: 'chat',
      hostCapabilities: h.capabilities,
    });
  });

  it('publishes no Codex runtime notice for a provider session', async () => {
    const h = harness();
    const execution = await h.service.prepare({
      workspaceId: workspace,
      projectPath: workspace,
      outputStyleName: 'concise',
      tabId: 'tab',
    });
    await h.service.publishRuntimeNotices(execution, { tabId: 'tab' });
    expect(h.broadcastMessage).not.toHaveBeenCalled();
  });
});

describe('storedChatRuntimeIdentity', () => {
  it('reads a stored provider-session binding', () => {
    expect(
      storedChatRuntimeIdentity(
        sessionId,
        { providerSessionExecution: identity, workspaceId: workspace },
        workspace,
      ),
    ).toBe(identity);
  });

  it('keeps metadata without a native binding on its Claude runtime', () => {
    expect(
      storedChatRuntimeIdentity(sessionId, { providerId: 'openrouter' }, workspace),
    ).toEqual({
      version: 1,
      sessionId,
      runtime: 'claude-sdk',
      providerId: 'openrouter',
      workspaceId: workspace,
    });
  });
});

describe('refuseProviderSessionExecution', () => {
  it('refuses a provider-session execution with PROVIDER_SESSION_UNAVAILABLE', () => {
    const execution = {
      ...providerSession,
      workspacePath: workspace,
      cwd: workspace,
      config: { tabId: 'tab' },
    } as ResolvedChatExecution;
    expect(() => refuseProviderSessionExecution(execution)).toThrow(
      expect.objectContaining({
        name: 'RpcUserError',
        errorCode: 'PROVIDER_SESSION_UNAVAILABLE',
      }),
    );
  });

  it('passes a Claude execution through', () => {
    const execution: ResolvedChatExecution = {
      runtime: 'claude-sdk',
      model: 'sonnet',
      providerProfile: undefined,
    };
    expect(() => refuseProviderSessionExecution(execution)).not.toThrow();
  });
});
