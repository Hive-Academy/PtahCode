import { EventEmitter } from 'node:events';
import type { SpawnOptions } from 'node:child_process';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  ANTIGRAVITY_CLI_ARGS,
  ANTIGRAVITY_CLI_CACHE_MS,
  ANTIGRAVITY_CLI_TIMEOUT_MS,
  antigravityCliCandidates,
  antigravityCliEnv,
  lastJsonObject,
  parseAgyUsageOutput,
  readAntigravityCliUsage,
  resetAntigravityCliUsageForTests,
  type AgySpawn,
  type AntigravityCliUsageOptions,
} from './antigravity-cli-usage.source';
import { FALLBACK_SHORT_BACKOFF_MS } from './fallback-usage.constants';
import { antigravityUsageJsonFixture } from './antigravity-usage.fixture';

type FakeChild = EventEmitter & {
  pid: number | undefined;
  stdout: EventEmitter;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: jest.Mock;
};

function fakeChild(pid: number | undefined): FakeChild {
  const child = Object.assign(new EventEmitter(), {
    pid, stdout: new EventEmitter(),
    exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
    kill: jest.fn(),
  });
  child.kill.mockImplementation(() => close(child, null));
  return child;
}

function close(child: FakeChild, code: number | null): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (code === null) child.signalCode = 'SIGKILL';
  else child.exitCode = code;
  child.emit('exit', code);
  child.emit('close', code);
}

interface Behaviour { (child: FakeChild): void; readonly noPid?: true }
const answer = (body: unknown, code = 0): Behaviour => (child) => queueMicrotask(() => {
  child.stdout.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
  close(child, code);
});
const hang: Behaviour = () => undefined;
const notFound: Behaviour = Object.assign((child: FakeChild) => queueMicrotask(() => {
  child.emit('error', Object.assign(new Error('spawn agy ENOENT'), { code: 'ENOENT' }));
  close(child, -2);
}), { noPid: true as const });

let testIndex = 0;
function harness(behaviours: Behaviour[]) {
  testIndex += 1;
  const logger = createMockLogger();
  const calls: Array<{ executable: string; args: string[]; options: SpawnOptions }> = [];
  const spawnProcess = jest.fn((executable: string, args: string[], options: SpawnOptions) => {
    calls.push({ executable, args, options });
    const behaviour = behaviours[Math.min(calls.length - 1, behaviours.length - 1)];
    const child = fakeChild(behaviour.noPid ? undefined : 4242);
    behaviour(child);
    return child;
  });
  const temporaryCwd = { create: jest.fn(async () => 'fake-agy-usage-cwd'), remove: jest.fn(async () => undefined) };
  const killTree = jest.fn(async () => undefined);
  const options = (more: Partial<AntigravityCliUsageOptions> = {}): AntigravityCliUsageOptions => ({
    ownerKey: `antigravity#cli-store:test-${testIndex}`,
    accountFingerprint: 'antigravity#cli-store:root',
    budgetMs: ANTIGRAVITY_CLI_TIMEOUT_MS + 1_000,
    logger: logger as Partial<Logger> as Logger,
    env: { PATH: '/bin', PTAH_MCP_TOKEN: 'never-forwarded', GEMINI_API_KEY: 'not-forwarded' },
    executables: ['agy'],
    spawnProcess: spawnProcess as unknown as AgySpawn,
    killTree,
    temporaryCwd,
    readSignIn: async () => 'signed-in',
    ...more,
  });
  return { logger, calls, spawnProcess, temporaryCwd, killTree, options };
}

/** The serialized run record the executor hands the parser. */
const run = (body: unknown, exitCode: number | null = 0) =>
  JSON.stringify({ exitCode, stdout: typeof body === 'string' ? body : JSON.stringify(body) });

beforeEach(() => resetAntigravityCliUsageForTests());

