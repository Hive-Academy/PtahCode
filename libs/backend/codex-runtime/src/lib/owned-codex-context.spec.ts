import type { CodexContext, CodexTurnReceipt } from './codex-runtime.types';
import { ownCodexContext } from './owned-codex-context';

describe('ownCodexContext', () => {
  const receipt: CodexTurnReceipt = { threadId: 'thread-1', turnId: 'turn-1', revision: 1 };
  const contextWith = (steer: CodexContext['steer']): CodexContext => ({
    identity: {
      threadId: 'thread-1', contextId: 'lane', processGeneration: 1,
      normalizedHome: '/home/codex', workspaceId: 'workspace',
      providerId: 'codex', profileFingerprint: 'fixture',
    },
    turnPermissionLevel: 'ask',
    listModels: async () => [],
    events: async function* () { /* no events in this fixture */ },
    startTurn: async () => receipt,
    steer,
    interrupt: async () => true,
    updateNextTurn: async () => ({ timing: 'nextTurn', revision: 1 }),
    compact: async () => undefined,
    close: async () => undefined,
  });

  it('forwards steer input and expected turn ID unchanged', async () => {
    const steer = jest.fn(async () => receipt);
    const owned = ownCodexContext(contextWith(steer), async () => undefined);
    const input = { text: 'Continue' };

    await expect(owned.steer(input, 'expected-turn')).resolves.toBe(receipt);
    expect(steer).toHaveBeenCalledWith(input, 'expected-turn');
  });

  it('releases the scope once when close is repeated', async () => {
    const dispose = jest.fn(async () => undefined);
    const owned = ownCodexContext(contextWith(async () => receipt), dispose);
    await Promise.all([owned.close(), owned.close()]);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
