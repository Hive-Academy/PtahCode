/**
 * Unit tests for CliPlatformCommands.
 *
 * The CLI has no window / terminal / chat UI, so every command is a no-op.
 * Critically, NONE of them may write to stdout (it carries the JSON-RPC NDJSON
 * machine stream); --verbose breadcrumbs go to stderr.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import spawn from 'cross-spawn';

jest.mock('cross-spawn', () => jest.fn(jest.requireActual('cross-spawn')));
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

import { MESSAGE_TYPES } from '@ptah-extension/shared';
import type {
  AuthDeviceCodePayload,
  AuthLoginOutputPayload,
} from '@ptah-extension/shared';

import { CliPlatformCommands } from './cli-platform-commands.js';
import type { AuthCommandPushSink } from './cli-platform-commands.js';

/** Records every push so assertions can read the emitted event stream. */
function makeRecordingSink(): AuthCommandPushSink & {
  events: Array<{ type: string; payload: unknown }>;
} {
  const events: Array<{ type: string; payload: unknown }> = [];
  return {
    events,
    broadcastMessage: async (type, payload) => {
      events.push({ type, payload });
    },
  };
}

/**
 * Materialise a script file and return the `node <path>` command line.
 *
 * `runAuthCommand` splits the command on whitespace (adequate for its only
 * caller, `codex login --device-auth`), so the command must not contain quoted
 * or space-bearing arguments — hence a file rather than `node -e "..."`, and
 * `node` from PATH rather than `process.execPath`, which on Windows lives
 * under `C:\Program Files\`.
 */
function nodeScript(dir: string, name: string, source: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, source, 'utf8');
  return `node ${file}`;
}

