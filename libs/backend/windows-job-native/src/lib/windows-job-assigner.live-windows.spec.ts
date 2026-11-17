import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { NativeWindowsJobAssigner } from './windows-job-assigner';

const runFile = promisify(execFile);
const binary = join(__dirname, '../../build/Release/windows_job.node');
const marker = 'ptah-job-live-' + randomUUID();
const leafScript = 'setInterval(() => {}, 1000)';
const middleScript = [
  "const { spawn } = require('node:child_process');",
  `const grandchild = spawn(process.execPath, ['-e', ${JSON.stringify(leafScript)}, process.argv[1]],`,
  "  { detached: true, stdio: 'ignore', windowsHide: true });",
  "process.stdout.write(JSON.stringify({ child: process.pid, grandchild: grandchild.pid }) + '\\n');",
  "if (process.argv[2] === 'orphan') grandchild.unref(); else setInterval(() => {}, 1000);",
].join('\n');
const rootScript = [
  "const { spawn } = require('node:child_process');",
  "process.stdin.on('data', () => {",
  `  const child = spawn(process.execPath, ['-e', ${JSON.stringify(middleScript)}, process.argv[1], process.argv[2]],`,
  "    { detached: true, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });",
  "  child.stdout.pipe(process.stdout);",
  "});",
  'setInterval(() => {}, 1000);',
].join('\n');

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if (error.code === 'EPERM') return true;
      if (error.code === 'ESRCH') return false;
    }
    throw error;
  }
}

async function poll(predicate: () => boolean, timeoutMs = 15000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= end) throw new Error('Timed out waiting for process state');
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}

function start(script: string, args: string[], pids: Set<number>): ChildProcess {
  const child = spawn(process.execPath, ['-e', script, marker, ...args], {
    detached: true, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  if (child.pid === undefined) throw new Error('Process did not start');
  pids.add(child.pid);
  return child;
}

function pidOf(child: ChildProcess): number {
  if (child.pid === undefined) throw new Error('Process has no PID');
  return child.pid;
}

function readTree(root: ChildProcess, pids: Set<number>): Promise<{ child: number; grandchild: number }> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for tree')), 10000);
    root.once('error', reject);
    root.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const end = output.indexOf('\n');
      if (end < 0) return;
      clearTimeout(timeout);
      try {
        const value: unknown = JSON.parse(output.slice(0, end));
        if (typeof value !== 'object' || value === null ||
            !('child' in value) || !('grandchild' in value) ||
            typeof value.child !== 'number' || typeof value.grandchild !== 'number') {
          throw new Error('Invalid tree response');
        }
        pids.add(value.child);
        pids.add(value.grandchild);
        resolve({ child: value.child, grandchild: value.grandchild });
      } catch (error: unknown) { reject(error); }
    });
  });
}

async function dispose(pids: Set<number>): Promise<void> {
  const errors: Error[] = [];
  for (const pid of pids) {
    if (!alive(pid)) continue;
    try { await runFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }); }
    catch (error: unknown) {
      if (alive(pid)) errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  pids.clear();
  try {
    const { stdout } = await runFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `$ErrorActionPreference = 'Stop'; Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*${marker}*' } | ForEach-Object { $_.ProcessId }`,
    ], { windowsHide: true });
    for (const line of stdout.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid || !alive(pid)) continue;
      try { await runFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }); }
      catch (error: unknown) {
        if (alive(pid)) errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
  } catch (error: unknown) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
  }
  if (errors.length) throw new AggregateError(errors, 'Failed to kill live test processes');
}

(process.platform === 'win32' && process.env['PTAH_SKIP_LIVE_WINDOWS'] !== '1' && existsSync(binary)
  ? describe : describe.skip)('native Windows job with real processes', () => {
  const pids = new Set<number>();
  const assigner = new NativeWindowsJobAssigner((): unknown => require(binary));
  afterEach(async () => { await dispose(pids); });

  it('close kills root, child and detached grandchild', async () => {
    const root = start(rootScript, ['tree'], pids);
    const job = assigner.assignToNewJob(pidOf(root));
    const treeLine = readTree(root, pids);
    root.stdin?.write('start\n');
    const tree = await treeLine;
    await poll(() => alive(tree.child) && alive(tree.grandchild));
    job.close();
    await poll(() => !alive(pidOf(root)) && !alive(tree.child) && !alive(tree.grandchild));
  }, 30000);

  it('close kills a detached grandchild after its parent exits', async () => {
    const root = start(rootScript, ['orphan'], pids);
    const job = assigner.assignToNewJob(pidOf(root));
    const treeLine = readTree(root, pids);
    root.stdin?.write('start\n');
    const tree = await treeLine;
    await poll(() => !alive(tree.child) && alive(tree.grandchild));
    job.close();
    await poll(() => !alive(pidOf(root)) && !alive(tree.grandchild));
  }, 30000);

  it('close kills a process started by a job member after assignment', async () => {
    const root = start(rootScript, ['tree'], pids);
    const job = assigner.assignToNewJob(pidOf(root));
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    const treeLine = readTree(root, pids);
    root.stdin?.write('start\n');
    const tree = await treeLine;
    await poll(() => alive(tree.grandchild));
    job.close();
    await poll(() => !alive(tree.child) && !alive(tree.grandchild));
  }, 30000);

  it('leaves an unrelated process alive', async () => {
    const root = start(rootScript, ['tree'], pids);
    const unrelated = start(leafScript, [], pids);
    const job = assigner.assignToNewJob(pidOf(root));
    job.close();
    await poll(() => !alive(pidOf(root)));
    expect(alive(pidOf(unrelated))).toBe(true);
  }, 30000);

  it('throws for an exited PID', async () => {
    const child = start('process.exit(0)', [], pids);
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    expect(() => assigner.assignToNewJob(pidOf(child))).toThrow(/failed \(GetLastError \d+\)/);
  }, 30000);

  it('accepts a second close', async () => {
    const root = start(rootScript, ['tree'], pids);
    const job = assigner.assignToNewJob(pidOf(root));
    job.close();
    expect(() => job.close()).not.toThrow();
  }, 30000);
});
