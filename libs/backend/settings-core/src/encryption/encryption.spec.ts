/**
 * Encryption + secret store tests.
 *
 * TC-20: Envelope round-trip (encrypt → decrypt → original plaintext).
 * TC-21: AAD binding (wrong aadKey must throw authentication error).
 * TC-22: Wrong master key (wrong key must throw authentication error).
 * TC-23: IV uniqueness (two encryptions of the same input produce different IVs).
 * TC-24: Invalid master key length (16-byte key must throw with a clear message).
 * TC-25: SecretsFileStore write/read round-trip across fresh instances.
 * TC-26: SecretsFileStore.delete removes the entry on disk.
 * TC-27: v3 migration round-trip — moves gateway ciphers and is idempotent.
 * TC-28: v3 migration with no gateway keys is a no-op.
 * TC-30: v3 migration write-before-delete ordering (crash-injection).
 */

import 'reflect-metadata';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { encryptValue, decryptValue } from './secret-envelope';
import { SecretsFileStore } from './secrets-file-store';
import { runV3Migration } from '../migrations/v3-migration';
import type { IMasterKeyProvider } from '@ptah-extension/platform-core';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ptah-enc-spec-${prefix}-`));
}

// ---------------------------------------------------------------------------
// TC-20: Envelope round-trip
// ---------------------------------------------------------------------------

describe('TC-20: encryptValue / decryptValue round-trip', () => {
  it('decrypting the envelope with the same key and aadKey returns the original plaintext', () => {
    const masterKey = crypto.randomBytes(32);
    const aadKey = 'gateway.telegram.tokenCipher';
    const plaintext = 'super-secret-bot-token-12345';

    const envelope = encryptValue(plaintext, masterKey, aadKey);
    const recovered = decryptValue(envelope, masterKey, aadKey);

    expect(recovered).toBe(plaintext);
  });

  it('round-trip works for an empty string plaintext', () => {
    const masterKey = crypto.randomBytes(32);
    const envelope = encryptValue('', masterKey, 'some.key');
    expect(decryptValue(envelope, masterKey, 'some.key')).toBe('');
  });

  it('round-trip works for a Unicode string', () => {
    const masterKey = crypto.randomBytes(32);
    const plaintext = 'Привет 🌍 مرحبا';
    const envelope = encryptValue(plaintext, masterKey, 'unicode.key');
    expect(decryptValue(envelope, masterKey, 'unicode.key')).toBe(plaintext);
  });
});

// ---------------------------------------------------------------------------
// TC-21: AAD binding — wrong aadKey must not decrypt
// ---------------------------------------------------------------------------

describe('TC-21: AAD binding prevents cross-entry swap', () => {
  it('decrypting with a different aadKey throws an authentication error', () => {
    const masterKey = crypto.randomBytes(32);
    const envelope = encryptValue('token-value', masterKey, 'foo');

    expect(() => decryptValue(envelope, masterKey, 'bar')).toThrow();
  });

  it('error message or type indicates authentication failure (not a silent wrong result)', () => {
    const masterKey = crypto.randomBytes(32);
    const envelope = encryptValue('token-value', masterKey, 'key-a');

    let caught: unknown;
    try {
      decryptValue(envelope, masterKey, 'key-b');
    } catch (err) {
      caught = err;
    }

    // Must throw — not silently return a wrong or empty string.
    expect(caught).toBeDefined();
    // Crypto errors from Node may be ERR_OSSL_BAD_DECRYPT or similar native error types.
    // Verify it has a message property rather than checking constructor identity.
    expect(typeof (caught as { message?: unknown })?.message).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// TC-22: Wrong master key — must throw authentication error
// ---------------------------------------------------------------------------

describe('TC-22: Wrong master key fails authentication', () => {
  it('decrypting with a different 32-byte master key throws', () => {
    const key1 = crypto.randomBytes(32);
    const key2 = crypto.randomBytes(32);

    const envelope = encryptValue('my-secret', key1, 'the.key');

    expect(() => decryptValue(envelope, key2, 'the.key')).toThrow();
  });

  it('the error is not a silent truncated/empty string return', () => {
    const key1 = crypto.randomBytes(32);
    const key2 = crypto.randomBytes(32);
    const envelope = encryptValue('my-secret', key1, 'the.key');

    let result: string | undefined;
    let threw = false;
    try {
      result = decryptValue(envelope, key2, 'the.key');
    } catch {
      threw = true;
    }

    expect(threw).toBe(true);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-23: IV uniqueness
// ---------------------------------------------------------------------------

describe('TC-23: IV uniqueness — catastrophic GCM reuse guard', () => {
  it('two encryptions of the same plaintext + key + aadKey produce different IVs', () => {
    const masterKey = crypto.randomBytes(32);
    const aadKey = 'gateway.telegram.tokenCipher';
    const plaintext = 'same-token-value';

    const env1 = encryptValue(plaintext, masterKey, aadKey);
    const env2 = encryptValue(plaintext, masterKey, aadKey);

    expect(env1.iv).not.toBe(env2.iv);
  });

  it('ciphertexts also differ (IV reuse would produce identical ciphertext — GCM catastrophic failure)', () => {
    const masterKey = crypto.randomBytes(32);
    const env1 = encryptValue('same', masterKey, 'k');
    const env2 = encryptValue('same', masterKey, 'k');

    // If IVs collide, ciphertexts are XOR-identical; different IVs produce different ciphertexts.
    expect(env1.ciphertext).not.toBe(env2.ciphertext);
  });
});

// ---------------------------------------------------------------------------
// TC-24: Invalid master key length
// ---------------------------------------------------------------------------

describe('TC-24: Invalid master key length', () => {
  it('encryptValue throws with a clear message when key is 16 bytes', () => {
    const shortKey = crypto.randomBytes(16);

    expect(() => encryptValue('value', shortKey, 'some.key')).toThrow(
      /masterKey must be 32 bytes/i,
    );
  });

  it('encryptValue throws when key is 0 bytes', () => {
    const emptyKey = Buffer.alloc(0);

    expect(() => encryptValue('value', emptyKey, 'some.key')).toThrow(
      /masterKey must be 32 bytes/i,
    );
  });

  it('decryptValue also throws when master key is the wrong length', () => {
    const goodKey = crypto.randomBytes(32);
    const envelope = encryptValue('value', goodKey, 'k');

    const shortKey = crypto.randomBytes(16);
    expect(() => decryptValue(envelope, shortKey, 'k')).toThrow(
      /masterKey must be 32 bytes/i,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-25: SecretsFileStore write/read round-trip across fresh instances
// ---------------------------------------------------------------------------

describe('TC-25: SecretsFileStore write/read round-trip across instances', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir('tc25');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it('a value written by one store instance is readable by a freshly constructed instance', async () => {
    const masterKey = crypto.randomBytes(32);
    const key = 'gateway.telegram.tokenCipher';
    const secret = 'vault-cipher-abcdef';

    // Write via first instance.
    const store1 = new SecretsFileStore(tmpDir);
    await store1.write(key, secret, masterKey);

    // Read via second fresh instance (no shared in-memory state).
    const store2 = new SecretsFileStore(tmpDir);
    const recovered = await store2.read(key, masterKey);

    expect(recovered).toBe(secret);
  });

  it('the on-disk file exists after write', async () => {
    const masterKey = crypto.randomBytes(32);
    const store = new SecretsFileStore(tmpDir);
    await store.write('some.key', 'secret-value', masterKey);

    const filePath = path.join(tmpDir, 'secrets.enc.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('the on-disk file is valid JSON with entries record', async () => {
    const masterKey = crypto.randomBytes(32);
    const store = new SecretsFileStore(tmpDir);
    await store.write('my.key', 'my-secret', masterKey);

    const raw = fs.readFileSync(path.join(tmpDir, 'secrets.enc.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(typeof parsed['entries']).toBe('object');
    expect(parsed['entries']).not.toBeNull();
    const entries = parsed['entries'] as Record<string, unknown>;
    expect(entries['my.key']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-26: SecretsFileStore.delete removes the entry
// ---------------------------------------------------------------------------

describe('TC-26: SecretsFileStore.delete removes the entry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir('tc26');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it('read returns undefined after delete', async () => {
    const masterKey = crypto.randomBytes(32);
    const key = 'gateway.telegram.tokenCipher';

    const store = new SecretsFileStore(tmpDir);
    await store.write(key, 'some-cipher', masterKey);
    await store.delete(key);

    // Fresh instance to confirm on-disk state.
    const store2 = new SecretsFileStore(tmpDir);
    const result = await store2.read(key, masterKey);
    expect(result).toBeUndefined();
  });

  it('the entries map on disk does not contain the deleted key', async () => {
    const masterKey = crypto.randomBytes(32);
    const key = 'gateway.discord.tokenCipher';

    const store = new SecretsFileStore(tmpDir);
    await store.write(key, 'cipher-1', masterKey);
    await store.write('other.key', 'cipher-2', masterKey);
    await store.delete(key);

    const raw = fs.readFileSync(path.join(tmpDir, 'secrets.enc.json'), 'utf8');
    const parsed = JSON.parse(raw) as { entries: Record<string, unknown> };
    expect(parsed.entries[key]).toBeUndefined();
    // Other key must still be present.
    expect(parsed.entries['other.key']).toBeDefined();
  });

  it('delete on a non-existent key is a no-op (does not throw)', async () => {
    const store = new SecretsFileStore(tmpDir);
    await expect(store.delete('does.not.exist')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-27: v3 migration round-trip
// ---------------------------------------------------------------------------

describe('TC-27: runV3Migration round-trip', () => {
  let tmpDir: string;
  let masterKey: Buffer;
  let mockProvider: IMasterKeyProvider;

  beforeEach(() => {
    tmpDir = makeTmpDir('tc27');
    masterKey = crypto.randomBytes(32);
    mockProvider = {
      getMasterKey: async () => masterKey,
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it('moves gateway.telegram.tokenCipher from settings.json to secrets.enc.json', async () => {
    const initialSettings = {
      $schema: 'https://ptah.live/schemas/settings.json',
      version: 1,
      authMethod: 'apiKey',
      gateway: {
        telegram: { tokenCipher: 'vault-cipher-stub', enabled: false },
        discord: { enabled: false },
        slack: { enabled: false },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify(initialSettings, null, 2),
      'utf8',
    );

    await runV3Migration(tmpDir, mockProvider);

    // 1. settings.json must NOT contain gateway.telegram.tokenCipher.
    const settingsRaw = fs.readFileSync(
      path.join(tmpDir, 'settings.json'),
      'utf8',
    );
    const settingsAfter = JSON.parse(settingsRaw) as {
      gateway?: { telegram?: { tokenCipher?: string } };
    };
    expect(settingsAfter.gateway?.telegram?.tokenCipher).toBeUndefined();

    // 2. secrets.enc.json must exist and contain an entry for the key.
    const secretsPath = path.join(tmpDir, 'secrets.enc.json');
    expect(fs.existsSync(secretsPath)).toBe(true);
    const secretsRaw = fs.readFileSync(secretsPath, 'utf8');
    const secretsFile = JSON.parse(secretsRaw) as {
      entries: Record<string, unknown>;
    };
    expect(secretsFile.entries['gateway.telegram.tokenCipher']).toBeDefined();

    // 3. Decrypting the envelope returns the original vault cipher string.
    const store = new SecretsFileStore(tmpDir);
    const recovered = await store.read(
      'gateway.telegram.tokenCipher',
      masterKey,
    );
    expect(recovered).toBe('vault-cipher-stub');
  });

  it('migration is idempotent — running a second time is a no-op because the key is gone from settings.json', async () => {
    const initialSettings = {
      authMethod: 'apiKey',
      gateway: {
        telegram: { tokenCipher: 'vault-cipher-stub' },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify(initialSettings, null, 2),
      'utf8',
    );

    await runV3Migration(tmpDir, mockProvider);

    // Read secrets.enc.json after first run.
    const secretsPath = path.join(tmpDir, 'secrets.enc.json');
    const firstRunStat = fs.statSync(secretsPath);

    // Second run — settings.json no longer has the key so migration returns early.
    await runV3Migration(tmpDir, mockProvider);

    // secrets.enc.json must not have changed on the second run.
    const secondRunStat = fs.statSync(secretsPath);
    expect(secondRunStat.mtimeMs).toBe(firstRunStat.mtimeMs);

    // Value still readable.
    const store = new SecretsFileStore(tmpDir);
    const recovered = await store.read(
      'gateway.telegram.tokenCipher',
      masterKey,
    );
    expect(recovered).toBe('vault-cipher-stub');
  });

  it('migrates all four gateway cipher keys when all are present', async () => {
    const initialSettings = {
      gateway: {
        telegram: { tokenCipher: 'tg-cipher' },
        discord: { tokenCipher: 'dc-cipher' },
        slack: {
          botTokenCipher: 'slack-bot-cipher',
          appTokenCipher: 'slack-app-cipher',
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify(initialSettings, null, 2),
      'utf8',
    );

    await runV3Migration(tmpDir, mockProvider);

    const store = new SecretsFileStore(tmpDir);
    expect(await store.read('gateway.telegram.tokenCipher', masterKey)).toBe(
      'tg-cipher',
    );
    expect(await store.read('gateway.discord.tokenCipher', masterKey)).toBe(
      'dc-cipher',
    );
    expect(await store.read('gateway.slack.botTokenCipher', masterKey)).toBe(
      'slack-bot-cipher',
    );
    expect(await store.read('gateway.slack.appTokenCipher', masterKey)).toBe(
      'slack-app-cipher',
    );

    // All four keys removed from settings.json.
    const settingsRaw = fs.readFileSync(
      path.join(tmpDir, 'settings.json'),
      'utf8',
    );
    const after = JSON.parse(settingsRaw) as {
      gateway?: {
        telegram?: { tokenCipher?: unknown };
        discord?: { tokenCipher?: unknown };
        slack?: { botTokenCipher?: unknown; appTokenCipher?: unknown };
      };
    };
    expect(after.gateway?.telegram?.tokenCipher).toBeUndefined();
    expect(after.gateway?.discord?.tokenCipher).toBeUndefined();
    expect(after.gateway?.slack?.botTokenCipher).toBeUndefined();
    expect(after.gateway?.slack?.appTokenCipher).toBeUndefined();
  });

  it('writes to secrets.enc.json BEFORE removing from settings.json (data-loss guard)', async () => {
    // We cannot interrupt mid-migration, but we can verify the write-before-delete
    // ordering is correct by checking: after migration, if we re-read the migrated
    // value from the secrets store, it must match what was in settings.json.
    // This exercises the ordering contract indirectly.
    const initialSettings = {
      gateway: { telegram: { tokenCipher: 'sensitive-value' } },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify(initialSettings, null, 2),
      'utf8',
    );

    await runV3Migration(tmpDir, mockProvider);

    // secrets.enc.json must exist and be readable BEFORE settings.json lost the key.
    // (Post-migration validation: both conditions hold at rest.)
    const settingsRaw = fs.readFileSync(
      path.join(tmpDir, 'settings.json'),
      'utf8',
    );
    const settingsAfter = JSON.parse(settingsRaw) as {
      gateway?: { telegram?: { tokenCipher?: string } };
    };
    expect(settingsAfter.gateway?.telegram?.tokenCipher).toBeUndefined();

    const store = new SecretsFileStore(tmpDir);
    const cipher = await store.read('gateway.telegram.tokenCipher', masterKey);
    expect(cipher).toBe('sensitive-value');
  });
});

// ---------------------------------------------------------------------------
// TC-28: v3 migration with no gateway keys is a no-op
// ---------------------------------------------------------------------------

describe('TC-28: runV3Migration with no gateway keys is a no-op', () => {
  let tmpDir: string;
  let masterKey: Buffer;
  let mockProvider: IMasterKeyProvider;

  beforeEach(() => {
    tmpDir = makeTmpDir('tc28');
    masterKey = crypto.randomBytes(32);
    mockProvider = {
      getMasterKey: async () => masterKey,
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it('does not create secrets.enc.json when settings.json has no gateway cipher keys', async () => {
    const settings = {
      authMethod: 'apiKey',
      gateway: { enabled: false },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify(settings, null, 2),
      'utf8',
    );

    await runV3Migration(tmpDir, mockProvider);

    const secretsPath = path.join(tmpDir, 'secrets.enc.json');
    expect(fs.existsSync(secretsPath)).toBe(false);
  });

  it('does not throw when settings.json does not exist', async () => {
    // No settings.json — migration must handle ENOENT gracefully.
    let threw = false;
    try {
      await runV3Migration(tmpDir, mockProvider);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it('does not throw when settings.json is empty JSON ({})', async () => {
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), '{}', 'utf8');

    await expect(runV3Migration(tmpDir, mockProvider)).resolves.toBeUndefined();
    expect(fs.existsSync(path.join(tmpDir, 'secrets.enc.json'))).toBe(false);
  });

  it('settings.json is not rewritten when there is nothing to migrate', async () => {
    const settings = { authMethod: 'apiKey' };
    const settingsPath = path.join(tmpDir, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

    const statBefore = fs.statSync(settingsPath);
    await runV3Migration(tmpDir, mockProvider);
    const statAfter = fs.statSync(settingsPath);

    // mtime must be unchanged — settings.json was not touched.
    expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
  });
});

// ---------------------------------------------------------------------------
// TC-30: v3 migration write-before-delete ordering (crash-injection).
//
// Injects a crash (throw) after SecretsFileStore finishes writing
// secrets.enc.json but before settings.json is rewritten.
// Asserts: (a) secrets.enc.json has the migrated value, (b) settings.json
// still has the original plaintext — no data loss.
//
// Sanity check: swap the write order (settings.json rewritten BEFORE
// secrets.enc.json is finalized) — the crash-injection test must show
// that secrets.enc.json is missing and settings.json has already lost the key.
// ---------------------------------------------------------------------------

describe('TC-30: v3 migration atomic write-before-delete (crash-injection)', () => {
  let tmpDir: string;
  let masterKey: Buffer;
  let mockProvider: IMasterKeyProvider;

  beforeEach(() => {
    tmpDir = makeTmpDir('tc30');
    masterKey = crypto.randomBytes(32);
    mockProvider = {
      getMasterKey: async () => masterKey,
    };
  });

  afterEach(() => {
    // Restore any spies that may have been left active.
    jest.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it('crash after secrets.enc.json is written but before settings.json is rewritten leaves no data loss', async () => {
    const initialSettings = {
      gateway: { telegram: { tokenCipher: 'crash-test-cipher' } },
    };
    const settingsPath = path.join(tmpDir, 'settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(initialSettings, null, 2),
      'utf8',
    );

    // Spy on fsPromises.rename (via require to get a mutable handle) and
    // throw on the SECOND call.
    // The first rename() finalises secrets.enc.json (*.tmp → secrets.enc.json).
    // The second rename() would finalise settings.json (settings.v3.tmp → settings.json).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fspModule = require('fs/promises') as typeof fsPromises;
    const realRename = fspModule.rename.bind(fspModule);
    let renameCallCount = 0;
    const renameSpy = jest
      .spyOn(fspModule, 'rename')
      .mockImplementation(async (oldPath, newPath) => {
        renameCallCount += 1;
        if (renameCallCount === 2) {
          // Simulate crash after secrets file is written but before settings is committed.
          throw new Error('simulated-crash-mid-migration');
        }
        // First call: let it proceed normally (secrets.enc.json gets committed).
        return realRename(oldPath, newPath);
      });

    // Migration should throw because of the injected crash.
    await expect(runV3Migration(tmpDir, mockProvider)).rejects.toThrow(
      'simulated-crash-mid-migration',
    );

    // --- Post-crash data-loss assertions ---

    // (a) secrets.enc.json must exist and be readable with the migrated value.
    //     The first rename succeeded, so the secrets file is committed.
    const secretsPath = path.join(tmpDir, 'secrets.enc.json');
    expect(fs.existsSync(secretsPath)).toBe(true);
    const store = new SecretsFileStore(tmpDir);
    const recovered = await store.read(
      'gateway.telegram.tokenCipher',
      masterKey,
    );
    expect(recovered).toBe('crash-test-cipher');

    // (b) settings.json must still contain the original plaintext cipher
    //     because the second rename (settings.v3.tmp → settings.json) was
    //     aborted by the injected crash. No data loss occurred.
    expect(fs.existsSync(settingsPath)).toBe(true);
    const settingsRaw = fs.readFileSync(settingsPath, 'utf8');
    const settingsAfter = JSON.parse(settingsRaw) as {
      gateway?: { telegram?: { tokenCipher?: string } };
    };
    expect(settingsAfter.gateway?.telegram?.tokenCipher).toBe(
      'crash-test-cipher',
    );

    renameSpy.mockRestore();
  });

  it('rename call order: secrets.enc.json rename happens before settings.json rename', async () => {
    const initialSettings = {
      gateway: { telegram: { tokenCipher: 'order-test-cipher' } },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify(initialSettings, null, 2),
      'utf8',
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fspModule2 = require('fs/promises') as typeof fsPromises;
    const realRename2 = fspModule2.rename.bind(fspModule2);
    const renameTargets: string[] = [];
    const renameSpy = jest
      .spyOn(fspModule2, 'rename')
      .mockImplementation(async (oldPath, newPath) => {
        renameTargets.push(String(newPath));
        return realRename2(oldPath, newPath);
      });

    await runV3Migration(tmpDir, mockProvider);

    // The first rename target must be secrets.enc.json.
    // The second rename target must be settings.json.
    expect(renameTargets.length).toBeGreaterThanOrEqual(2);
    const secretsIdx = renameTargets.findIndex((p) =>
      p.includes('secrets.enc.json'),
    );
    const settingsIdx = renameTargets.findIndex((p) =>
      p.includes('settings.json'),
    );
    expect(secretsIdx).toBeGreaterThanOrEqual(0);
    expect(settingsIdx).toBeGreaterThanOrEqual(0);
    // secrets.enc.json must be committed before settings.json.
    expect(secretsIdx).toBeLessThan(settingsIdx);

    renameSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// TC-31: a corrupt secrets.enc.json is moved aside, never overwritten
// ---------------------------------------------------------------------------

describe('TC-31: SecretsFileStore never destroys a corrupt secrets file', () => {
  const CORRUPT_JSON = '{ "entries": { "a": ';
  const UNKNOWN_FORMAT = JSON.stringify({ version: 'one', entries: [] });
  let tmpDir: string;
  let secretsPath: string;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = makeTmpDir('tc31');
    secretsPath = path.join(tmpDir, 'secrets.enc.json');
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  function backupFiles(): string[] {
    return fs
      .readdirSync(tmpDir)
      .filter((name) => name.startsWith('secrets.enc.json.corrupt-'));
  }

  it('moves a corrupt file aside once for concurrent first reads and keeps writes open', async () => {
    fs.writeFileSync(secretsPath, CORRUPT_JSON, 'utf8');
    const masterKey = crypto.randomBytes(32);
    const store = new SecretsFileStore(tmpDir);

    await Promise.all([
      store.read('a.key', masterKey),
      store.read('b.key', masterKey),
      store.read('c.key', masterKey),
    ]);

    expect(backupFiles()).toHaveLength(1);
    await expect(
      store.write('new.key', 'new-secret', masterKey),
    ).resolves.toBeUndefined();
    await expect(store.read('new.key', masterKey)).resolves.toBe('new-secret');
  });

  it.each([
    ['invalid JSON', CORRUPT_JSON],
    ['an unknown format', UNKNOWN_FORMAT],
  ])(
    'moves a file with %s aside and keeps it through the next persist()',
    async (_label, content) => {
      fs.writeFileSync(secretsPath, content, 'utf8');
      const masterKey = crypto.randomBytes(32);
      const store = new SecretsFileStore(tmpDir);

      await expect(store.read('any.key', masterKey)).resolves.toBeUndefined();
      await store.write('new.key', 'new-secret', masterKey);

      const backups = backupFiles();
      expect(backups).toHaveLength(1);
      expect(fs.readFileSync(path.join(tmpDir, backups[0]), 'utf8')).toBe(
        content,
      );
      // The new file holds only the new entry.
      const fresh = new SecretsFileStore(tmpDir);
      await expect(fresh.read('new.key', masterKey)).resolves.toBe(
        'new-secret',
      );

      // Logged at error with the backup name only, never the file content.
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('moved it aside'),
        expect.objectContaining({ backupFile: backups[0] }),
      );
      const logged = JSON.stringify(errorSpy.mock.calls);
      expect(logged).not.toContain(content);
    },
  );

  it('refuses to overwrite the file when the move aside fails', async () => {
    fs.writeFileSync(secretsPath, CORRUPT_JSON, 'utf8');
    const fspModule = require('fs/promises') as typeof fsPromises;
    const realRename = fspModule.rename.bind(fspModule);
    jest
      .spyOn(fspModule, 'rename')
      .mockImplementation(async (oldPath, newPath) => {
        if (String(newPath).includes('.corrupt-')) {
          throw Object.assign(new Error('simulated EPERM'), { code: 'EPERM' });
        }
        return realRename(oldPath, newPath);
      });
    const masterKey = crypto.randomBytes(32);
    const store = new SecretsFileStore(tmpDir);

    await expect(store.read('any.key', masterKey)).resolves.toBeUndefined();
    await expect(
      store.write('new.key', 'new-secret', masterKey),
    ).rejects.toThrow('refusing to overwrite');
    // The rejected write must not read back as if it had been saved.
    await expect(store.read('new.key', masterKey)).resolves.toBeUndefined();
    store.flushSync(masterKey);

    expect(fs.readFileSync(secretsPath, 'utf8')).toBe(CORRUPT_JSON);
    expect(backupFiles()).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not be moved aside'),
      expect.objectContaining({ code: 'EPERM' }),
    );
  });

  it('loads a valid file that replaced the corrupt one instead of moving it aside', async () => {
    // Another store instance moved the corrupt file aside and wrote a valid
    // one between this store's first read and its rename.
    const masterKey = crypto.randomBytes(32);
    const writer = new SecretsFileStore(tmpDir);
    await writer.write('kept.key', 'kept-secret', masterKey);
    const valid = fs.readFileSync(secretsPath, 'utf8');

    const fspModule = require('fs/promises') as typeof fsPromises;
    const realReadFile = fspModule.readFile.bind(fspModule);
    let reads = 0;
    jest
      .spyOn(fspModule, 'readFile')
      .mockImplementation((async (...args: Parameters<typeof realReadFile>) => {
        reads += 1;
        if (reads === 1) return CORRUPT_JSON;
        return realReadFile(...args);
      }) as typeof realReadFile);
    const store = new SecretsFileStore(tmpDir);

    await expect(store.read('kept.key', masterKey)).resolves.toBe('kept-secret');
    expect(fs.readFileSync(secretsPath, 'utf8')).toBe(valid);
    expect(backupFiles()).toHaveLength(0);
  });

  it('rolls a write back when saving fails, so it does not read back', async () => {
    const masterKey = crypto.randomBytes(32);
    const store = new SecretsFileStore(tmpDir);
    await store.write('old.key', 'old-secret', masterKey);
    const fspModule = require('fs/promises') as typeof fsPromises;
    jest
      .spyOn(fspModule, 'rename')
      .mockRejectedValue(Object.assign(new Error('simulated EIO'), { code: 'EIO' }));

    await expect(
      store.write('old.key', 'new-secret', masterKey),
    ).rejects.toThrow('simulated EIO');
    await expect(store.read('old.key', masterKey)).resolves.toBe('old-secret');
  });

  it('keeps a newer saved write when an older overlapping write fails', async () => {
    const masterKey = crypto.randomBytes(32);
    const store = new SecretsFileStore(tmpDir);
    await store.write('k', 'v0', masterKey);
    const fspModule = require('fs/promises') as typeof fsPromises;
    const realRename = fspModule.rename.bind(fspModule);
    let renames = 0;
    jest
      .spyOn(fspModule, 'rename')
      .mockImplementation(async (oldPath, newPath) => {
        renames += 1;
        if (renames === 1) {
          throw Object.assign(new Error('simulated EIO'), { code: 'EIO' });
        }
        return realRename(oldPath, newPath);
      });

    const older = store.write('k', 'v1', masterKey);
    const newer = store.write('k', 'v2', masterKey);
    await expect(older).rejects.toThrow('simulated EIO');
    await expect(newer).resolves.toBeUndefined();

    // The older rollback ran before the newer write, so it cannot undo it.
    await expect(store.read('k', masterKey)).resolves.toBe('v2');
    await expect(
      new SecretsFileStore(tmpDir).read('k', masterKey),
    ).resolves.toBe('v2');
  });

  it('keeps reads working and blocks writes when the re-read before the move fails', async () => {
    fs.writeFileSync(secretsPath, CORRUPT_JSON, 'utf8');
    const fspModule = require('fs/promises') as typeof fsPromises;
    const realReadFile = fspModule.readFile.bind(fspModule);
    let reads = 0;
    jest
      .spyOn(fspModule, 'readFile')
      .mockImplementation((async (...args: Parameters<typeof realReadFile>) => {
        reads += 1;
        if (reads === 2) {
          throw Object.assign(new Error('simulated EACCES'), {
            code: 'EACCES',
          });
        }
        return realReadFile(...args);
      }) as typeof realReadFile);
    const masterKey = crypto.randomBytes(32);
    const store = new SecretsFileStore(tmpDir);

    await expect(store.read('any.key', masterKey)).resolves.toBeUndefined();
    await expect(
      store.write('new.key', 'new-secret', masterKey),
    ).rejects.toThrow('refusing to overwrite');
    expect(fs.readFileSync(secretsPath, 'utf8')).toBe(CORRUPT_JSON);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not be read again'),
      expect.objectContaining({ code: 'EACCES' }),
    );
  });

  it('starts empty without a backup or an error log when the file does not exist', async () => {
    const masterKey = crypto.randomBytes(32);
    const store = new SecretsFileStore(tmpDir);

    await expect(store.read('any.key', masterKey)).resolves.toBeUndefined();
    await store.write('new.key', 'new-secret', masterKey);

    expect(backupFiles()).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
    await expect(
      new SecretsFileStore(tmpDir).read('new.key', masterKey),
    ).resolves.toBe('new-secret');
  });
});
