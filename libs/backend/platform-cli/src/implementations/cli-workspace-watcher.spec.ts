/**
 * `CliWorkspaceWatcher` (TASK_2026_437 C9). Supervision itself is
 * `WorkspaceWatchSupervisor`, specified in platform-core; this spec covers what
 * the CLI facade adds, against real processes:
 *
 * 1. the host path both `main.mjs` and `tui.mjs` resolve (D7);
 * 2. a missing bundle degrades the watcher without spawning anything;
 * 3. the shared `runWorkspaceWatcherContract` over the REAL entry, bundled the
 *    way the CLI build bundles it (ESM, `createRequire` banner,
 *    `@parcel/watcher` external) and started by the production fork shim —
 *    including the overflow case, driven by killing the host.
 *
 * 4. the host's stderr stays a bounded tail and reaches the failure diagnostic.
 *
 * The real bundle comes from `workspace-watch-host.bundle.harness.ts`.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { killProcessTree } from '@ptah-extension/platform-core';

jest.mock('@ptah-extension/platform-core', () => {
  const actual = jest.requireActual<typeof import('@ptah-extension/platform-core')>(
    '@ptah-extension/platform-core',
  );
  return {
    ...actual,
    // The default query starts PowerShell. Real children in this suite must not do that.
    defaultOrphanCleanupDependencies: {
      ...actual.defaultOrphanCleanupDependencies,
      query: jest.fn(async () => []),
      kill: jest.fn(async () => undefined),
    },
    killProcessTree: jest.fn((...args: Parameters<typeof killProcessTree>) =>
      actual.killProcessTree(...args),
    ),
  };
});

import type {
  WorkspaceChangeBatch,
  WorkspaceWatchHostProcess,
  WorkspaceWatchOptions,
  WorkspaceWatcherDegradation,
  WorkspaceWatcherDiagnostic,
} from '@ptah-extension/platform-core';
import { runWorkspaceWatcherContract } from '@ptah-extension/platform-core/testing';

import {
  buildCliWatchHostBundle,
  type CliWatchHostBundle,
} from '../workspace-watch/workspace-watch-host.bundle.harness';
import {
  CLI_WATCH_HOST_STDERR_TAIL_CHARS,
  CLI_WORKSPACE_WATCH_HOST_BUNDLE,
  CliWorkspaceWatchHostForker,
  CliWorkspaceWatchHostProcess,
  CliWorkspaceWatcher,
  resolveCliWorkspaceWatchHostPath,
} from './cli-workspace-watcher';

/** The live core module, shared with the adapter's own `fork` import. */
const nodeChildProcess =
  jest.requireActual<typeof import('node:child_process')>('node:child_process');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
  predicate: () => boolean,
  what: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(25);
  }
}

const tempRoots: string[] = [];
function makeTempRoot(): string {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-cli-watch-')),
  );
  tempRoots.push(root);
  return root;
}

function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function watchOptions(): WorkspaceWatchOptions {
  return {
    excludeGlobs: [],
    excludeDirNames: [],
    excludeSegmentRules: [],
    nestedRepoDetection: false,
  };
}

