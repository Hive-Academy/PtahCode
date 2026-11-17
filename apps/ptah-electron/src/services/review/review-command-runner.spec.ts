import * as childProcess from 'node:child_process';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReviewCommandRunner, ReviewCommandScopeError } from './review-command-runner';

jest.mock('node:child_process', () => {
  const actual = jest.requireActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, spawn: jest.fn() };
});

const repoA = { owner: 'Hive-Academy', name: 'PtahCode' } as const;
const logger = { error: jest.fn() };
const emptyQuery = async () => [];

function mockChild(largeOutput: boolean): childProcess.ChildProcess {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = Object.assign(new childProcess.ChildProcess(), { stdout, stderr });
  jest.spyOn(child, 'kill').mockReturnValue(true);
  queueMicrotask(() => {
    if (largeOutput) stdout.emit('data', Buffer.alloc(1_000_001, 'x'));
    Object.defineProperty(child, 'exitCode', { value: 0, configurable: true });
    child.emit('exit', 0, null);
    child.emit('close', 0, null);
  });
  return child;
}

describe('ReviewCommandRunner', () => {
  it('makes no Windows query when the command exits normally', async () => {
    jest.useFakeTimers();
    const realPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const root = await mkdtemp(join(tmpdir(), 'ptah-review-win-normal-'));
    const checkout = join(root, 'repo');
    const source = join(root, 'attempts', 'claim', 'src');
    await mkdir(checkout);
    await mkdir(source, { recursive: true });
    const child = Object.assign(new childProcess.ChildProcess(), {
      stdout: new PassThrough(), stderr: new PassThrough(),
    });
    Object.defineProperty(child, 'pid', { value: 43215, configurable: true });
    jest.mocked(childProcess.spawn).mockImplementationOnce(() => {
      void Promise.resolve().then(() => {
        child.emit('exit', 0, null);
        child.emit('close', 0, null);
      });
      return child;
    });
    const query = jest.fn(async () => []);
    const clock = jest.fn().mockReturnValueOnce(10_000).mockReturnValueOnce(20_000);
    const runner = new ReviewCommandRunner(
      async () => ({ repoRoot: checkout, attemptsRoot: join(root, 'attempts') }),
      logger, jest.fn(async () => undefined), query, clock);
    try {
      await expect(runner.run(repoA, 'node', ['--version'], source, 100))
        .resolves.toMatchObject({ timedOut: false, exitCode: 0 });
      expect(query).not.toHaveBeenCalled();
      expect(clock).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
      jest.useRealTimers();
      await rm(root, { recursive: true, force: true });
    }
  });
  it.each(['live root', 'exited root'] as const)(
    'settles a Windows %s stop when the CIM query rejects', async (state) => {
      jest.useFakeTimers();
      const realPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const root = await mkdtemp(join(tmpdir(), 'ptah-review-win-stop-'));
      const checkout = join(root, 'repo');
      const source = join(root, 'attempts', 'claim', 'src');
      await mkdir(checkout);
      await mkdir(source, { recursive: true });
      const child = Object.assign(new childProcess.ChildProcess(), {
        stdout: new PassThrough(), stderr: new PassThrough(),
      });
      Object.defineProperty(child, 'pid', { value: 43212, configurable: true });
      let closedPipes = 0;
      for (const pipe of [child.stdout, child.stderr]) pipe.once('close', () => {
        closedPipes += 1;
        if (closedPipes === 2) child.emit('close', 0, null);
      });
      let spawned: () => void = () => undefined;
      const spawnReady = new Promise<void>((resolve) => { spawned = resolve; });
      jest.mocked(childProcess.spawn).mockImplementationOnce(() => { spawned(); return child; });
      const query = jest.fn(async () => { throw new Error('CIM unavailable'); });
      const killTree = jest.fn(async () => undefined);
      const runner = new ReviewCommandRunner(
        async () => ({ repoRoot: checkout, attemptsRoot: join(root, 'attempts') }),
        logger, killTree, query, () => state === 'exited root' ? 20_000 : 10_000);
      try {
        const result = runner.run(repoA, 'node', ['--version'], source, 100);
        await spawnReady;
        if (state === 'exited root') child.emit('exit', 0, null);
        await jest.advanceTimersByTimeAsync(100);
        await expect(result).resolves.toMatchObject({ timedOut: true, exitCode: 0 });
        expect(child.stdout.destroyed).toBe(true);
        expect(child.stderr.destroyed).toBe(true);
        expect(killTree).toHaveBeenCalledTimes(state === 'live root' ? 1 : 0);
        expect(query).toHaveBeenCalledTimes(state === 'live root' ? 0 : 1);
      } finally {
        Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
        jest.useRealTimers();
        await rm(root, { recursive: true, force: true });
      }
    },
  );
  it.each(['verified', 'reused'] as const)(
    'stops only a %s Windows descendant after root exit', async (identity) => {
      jest.useFakeTimers();
      const realPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const root = await mkdtemp(join(tmpdir(), 'ptah-review-win-desc-'));
      const checkout = join(root, 'repo');
      const source = join(root, 'attempts', 'claim', 'src');
      await mkdir(checkout);
      await mkdir(source, { recursive: true });
      const child = Object.assign(new childProcess.ChildProcess(), {
        stdout: new PassThrough(), stderr: new PassThrough(),
      });
      Object.defineProperty(child, 'pid', { value: 43213, configurable: true });
      let closedPipes = 0;
      for (const pipe of [child.stdout, child.stderr]) pipe.once('close', () => {
        closedPipes += 1;
        if (closedPipes === 2) child.emit('close', 0, null);
      });
      let spawned: () => void = () => undefined;
      const spawnReady = new Promise<void>((resolve) => { spawned = resolve; });
      jest.mocked(childProcess.spawn).mockImplementationOnce(() => { spawned(); return child; });
      const row = (pid: number, parent: number, created: number) =>
        ({ ProcessId: pid, ParentProcessId: parent, CreationDate: `/Date(${created})/` });
      const query = jest.fn(async () => [
        row(43213, 1, 15_000),
        row(43214, 43213, identity === 'verified' ? 15_000 : 22_000),
      ]);
      const killTree = jest.fn(async () => undefined);
      const runner = new ReviewCommandRunner(
        async () => ({ repoRoot: checkout, attemptsRoot: join(root, 'attempts') }),
        logger, killTree, query, jest.fn().mockReturnValueOnce(10_000).mockReturnValueOnce(20_000));
      try {
        const result = runner.run(repoA, 'node', ['--version'], source, 100);
        await spawnReady;
        await Promise.resolve();
        child.emit('exit', 0, null);
        await jest.advanceTimersByTimeAsync(100);
        await expect(result).resolves.toMatchObject({ timedOut: true, exitCode: 0 });
        // A selected descendant needs a second identity query before the kill.
        expect(query).toHaveBeenCalledTimes(identity === 'verified' ? 2 : 1);
        expect(killTree).toHaveBeenCalledTimes(identity === 'verified' ? 1 : 0);
        if (identity === 'verified') expect(killTree).toHaveBeenCalledWith(43214, 'SIGTERM', expect.any(Function));
      } finally {
        Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
        jest.useRealTimers();
        await rm(root, { recursive: true, force: true });
      }
    },
  );
  it.each(['timeout', 'abort', 'output cap', 'exited'] as const)(
    '%s uses the tree stop only while the child is live', async (reason) => {
      jest.useFakeTimers();
      const realPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const root = await mkdtemp(join(tmpdir(), 'ptah-review-stop-'));
      const checkout = join(root, 'repo');
      const source = join(root, 'attempts', 'claim', 'src');
      await mkdir(checkout);
      await mkdir(source, { recursive: true });
      const child = Object.assign(new childProcess.ChildProcess(), {
        stdout: new PassThrough(), stderr: new PassThrough(),
      });
      Object.defineProperty(child, 'pid', { value: 43210, configurable: true });
      const directKill = jest.spyOn(child, 'kill').mockReturnValue(true);
      let spawned: () => void = () => undefined;
      const spawnReady = new Promise<void>((resolve) => { spawned = resolve; });
      jest.mocked(childProcess.spawn).mockImplementationOnce(() => { spawned(); return child; });
      const killTree = jest.fn(async () => undefined);
      const controller = new AbortController();
      const runner = new ReviewCommandRunner(
        async () => ({ repoRoot: checkout, attemptsRoot: join(root, 'attempts') }),
        { error: jest.fn() }, killTree, emptyQuery,
      );
      try {
        const result = runner.run(repoA, 'node', ['--version'], source, 100, controller.signal);
        await spawnReady;
        if (reason === 'exited') {
          Object.defineProperty(child, 'exitCode', { value: 0, configurable: true });
          child.emit('exit', 0, null);
          controller.abort();
        } else if (reason === 'timeout') {
          await jest.advanceTimersByTimeAsync(100);
          controller.abort();
        } else if (reason === 'abort') {
          controller.abort();
          controller.abort();
        } else {
          child.stdout.emit('data', Buffer.alloc(1_000_001, 'x'));
          controller.abort();
        }
        child.emit('close', 0, null);
        await expect(result).resolves.toMatchObject({
          exitCode: 0, timedOut: true,
        });
        expect(killTree).toHaveBeenCalledTimes(reason === 'exited' && process.platform === 'win32' ? 0 : 1);
        if (reason !== 'exited' || process.platform !== 'win32')
          expect(killTree).toHaveBeenCalledWith(43210, 'SIGTERM', expect.any(Function),
            { groupOnly: process.platform !== 'win32' });
        expect(directKill).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
        jest.useRealTimers();
        await rm(root, { recursive: true, force: true });
      }
    },
  );
  it('keeps the deadline after leader exit while a descendant holds the pipes', async () => {
    jest.useFakeTimers();
    const root = await mkdtemp(join(tmpdir(), 'ptah-review-inherited-pipe-'));
    const checkout = join(root, 'repo');
    const source = join(root, 'attempts', 'claim', 'src');
    await mkdir(checkout);
    await mkdir(source, { recursive: true });
    const child = Object.assign(new childProcess.ChildProcess(), {
      stdout: new PassThrough(), stderr: new PassThrough(),
    });
    Object.defineProperty(child, 'pid', { value: 43211, configurable: true });
    let spawned: () => void = () => undefined;
    const spawnReady = new Promise<void>((resolve) => { spawned = resolve; });
    jest.mocked(childProcess.spawn).mockImplementationOnce(() => { spawned(); return child; });
    const killTree = jest.fn(async () => undefined);
    try {
      const runner = new ReviewCommandRunner(
        async () => ({ repoRoot: checkout, attemptsRoot: join(root, 'attempts') }), logger, killTree, emptyQuery);
      const result = runner.run(repoA, 'node', ['--version'], source, 100);
      await spawnReady;
      child.emit('exit', 0, null);
      await jest.advanceTimersByTimeAsync(100);
      if (process.platform === 'win32') {
        expect(child.stdout.destroyed).toBe(true);
        expect(child.stderr.destroyed).toBe(true);
      } else {
        expect(killTree).toHaveBeenCalledWith(43211, 'SIGTERM', expect.any(Function), { groupOnly: true });
      }
      child.emit('close', 0, null);
      await expect(result).resolves.toMatchObject({ timedOut: true, exitCode: 0 });
    } finally {
      jest.useRealTimers();
      await rm(root, { recursive: true, force: true });
    }
  });
  it('preserves a UTF-8 filename split between stdout chunks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ptah-review-utf8-'));
    const checkout = join(root, 'repo');
    const attempts = join(root, 'attempts');
    const source = join(attempts, 'claim', 'src');
    await Promise.all([mkdir(checkout), mkdir(source, { recursive: true })]);
    try {
      jest.mocked(childProcess.spawn).mockImplementationOnce(() => {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const child = Object.assign(new childProcess.ChildProcess(), { stdout, stderr });
        jest.spyOn(child, 'kill').mockReturnValue(true);
        queueMicrotask(() => {
          const bytes = Buffer.from('café.ts\0');
          stdout.emit('data', bytes.subarray(0, 4));
          stdout.emit('data', bytes.subarray(4));
          Object.defineProperty(child, 'exitCode', { value: 0, configurable: true });
          child.emit('exit', 0, null);
          child.emit('close', 0, null);
        });
        return child;
      });
      const runner = new ReviewCommandRunner(async () => ({ repoRoot: checkout, attemptsRoot: attempts }), logger, undefined, emptyQuery);
      await expect(runner.run(repoA, 'git', ['ls-files', '-s', '-z'], source, 1_000))
        .resolves.toMatchObject({ stdout: 'café.ts\0', timedOut: false });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  beforeEach(() => {
    jest.mocked(childProcess.spawn).mockImplementation((_command, args) =>
      mockChild(args?.[0] === '-e' || args?.[0] === 'ls-files'));
  });

  afterEach(() => {
    jest.mocked(childProcess.spawn).mockReset();
  });

  it('permits only the exact repository-root maintenance commands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ptah-review-root-commands-'));
    const spawn = jest.mocked(childProcess.spawn);
    try {
      const checkout = join(root, 'repo');
      const outside = join(root, 'outside');
      const attempts = join(root, 'attempts');
      await Promise.all([mkdir(checkout), mkdir(outside), mkdir(attempts)]);
      const runner = new ReviewCommandRunner(async () => ({ repoRoot: checkout, attemptsRoot: attempts }), logger, undefined, emptyQuery);
      const allowed = [
        ['cat-file', '-e', `${'a'.repeat(40)}^{commit}`],
        ['fetch', '--no-tags', 'origin', '+refs/pull/123/head'],
        ['worktree', 'prune'],
        ['worktree', 'list', '--porcelain'],
      ];
      const rejected = [
        ['cat-file', '-e', 'a'.repeat(40)],
        ['cat-file', '-e', `${'a'.repeat(7)}^{commit}`],
        ['cat-file', '-e', `${'g'.repeat(40)}^{commit}`],
        ['fetch', '--no-tags', 'origin', '+refs/heads/main'],
        ['fetch', '--no-tags', 'upstream', '+refs/pull/123/head'],
        ['fetch', '--no-tags', 'origin', '+refs/pull/123/head', '--force'],
        ['fetch', '--no-tags', 'origin', '+refs/pull/0/head'],
        ['fetch', '--no-tags', 'origin', '+refs/pull/1/head:refs/x'],
        ['worktree', 'prune', '--expire', 'now'],
        ['worktree', 'list'],
        ['worktree', 'list', '--porcelain', '-z'],
        ['worktree', 'list', '--verbose'],
        ['status'],
        ['checkout', 'main'],
      ];
      for (const args of allowed) {
        spawn.mockClear();
        await expect(runner.run(repoA, 'git', args, checkout, 1_000))
          .resolves.toMatchObject({ exitCode: 0, timedOut: false });
        expect(spawn).toHaveBeenCalledTimes(1);
      }
      for (const args of rejected) {
        spawn.mockClear();
        await expect(runner.run(repoA, 'git', args, checkout, 1_000))
          .rejects.toBeInstanceOf(ReviewCommandScopeError);
        expect(spawn).not.toHaveBeenCalled();
      }
      for (const args of allowed) {
        spawn.mockClear();
        await expect(runner.run(repoA, 'git', args, outside, 1_000))
          .rejects.toBeInstanceOf(ReviewCommandScopeError);
        expect(spawn).not.toHaveBeenCalled();
      }
    } finally {
      spawn.mockClear();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it('allows the claimed checkout and source, but rejects another checkout and a symlink escape', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ptah-review-command-'));
    try {
      const checkoutA = join(root, 'repo-a');
      const checkoutB = join(root, 'repo-b');
      const attempts = join(root, 'attempts-a');
      const source = join(attempts, 'attempt-1', 'src');
      const outside = join(root, 'outside');
      await Promise.all([mkdir(checkoutA), mkdir(checkoutB), mkdir(source, { recursive: true }), mkdir(outside)]);
      const escape = join(source, 'escape');
      await symlink(outside, escape, process.platform === 'win32' ? 'junction' : 'dir');
      const runner = new ReviewCommandRunner(async (repo) => {
        expect(repo).toEqual(repoA);
        return { repoRoot: checkoutA, attemptsRoot: attempts };
      }, logger, undefined, emptyQuery);

      await expect(runner.run(repoA, 'git', ['worktree', 'add'], checkoutA, 1_000))
        .rejects.toBeInstanceOf(ReviewCommandScopeError);
      await expect(runner.run(repoA, 'git', ['worktree', 'add', '--detach', outside, 'a'.repeat(40)], checkoutA, 1_000))
        .rejects.toBeInstanceOf(ReviewCommandScopeError);
      await expect(runner.run(repoA, 'git', ['worktree', 'add', '--detach', join(root, 'outside', 'src'), 'a'.repeat(40)], checkoutA, 1_000))
        .rejects.toBeInstanceOf(ReviewCommandScopeError);
      await expect(runner.run(repoA, 'node', ['--version'], source, 10_000))
        .resolves.toEqual(expect.objectContaining({ timedOut: false }));
      await expect(runner.run(repoA, 'node', ['-e', "process.stdout.write('x'.repeat(1_000_001))"], source, 5_000))
        .resolves.toEqual(expect.objectContaining({ timedOut: true }));
      await expect(runner.run(repoA, 'git', ['ls-files', '-s', '-z'], source, 5_000))
        .resolves.toEqual(expect.objectContaining({ timedOut: false, stdout: expect.stringMatching(/^x+$/) }));
      await expect(runner.run(repoA, 'git', ['worktree', 'add'], checkoutB, 1_000))
        .rejects.toMatchObject({ code: 'review-command-cwd-outside-roots' });
      await expect(runner.run(repoA, 'node', ['--version'], escape, 1_000))
        .rejects.toBeInstanceOf(ReviewCommandScopeError);
      await expect(runner.run(repoA, 'node', ['--version'], root, 1_000))
        .rejects.toBeInstanceOf(ReviewCommandScopeError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
  it('rechecks real paths and claim roots on every command', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ptah-review-recheck-'));
    const checkout = join(root, 'repo');
    const attempts = join(root, 'attempts');
    const source = join(attempts, 'claim', 'src');
    await mkdir(checkout);
    await mkdir(source, { recursive: true });
    const roots = jest.fn(async () => ({ repoRoot: checkout, attemptsRoot: attempts }));
    try {
      const runner = new ReviewCommandRunner(roots, logger, undefined, emptyQuery);
      await expect(runner.run(repoA, 'node', ['--version'], source, 10_000))
        .resolves.toMatchObject({ timedOut: false });
      await rm(source, { recursive: true });
      await expect(runner.run(repoA, 'node', ['--version'], source, 10_000))
        .rejects.toBeInstanceOf(ReviewCommandScopeError);
      expect(roots).toHaveBeenCalledTimes(2);
    } finally { await rm(root, { recursive: true, force: true }); }
  });});
