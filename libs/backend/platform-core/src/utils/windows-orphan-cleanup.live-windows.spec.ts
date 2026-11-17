import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import {
  defaultOrphanCleanupDependencies,
  scheduleWindowsOrphanCleanup,
} from './windows-orphan-cleanup';

const runFile = promisify(execFile);
const marker = 'ptah-live-' + randomUUID();
const leafScript = 'setInterval(() => {}, 1000)';
const middleScript = [
  "const { spawn } = require('node:child_process');",
  "const grandchild = spawn(process.execPath, ['-e', " +
    JSON.stringify(leafScript) +
    ", process.argv[1]], { detached: true, stdio: 'ignore', windowsHide: true });",
  'process.stdout.write(JSON.stringify({ child: process.pid, ' +
    "grandchild: grandchild.pid }) + '\\n');",
  'setInterval(() => {}, 1000);',
].join('\n');
const rootScript = [
  "const { spawn } = require('node:child_process');",
  "const child = spawn(process.execPath, ['-e', " +
    JSON.stringify(middleScript) +
    ', process.argv[1]], {',
  "  detached: true, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,",
  '});',
  "process.stdout.write(JSON.stringify({ child: child.pid }) + '\\n');",
  'child.stdout.pipe(process.stdout);',
  "process.stdin.on('data', () => process.exit(0));",
].join('\n');

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if (error.code === 'EPERM') return true;
      if (error.code === 'ESRCH') return false;
    }
    throw error;
  }
}

async function poll(
  predicate: () => boolean,
  timeoutMs = 15000,
): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= end)
      throw new Error('Timed out waiting for process state');
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}

function readTree(
  root: ChildProcess,
  pids: Set<number>,
): Promise<{ child: number; grandchild: number }> {
  return new Promise((resolve, reject) => {
    let output = '';
    let stderr = '';
    root.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    root.once('error', reject);
    root.once('exit', (code) =>
      reject(
        new Error(`Root exited before tree line (code ${code}): ${stderr}`),
      ),
    );
    root.once('close', (code) =>
      reject(
        new Error(`Root closed before tree line (code ${code}): ${stderr}`),
      ),
    );
    root.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      while (output.includes('\n')) {
        const end = output.indexOf('\n');
        const line = output.slice(0, end);
        output = output.slice(end + 1);
        try {
          if (line.includes('child') && !line.includes('grandchild')) {
            const partial = JSON.parse(line) as { child: number };
            pids.add(partial.child);
          }
          if (line.includes('grandchild')) {
            resolve(JSON.parse(line) as { child: number; grandchild: number });
          }
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}

async function dispose(pids: Set<number>): Promise<void> {
  // PID reuse is accepted because these PIDs are recorded for only a few seconds.
  const errors: Error[] = [];
  try {
    for (const pid of pids) {
      if (!alive(pid)) continue;
      try {
        await runFile('taskkill', ['/PID', String(pid), '/T', '/F'], {
          windowsHide: true,
        });
      } catch (error) {
        if (alive(pid))
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
      }
    }
  } finally {
    pids.clear();
  }
  try {
    const { stdout } = await runFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$ErrorActionPreference = 'Stop'; Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*${marker}*' } | ForEach-Object { $_.ProcessId }`,
      ],
      { windowsHide: true },
    );
    for (const line of stdout.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
      try {
        await runFile('taskkill', ['/PID', String(pid), '/T', '/F'], {
          windowsHide: true,
        });
      } catch (error) {
        if (alive(pid))
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
  }
  if (errors.length)
    throw new AggregateError(errors, 'Failed to kill live test processes');
}

(process.platform === 'win32' && process.env['PTAH_SKIP_LIVE_WINDOWS'] !== '1'
  ? describe
  : describe.skip)('shared Windows orphan cleanup with real processes', () => {
  const pids = new Set<number>();
  afterEach(async () => {
    await dispose(pids);
  });

  it('kills detached descendants and leaves an unrelated process alive', async () => {
    const startedAt = Date.now();
    const root = spawn(process.execPath, ['-e', rootScript, marker], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (root.pid === undefined) throw new Error('Root did not start');
    pids.add(root.pid);
    // The unrelated process starts inside the cleanup time window; ancestry alone excludes it.
    const unrelated = spawn(process.execPath, ['-e', leafScript, marker], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    if (unrelated.pid === undefined)
      throw new Error('Unrelated process did not start');
    pids.add(unrelated.pid);
    const tree = await readTree(root, pids);
    pids.add(tree.child);
    pids.add(tree.grandchild);
    await poll(() => alive(tree.child) && alive(tree.grandchild), 5000);
    const errors: Error[] = [];
    root.stdin?.write('exit\n');
    await new Promise<void>((resolve) => root.once('exit', () => resolve()));
    scheduleWindowsOrphanCleanup(
      root.pid,
      startedAt,
      false,
      (error) => errors.push(error),
      defaultOrphanCleanupDependencies,
    );
    await poll(() => !alive(tree.child) && !alive(tree.grandchild));
    expect(alive(unrelated.pid)).toBe(true);
    expect(errors).toEqual([]);
  }, 30000);
});
