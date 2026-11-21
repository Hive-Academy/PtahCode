import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import { readAgySignIn, type AgyKeyringQuery } from './antigravity-sign-in';
import { AntigravityCliAdapter } from './antigravity-cli.adapter';

const FOUND = `
Currently stored credentials for gemini:antigravity:

    Target: gemini:antigravity
    Type: Generic
    User: dev
    Local machine persistence
`;
const NONE = `
Currently stored credentials for gemini:antigravity:

* NONE *
`;

function query(stdout: string, exitCode = 0) {
  return jest.fn<ReturnType<AgyKeyringQuery>, Parameters<AgyKeyringQuery>>(
    async () => ({ stdout, exitCode }),
  );
}

describe('readAgySignIn', () => {
  it('Windows: a stored gemini:antigravity credential is signed in', async () => {
    const q = query(FOUND);
    await expect(
      readAgySignIn({ platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, query: q }),
    ).resolves.toBe('signed-in');
    expect(q).toHaveBeenCalledWith('C:\\Windows\\System32\\cmdkey.exe', [
      '/list:gemini:antigravity',
    ]);
  });

  it('Windows: no stored credential is signed out; a failing cmdkey is unknown', async () => {
    await expect(
      readAgySignIn({ platform: 'win32', env: {}, query: query(NONE) }),
    ).resolves.toBe('signed-out');
    await expect(
      readAgySignIn({ platform: 'win32', env: {}, query: query('', 1) }),
    ).resolves.toBe('unknown');
  });

  it('macOS: the keychain item decides; other exit codes are unknown', async () => {
    const found = query('attributes only', 0);
    await expect(
      readAgySignIn({ platform: 'darwin', env: {}, query: found }),
    ).resolves.toBe('signed-in');
    // Presence only: never `-w` or `-g`, which print the secret.
    expect(found.mock.calls[0]?.[1]).toEqual([
      'find-generic-password',
      '-s',
      'gemini',
      '-a',
      'antigravity',
    ]);
    await expect(
      readAgySignIn({ platform: 'darwin', env: {}, query: query('', 44) }),
    ).resolves.toBe('signed-out');
    await expect(
      readAgySignIn({ platform: 'darwin', env: {}, query: query('', 51) }),
    ).resolves.toBe('unknown');
  });

  it('an environment credential agy accepts counts as signed in, with no query', async () => {
    for (const name of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS']) {
      const q = query(NONE);
      await expect(
        readAgySignIn({ platform: 'win32', env: { [name]: 'x' }, query: q }),
      ).resolves.toBe('signed-in');
      expect(q).not.toHaveBeenCalled();
    }
  });

  it('Linux has no presence-only query and answers unknown', async () => {
    const q = query(FOUND);
    await expect(
      readAgySignIn({ platform: 'linux', env: {}, query: q }),
    ).resolves.toBe('unknown');
    expect(q).not.toHaveBeenCalled();
  });
});

describe('AntigravityCliAdapter.ensureTokensFresh', () => {
  const adapter = (read: () => Promise<'signed-in' | 'signed-out' | 'unknown'>) => {
    const logger = createMockLogger();
    return {
      logger,
      lane: new AntigravityCliAdapter(
        undefined,
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
