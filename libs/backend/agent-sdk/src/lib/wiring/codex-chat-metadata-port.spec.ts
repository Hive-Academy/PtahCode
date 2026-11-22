import { SessionId } from '@ptah-extension/shared';
import type { SessionMetadataStore } from '../session-metadata-store';
import { createCodexChatMetadataPort } from './codex-chat-metadata-port';
const workspace = process.platform === 'win32' ? 'D:/workspace' : '/workspace';
const home = process.platform === 'win32' ? 'd:\\home' : '/home';
describe('native metadata port', () => {
  it('maps native identity through the sole metadata writer and rejects mismatched IDs', async () => {
    const updateCodexExecution = jest
      .fn<
        ReturnType<SessionMetadataStore['updateCodexExecution']>,
        Parameters<SessionMetadataStore['updateCodexExecution']>
      >()
      .mockResolvedValue(undefined);
    const incrementCodexMessageCount = jest.fn(async () => undefined);
    const port = createCodexChatMetadataPort({ updateCodexExecution, incrementCodexMessageCount });
    const sessionId = SessionId.from('33333333-3333-4333-8333-333333333333');
    const identity = {
      threadId: sessionId,
      contextId: 'context',
      processGeneration: 1,
      normalizedHome: home,
      workspaceId: workspace,
      providerId: 'openai-codex',
      profileFingerprint: 'profile',
    };
    await port.save(sessionId, identity, '  Native chat  ');
    expect(updateCodexExecution).toHaveBeenCalledTimes(1);
    await port.completedTurn?.(sessionId);
    expect(incrementCodexMessageCount).toHaveBeenCalledTimes(1);
    expect(incrementCodexMessageCount).toHaveBeenCalledWith(sessionId);
    expect(updateCodexExecution.mock.calls[0][2]).toBeUndefined();
    expect(updateCodexExecution.mock.calls[0][3]).toBe('  Native chat  ');
    expect(updateCodexExecution.mock.calls[0][1](undefined)).toEqual({
      version: 1,
      sessionId,
      runtime: 'codex-app-server',
      providerId: 'openai-codex',
      workspaceId: workspace,
      codex: { normalizedHome: home },
    });
    await expect(
      port.save(sessionId, { ...identity, threadId: 'other' }),
    ).rejects.toThrow('Codex session/thread identity mismatch');
    expect(updateCodexExecution).toHaveBeenCalledTimes(1);
  });

  it('sends a duration-only write to the store and reads the stored time', async () => {
    const sessionId = SessionId.from('44444444-4444-4444-8444-444444444444');
    const duration = { completedMs: 3_000, turnId: 'turn-2', turnMs: 500 };
    const usageStore = {
      get: jest.fn(async () => ({ codexTurnDuration: duration, codexMessageCount: 2 })),
      updateCodexUsageCheckpoint: jest.fn(async () => undefined),
      updateCodexTurnDuration: jest.fn(async () => undefined),
    } as unknown as Parameters<typeof createCodexChatMetadataPort>[1];
    const port = createCodexChatMetadataPort(
      { updateCodexExecution: jest.fn(), incrementCodexMessageCount: jest.fn() },
      usageStore,
    );
    await port.persistDuration?.(sessionId, duration);
    expect(usageStore?.updateCodexTurnDuration).toHaveBeenCalledWith(sessionId, duration);
    expect(usageStore?.updateCodexUsageCheckpoint).not.toHaveBeenCalled();
    await expect(port.readUsage?.(sessionId)).resolves.toMatchObject({ duration });
  });
});