describe('parseAgyUsageOutput', () => {
  it('accepts the probe JSON only with exit 0 and the full no-turn proof', () => {
    expect(parseAgyUsageOutput(run(antigravityUsageJsonFixture()), 1)).toMatchObject({ kind: 'windows' });
    expect(parseAgyUsageOutput(run(antigravityUsageJsonFixture(), 1), 1))
      .toEqual({ kind: 'failed', reason: 'cli-exit-error' });
  });

  it('tolerates a banner line before the JSON', () => {
    const stdout = `A new agy version is available\n${JSON.stringify(antigravityUsageJsonFixture(), null, 2)}\n`;
    expect(parseAgyUsageOutput(run(stdout), 1)).toMatchObject({ kind: 'windows' });
    expect(lastJsonObject('note {"a":{"b":1}} tail')).toEqual({ a: { b: 1 } });
  });

  it.each([0, 1, null])('reports billing evidence whatever the exit code (%s)', (exitCode) => {
    expect(parseAgyUsageOutput(run(antigravityUsageJsonFixture({ num_turns: 1 }), exitCode), 1))
      .toEqual({ kind: 'billed' });
    expect(parseAgyUsageOutput(run(antigravityUsageJsonFixture({ usage: { output_tokens: 12 } }), exitCode), 1))
      .toEqual({ kind: 'billed' });
    expect(parseAgyUsageOutput(run(`banner\n${JSON.stringify({ num_turns: 2, usage: {} })}`, exitCode), 1))
      .toEqual({ kind: 'billed' });
  });

  it('does not treat unproven output without billing evidence as billed', () => {
    expect(parseAgyUsageOutput(run('Here is your usage summary'), 1))
      .toEqual({ kind: 'failed', reason: 'cli-parse-failed' });
    expect(parseAgyUsageOutput(run(antigravityUsageJsonFixture({ num_turns: undefined })), 1))
      .toEqual({ kind: 'failed', reason: 'cli-parse-failed' });
    expect(parseAgyUsageOutput(run(antigravityUsageJsonFixture({ command: { name: 'help', data: {} } })), 1))
      .toEqual({ kind: 'failed', reason: 'cli-parse-failed' });
  });

  it('says "not signed in" only when agy JSON reply says so, never from other error text', () => {
    const auth = { num_turns: 0, usage: {}, status: 'error', error: { message: 'Not signed in. Run agy to sign in.' } };
    expect(parseAgyUsageOutput(run(auth, 1), 1)).toEqual({ kind: 'failed', reason: 'cli-not-signed-in' });
    const network = { num_turns: 0, usage: {}, status: 'error', error: 'network unreachable' };
    expect(parseAgyUsageOutput(run(network, 1), 1)).toEqual({ kind: 'failed', reason: 'cli-exit-error' });
    expect(parseAgyUsageOutput(run('Error: please sign in again', 1), 1))
      .toEqual({ kind: 'failed', reason: 'cli-exit-error' });
  });
});

