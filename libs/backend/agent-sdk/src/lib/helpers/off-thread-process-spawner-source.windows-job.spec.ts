import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { OFF_THREAD_SPAWNER_WORKER_SOURCE } from './off-thread-process-spawner-source';

type Message = { type: string; id: number; pid?: number; job?: { ok: boolean; message?: string } };

describe('generated worker job kill ordering', () => {
  it.each(['success', 'not-found', 'failure', 'timeout', 'throw'] as const)(
    'starts taskkill before closing and closes once after %s', (outcome) => {
      const child = Object.assign(new EventEmitter(), {
        pid: 4242, stdin: null, stdout: null, stderr: null, kill: jest.fn(),
      });
      const closeJob = jest.fn();
      let complete: ((error: Error | null, stdout: string, stderr: string) => void) | undefined;
      const execFile = jest.fn((_file: string, _args: string[], _options: object, callback: NonNullable<typeof complete>) => {
        expect(closeJob).not.toHaveBeenCalled();
        if (outcome === 'throw') throw new Error('launch failed');
        complete = callback;
      });
      let onMessage: ((message: Record<string, unknown>) => void) | undefined;
      runInNewContext(OFF_THREAD_SPAWNER_WORKER_SOURCE, {
        process: { platform: 'win32', env: {} }, Buffer,
        require: (id: string): unknown => {
          if (id === 'node:worker_threads') return { parentPort: {
            on: (_event: string, listener: typeof onMessage) => { onMessage = listener; },
            postMessage: jest.fn(),
          } };
          if (id === 'node:child_process') return { spawn: () => child, execFile };
          if (id === 'C:/windows_job.node') return { createJobForPid: () => ({ pid: child.pid }), closeJob };
          return jest.requireActual(id);
        },
      });
      onMessage?.({ type: 'spawn', id: 1, command: 'fake', args: [], env: {}, stdioMode: 'ignore',
        windowsJobPolicy: 'job', windowsJobBinaryPath: 'C:/windows_job.node' });
      onMessage?.({ type: 'kill', id: 1, signal: 'SIGTERM' });
      expect(execFile).toHaveBeenCalledTimes(1);
      if (outcome !== 'throw') {
        expect(closeJob).not.toHaveBeenCalled();
        expect(complete).toBeDefined();
        complete?.(outcome === 'success' ? null : Object.assign(new Error(outcome), {
          code: outcome === 'not-found' ? 128 : 5, killed: outcome === 'timeout',
        }), '', outcome === 'not-found' ? 'not found' : '');
      }
      expect(closeJob).toHaveBeenCalledTimes(1);
      child.emit('exit', null, 'SIGTERM');
      expect(closeJob).toHaveBeenCalledTimes(1);
    },
  );
});

