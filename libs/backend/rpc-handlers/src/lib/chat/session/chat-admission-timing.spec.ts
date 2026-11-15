import { createMockLogger } from '@ptah-extension/shared/testing';
import { ChatAdmissionTiming } from './chat-admission-timing';

describe('ChatAdmissionTiming', () => {
  it('records a bounded, redacted summary and preserves failures', async () => {
    const logger = createMockLogger();
    const timing = new ChatAdmissionTiming(logger, 'chat:resume');
    const secret = new Error('private account and path');
    await expect(timing.measure('jsonlRead', async () => { throw secret; })).rejects.toBe(secret);
    timing.emit('error');
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [message, fields] = (logger.info as jest.Mock).mock.calls[0] as [string, { method: string; result: string; stages: Record<string, number> }];
    expect(message).toBe('[RPC] chat admission timing');
    expect(fields.method).toBe('chat:resume');
    expect(fields.result).toBe('error');
    expect(fields.stages['jsonlRead']).toBeGreaterThanOrEqual(0);
    expect(fields.stages['jsonlRead']).toBeLessThanOrEqual(600_000);
    expect(JSON.stringify(fields)).not.toContain(secret.message);
  });
});
