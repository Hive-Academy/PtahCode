import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type {
  IProcessSpawner,
  SpawnedProcessHandle,
} from '../interfaces/process-spawner.interface';
import { runProcessToCompletion } from './run-process-to-completion';

class FakeProcess extends EventEmitter {
  readonly stdin = null;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly whenSpawned = Promise.resolve(1);
  readonly pid = 1;
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
  afterEach(() => jest.useRealTimers());

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

  it('settles at the timeout with the output so far and kills the process', async () => {
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
    expect(child.kill).toHaveBeenCalled();
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
