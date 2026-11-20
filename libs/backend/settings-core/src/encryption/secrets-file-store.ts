/**
 * SecretsFileStore — file-backed store for encrypted secret envelopes.
 *
 * Reads and writes ~/.ptah/secrets.enc.json atomically (tmp + rename).
 * Holds a Map<string, SecretEnvelope> in memory after the first load.
 *
 * This class is not an ISettingsStore — it is a pure I/O helper used by
 * the platform adapters' readSecret / writeSecret / deleteSecret methods.
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { decryptValue, encryptValue } from './secret-envelope';
import type { SecretEnvelope } from './secret-envelope';

/** On-disk format for secrets.enc.json. */
interface SecretsFileFormat {
  $schema: string;
  version: number;
  entries: Record<string, SecretEnvelope>;
}

const FILE_SCHEMA = 'https://ptah.live/schemas/secrets.enc.json';
const FILE_VERSION = 1;
const TMP_SUFFIX = '.flush.tmp';
const CORRUPT_SUFFIX = '.corrupt-';

export class SecretsFileStore {
  private readonly filePath: string;
  private entries: Map<string, SecretEnvelope> = new Map();
  private loaded = false;
  /** The load in flight, shared so concurrent first calls read the file once. */
  private loading: Promise<void> | null = null;
  /** True when a corrupt file could not be moved aside; see quarantineCorruptFile. */
  private writesBlocked = false;

  constructor(ptahDir: string) {
    this.filePath = path.join(ptahDir, 'secrets.enc.json');
  }

  /**
   * Read a secret from the store, decrypting with the provided master key.
   * Returns undefined if the key does not exist.
   */
  async read(key: string, masterKey: Buffer): Promise<string | undefined> {
    await this.ensureLoaded();
    const envelope = this.entries.get(key);
    if (!envelope) return undefined;
    return decryptValue(envelope, masterKey, key);
  }

  /**
   * Encrypt and persist a secret value under the given key.
   * Writes atomically via tmp + rename.
   */
  async write(key: string, value: string, masterKey: Buffer): Promise<void> {
    await this.ensureLoaded();
    const envelope = encryptValue(value, masterKey, key);
    this.entries.set(key, envelope);
    await this.persist();
  }

  /**
   * Remove a secret entry by key and persist the updated file.
   * No-op (no error) if the key does not exist.
   */
  async delete(key: string): Promise<void> {
    await this.ensureLoaded();
    if (!this.entries.has(key)) return;
    this.entries.delete(key);
    await this.persist();
  }

  /**
   * Synchronously flush the current in-memory entries to disk.
   *
   * The caller must supply the master key synchronously because
   * getMasterKey() is async. The platform adapter caches the key on first
   * async access and passes the cached value here. If the cache is empty
   * (secrets were never accessed in this process), the flush is a no-op
   * because there is nothing to write that wasn't already written by the
   * async path.
   *
   * Uses a distinct `.flush.tmp` suffix to avoid racing with async writes.
   */
  flushSync(masterKey: Buffer | null): void {
    if (masterKey === null) {
      return;
    }
    if (!this.loaded) {
      return;
    }
    const tmpPath = this.filePath + TMP_SUFFIX;
    try {
      this.assertWritable();
      const data = this.buildFileData();
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.error(
        '[SecretsFileStore] flushSync failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    // One load for every concurrent caller: two loads of a corrupt file would
    // both try to move it aside, and the second would find it gone.
    this.loading ??= this.loadFromDisk().then(
      () => {
        this.loaded = true;
      },
      (error: unknown) => {
        // A failed read stays unloaded, so the next call retries it.
        this.loading = null;
        throw error;
      },
    );
    await this.loading;
  }

  private async loadFromDisk(): Promise<void> {
    let raw: string;
    try {
      raw = await fsPromises.readFile(this.filePath, 'utf8');
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        this.entries = new Map();
        return;
      }
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // degradation-audit: reported - quarantineCorruptFile logs at error
      // and keeps the unreadable file. The parse error is not logged: its
      // message can quote file content, and the file holds secrets.
      await this.quarantineCorruptFile('invalid-json');
      return;
    }

    if (!isSecretsFileFormat(parsed)) {
      await this.quarantineCorruptFile('unknown-format');
      return;
    }

    this.entries = new Map(Object.entries(parsed.entries));
  }

  /**
   * Move an unreadable secrets file aside so that the next persist() cannot
   * overwrite it, then start with an empty store. The file is never read
   * again or logged; only the backup file name is logged.
   *
   * If the move fails, the store stays readable (every key reads as missing)
   * but refuses to write: persist() throws and flushSync() skips, so the
   * corrupt file stays on disk for manual recovery. Callers already handle a
   * thrown write (FileSettingsStore.writeSecret rejects to its caller and
   * runV3Migration aborts before it deletes any plaintext key), while a
   * thrown read would break every secret lookup for the session.
   */
  private async quarantineCorruptFile(
    reason: 'invalid-json' | 'unknown-format',
  ): Promise<void> {
    this.entries = new Map();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${this.filePath}${CORRUPT_SUFFIX}${stamp}`;
    try {
      await fsPromises.rename(this.filePath, backupPath);
    } catch (err: unknown) {
      // Already gone: nothing is left that a write could overwrite.
      if (isNodeError(err) && err.code === 'ENOENT') return;
      this.writesBlocked = true;
      console.error(
        '[SecretsFileStore] secrets file is corrupt and could not be moved aside; secret writes are disabled for this session',
        {
          reason,
          file: path.basename(this.filePath),
          code: isNodeError(err) ? err.code : undefined,
          errorName: err instanceof Error ? err.name : typeof err,
        },
      );
      return;
    }
    console.error(
      '[SecretsFileStore] secrets file is corrupt; moved it aside and started with an empty store',
      { reason, backupFile: path.basename(backupPath) },
    );
  }

  /** Throw instead of overwriting a corrupt file that could not be moved aside. */
  private assertWritable(): void {
    if (this.writesBlocked) {
      throw new Error(
        `[SecretsFileStore] ${path.basename(this.filePath)} is corrupt and could not be moved aside; refusing to overwrite it. Move or repair the file, then restart.`,
      );
    }
  }

  private async persist(): Promise<void> {
    this.assertWritable();
    const dir = path.dirname(this.filePath);
    await fsPromises.mkdir(dir, { recursive: true });

    const tmpPath = this.filePath + '.tmp';
    const data = this.buildFileData();
    await fsPromises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fsPromises.rename(tmpPath, this.filePath);
  }

  private buildFileData(): SecretsFileFormat {
    const entries: Record<string, SecretEnvelope> = {};
    for (const [k, v] of this.entries) {
      entries[k] = v;
    }
    return {
      $schema: FILE_SCHEMA,
      version: FILE_VERSION,
      entries,
    };
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return (
    typeof err === 'object' && err !== null && 'code' in err && 'message' in err
  );
}

function isSecretEnvelope(value: unknown): value is SecretEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)['iv'] === 'string' &&
    typeof (value as Record<string, unknown>)['tag'] === 'string' &&
    typeof (value as Record<string, unknown>)['ciphertext'] === 'string'
  );
}

function isSecretsFileFormat(value: unknown): value is SecretsFileFormat {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v['version'] !== 'number') return false;
  if (typeof v['entries'] !== 'object' || v['entries'] === null) return false;
  const entries = v['entries'] as Record<string, unknown>;
  for (const entry of Object.values(entries)) {
    if (!isSecretEnvelope(entry)) return false;
  }
  return true;
}
