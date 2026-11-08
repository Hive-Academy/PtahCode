import { WORKER_ERROR_MESSAGES } from '@ptah-extension/worker-protocol';
import { InProcessRpc, IN_PROCESS_SPECS } from './in-process-rpc';

describe('InProcessRpc', () => {
  it.each(['chat:start', 'chat:continue', 'chat:abort'] as const)(
    '%s treats nested failure as a failure',
    async (method) => {
      const handler = {
        handleMessage: jest.fn(async () => ({
          success: true,
          data: {
            success: false,
            errorCode: 'AUTH_REQUIRED',
            error: '/secret/path',
          },
        })),
      };
      const rpc = new InProcessRpc(handler);
      const result = await rpc.call(
        method,
        {} as never,
        IN_PROCESS_SPECS[method] as never,
      );
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'NO_PROVIDER_READY',
          message: WORKER_ERROR_MESSAGES.NO_PROVIDER_READY,
        }),
      });
      expect(JSON.stringify(result)).not.toContain('/secret/path');
    },
  );

  it('validates session:list result shape', async () => {
    const rpc = new InProcessRpc({
      handleMessage: async () => ({ success: true, data: { sessions: 'bad' } }),
    });
    const result = await rpc.call(
      'session:list',
      {} as never,
      IN_PROCESS_SPECS['session:list'] as never,
    );
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INTERNAL' }),
    });
  });

  it('validates the session:status result and keeps the turn phase', async () => {
    const answer = (data: unknown) =>
      new InProcessRpc({
        handleMessage: async () => ({ success: true, data }),
      }).call(
        'session:status',
        { sessionId: 's1' },
        IN_PROCESS_SPECS['session:status'] as never,
      );
    expect(
      await answer({
        isActive: true,
        isStreaming: false,
        turnState: { phase: 'failed', revision: 2, backgroundTasks: [] },
      }),
    ).toEqual({
      ok: true,
      value: expect.objectContaining({
        turnState: expect.objectContaining({ phase: 'failed' }),
      }),
    });
    expect(await answer({ isActive: 'yes' })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INTERNAL' }),
    });
  });

  it('logs redacted raw errors and returns only fixed copy', async () => {
    const log = jest.fn();
    const rpc = new InProcessRpc(
      {
        handleMessage: async () => ({
          success: false,
          errorCode: 'UNKNOWN',
          error: 'provider secret at /home/user',
        }),
      },
      log,
    );
    const result = await rpc.call(
      'chat:abort',
      {} as never,
      IN_PROCESS_SPECS['chat:abort'] as never,
    );
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'INTERNAL',
        message: WORKER_ERROR_MESSAGES.INTERNAL,
        ref: expect.any(String),
      }),
    });
    expect(JSON.stringify(result)).not.toContain('/home/user');
    expect(log).toHaveBeenCalledTimes(1);
  });
});
