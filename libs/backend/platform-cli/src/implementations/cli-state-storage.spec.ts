/**
 * `cli-state-storage.spec.ts` — runs `runStateStorageContract` against
 * `CliStateStorage`, plus CLI-specific checks for atomic-rename persistence
 * and restart recovery. Mirrors the Electron state-storage spec since the
 * CLI impl is a direct port of the same logic.
 */

import 'reflect-metadata';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runStateStorageContract } from '@ptah-extension/platform-core/testing';
import { CliStateStorage } from './cli-state-storage';

const tmpDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptah-cli-state-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  jest.restoreAllMocks();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (!dir) continue;
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {
      /* swallow */
    });
  }
});

runStateStorageContract('CliStateStorage', async () => {
  const storage = await makeTempDir();
  return new CliStateStorage(storage, 'state.json');
});

describe('CliStateStorage — CLI-specific behaviour', () => {
  let storage: string;
  let provider: CliStateStorage;

  beforeEach(async () => {
    storage = await makeTempDir();
    provider = new CliStateStorage(storage, 'state.json');
  });

  it('restores disk baseline after consecutive failures before an unrelated commit', async () => {
    await provider.update('key', 0);
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('disk')).mockRejectedValueOnce(new Error('disk'));
    const first = expect(provider.update('key', 1)).rejects.toThrow('disk');
    const second = expect(provider.update('key', 2)).rejects.toThrow('disk');
    await Promise.all([first, second]);
    expect(provider.get('key')).toBe(0);
    await provider.update('other', true);
    expect(new CliStateStorage(storage, 'state.json').get('key')).toBe(0);
  });

  it('accounts for other pending keys included in a successful full snapshot', async () => {
    await provider.update('key', 0);
    const rename = fs.rename.bind(fs);
    jest.spyOn(fs, 'rename').mockImplementationOnce(rename).mockRejectedValueOnce(new Error('disk'));
    const first = provider.update('other', true);
    const second = expect(provider.update('key', 2)).rejects.toThrow('disk');
    await Promise.all([first, second]);
    expect(provider.get('key')).toBe(2);
    expect(new CliStateStorage(storage, 'state.json').get('key')).toBe(2);
  });

  it('makes updates and queued updates visible before persistence settles', async () => {
    const first = provider.update('visible', 1);
    expect(provider.get('visible')).toBe(1);
    const second = provider.update('visible', 2);
    expect(provider.get('visible')).toBe(2);
    await Promise.all([first, second]);
    const deletion = provider.update('visible', undefined);
    expect(provider.get('visible')).toBeUndefined();
    await deletion;
  });

  it('keeps a queued same-key update when the preceding write fails', async () => {
    await provider.update('kept', 0);
    const failure = new Error('rename failed');
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(failure);
    const failed = provider.update('kept', 1);
    const rejected = expect(failed).rejects.toBe(failure);
    const successful = provider.update('kept', 2);
    expect(provider.get('kept')).toBe(2);
    await rejected;
    expect(provider.get('kept')).toBe(2);
    await successful;
    expect(provider.get('kept')).toBe(2);
    expect(new CliStateStorage(storage, 'state.json').get('kept')).toBe(2);
  });

  it('removes a failed new key when no later update supersedes it', async () => {
    const failure = new Error('rename failed');
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(failure);
    const write = provider.update('new-key', 1);
    expect(provider.get('new-key')).toBe(1);
    await expect(write).rejects.toBe(failure);
    expect(provider.get('new-key')).toBeUndefined();
    expect(new CliStateStorage(storage, 'state.json').get('new-key')).toBeUndefined();
  });

  it('rolls back failed updates and deletions before a later write', async () => {
    await provider.update('kept', 1);
    const blocker = path.join(storage, 'state.json.tmp');
    await fs.mkdir(blocker);
    await expect(provider.update('kept', 2)).rejects.toThrow();
    expect(provider.get('kept')).toBe(1);
    await expect(provider.update('kept', undefined)).rejects.toThrow();
    expect(provider.get('kept')).toBe(1);
    await fs.rmdir(blocker);
    await provider.update('other', true);
    const restored = new CliStateStorage(storage, 'state.json');
    expect(restored.get('kept')).toBe(1);
  });
  it('update persists JSON to the configured filename', async () => {
    await provider.update('greeting', 'hello');
    const raw = await fs.readFile(path.join(storage, 'state.json'), 'utf-8');
    expect(JSON.parse(raw)).toEqual({ greeting: 'hello' });
  });

  it('persisted state survives a restart', async () => {
    await provider.update('counter', 5);
    const fresh = new CliStateStorage(storage, 'state.json');
    expect(fresh.get<number>('counter')).toBe(5);
  });

  it('update with undefined deletes the key from disk', async () => {
    await provider.update('temp', 'x');
    await provider.update('temp', undefined);
    const raw = await fs.readFile(path.join(storage, 'state.json'), 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('temp');
  });

  it('concurrent updates serialize without data loss', async () => {
    // Fire twenty updates with the same key in parallel and assert the final
    // value is whichever one was scheduled last — the write chain must not
    // drop any of them or corrupt the JSON on disk.
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      promises.push(provider.update('race', i));
    }
    await Promise.all(promises);
    expect(provider.get<number>('race')).toBe(19);

    const raw = await fs.readFile(path.join(storage, 'state.json'), 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  }, // Explicit timeout, matching the precedent in
  // `platform-core/src/file-settings-manager.cross-process.spec.ts`.
  //
  // `CliStateStorage.update` SERIALIZES through a promise chain, so twenty
  // parallel calls become sixty sequential real-disk syscalls (mkdir +
  // write + atomic rename, twenty times). That is the behaviour under test —
  // it cannot be made faster without testing something else — and its
  // wall-clock cost scales with whatever else is hitting the disk. Under the
  // eleven-project `nx run-many` gate it exceeded Jest's 5s default and
  // failed the whole gate, while passing in isolation; Nx then marked the
  // task flaky.
  //
  // This is a load-sensitive DURATION, not a leaked handle: nothing here is
  // left open, and a genuine serialization break still fails fast (wrong
  // final value, or unparseable JSON) rather than waiting this out.
  30_000);

  it('loadSync recovers from a missing file without throwing', () => {
    expect(
      () => new CliStateStorage(storage, 'does-not-exist.json'),
    ).not.toThrow();
    const p = new CliStateStorage(storage, 'does-not-exist.json');
    expect(p.keys()).toEqual([]);
  });

  it('loadSync recovers from a corrupted file by starting empty', async () => {
    await fs.writeFile(
      path.join(storage, 'corrupt.json'),
      '{ not: valid: json',
      'utf-8',
    );
    const p = new CliStateStorage(storage, 'corrupt.json');
    expect(p.keys()).toEqual([]);
  });

  it('uses atomic rename (no leftover .tmp after a successful write)', async () => {
    await provider.update('atomic', true);
    const entries = await fs.readdir(storage);
    expect(entries).toContain('state.json');
    expect(entries.some((e) => e.endsWith('.tmp'))).toBe(false);
  });
});