describe('readAntigravityCliUsage', () => {
  it('reads the probe JSON into per-pool windows through a guarded spawn', async () => {
    const { calls, options, temporaryCwd } = harness([answer(antigravityUsageJsonFixture())]);
    const reading = await readAntigravityCliUsage(undefined, options());
    expect(reading).toMatchObject({ status: 'available', windowSetEstablished: true });
    expect(reading.windows.map((window) => window.key)).toEqual([
      'other:cli-gemini-models-five_hour', 'other:cli-gemini-models-weekly',
      'other:cli-claude-and-gpt-models-five_hour', 'other:cli-claude-and-gpt-models-weekly',
    ]);
    expect(calls).toHaveLength(1);
    const [{ executable, args, options: spawnOptions }] = calls;
    expect(executable).toBe('agy');
    expect(args).toEqual(['-p', '/usage', '--output-format', 'json', '--print-timeout', '10s',
      '--model', 'gemini-4-hydrogen-low']);
    expect(args).toEqual([...ANTIGRAVITY_CLI_ARGS]);
    expect(spawnOptions).toMatchObject({ shell: false, cwd: 'fake-agy-usage-cwd',
      stdio: ['ignore', 'pipe', 'ignore'] });
    expect(spawnOptions.env).toEqual({ PATH: '/bin' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(temporaryCwd.remove).toHaveBeenCalledWith('fake-agy-usage-cwd');
  });

  it('falls back to the tab-separated response only when command is absent', async () => {
    const body = antigravityUsageJsonFixture();
    delete body['command'];
    const { options } = harness([answer(body)]);
    const reading = await readAntigravityCliUsage(undefined, options());
    expect(reading.status).toBe('available');
    expect(reading.windows[0]).toMatchObject({ key: 'other:cli-gemini-models-weekly',
      used: { kind: 'percent', percent: 20 } });
  });

  it.each([
    ['a model turn with exit 0', antigravityUsageJsonFixture({ num_turns: 1 }), 0],
    ['a model turn with a non-zero exit', antigravityUsageJsonFixture({ num_turns: 1 }), 3],
    ['a non-zero counter with a non-zero exit', { num_turns: 0, usage: { input_tokens: 40 } }, 1],
  ])('trips the breaker on %s, logging once without the reply', async (_name, body, code) => {
    const { options, calls, logger } = harness([answer(body, code)]);
    expect(await readAntigravityCliUsage(undefined, options())).toMatchObject({
      status: 'service-unavailable', statusReason: 'cli-unavailable',
      sourceFailures: [{ source: 'cli-command', cause: 'cli-guard-rejected' }],
    });
    expect(await readAntigravityCliUsage(undefined, options({ ownerKey: 'antigravity#cli-store:other' })))
      .toMatchObject({ sourceFailures: [{ cause: 'cli-disabled' }] });
    expect(calls).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/Gemini Models|groups|input_tokens/);
  });

  it('does not trip on a clean non-billing error reply, and backs it off', async () => {
    const { options, calls } = harness([answer({ num_turns: 0, usage: {}, error: 'quota service down' }, 1),
      answer(antigravityUsageJsonFixture())]);
    expect(await readAntigravityCliUsage(undefined, options())).toMatchObject({ statusReason: 'cli-exit-error' });
    expect(await readAntigravityCliUsage(undefined, options())).toMatchObject({ statusReason: 'cli-exit-error' });
    expect(calls).toHaveLength(1);
    let clock = Date.now() + FALLBACK_SHORT_BACKOFF_MS + 1;
    expect((await readAntigravityCliUsage(undefined, options({ now: () => clock++ }))).status).toBe('available');
  });

  it('kills a run that outlasts its window and disables the source', async () => {
    jest.useFakeTimers();
    try {
      const { options, calls, killTree } = harness([hang]);
      const pending = readAntigravityCliUsage(undefined, options());
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_TIMEOUT_MS + 1_000);
      expect(await pending).toMatchObject({ statusReason: 'cli-timeout' });
      expect(killTree).toHaveBeenCalledWith(4242);
      expect(await readAntigravityCliUsage(undefined, options({ ownerKey: 'antigravity#cli-store:next' })))
        .toMatchObject({ sourceFailures: [{ cause: 'cli-disabled' }] });
      expect(calls).toHaveLength(1);
    } finally { jest.useRealTimers(); }
  });

  it('defers without spawning when the chain has less than the full window left', async () => {
    const { options, spawnProcess } = harness([answer(antigravityUsageJsonFixture())]);
    expect(await readAntigravityCliUsage(undefined, options({ budgetMs: ANTIGRAVITY_CLI_TIMEOUT_MS - 1 })))
      .toMatchObject({ statusReason: 'usage-budget-exhausted', sourceFailures: [{ cause: 'cli-deferred' }] });
    expect(spawnProcess).not.toHaveBeenCalled();
    // The deferral is not cached: the next request with a full window runs.
    expect(await readAntigravityCliUsage(undefined, options({ budgetMs: ANTIGRAVITY_CLI_TIMEOUT_MS })))
      .toMatchObject({ status: 'available' });
    expect(spawnProcess).toHaveBeenCalledTimes(1);
  });

  it('spawns with the full window, never a squeezed timeout', async () => {
    jest.useFakeTimers();
    try {
      const { options, killTree } = harness([hang]);
      const pending = readAntigravityCliUsage(undefined, options({ budgetMs: ANTIGRAVITY_CLI_TIMEOUT_MS }));
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_TIMEOUT_MS - 100);
      expect(killTree).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1_000);
      expect(await pending).toMatchObject({ statusReason: 'cli-timeout' });
    } finally { jest.useRealTimers(); }
  });

  it('stops only on a confident sign-out; unknown or a failed check runs agy', async () => {
    const { options, spawnProcess } = harness([answer(antigravityUsageJsonFixture())]);
    expect(await readAntigravityCliUsage(undefined, options({ readSignIn: async () => 'signed-out' })))
      .toMatchObject({ statusReason: 'cli-not-signed-in', sourceFailures: [{ cause: 'signed-out' }] });
    expect(spawnProcess).not.toHaveBeenCalled();
    expect((await readAntigravityCliUsage(undefined, options({ ownerKey: 'antigravity#cli-store:u',
      readSignIn: async () => 'unknown' }))).status).toBe('available');
    expect((await readAntigravityCliUsage(undefined, options({ ownerKey: 'antigravity#cli-store:f',
      readSignIn: async () => { throw new Error('cmdkey failed'); } }))).status).toBe('available');
  });

  it('shares one process between concurrent reads and reuses the reading for the same account', async () => {
    let now = 1_000_000;
    const { options, calls } = harness([answer(antigravityUsageJsonFixture())]);
    const shared = options({ now: () => now });
    const [first, second] = await Promise.all([
      readAntigravityCliUsage(undefined, shared), readAntigravityCliUsage(undefined, shared),
    ]);
    expect(first.status).toBe('available');
    expect(second.status).toBe('available');
    now += ANTIGRAVITY_CLI_CACHE_MS - 1;
    expect((await readAntigravityCliUsage(undefined, shared)).fetchedAt).toBe(1_000_000);
    expect(calls).toHaveLength(1);
  });

  it('never serves one account\'s cached reading for another account', async () => {
    const { options, calls } = harness([answer(antigravityUsageJsonFixture())]);
    expect((await readAntigravityCliUsage(undefined, options({ accountFingerprint: 'antigravity#account:a' }))).status)
      .toBe('available');
    expect((await readAntigravityCliUsage(undefined, options({ accountFingerprint: 'antigravity#account:b' }))).status)
      .toBe('available');
    expect(calls).toHaveLength(2);
  });

  it('tries the next candidate when one is missing, and backs off a missing binary', async () => {
    const found = harness([notFound, answer(antigravityUsageJsonFixture())]);
    expect((await readAntigravityCliUsage(undefined, found.options({ executables: ['agy', 'C:/agy/bin/agy.exe'] })))
      .status).toBe('available');
    expect(found.calls.map((call) => call.executable)).toEqual(['agy', 'C:/agy/bin/agy.exe']);
    const missing = harness([notFound]);
    expect(await readAntigravityCliUsage(undefined, missing.options())).toMatchObject({ statusReason: 'cli-not-found' });
    expect(await readAntigravityCliUsage(undefined, missing.options())).toMatchObject({ statusReason: 'cli-not-found' });
    expect(missing.calls).toHaveLength(1);
    expect(missing.logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('disabled'), expect.anything());
    expect(await readAntigravityCliUsage(undefined, missing.options({ executables: [] })))
      .toMatchObject({ statusReason: 'cli-not-found' });
  });
});

