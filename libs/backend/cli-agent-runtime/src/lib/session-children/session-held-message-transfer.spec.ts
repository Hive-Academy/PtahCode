import type { IAgentAdapter, SessionId } from '@ptah-extension/shared';
import { transferHeldPeerMessages } from './session-held-message-transfer';

describe('transferHeldPeerMessages', () => {
  const origin = { kind: 'peer' as const, from: 'parent' };

  function adapterWith(
    held: unknown[],
    send: jest.Mock,
  ): IAgentAdapter {
    return {
      claimHeldPeerMessages: jest.fn().mockReturnValue(held),
      sendMessageToSession: send,
    } as unknown as IAgentAdapter;
  }

  it('returns an empty list when every replay succeeds', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const result = await transferHeldPeerMessages(
      adapterWith([{ content: 'a', origin }], send),
      'p' as SessionId,
      's' as SessionId,
      jest.fn(),
    );
    expect(result).toEqual([]);
  });

  it('continues after a failure and returns collapsed, truncated previews', async () => {
    const long = `x${' y'.repeat(100)}`;
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const log = jest.fn();
    const result = await transferHeldPeerMessages(
      adapterWith(
        [
          {
            content: long,
            origin,
            files: ['a'],
            images: [{ data: 'd', mediaType: 'image/png' }],
          },
          { content: 'ok', origin },
        ],
        send,
      ),
      'p' as SessionId,
      's' as SessionId,
      log,
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(1);
    expect(result[0].preview).toMatch(/^x y y.*\.\.\. \[1 file\(s\), 1 image\(s\)\]$/);
    expect(log).toHaveBeenCalledTimes(1);
  });
});
