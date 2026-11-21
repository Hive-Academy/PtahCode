import 'reflect-metadata';
import { resolve } from 'node:path';
import type {
  ResolvedExecutionProfile,
  WorkspaceProviderProfileResolver,
} from '@ptah-extension/auth-providers';
import type { RuntimeHostCapabilities } from '@ptah-extension/shared';
import { createMockWorkspaceProvider } from '@ptah-extension/platform-core/testing';
import { createChatRuntimeAdmission } from './chat-runtime-admission';

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

const workspace = resolve('/projects/admission');

function admission(
  resolved: ResolvedExecutionProfile,
  hostCapabilities: RuntimeHostCapabilities,
) {
  const resolveExecutionProfile = jest
    .fn<
      ReturnType<WorkspaceProviderProfileResolver['resolveExecutionProfile']>,
      Parameters<WorkspaceProviderProfileResolver['resolveExecutionProfile']>
    >()
    .mockResolvedValue(resolved);
  const port = createChatRuntimeAdmission({
    resolver: { resolveExecutionProfile },
    workspaceProvider: createMockWorkspaceProvider({ folders: [workspace] }),
    platformInfo: {
      extensionPath: resolve('/application'),
      globalStoragePath: resolve('/storage'),
    },
    webviewManager: { broadcastMessage: jest.fn(async () => undefined) },
    hostCapabilities,
  });
  return { port, resolveExecutionProfile };
}

const config = {
  workspaceId: workspace,
  projectPath: workspace,
  tabId: 'tab',
};

describe('createChatRuntimeAdmission', () => {
  it('answers the provider-session seed provider', async () => {
    const capabilities = {
      nativeCodex: false,
      providerSessions: ['antigravity'] as const,
    };
    const { port, resolveExecutionProfile } = admission(
      {
        runtime: 'provider-session',
        seed: {
          providerId: 'antigravity-cli',
          profile: 'antigravity',
          consumer: 'chat',
          workspacePath: workspace,
          workspaceId: workspace,
        },
      },
      capabilities,
    );
    await expect(port.servingProviderId(config)).resolves.toBe(
      'antigravity-cli',
    );
    expect(resolveExecutionProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: workspace,
        consumer: 'chat',
        hostCapabilities: capabilities,
      }),
    );
  });

  it('answers no provider for a Claude start without a provider profile', async () => {
    const { port } = admission(
      { runtime: 'claude-sdk', model: 'claude-sonnet-4-5', providerProfile: undefined },
      { nativeCodex: false },
    );
    await expect(port.servingProviderId(config)).resolves.toBeUndefined();
  });
});