afterAll(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('resolveCliWorkspaceWatchHostPath', () => {
  it('puts the host beside the running bundle, the same file for main.mjs and tui.mjs', () => {
    const dist = path.join(path.sep, 'pkg', 'dist', 'apps', 'ptah-cli');
    const expected = path.join(dist, 'workspace-watch-host.mjs');
    expect(CLI_WORKSPACE_WATCH_HOST_BUNDLE).toBe('workspace-watch-host.mjs');
    // Both bundles evaluate `__dirname` to the directory they sit in.
    expect(
      resolveCliWorkspaceWatchHostPath(
        path.dirname(path.join(dist, 'main.mjs')),
      ),
    ).toBe(expected);
    expect(
      resolveCliWorkspaceWatchHostPath(
        path.dirname(path.join(dist, 'tui.mjs')),
      ),
    ).toBe(expected);
  });
});

describe('CliWorkspaceWatcher without a host bundle', () => {
  afterEach(() => jest.restoreAllMocks());

  it('degrades on failed forks without spawning a process, and still delivers overflow', async () => {
    const forkSpy = jest.spyOn(nodeChildProcess, 'fork');
    const degradations: WorkspaceWatcherDegradation[] = [];
    const batches: WorkspaceChangeBatch[] = [];
    const watcher = new CliWorkspaceWatcher({
      hostPath: path.join(makeTempRoot(), CLI_WORKSPACE_WATCH_HOST_BUNDLE),
      supervision: { restartDelayMs: 5 },
      onDegraded: (degradation) => degradations.push(degradation),
    });

    watcher.watch(makeTempRoot(), watchOptions(), (batch) =>
      batches.push(batch),
    );
    await waitFor(() => watcher.isDegraded, 'the degraded watcher');
    await waitFor(() => batches.some((b) => b.overflow), 'an overflow batch');

    expect(forkSpy).not.toHaveBeenCalled();
    expect(degradations).toEqual([
      expect.objectContaining({ reason: 'fork-failed', failuresInWindow: 6 }),
    ]);
    watcher.dispose();
  });

  it('constructing and disposing forks nothing', () => {
    const forkSpy = jest.spyOn(nodeChildProcess, 'fork');
    const watcher = new CliWorkspaceWatcher({
      hostPath: path.join(
        os.tmpdir(),
        'absent',
        CLI_WORKSPACE_WATCH_HOST_BUNDLE,
      ),
    });
    watcher.dispose();
    watcher.dispose();
    expect(forkSpy).not.toHaveBeenCalled();
  });
});

describe('CliWorkspaceWatchHostProcess lifecycle and stderr', () => {
  it.each([
    { name: 'crash', platform: 'win32', code: 13, queryFails: false, killFails: false, queries: 2, kills: 1, errors: 0 },
    { name: 'query failure', platform: 'win32', code: 0, queryFails: true, killFails: false, queries: 1, kills: 0, errors: 1 },
    { name: 'kill failure', platform: 'win32', code: 0, queryFails: false, killFails: true, queries: 2, kills: 1, errors: 1 },
    { name: 'non-Windows', platform: 'linux', code: 0, queryFails: false, killFails: false, queries: 0, kills: 0, errors: 0 },
  ] as const)('watch host spontaneous exit: $name', async ({ platform, code, queryFails, killFails, queries, kills, errors }) => {
    const script = path.join(makeTempRoot(), 'fake.cjs');
    fs.writeFileSync(script, '');
    const fakeChild = Object.assign(new nodeChildProcess.ChildProcess(), {
      pid: 42, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
      channel: null, stderr: null, unref: jest.fn(), kill: jest.fn(() => true),
    });
    const fork = jest.spyOn(nodeChildProcess, 'fork').mockReturnValue(fakeChild);
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    const queryError = new Error('query failed');
    const killError = new Error('kill failed');
    const query = jest.fn(async () => {
      if (queryFails) throw queryError;
      return [{ ProcessId: 43, ParentProcessId: 42, CreationDate: new Date(10_000).toISOString() }];
    });
    const kill = jest.fn(async (_pid: number) => { if (killFails) throw killError; });
    const diagnostics: WorkspaceWatcherDiagnostic[] = [];
    try {
      const host = new CliWorkspaceWatchHostProcess(script, (d) => diagnostics.push(d), query, kill, () => 10_000);
      fakeChild.exitCode = code;
      fakeChild.emit('close', code);
      fakeChild.emit('close', code);
      await new Promise((resolve) => setImmediate(resolve));
      expect(query).toHaveBeenCalledTimes(queries);
      expect(kill).toHaveBeenCalledTimes(kills);
      expect(diagnostics).toHaveLength(errors);
      if (errors) expect(diagnostics[0].detail?.['error']).toBe(queryFails ? queryError : killError);
      host.kill();
      expect(fakeChild.kill).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(process, 'platform', descriptor);
      fork.mockRestore();
    }
  });
  it('cleans only linked descendants after a duplicate Windows close', async () => {
    const script = path.join(makeTempRoot(), 'fake.cjs');
    fs.writeFileSync(script, '');
    const fakeChild = Object.assign(new nodeChildProcess.ChildProcess(), {
      pid: 42, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
      channel: null, stderr: null, unref: jest.fn(), kill: jest.fn(() => true),
    });
    const fork = jest.spyOn(nodeChildProcess, 'fork').mockReturnValue(fakeChild);
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const query = jest.fn(async () => [
      { ProcessId: 43, ParentProcessId: 42, CreationDate: new Date(10_000).toISOString() },
      { ProcessId: 44, ParentProcessId: 1, CreationDate: new Date(10_000).toISOString() },
    ]);
    const kill = jest.fn(async (_pid: number) => undefined);
    try {
      const host = new CliWorkspaceWatchHostProcess(script, undefined, query, kill, () => 10_000);
      fakeChild.exitCode = 0;
      fakeChild.emit('close', 0);
      fakeChild.emit('close', 0);
      await new Promise((resolve) => setImmediate(resolve));
      expect(query).toHaveBeenCalledTimes(2);
      expect(kill).toHaveBeenCalledTimes(1);
      expect(kill).toHaveBeenCalledWith(43);
      host.kill();
      expect(fakeChild.kill).not.toHaveBeenCalled();
    } finally {
      if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
      fork.mockRestore();
    }
  });
  it('excludes a reused PID child created after host exit but before close', async () => {
    const script = path.join(makeTempRoot(), 'fake.cjs');
    fs.writeFileSync(script, '');
    const fakeChild = Object.assign(new nodeChildProcess.ChildProcess(), {
      pid: 42, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
      channel: null, stderr: null, unref: jest.fn(), kill: jest.fn(() => true),
    });
    const fork = jest.spyOn(nodeChildProcess, 'fork').mockReturnValue(fakeChild);
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    let now = 10_000;
    const query = jest.fn(async () => [
      { ProcessId: 43, ParentProcessId: 42, CreationDate: new Date(10_150).toISOString() },
    ]);
    const kill = jest.fn(async (_pid: number) => undefined);
    try {
      const host = new CliWorkspaceWatchHostProcess(script, undefined, query, kill, () => now);
      now = 10_100;
      fakeChild.emit('exit', 0);
      now = 10_200;
      fakeChild.exitCode = 0;
      fakeChild.emit('close', 0);
      await new Promise((resolve) => setImmediate(resolve));
      expect(query).toHaveBeenCalledTimes(1);
      expect(kill).not.toHaveBeenCalled();
      host.kill();
    } finally {
      if (descriptor) Object.defineProperty(process, 'platform', descriptor);
      fork.mockRestore();
    }
  });
  it('waits for the Windows tree stop before killing the root', async () => {
    const script = path.join(makeTempRoot(), 'waiting.cjs');
    fs.writeFileSync(script, '');
    const fakeChild = Object.assign(new nodeChildProcess.ChildProcess(), {
      pid: 42, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
      channel: null, stderr: null, unref: jest.fn(),
      kill: jest.fn(() => true),
    });
    const fork = jest.spyOn(nodeChildProcess, 'fork').mockReturnValue(fakeChild);
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    let finishTree: (() => void) | undefined;
    const reaper = jest.mocked(killProcessTree).mockImplementation(() => new Promise<void>((resolve) => { finishTree = resolve; }));
    const orphanQuery = jest.fn(async () => []);
    try {
      const host = new CliWorkspaceWatchHostProcess(script, undefined,
        orphanQuery, async () => undefined, () => 10_000);
      const exited = new Promise<void>((resolve) => host.on('exit', () => resolve()));
      const rootKill = fakeChild.kill;
      host.kill();
      expect(reaper).toHaveBeenCalledWith(expect.any(Number), 'SIGTERM', expect.any(Function));
      expect(rootKill).not.toHaveBeenCalled();
      finishTree?.();
      await new Promise((resolve) => setImmediate(resolve));
      expect(rootKill).toHaveBeenCalledTimes(1);
      fakeChild.exitCode = 0;
      fakeChild.emit('close', 0);
      await exited;
      await new Promise((resolve) => setImmediate(resolve));
      expect(orphanQuery).not.toHaveBeenCalled();
      const count = reaper.mock.calls.length;
      host.kill();
      expect(reaper).toHaveBeenCalledTimes(count);
    } finally {
      if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
      fork.mockRestore();
      reaper.mockImplementation((...args) => jest.requireActual<typeof import('@ptah-extension/platform-core')>('@ptah-extension/platform-core').killProcessTree(...args));
    }
  });
  it('reports a Windows tree-stop launch failure once and skips a later stop after exit', async () => {
    const dir = makeTempRoot();
    const script = path.join(dir, 'idle.cjs');
    fs.writeFileSync(script, '');
    const fakeChild = Object.assign(new nodeChildProcess.ChildProcess(), {
      pid: 46, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
      channel: null, stderr: null, unref: jest.fn(), kill: jest.fn(() => true),
    });
    const fork = jest.spyOn(nodeChildProcess, 'fork').mockReturnValue(fakeChild);
    const diagnostics: WorkspaceWatcherDiagnostic[] = [];
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    const reaper = jest.mocked(killProcessTree).mockImplementation(async (_pid, _signal, onError) => {
      onError?.(new Error('ENOENT'));
    });
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      const host = new CliWorkspaceWatchHostProcess(script, (d) => diagnostics.push(d));
      host.kill();
      expect(reaper).toHaveBeenCalledWith(expect.any(Number), 'SIGTERM', expect.any(Function));
      await new Promise((resolve) => setImmediate(resolve));
      await waitFor(() => diagnostics.length > 0, 'tree stop error');
      expect(fakeChild.kill).toHaveBeenCalledTimes(1);
      fakeChild.exitCode = 0;
      fakeChild.emit('close', 0);
      host.kill();
      expect(diagnostics).toHaveLength(1);
      expect((diagnostics[0].detail?.['error'] as Error).message).toContain('ENOENT');
    } finally {
      if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
      fork.mockRestore();
      reaper.mockImplementation((...args) => jest.requireActual<typeof import('@ptah-extension/platform-core')>('@ptah-extension/platform-core').killProcessTree(...args));
    }
  });
  it('contains a throwing stop diagnostic sink', async () => {
    const script = path.join(makeTempRoot(), 'throwing-sink.cjs');
    fs.writeFileSync(script, '');
    const fakeChild = Object.assign(new nodeChildProcess.ChildProcess(), {
      pid: 47, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
      channel: null, stderr: null, unref: jest.fn(), kill: jest.fn(() => true),
    });
    const fork = jest.spyOn(nodeChildProcess, 'fork').mockReturnValue(fakeChild);
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const reaper = jest.mocked(killProcessTree).mockImplementation(async (_pid, _signal, onError) => {
      onError?.(new Error('failed reaper'));
    });
    try {
      const host = new CliWorkspaceWatchHostProcess(script, () => { throw new Error('broken sink'); });
      expect(() => host.kill()).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
      expect(fakeChild.kill).toHaveBeenCalledTimes(1);
    } finally {
      if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
      fork.mockRestore();
      reaper.mockImplementation((...args) => jest.requireActual<typeof import('@ptah-extension/platform-core')>('@ptah-extension/platform-core').killProcessTree(...args));
    }
  });
  /** A stand-in host that floods stderr, then dies before it posts anything. */
  function writeCrashingHost(dir: string): string {
    const script = path.join(dir, 'crashing-host.cjs');
    fs.writeFileSync(
      script,
      [
        "process.stderr.write('x'.repeat(200000));",
        "process.stderr.write('\\nnative binding crashed: MARKER\\n', () => process.exit(3));",
      ].join('\n'),
    );
    return script;
  }

  it('keeps only a bounded tail of a large stderr and reports exit after it', async () => {
    const script = writeCrashingHost(makeTempRoot());
    const host = new CliWorkspaceWatchHostProcess(script);
    const exits: Array<number | null> = [];
    host.on('exit', (code) => exits.push(code));

    await waitFor(() => exits.length > 0, 'the host exit');

    expect(exits).toEqual([3]);
    const tail = host.readStderrTail();
    expect(tail.length).toBeLessThanOrEqual(CLI_WATCH_HOST_STDERR_TAIL_CHARS);
    expect(tail.trim().endsWith('native binding crashed: MARKER')).toBe(true);
  });

  it('puts the tail on the failure diagnostic, never logs stderr on its own', async () => {
    const diagnostics: WorkspaceWatcherDiagnostic[] = [];
    const watcher = new CliWorkspaceWatcher({
      hostPath: writeCrashingHost(makeTempRoot()),
      supervision: { restartBudget: 0 },
      onDiagnostic: (d) => diagnostics.push(d),
    });
    watcher.watch(makeTempRoot(), watchOptions(), () => undefined);

    await waitFor(() => watcher.isDegraded, 'the degraded watcher');
    watcher.dispose();

    const mentioning = diagnostics.filter((d) =>
      JSON.stringify(d).includes('MARKER'),
    );
    expect(mentioning).toHaveLength(1);
    expect(mentioning[0].message).toBe('[WorkspaceWatcher] host degraded');
    expect(String(mentioning[0].detail?.['detail']).length).toBeLessThan(1_200);
  });
});