describe('agy process inputs', () => {
  it('Windows: the first agy.exe on PATH, then the install directory; a .cmd shim is skipped', () => {
    const files = new Set(['C:\\tools\\agy.exe', 'C:\\Users\\dev\\AppData\\Local\\agy\\bin\\agy.exe']);
    expect(antigravityCliCandidates({ Path: 'C:\\shims;"C:\\tools"', LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' },
      'win32', (path) => files.has(path))).toEqual(['C:\\tools\\agy.exe', 'C:\\Users\\dev\\AppData\\Local\\agy\\bin\\agy.exe']);
    // Only agy.cmd in C:\shims: nothing that runs without a shell.
    expect(antigravityCliCandidates({ PATH: 'C:\\shims' }, 'win32', (path) => path === 'C:\\shims\\agy.cmd')).toEqual([]);
    expect(antigravityCliCandidates({}, 'linux', () => true)).toEqual(['agy']);
  });

  it('forwards only the allow-listed environment, without API keys or ADC', () => {
    expect(antigravityCliEnv({ Path: 'p', SystemRoot: 'C:\\Windows', HOME: '/h',
      PTAH_SESSION_ID: 's', ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: 'k', GOOGLE_API_KEY: 'k',
      GOOGLE_APPLICATION_CREDENTIALS: '/adc.json', GOOGLE_CLOUD_PROJECT: 'p' }))
      .toEqual({ Path: 'p', SystemRoot: 'C:\\Windows', HOME: '/h' });
  });
});
