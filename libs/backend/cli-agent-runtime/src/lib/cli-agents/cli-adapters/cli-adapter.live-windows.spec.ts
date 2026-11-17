import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { spawnCli } from './cli-adapter.utils';

const runFile = promisify(execFile);
const leafScript = 'setInterval(() => {}, 1000)';
const middleScript = [
  "const { spawn } = require('node:child_process');",
  "const detached = process.argv[1] === 'true';",
  "const grandchild = spawn(process.execPath, ['-e', " +
    JSON.stringify(leafScript) +
    '], {',
  '  detached, stdio: "ignore", windowsHide: true,',
  '});',
  'process.stdout.write(JSON.stringify({ child: process.pid, ' +
    "grandchild: grandchild.pid }) + '\\n');",
  'setInterval(() => {}, 1000);',
].join('\n');
const rootScript = [
  "const { spawn } = require('node:child_process');",
  "const detached = process.argv[1] === 'true';",
  "const child = spawn(process.execPath, ['-e', " +
    JSON.stringify(middleScript) +
    ', String(detached)], {',
  '  detached, stdio: ["ignore", "pipe", "ignore"], windowsHide: true,',
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

async function staysAlive(
  child: number,
  grandchild: number,
  durationMs = 2000,
): Promise<void> {
  const end = Date.now() + durationMs;
  let samples = 0;
  while (Date.now() < end || samples < 10) {
    expect(alive(child)).toBe(true);
    expect(alive(grandchild)).toBe(true);
    samples++;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
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
  if (errors.length)
    throw new AggregateError(errors, 'Failed to kill live test processes');
}

async function treeFor(
  cleanupOrphanDescendants: boolean,
  descendantsDetached: boolean,
  pids: Set<number>,
): Promise<{
  root: ReturnType<typeof spawnCli>;
  rootPid: number;
  child: number;
  grandchild: number;
}> {
  const root = spawnCli(
    process.execPath,
    ['-e', rootScript, String(descendantsDetached)],
    {
      detached: true,
      cleanupOrphanDescendants,
    },
  );
  const rootPid = await root.whenSpawned;
  if (rootPid === null) throw new Error('Root did not start');
  pids.add(rootPid);
  const tree = await new Promise<{ child: number; grandchild: number }>(
    (resolve, reject) => {
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
              resolve(
                JSON.parse(line) as { child: number; grandchild: number },
              );
            }
          } catch (error) {
            reject(error);
          }
        }
      });
    },
  );
  pids.add(tree.child);
  pids.add(tree.grandchild);
  await poll(() => alive(tree.child) && alive(tree.grandchild), 5000);
  return { root, rootPid, ...tree };
}

(process.platform === 'win32' && process.env['PTAH_SKIP_LIVE_WINDOWS'] !== '1'
  ? describe
  : describe.skip)('CLI adapter Windows process cleanup', () => {
  const pids = new Set<number>();
  afterEach(async () => {
    await dispose(pids);
  });

  it('cleans detached descendants when the root exits by itself', async () => {
    const tree = await treeFor(true, true, pids);
    tree.root.stdin?.write('exit\n');
    await new Promise<void>((resolve) =>
      tree.root.once('exit', () => resolve()),
    );
    await poll(() => !alive(tree.child) && !alive(tree.grandchild));
  }, 30000);

  it('cleans detached descendants when the root is stopped through its handle', async () => {
    const tree = await treeFor(true, true, pids);
    expect(tree.root.kill()).toBe(true);
    await poll(() => !alive(tree.child) && !alive(tree.grandchild));
  }, 30000);

  it('lets a detached daemon survive root exit when cleanup is disabled', async () => {
    const tree = await treeFor(false, true, pids);
    tree.root.stdin?.write('exit\n');
    await new Promise<void>((resolve) =>
      tree.root.once('exit', () => resolve()),
    );
    await staysAlive(tree.child, tree.grandchild);
  }, 30000);

  it('non-detached descendants die with the root when cleanup is off (libuv job object)', async () => {
    const tree = await treeFor(false, false, pids);
    tree.root.stdin?.write('exit\n');
    await new Promise<void>((resolve) =>
      tree.root.once('exit', () => resolve()),
    );
    // A Windows libuv job can kill non-detached descendants when their parent exits.
    await poll(() => !alive(tree.child) && !alive(tree.grandchild));
  }, 30000);
});
