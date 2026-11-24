import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import { AntigravityCliAdapter } from './antigravity-cli.adapter';

describe('AntigravityCliAdapter.ensureTokensFresh', () => {
  const adapter = (read: () => Promise<'signed-in' | 'signed-out' | 'unknown'>) => {
    const logger = createMockLogger();
    return {
      logger,
      lane: new AntigravityCliAdapter(
        undefined,
        logger as unknown as Logger,
        {},
        read,
      ),
    };
  };

  it('is false only for a definite signed-out state', async () => {
    expect(await adapter(async () => 'signed-in').lane.ensureTokensFresh()).toBe(true);
    expect(await adapter(async () => 'signed-out').lane.ensureTokensFresh()).toBe(false);
    expect(await adapter(async () => 'unknown').lane.ensureTokensFresh()).toBe(true);
  });

  it('keeps the optimistic answer when the read fails, logging only the error type', async () => {
    const { lane, logger } = adapter(async () => {
      throw new Error('secret-looking text');
    });
    expect(await lane.ensureTokensFresh()).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('sign-in check failed'),
      { error: 'Error' },
    );
  });
});