describe('generated worker Windows jobs', () => {
  let directory: string;
  let binding: string;
  let journal: string;
  let worker: Worker;
  let messages: Message[];
  let pids: Set<number>;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'ptah-worker-job-'));
    binding = join(directory, 'binding.js');
    journal = join(directory, 'calls.jsonl');
    writeFileSync(journal, '');
    messages = [];
    pids = new Set();
    worker = new Worker(OFF_THREAD_SPAWNER_WORKER_SOURCE, { eval: true });
    worker.on('message', (message: Message) => {
      messages.push(message);
      if (message.type === 'spawned' && message.pid) pids.add(message.pid);
    });
  });

  afterEach(async () => {
    try {
      // Always stop every child, including a child replaced in the pooled worker.
      for (const pid of pids) {
        try { process.kill(pid, 'SIGKILL'); }
        catch (error: unknown) {
          // degradation-audit: process-gone - an exited child needs no further stop.
          if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH')) throw error;
        }
      }
    } finally {
      await worker.terminate();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function stub(create = 'return { pid };', close = ''): void {
    writeFileSync(binding, [
      "const fs = require('node:fs');",
      `const record = (event, pid) => fs.appendFileSync(${JSON.stringify(journal)}, JSON.stringify({ event, pid }) + '\\n');`,
      "record('load');",
      `exports.createJobForPid = (pid) => { record('assign', pid); require('node:worker_threads').parentPort.postMessage({ type: 'binding-assigned', id: pid }); ${create} };`,
      `exports.closeJob = (handle) => { record('close', handle.pid); ${close} };`,
    ].join('\n'));
  }

  function calls(): Array<{ event: string; pid?: number }> {
    return readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean)
      .map((line: string) => JSON.parse(line));
  }

  function sendSpawn(id = 1, jobFields: Record<string, string> = {
    windowsJobPolicy: 'job', windowsJobBinaryPath: binding,
  }): void {
    worker.postMessage({ type: 'spawn', id, command: process.execPath,
      args: ['-e', "process.stdin.on('data', () => process.exit(0)); process.stdout.write('ready'); setInterval(() => {}, 1000);"],
      env: { ...process.env }, ...jobFields });
  }

  async function wait(type: string, id = 1): Promise<Message> {
    const existing = messages.find((message) => message.type === type && message.id === id);
    if (existing) return existing;
    return new Promise<Message>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Missing ${type} for ${id}`)); }, 10000);
      const onMessage = (message: Message): void => {
        if (message.type === type && message.id === id) { cleanup(); resolve(message); }
      };
      const onError = (error: Error): void => { cleanup(); reject(error); };
      function cleanup(): void {
        clearTimeout(timer);
        worker.off('message', onMessage);
        worker.off('error', onError);
      }
      worker.on('message', onMessage);
      worker.on('error', onError);
    });
  }

  it('assigns before spawned and closes exactly once on child exit', async () => {
    stub();
    sendSpawn();
    const spawned = await wait('spawned');
    expect(spawned.job).toEqual({ ok: true });
    expect(messages.findIndex((message) => message.type === 'binding-assigned')).toBeLessThan(
      messages.findIndex((message) => message.type === 'spawned'));
    expect(calls()).toEqual([{ event: 'load' }, { event: 'assign', pid: spawned.pid }]);
    await wait('stdout');
    worker.postMessage({ type: 'stdin', id: 1, chunk: Buffer.from('exit') });
    await wait('exit');
    worker.postMessage({ type: 'kill', id: 1, signal: 'SIGKILL' });
    sendSpawn(2, {});
    await wait('spawned', 2); // Barrier: repeated close paths have run.
    expect(calls().filter((call) => call.event === 'close')).toEqual([{ event: 'close', pid: spawned.pid }]);
  });

  it('closes exactly once on explicit kill and subsequent exit', async () => {
    stub();
    sendSpawn();
    const spawned = await wait('spawned');
    worker.postMessage({ type: 'kill', id: 1, signal: 'SIGKILL' });
    await wait('exit');
    expect(calls().filter((call) => call.event === 'close')).toEqual([{ event: 'close', pid: spawned.pid }]);
  });

  it('closes the replaced job and keeps the new job until its own exit', async () => {
    stub();
    sendSpawn();
    const first = await wait('spawned');
    sendSpawn(2);
    const second = await wait('spawned', 2);
    expect(calls().filter((call) => call.event === 'close')).toEqual([{ event: 'close', pid: first.pid }]);
    if (first.pid === undefined) throw new Error('Missing first child PID');
    process.kill(first.pid, 'SIGKILL');
    await wait('exit');
    expect(calls().filter((call) => call.event === 'close')).toHaveLength(1);
    worker.postMessage({ type: 'kill', id: 2, signal: 'SIGKILL' });
    await wait('exit', 2);
    expect(calls().filter((call) => call.event === 'close')).toEqual([
      { event: 'close', pid: first.pid }, { event: 'close', pid: second.pid },
    ]);
  });

  it.each(['missing', 'throw', 'shape'] as const)('keeps one usable child after %s binding failure', async (mode) => {
    if (mode === 'throw') stub("throw new Error('assign failed');");
    if (mode === 'shape') writeFileSync(binding, 'module.exports = {};');
    sendSpawn();
    const spawned = await wait('spawned');
    expect(spawned.job).toEqual(expect.objectContaining({ ok: false, message: expect.any(String) }));
    expect(spawned.job?.message).toMatch(mode === 'missing' ? /Cannot find module/ : mode === 'throw' ? /assign failed/ : /invalid binding shape/);
    await wait('stdout');
    const pid = spawned.pid;
    if (pid === undefined) throw new Error('Missing child PID');
    expect(() => process.kill(pid, 0)).not.toThrow();
    worker.postMessage({ type: 'stdin', id: 1, chunk: Buffer.from('exit') });
    await wait('exit');
    expect(messages.filter((message) => message.type === 'spawned')).toHaveLength(1);
    expect(pids.size).toBe(1);
    expect(calls().filter((call) => call.event === 'close')).toHaveLength(0);
  });

  it('does not load the binding without job fields', async () => {
    stub();
    sendSpawn(1, {});
    expect((await wait('spawned')).job).toBeUndefined();
    await wait('stdout');
    expect(calls()).toEqual([]);
    worker.postMessage({ type: 'kill', id: 1, signal: 'SIGKILL' });
    await wait('exit');
    expect(calls()).toEqual([]);
  });

  it('reports close errors and does not close the same handle again', async () => {
    stub('return { pid };', "throw new Error('close failed');");
    sendSpawn();
    await wait('spawned');
    worker.postMessage({ type: 'kill', id: 1, signal: 'SIGKILL' });
    expect(await wait('job-close-error')).toMatchObject({ message: 'Error: close failed' });
    await wait('exit');
    expect(calls().filter((call) => call.event === 'close')).toHaveLength(1);
  });
});