describe('CliWorkspaceWatcher supervising the real forked host', () => {
  const watchers: CliWorkspaceWatcher[] = [];
  const hosts: WorkspaceWatchHostProcess[] = [];
  // Counted, not a boolean: the shared contract subscribes TWICE on the same
  // host, and the protocol acks per subscription. A WeakSet would be satisfied
  // by the first ack, so the second barrier would no-op and we would be back to
  // the guessed sleep this replaced. `workspace-watch-host.stress.harness.ts`
  // makes the same distinction with `hasSubscriptionCount`.
  const subscribeAcks = new WeakMap<WorkspaceWatchHostProcess, number>();
  const awaitedAcks = new WeakMap<WorkspaceWatchHostProcess, number>();

  const awaitNextSubscription = async (label: string): Promise<void> => {
    const host = hosts.at(-1);
    if (host === undefined) throw new Error(`No host to await for ${label}`);
    const expected = (awaitedAcks.get(host) ?? 0) + 1;
    awaitedAcks.set(host, expected);
    await waitFor(() => (subscribeAcks.get(host) ?? 0) >= expected, label);
  };
  let bundle: CliWatchHostBundle | undefined;

  beforeAll(() => {
    bundle = buildCliWatchHostBundle('watcher-spec');
    const fork = CliWorkspaceWatchHostForker.prototype.fork;
    jest
      .spyOn(CliWorkspaceWatchHostForker.prototype, 'fork')
      .mockImplementation(function (this: CliWorkspaceWatchHostForker) {
        const host = fork.call(this);
        hosts.push(host);
        host.on('message', (message: unknown) => {
          if (
            typeof message === 'object' &&
            message !== null &&
            'type' in message &&
            message.type === 'subscribed'
          ) {
            subscribeAcks.set(host, (subscribeAcks.get(host) ?? 0) + 1);
          }
        });
        return host;
      });
  }, 120_000);

  afterAll(() => {
    jest.restoreAllMocks();
    bundle?.dispose();
  });

  runWorkspaceWatcherContract(
    'CliWorkspaceWatcher (child_process.fork host, @parcel/watcher)',
    {
      createWatcher: () => {
        const watcher = new CliWorkspaceWatcher({
          hostPath: bundle?.bundlePath ?? '',
        });
        watchers.push(watcher);
        return watcher;
      },
      createRoot: makeTempRoot,
      writeFile,
      deleteFile: (file) => fs.rmSync(file),
      triggerOverflow: async () => {
        const before = hosts.length;
        hosts[before - 1]?.kill();
        // Wait for the supervised restart and its native re-subscribe, so the
        // contract's post-overflow write lands on a live subscription.
        await waitFor(() => hosts.length > before, 'the restarted host');
        await awaitNextSubscription(
          'the restarted host subscription acknowledgement',
        );
      },
      waitForSubscription: () =>
        awaitNextSubscription('the host subscription acknowledgement'),
      cadenceToleranceMs: 30,
    },
    () => {
      for (const watcher of watchers.splice(0)) watcher.dispose();
      hosts.splice(0);
    },
  );
});
