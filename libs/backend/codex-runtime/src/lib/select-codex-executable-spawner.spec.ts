import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type {
  IProcessSpawner,
  SpawnedProcessHandle,
} from '@ptah-extension/platform-core';
import { createNodeCodexExecutableProbes } from './select-codex-executable';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));

class FakeChild extends EventEmitter {
  readonly stdin = null;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly whenSpawned = Promise.resolve(1);
  readonly pid = 1;
  readonly killed = false;
  readonly exitCode = null;
  kill = jest.fn(() => true);
}

/** A spawner whose child prints `stdout` and exits with `code` on the next tick. */
function spawnerAnswering(stdout: string, code: number): IProcessSpawner & {
  spawnProcess: jest.Mock;
} {
  return {
    spawnProcess: jest.fn(() => {
      const child = new FakeChild();
      setImmediate(() => {
        child.stdout.write(stdout);
        child.emit('close', code, null);
      });
      return child as unknown as SpawnedProcessHandle;
    }),
  };
}

describe('native Codex version probe through a process spawner', () => {
  let directory: string;
  let binary: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ptah-codex-spawner-'));
    binary = join(directory, process.platform === 'win32' ? 'codex.exe' : 'codex');
    await writeFile(binary, 'native');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
    jest.mocked(execFile).mockClear();
  });

  it('runs --version through the spawner, not execFile', async () => {
    const spawner = spawnerAnswering('codex-cli 0.171.0\n', 0);
    const probes = createNodeCodexExecutableProbes(async () => undefined, {
      processSpawner: spawner,
    });

    await expect(probes.readVersion(binary, 7000)).resolves.toBe(
      'codex-cli 0.171.0\n',
    );
    expect(spawner.spawnProcess).toHaveBeenCalledWith(
      expect.objectContaining({ command: binary, args: ['--version'] }),
    );
    expect(execFile).not.toHaveBeenCalled();
  });

  it('rejects a non-zero exit, as execFile does', async () => {
    const probes = createNodeCodexExecutableProbes(async () => undefined, {
      processSpawner: spawnerAnswering('', 2),
    });

    await expect(probes.readVersion(binary, 7000)).rejects.toThrow(
      'Codex --version exited with 2',
    );
  });
});
