import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type {
  IProcessSpawner,
  SpawnedProcessHandle,
} from '../interfaces/process-spawner.interface';
const mockKillProcessTree = jest.fn(async () => undefined);
jest.mock('./process-tree-reaper', () => ({
  killProcessTree: (...args: unknown[]) => mockKillProcessTree(...(args as [])),
}));

import {
  runProcessToCompletion,
  stopProcessTree,
} from './run-process-to-completion';

class FakeProcess extends EventEmitter {
  readonly stdin = null;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  whenSpawned: Promise<number | null> = Promise.resolve(1);
  pid: number | undefined = 1;
  killed = false;
  exitCode: number | null = null;
  kill = jest.fn(() => {
    this.killed = true;
    return true;
  });
}

function spawnerFor(child: FakeProcess): IProcessSpawner & {
  spawnProcess: jest.Mock;
} {
  return {
    spawnProcess: jest.fn(() => child as unknown as SpawnedProcessHandle),
  };
}

const request = { command: 'codex', args: ['--version'], env: {} };

describe('runProcessToCompletion', () => {
  afterEach(() => {
    jest.useRealTimers();
    mockKillProcessTree.mockClear();
  });

  it('collects stdout, stderr and the exit code', async () => {
    const child = new FakeProcess();
    const spawner = spawnerFor(child);
    const run = runProcessToCompletion(spawner, request, { timeoutMs: 1000 });

    child.stdout.write('codex-cli 0.171.0\n');
    child.stderr.write('note');
    child.emit('close', 0, null);

    await expect(run).resolves.toEqual({
      stdout: 'codex-cli 0.171.0\n',
      stderr: 'note',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    expect(spawner.spawnProcess).toHaveBeenCalledWith(request);
  });

  it('settles at the timeout with the output so far and reaps the process tree', async () => {
    jest.useFakeTimers();
    const child = new FakeProcess();
    const run = runProcessToCompletion(spawnerFor(child), request, {
      timeoutMs: 50,
    });

    child.stdout.write('partial');
    jest.advanceTimersByTime(50);

    await expect(run).resolves.toEqual({
      stdout: 'partial',
      stderr: '',
      exitCode: null,
      signal: null,
      timedOut: true,
    });
    expect(mockKillProcessTree).toHaveBeenCalledWith(1, 'SIGTERM', undefined);
  });

  it('stops a timed-out process with onTimeout when given', async () => {
    jest.useFakeTimers();
    const child = new FakeProcess();
    const onTimeout = jest.fn();
    const run = runProcessToCompletion(spawnerFor(child), request, {
      timeoutMs: 50,
      onTimeout,
    });

    jest.advanceTimersByTime(50);

    await expect(run).resolves.toMatchObject({ timedOut: true });
    expect(onTimeout).toHaveBeenCalledWith(child);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('keeps at most maxOutputBytes per stream', async () => {
    const child = new FakeProcess();
    const run = runProcessToCompletion(spawnerFor(child), request, {
      timeoutMs: 1000,
      maxOutputBytes: 4,
    });

    child.stdout.write('abc');
    child.stdout.write('defgh');
    child.emit('close', 0, null);

    await expect(run).resolves.toMatchObject({ stdout: 'abcd' });
  });

  it('rejects when the process cannot start', async () => {
    const child = new FakeProcess();
    const run = runProcessToCompletion(spawnerFor(child), request, {
      timeoutMs: 1000,
    });

    child.emit('error', new Error('spawn ENOENT'));

    await expect(run).rejects.toThrow('spawn ENOENT');
  });

  it('does not throw on a second error after it settled', async () => {
    const child = new FakeProcess();
    const run = runProcessToCompletion(spawnerFor(child), request, {
      timeoutMs: 1000,
    });

    child.emit('error', new Error('first'));
    await expect(run).rejects.toThrow('first');
    expect(() => child.emit('error', new Error('second'))).not.toThrow();
  });

  it('rejects when the spawner throws', async () => {
    const spawner: IProcessSpawner = {
      spawnProcess: () => {
        throw new Error('refused');
      },
    };

    await expect(
      runProcessToCompletion(spawner, request, { timeoutMs: 1000 }),
    ).rejects.toThrow('refused');
  });
});

describe('stopProcessTree', () => {
  afterEach(() => mockKillProcessTree.mockClear());

  it('queues a kill and reaps the tree once a late pid arrives', async () => {
    const child = new FakeProcess();
    let spawned!: (pid: number) => void;
    child.pid = undefined;
    child.whenSpawned = new Promise((resolve) => (spawned = resolve));

    stopProcessTree(child as unknown as SpawnedProcessHandle);
    expect(child.kill).toHaveBeenCalled();
    expect(mockKillProcessTree).not.toHaveBeenCalled();

    spawned(42);
    await child.whenSpawned;
    await Promise.resolve();
    expect(mockKillProcessTree).toHaveBeenCalledWith(42, 'SIGTERM', undefined);
  });

  it('does not reap a process that already exited', () => {
    const child = new FakeProcess();
    child.exitCode = 0;

    stopProcessTree(child as unknown as SpawnedProcessHandle);

    expect(mockKillProcessTree).not.toHaveBeenCalled();
  });

  it('reports a launch that failed instead of leaving the rejection unhandled', async () => {
    const child = new FakeProcess();
    child.pid = undefined;
    child.whenSpawned = Promise.reject(new Error('spawn failed'));
    const onError = jest.fn();

    stopProcessTree(child as unknown as SpawnedProcessHandle, onError);
    await new Promise((resolve) => setImmediate(resolve));

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'spawn failed' }));
    expect(mockKillProcessTree).not.toHaveBeenCalled();
  });
});
