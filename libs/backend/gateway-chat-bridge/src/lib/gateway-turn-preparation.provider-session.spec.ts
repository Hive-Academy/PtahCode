import 'reflect-metadata';
import { AuthRequiredError } from '@ptah-extension/agent-sdk';
import {
  GatewayTurnPreparation,
  type GatewayTurnPreparationDeps,
} from './gateway-turn-preparation';

const WORKSPACE = '/ws/proj';

function preparation(
  resolveExecutionProfile: GatewayTurnPreparationDeps['profileResolver']['resolveExecutionProfile'],
): GatewayTurnPreparation {
  return new GatewayTurnPreparation({
    logger: { debug: () => undefined, warn: () => undefined },
    codeExecutionMcp: {
      getPort: () => null,
      ensureRegisteredForSubagents: async () => ({ registered: true }),
    },
    enhancedPrompts: { getEnhancedPromptContent: async () => null },
    profileResolver: {
      resolveStoredModel: (_workspacePath, storedModel) => storedModel,
      resolveExecutionProfile,
    },
    readSelectedModel: () => 'stored-model',
    hostCapabilities: {
      nativeCodex: true,
      providerSessions: ['antigravity'],
    },
  });
}

/**
 * A9: a provider-session active provider ends a gateway turn with
 * `AuthRequiredError`, which the bridge reports as `auth-required`
 * (`gateway-chat-bridge.ts` pre-session catch).
 */
describe('GatewayTurnPreparation with a provider-session active provider', () => {
  it('propagates the resolver refusal for the gateway consumer', async () => {
    const refusal = new AuthRequiredError(
      "Antigravity runs only in Ptah's main chat.",
      { providerId: 'antigravity-cli' },
    );
    const resolve = jest.fn(async () => {
      throw refusal;
    });
    await expect(preparation(resolve).prepareTurn(WORKSPACE)).rejects.toBe(
      refusal,
    );
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({ consumer: 'gateway' }),
    );
  });

  it('refuses a provider-session decision instead of running it on the Claude path', async () => {
    const attempt = preparation(async () => ({
      runtime: 'provider-session',
      seed: {
        providerId: 'antigravity-cli',
        profile: 'antigravity',
        consumer: 'chat',
        workspacePath: WORKSPACE,
        workspaceId: WORKSPACE,
      },
    })).prepareTurn(WORKSPACE);
    await expect(attempt).rejects.toBeInstanceOf(AuthRequiredError);
    await expect(attempt).rejects.toMatchObject({
      providerId: 'antigravity-cli',
    });
  });
});
