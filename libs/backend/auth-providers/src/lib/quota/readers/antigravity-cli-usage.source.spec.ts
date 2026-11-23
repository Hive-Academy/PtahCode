import { EventEmitter } from 'node:events';
import type { SpawnOptions } from 'node:child_process';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  ANTIGRAVITY_CLI_ARGS,
  ANTIGRAVITY_CLI_CACHE_MS,
  ANTIGRAVITY_CLI_KILL_BACKOFF_MS,
  ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS,
  ANTIGRAVITY_CLI_MAX_STDOUT_BYTES,
  ANTIGRAVITY_CLI_REFRESH_MIN_GAP_MS,
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
import { ANTIGRAVITY_CHAIN_TIMEOUT_MS } from './antigravity-plan-usage.reader';
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
// A promise tick, not `queueMicrotask`: fake timers replace `queueMicrotask`.
const soon = (run: () => void): void => void Promise.resolve().then(run);
const answer = (body: unknown, code = 0): Behaviour => (child) => soon(() => {
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

  it('does not reuse a parsed error reply as a reading: a refresh runs agy again', async () => {
    jest.useFakeTimers();
    try {
      const { options, spawnProcess } = harness([answer({ num_turns: 0, usage: {}, error: 'quota service down' }, 1),
        answer(antigravityUsageJsonFixture())]);
      expect(await readAntigravityCliUsage(undefined, options())).toMatchObject({ statusReason: 'cli-exit-error' });
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_REFRESH_MIN_GAP_MS + 1);
      expect((await readAntigravityCliUsage(undefined, options({ refresh: true }))).status).toBe('available');
      expect(spawnProcess).toHaveBeenCalledTimes(2);
    } finally { jest.useRealTimers(); }
  });

  it('does not start a run when another run was killed while this read waited for the sign-in check', async () => {
    jest.useFakeTimers();
    try {
      const { options, spawnProcess } = harness([hang, answer(antigravityUsageJsonFixture())]);
      // The first read starts a run. The second read (another owner) reaches its
      // sign-in wait 0.5 s before the kill; the wait ends after the kill.
      const first = readAntigravityCliUsage(undefined, options({ ownerKey: 'antigravity#cli-store:one' }));
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_TIMEOUT_MS - 500);
      const second = readAntigravityCliUsage(undefined, options({ ownerKey: 'antigravity#cli-store:two',
        readSignIn: () => new Promise(() => undefined) }));
      await jest.advanceTimersByTimeAsync(2_000);
      await first;
      expect(await second).toMatchObject({ statusReason: 'cli-timeout' });
      expect(spawnProcess).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });

  it('keeps the failure backoff when the caller stopped waiting before the error reply', async () => {
    let release: (() => void) | undefined;
    const late: Behaviour = (child) => {
      release = () => {
        child.stdout.emit('data', Buffer.from(JSON.stringify({ num_turns: 0, usage: {}, error: 'quota service down' })));
        close(child, 1);
      };
    };
    const { options, spawnProcess } = harness([late, answer(antigravityUsageJsonFixture())]);
    const caller = new AbortController();
    const pending = readAntigravityCliUsage(caller.signal, options());
    for (let i = 0; i < 20 && !release; i++) await new Promise((resolve) => setImmediate(resolve));
    caller.abort();
    await pending;
    release?.();
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
    expect(await readAntigravityCliUsage(undefined, options())).toMatchObject({ statusReason: 'cli-exit-error' });
    expect(spawnProcess).toHaveBeenCalledTimes(1);
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

  describe('a run that outlasts its window', () => {
    const killedRead = async (read: () => Promise<unknown>) => {
      const pending = read();
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_TIMEOUT_MS + 1_000);
      return pending;
    };
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('kills the run after agy own timeout and keeps the source alive', async () => {
      const { options, killTree, spawnProcess } = harness([hang]);
      expect(ANTIGRAVITY_CLI_TIMEOUT_MS).toBeGreaterThan(10_000);
      expect(ANTIGRAVITY_CLI_ARGS).toContain('10s');
      expect(await killedRead(() => readAntigravityCliUsage(undefined, options())))
        .toMatchObject({ statusReason: 'cli-timeout' });
      expect(killTree).toHaveBeenCalledWith(4242);
      // The failed read is held for the kill backoff: no new process.
      expect(await readAntigravityCliUsage(undefined, options()))
        .toMatchObject({ statusReason: 'cli-timeout' });
      expect(spawnProcess).toHaveBeenCalledTimes(1);
    });

    it('retries after the kill backoff and reads the windows', async () => {
      const { options, spawnProcess, logger } = harness([hang, answer(antigravityUsageJsonFixture())]);
      await killedRead(() => readAntigravityCliUsage(undefined, options()));
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_KILL_BACKOFF_MS[0]! + 1);
      const reading = await readAntigravityCliUsage(undefined, options());
      expect(reading.status).toBe('available');
      expect(reading.windows.length).toBeGreaterThan(0);
      expect(spawnProcess).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('killed without billing evidence'),
        expect.anything());
    });

    it('grows the backoff, then disables after the maximum kills in a row', async () => {
      const { options, spawnProcess } = harness([hang]);
      for (let kill = 1; kill <= ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS; kill++) {
        await killedRead(() => readAntigravityCliUsage(undefined, options()));
        expect(spawnProcess).toHaveBeenCalledTimes(kill);
        await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_KILL_BACKOFF_MS[1]! + 1);
      }
      expect(await readAntigravityCliUsage(undefined, options()))
        .toMatchObject({ sourceFailures: [{ cause: 'cli-disabled' }] });
      expect(spawnProcess).toHaveBeenCalledTimes(ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS);
    });

    it('uses the longer backoff after the second kill', async () => {
      const { options, spawnProcess } = harness([hang]);
      await killedRead(() => readAntigravityCliUsage(undefined, options()));
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_KILL_BACKOFF_MS[0]! + 1);
      await killedRead(() => readAntigravityCliUsage(undefined, options()));
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_KILL_BACKOFF_MS[0]! + 1);
      await readAntigravityCliUsage(undefined, options());
      expect(spawnProcess).toHaveBeenCalledTimes(2);
    });

    it('lets a manual refresh retry after the kill-disable, and a good answer re-enables it', async () => {
      const { options, spawnProcess } = harness([hang, hang, hang, answer(antigravityUsageJsonFixture())]);
      for (let kill = 0; kill < ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS; kill++) {
        await killedRead(() => readAntigravityCliUsage(undefined, options({ refresh: true })));
        await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_REFRESH_MIN_GAP_MS + 1);
      }
      expect(await readAntigravityCliUsage(undefined, options()))
        .toMatchObject({ sourceFailures: [{ cause: 'cli-disabled' }] });
      expect(spawnProcess).toHaveBeenCalledTimes(ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS);
      const refreshed = await readAntigravityCliUsage(undefined, options({ refresh: true }));
      expect(refreshed.status).toBe('available');
      expect(spawnProcess).toHaveBeenCalledTimes(ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS + 1);
      // The source works again without a refresh.
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_CACHE_MS + 1);
      expect((await readAntigravityCliUsage(undefined, options())).status).toBe('available');
    });

    it('does not start a refresh run faster than the refresh gap', async () => {
      const { options, spawnProcess } = harness([hang, answer(antigravityUsageJsonFixture())]);
      await killedRead(() => readAntigravityCliUsage(undefined, options()));
      // The gap runs from the end of the killed run: it has not passed yet.
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_REFRESH_MIN_GAP_MS / 2);
      expect(await readAntigravityCliUsage(undefined, options({ refresh: true })))
        .toMatchObject({ statusReason: 'cli-timeout' });
      expect(spawnProcess).toHaveBeenCalledTimes(1);
    });

    it('keeps the kill backoff for a normal read, but a manual refresh passes it', async () => {
      const { options, spawnProcess } = harness([hang, answer(antigravityUsageJsonFixture())]);
      await killedRead(() => readAntigravityCliUsage(undefined, options()));
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_REFRESH_MIN_GAP_MS);
      await readAntigravityCliUsage(undefined, options());
      expect(spawnProcess).toHaveBeenCalledTimes(1);
      expect((await readAntigravityCliUsage(undefined, options({ refresh: true }))).status).toBe('available');
      expect(spawnProcess).toHaveBeenCalledTimes(2);
    });

    it('keeps the kill backoff when the caller stopped waiting before the kill', async () => {
      const { options, spawnProcess } = harness([hang, answer(antigravityUsageJsonFixture())]);
      const caller = new AbortController();
      const pending = readAntigravityCliUsage(caller.signal, options());
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_TIMEOUT_MS - 1_000);
      caller.abort();
      await pending;
      await jest.advanceTimersByTimeAsync(2_000);
      // The run was killed after its caller left; the next read must not spawn at once.
      expect(await readAntigravityCliUsage(undefined, options()))
        .toMatchObject({ statusReason: 'cli-timeout' });
      expect(spawnProcess).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_KILL_BACKOFF_MS[0]! + 1);
      expect((await readAntigravityCliUsage(undefined, options())).status).toBe('available');
    });

    it('does not count a run stopped for too much output as a kill', async () => {
      const flood: Behaviour = (child) => soon(() =>
        child.stdout.emit('data', Buffer.alloc(ANTIGRAVITY_CLI_MAX_STDOUT_BYTES + 1, 'x')));
      const { options, spawnProcess } = harness([flood, flood, flood, flood]);
      for (let run = 0; run < ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS + 1; run++) {
        expect(await readAntigravityCliUsage(undefined, options({ refresh: true })))
          .toMatchObject({ statusReason: 'cli-parse-failed' });
        await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_REFRESH_MIN_GAP_MS + 1);
      }
      expect(spawnProcess).toHaveBeenCalledTimes(ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS + 1);
    });

    it('re-enables the source when a refresh run answers after its caller stopped waiting', async () => {
      const slowGood: Behaviour = (child) => { setTimeout(() => {
        child.stdout.emit('data', Buffer.from(JSON.stringify(antigravityUsageJsonFixture())));
        close(child, 0);
      }, 2_000); };
      const { options, spawnProcess } = harness([hang, hang, hang, slowGood]);
      for (let kill = 0; kill < ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS; kill++) {
        await killedRead(() => readAntigravityCliUsage(undefined, options({ refresh: true })));
        await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_REFRESH_MIN_GAP_MS + 1);
      }
      const caller = new AbortController();
      const pending = readAntigravityCliUsage(caller.signal, options({ refresh: true }));
      await jest.advanceTimersByTimeAsync(500);
      caller.abort();
      await pending;
      await jest.advanceTimersByTimeAsync(2_000);
      // The run settled with a good answer after its caller left: no refresh needed now.
      expect((await readAntigravityCliUsage(undefined, options())).status).toBe('available');
      expect(spawnProcess).toHaveBeenCalledTimes(ANTIGRAVITY_CLI_MAX_CONSECUTIVE_KILLS + 1);
    });

    it('disables for good when the killed run had already shown a model turn', async () => {
      const turnThenHang: Behaviour = (child) => soon(() =>
        child.stdout.emit('data', Buffer.from(JSON.stringify(antigravityUsageJsonFixture({ num_turns: 1 })))));
      const { options, spawnProcess } = harness([turnThenHang, answer(antigravityUsageJsonFixture())]);
      await killedRead(() => readAntigravityCliUsage(undefined, options()));
      await jest.advanceTimersByTimeAsync(ANTIGRAVITY_CLI_REFRESH_MIN_GAP_MS + 1);
      for (const refresh of [false, true])
        expect(await readAntigravityCliUsage(undefined, options({ refresh })))
          .toMatchObject({ sourceFailures: [{ cause: 'cli-disabled' }] });
      expect(spawnProcess).toHaveBeenCalledTimes(1);
    });

    it('a slow first run at app start still answers inside its window, with no kill', async () => {
      const slow: Behaviour = (child) => { setTimeout(() => {
        child.stdout.emit('data', Buffer.from(JSON.stringify(antigravityUsageJsonFixture())));
        close(child, 0);
      }, 9_000); };
      const { options, killTree } = harness([slow]);
      const pending = readAntigravityCliUsage(undefined, options());
      await jest.advanceTimersByTimeAsync(9_500);
      expect((await pending).status).toBe('available');
      expect(killTree).not.toHaveBeenCalled();
    });
  });

  it('keeps the billing trip for a refresh, too', async () => {
    const { options, spawnProcess } = harness([answer(antigravityUsageJsonFixture({ num_turns: 1 }))]);
    await readAntigravityCliUsage(undefined, options());
    expect(await readAntigravityCliUsage(undefined, options({ refresh: true })))
      .toMatchObject({ sourceFailures: [{ cause: 'cli-disabled' }] });
    expect(spawnProcess).toHaveBeenCalledTimes(1);
  });

  it('trips the breaker inside the shared run when its caller stopped waiting', async () => {
    let release: (() => void) | undefined;
    const late: Behaviour = (child) => {
      release = () => {
        child.stdout.emit('data', Buffer.from(JSON.stringify(antigravityUsageJsonFixture({ num_turns: 1 }))));
        close(child, 0);
      };
    };
    const { options, spawnProcess } = harness([late]);
    const caller = new AbortController();
    const pending = readAntigravityCliUsage(caller.signal, options());
    for (let i = 0; i < 20 && !release; i++) await new Promise((resolve) => setImmediate(resolve));
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    caller.abort();
    await pending;
    release?.();
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
    // The billed run settled after its caller left; the breaker is still tripped.
    expect(await readAntigravityCliUsage(undefined, options({ ownerKey: 'antigravity#cli-store:after' })))
      .toMatchObject({ sourceFailures: [{ cause: 'cli-disabled' }] });
    expect(spawnProcess).toHaveBeenCalledTimes(1);
  });

  it('the chain budget leaves the full CLI window after both slower stages time out', () => {
    // Token file and IDE server stages: 3 s each at most; sign-in check 1 s; 250 ms CLI margin.
    expect(ANTIGRAVITY_CHAIN_TIMEOUT_MS - 3_000 - 3_000 - 1_000 - 250).toBeGreaterThanOrEqual(ANTIGRAVITY_CLI_TIMEOUT_MS);
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