describe('CliPlatformCommands', () => {
  // The six `runAuthCommand` specs below each SPAWN A REAL `node` child process
  // and wait for it to exit. That is the point of them — `runAuthCommand` exists
  // because `auth:codexLogin` reported success while `openTerminal` did nothing,
  // so a mocked `child_process` would assert the bug back into place. The cost is
  // process creation plus a cold Node runtime start, per spec, and on Windows
  // that is the expensive direction; under `--coverage` with several Nx projects
  // in parallel it overruns Jest's 5 s default. Measured 2026-09-07: the file
  // took 55.3 s at `--parallel=4` and `pushes child output as auth:loginOutput
  // and never writes to stdout` crossed the ceiling first. Which of the six
  // crosses first is a property of the host, not of the spec, so the ceiling is
  // raised for the file rather than for that one test.
  //
  // Raised again 2026-09-08. The 30 s ceiling was calibrated against a 55.3 s
  // file at `--parallel=4`; the GitHub runner ran the same file in 140.33 s at
  // `--parallel=3` with coverage, and `extracts a device code and verification
  // URL from the output` crossed first — a different one of the six, which is
  // the property this comment already names. Every cli-engine suite on that run
  // took 114-250 s, so the host, not the spec, moved. 120 s is deliberately far
  // above the observed per-spec cost: a fourth calibration round is worth more
  // than the seconds a tighter bound would save, and no spec here asserts a
  // duration, so a generous ceiling forfeits no signal.
  //
  // `jest.setTimeout` is file-scoped from the point it runs, and every describe
  // body runs during collection — placing it here rather than in the inner
  // describe is what the scope actually is.
  jest.setTimeout(120_000);

  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('never writes to stdout or console.log (default)', async () => {
    const cmds = new CliPlatformCommands();
    await cmds.reloadWindow();
    cmds.openTerminal('name', 'echo hi');
    await cmds.focusChat();

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('emits breadcrumbs to stderr (never stdout) when verbose', async () => {
    const cmds = new CliPlatformCommands({ verbose: true });
    await cmds.reloadWindow();
    cmds.openTerminal('name', 'echo hi');
    await cmds.focusChat();

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledTimes(3);
    const written = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(written[0]).toContain('reloadWindow');
    expect(written[1]).toContain('openTerminal');
    expect(written[2]).toContain('focusChat');
  });

  /**
   * `runAuthCommand` is the fix for `auth:codexLogin` reporting success while
   * `openTerminal` did nothing. The contract that matters:
   *   - the command actually runs,
   *   - `success` tracks the real exit status (never optimistic),
   *   - a missing binary is a reported failure, not a throw,
   *   - output reaches the UI as push events instead of the real stdout,
   *     which the TUI owns.
   */
  describe('runAuthCommand', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-auth-cmd-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('is detectable as the IAuthCommandRunner capability', () => {
      const cmds = new CliPlatformCommands();
      expect(typeof cmds.runAuthCommand).toBe('function');
    });

    it('reports success only when the process exits 0', async () => {
      const cmds = new CliPlatformCommands();
      const result = await cmds.runAuthCommand({
        provider: 'openai-codex',
        name: 'Codex Login',
        command: nodeScript(tmpDir, 'ok.js', 'process.exit(0);'),
      });

      expect(result).toEqual({ success: true, exitCode: 0 });
    });

    it('reports failure with the real exit code (never optimistic success)', async () => {
      const cmds = new CliPlatformCommands();
      const result = await cmds.runAuthCommand({
        provider: 'openai-codex',
        name: 'Codex Login',
        command: nodeScript(tmpDir, 'fail.js', 'process.exit(7);'),
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(7);
      expect(result.error).toContain('7');
    });

    it('reports a missing binary as a failure instead of throwing', async () => {
      const cmds = new CliPlatformCommands();
      const result = await cmds.runAuthCommand({
        provider: 'openai-codex',
        name: 'Codex Login',
        command: 'ptah-definitely-not-a-real-binary --device-auth',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('PATH');
    });

    it('rejects an empty command without spawning', async () => {
      const cmds = new CliPlatformCommands();
      const result = await cmds.runAuthCommand({
        provider: 'openai-codex',
        name: 'Codex Login',
        command: '   ',
      });

      expect(result).toEqual({
        success: false,
        exitCode: null,
        error: 'Empty auth command.',
      });
    });

    it('pushes child output as auth:loginOutput and never writes to stdout', async () => {
      const sink = makeRecordingSink();
      const cmds = new CliPlatformCommands({ pushSink: sink });

      await cmds.runAuthCommand({
        provider: 'openai-codex',
        name: 'Codex Login',
        command: nodeScript(
          tmpDir,
          'chatty.js',
          'console.log("hello");console.error("oops");',
        ),
      });

      const output = sink.events
        .filter((e) => e.type === MESSAGE_TYPES.AUTH_LOGIN_OUTPUT)
        .map((e) => e.payload as AuthLoginOutputPayload);

      expect(output.map((o) => o.line)).toEqual(
        expect.arrayContaining(['hello', 'oops']),
      );
      expect(output.every((o) => o.provider === 'openai-codex')).toBe(true);
      expect(output.some((o) => o.stream === 'stderr')).toBe(true);
      // stdout belongs to the Ink frame — the child must never reach it.
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('extracts a device code and verification URL from the output', async () => {
      const sink = makeRecordingSink();
      const cmds = new CliPlatformCommands({ pushSink: sink });

      await cmds.runAuthCommand({
        provider: 'openai-codex',
        name: 'Codex Login',
        command: nodeScript(
          tmpDir,
          'device.js',
          'console.log("Enter code ABCD-1234 at https://auth.example.com/device");',
        ),
      });

      const device = sink.events
        .filter((e) => e.type === MESSAGE_TYPES.AUTH_DEVICE_CODE)
        .map((e) => e.payload as AuthDeviceCodePayload);

      expect(device).toHaveLength(1);
      expect(device[0]?.userCode).toBe('ABCD-1234');
      expect(device[0]?.verificationUri).toBe(
        'https://auth.example.com/device',
      );
    });

    it('emits no device-code event for ordinary output lines', async () => {
      const sink = makeRecordingSink();
      const cmds = new CliPlatformCommands({ pushSink: sink });

      await cmds.runAuthCommand({
        provider: 'openai-codex',
        name: 'Codex Login',
        command: nodeScript(tmpDir, 'plain.js', 'console.log("working...");'),
      });

      expect(
        sink.events.filter((e) => e.type === MESSAGE_TYPES.AUTH_DEVICE_CODE),
      ).toHaveLength(0);
    });

    it('kills and reports a command that outlives the timeout', async () => {
      const cmds = new CliPlatformCommands({ authCommandTimeoutMs: 150 });
      const result = await cmds.runAuthCommand({
        provider: 'openai-codex',
        name: 'Codex Login',
        command: nodeScript(
          tmpDir,
          'hang.js',
          'setTimeout(() => process.exit(0), 60000);',
        ),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('requests a Windows tree stop and reports a launch failure', async () => {
      const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
      const fakeChild = Object.assign(new ChildProcess(), {
        pid: 45, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
        stdout: new PassThrough(), stderr: new PassThrough(), kill: jest.fn(() => true),
      });
      jest.mocked(spawn).mockImplementationOnce(() => fakeChild);
      const reaper = jest.mocked(killProcessTree).mockImplementation(async (_pid, _signal, onError) => {
        onError?.(new Error('ENOENT'));
      });
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const orphanQuery = jest.fn(async () => []);
      try {
        const cmds = new CliPlatformCommands({ authCommandTimeoutMs: 5, processQuery: orphanQuery });
        const result = await cmds.runAuthCommand({
          provider: 'openai-codex', name: 'Codex Login',
          command: 'fake-login',
        });
        expect(result.error).toContain('timed out');
        expect(reaper).toHaveBeenCalledWith(expect.any(Number), 'SIGTERM', expect.any(Function));
        await new Promise((resolve) => setImmediate(resolve));
        expect(stderrSpy.mock.calls.some((call) => String(call[0]).includes('tree stop failed'))).toBe(true);
        expect(fakeChild.kill).toHaveBeenCalledTimes(1);
        fakeChild.emit('close', null);
        await new Promise((resolve) => setImmediate(resolve));
        expect(orphanQuery).not.toHaveBeenCalled();
      } finally {
        if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
        reaper.mockImplementation((...args) => jest.requireActual<typeof import('@ptah-extension/platform-core')>('@ptah-extension/platform-core').killProcessTree(...args));
      }
    });

    it('waits for Windows tree termination before the root fallback', async () => {
      const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const fakeChild = Object.assign(new ChildProcess(), {
        pid: 42, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
        stdout: new PassThrough(), stderr: new PassThrough(), kill: jest.fn(() => true),
      });
      jest.mocked(spawn).mockImplementationOnce(() => fakeChild);
      let finishTree: (() => void) | undefined;
      const reaper = jest.mocked(killProcessTree).mockImplementation(() => new Promise<void>((resolve) => { finishTree = resolve; }));
      try {
        const cmds = new CliPlatformCommands({ authCommandTimeoutMs: 5 });
        const result = await cmds.runAuthCommand({ provider: 'openai-codex', name: 'Login', command: 'fake-login' });
        expect(result.error).toContain('timed out');
        expect(reaper).toHaveBeenCalledWith(42, 'SIGTERM', expect.any(Function));
        expect(fakeChild.kill).not.toHaveBeenCalled();
        finishTree?.();
        await new Promise((resolve) => setImmediate(resolve));
        expect(fakeChild.kill).toHaveBeenCalledTimes(1);
        const exitedChild = Object.assign(new ChildProcess(), {
          pid: 43, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
          stdout: new PassThrough(), stderr: new PassThrough(), kill: jest.fn(() => true),
        });
        jest.mocked(spawn).mockImplementationOnce(() => exitedChild);
        const second = cmds.runAuthCommand({ provider: 'openai-codex', name: 'Login', command: 'fake-login' });
        await second;
        exitedChild.exitCode = 0;
        finishTree?.();
        await new Promise((resolve) => setImmediate(resolve));
        expect(exitedChild.kill).not.toHaveBeenCalled();
        const completedChild = Object.assign(new ChildProcess(), {
          pid: 44, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
          stdout: new PassThrough(), stderr: new PassThrough(), kill: jest.fn(() => true),
        });
        jest.mocked(spawn).mockImplementationOnce(() => completedChild);
        const count = reaper.mock.calls.length;
        const completed = cmds.runAuthCommand({ provider: 'openai-codex', name: 'Login', command: 'fake-login' });
        completedChild.exitCode = 0;
        completedChild.emit('close', 0);
        await completed;
        expect(reaper).toHaveBeenCalledTimes(count);
      } finally {
        if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
        reaper.mockImplementation((...args) => jest.requireActual<typeof import('@ptah-extension/platform-core')>('@ptah-extension/platform-core').killProcessTree(...args));
      }
    });

    it('cleans linked descendants once after a successful Windows close', async () => {
      const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const fakeChild = Object.assign(new ChildProcess(), {
        pid: 42, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
        stdout: new PassThrough(), stderr: new PassThrough(), kill: jest.fn(() => true),
      });
      jest.mocked(spawn).mockImplementationOnce(() => fakeChild);
      const query = jest.fn(async () => [
        { ProcessId: 43, ParentProcessId: 42, CreationDate: new Date(10_000).toISOString() },
        { ProcessId: 44, ParentProcessId: 1, CreationDate: new Date(10_000).toISOString() },
      ]);
      const kill = jest.fn(async (_pid: number) => undefined);
      try {
        const cmds = new CliPlatformCommands({ processQuery: query, killOrphan: kill, now: () => 10_000 });
        const result = cmds.runAuthCommand({ provider: 'openai-codex', name: 'Login', command: 'fake-login' });
        fakeChild.exitCode = 0;
        fakeChild.emit('close', 0);
        fakeChild.emit('close', 0);
        expect((await result).success).toBe(true);
        await new Promise((resolve) => setImmediate(resolve));
        expect(query).toHaveBeenCalledTimes(2);
        expect(kill).toHaveBeenCalledTimes(1);
        expect(kill).toHaveBeenCalledWith(43);
      } finally {
        if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
      }
    });

    it.each([
      { name: 'crash', platform: 'win32', code: 12, queryFails: false, killFails: false, queries: 2, kills: 1, reports: 0 },
      { name: 'query failure', platform: 'win32', code: 0, queryFails: true, killFails: false, queries: 1, kills: 0, reports: 1 },
      { name: 'kill failure', platform: 'win32', code: 0, queryFails: false, killFails: true, queries: 2, kills: 1, reports: 1 },
      { name: 'non-Windows', platform: 'linux', code: 0, queryFails: false, killFails: false, queries: 0, kills: 0, reports: 0 },
    ] as const)('auth command close: $name', async ({ platform, code, queryFails, killFails, queries, kills, reports }) => {
      const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: platform, configurable: true });
      const fakeChild = Object.assign(new ChildProcess(), {
        pid: 42, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
        stdout: new PassThrough(), stderr: new PassThrough(), kill: jest.fn(() => true),
      });
      jest.mocked(spawn).mockImplementationOnce(() => fakeChild);
      const queryError = new Error('query failed');
      const killError = new Error('kill failed');
      const query = jest.fn(async () => {
        if (queryFails) throw queryError;
        return [{ ProcessId: 43, ParentProcessId: 42, CreationDate: new Date(10_000).toISOString() }];
      });
      const kill = jest.fn(async (_pid: number) => { if (killFails) throw killError; });
      try {
        const cmds = new CliPlatformCommands({ processQuery: query, killOrphan: kill, now: () => 10_000 });
        const result = cmds.runAuthCommand({ provider: 'openai-codex', name: 'Login', command: 'fake-login' });
        fakeChild.exitCode = code;
        fakeChild.emit('close', code);
        fakeChild.emit('close', code);
        expect((await result).success).toBe(code === 0);
        await new Promise((resolve) => setImmediate(resolve));
        expect(query).toHaveBeenCalledTimes(queries);
        expect(kill).toHaveBeenCalledTimes(kills);
        const failures = stderrSpy.mock.calls.filter((call) => String(call[0]).includes('orphan cleanup failed'));
        expect(failures).toHaveLength(reports);
        if (reports) expect(String(failures[0][0])).toContain(queryFails ? queryError.message : killError.message);
      } finally {
        if (descriptor) Object.defineProperty(process, 'platform', descriptor);
      }
    });

    it('runs and reports normally when no push sink is configured', async () => {
      const cmds = new CliPlatformCommands();
      const result = await cmds.runAuthCommand({
        provider: 'openai-codex',
        name: 'Codex Login',
        command: nodeScript(tmpDir, 'quiet.js', 'console.log("hi");'),
      });

      expect(result.success).toBe(true);
    });
  });
});
