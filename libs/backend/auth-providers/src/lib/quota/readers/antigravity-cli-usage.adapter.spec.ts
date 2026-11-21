import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  ANTIGRAVITY_CLI_USAGE_ARGS,
  createAntigravityCliUsageReader,
  parseAntigravityCliOutput,
  resetAntigravityCliTurnLatchForTests,
} from './antigravity-cli-usage.adapter';
import type { FallbackExecutor, FallbackProcess } from './fallback-usage.runner';
import { FALLBACK_MAX_OUTPUT_BYTES, FALLBACK_PARSE_BACKOFF_MS } from './fallback-usage.constants';

const USAGE = JSON.stringify({ num_turns: 0, command: { name: 'usage', data: { groups: [
  { name: 'Placeholder Group', buckets: [
    { window: 'weekly', remaining_fraction: 0.6 },
    { window: '5h', remaining_fraction: 0.9 },
  ] },
] } } });
const MODEL_TURN = JSON.stringify({ num_turns: 1, result: 'invented reply', command: { name: 'usage' } });

let serial = 0;
/** The runner cache is module-wide, so each test uses its own account fingerprint. */
function harness(handle: () => FallbackProcess, executable: string | null = '/opt/fake/agy') {
  const start = jest.fn<FallbackProcess, Parameters<FallbackExecutor['start']>>(() => handle());
  const remove = jest.fn(async () => undefined);
  const killTree = jest.fn(async () => undefined);
  const logger = createMockLogger();
  const read = createAntigravityCliUsageReader({
    resolveExecutable: async () => executable ?? undefined, executor: { start },
    temporaryCwd: { create: async () => '/tmp/fake-agy-usage', remove }, killTree,
    logger: logger as Partial<Logger> as Logger,
  });
  const request = (deadline = Date.now() + 5_000) => ({ deadline, ownerKey: 'antigravity#cli-store:fixture',
    accountFingerprint: `fingerprint-${++serial}` });
  return { read, request, start, remove, killTree, logger };
}
function finished(output: Promise<string>): FallbackProcess {
  return { pid: 4242, result: output, closed: Promise.resolve(), kill: jest.fn(), isClosed: () => true };
}

describe('Antigravity CLI usage adapter', () => {
  afterEach(() => resetAntigravityCliTurnLatchForTests());

  it('reads usage windows from a /usage command result in a temporary directory', async () => {
    const h = harness(() => finished(Promise.resolve(USAGE)));
    const result = await h.read(h.request());
    expect(result).toMatchObject({ ok: true, windows: [
      { kind: 'weekly', used: { kind: 'percent', percent: 40 } },
      { kind: 'five_hour', used: { kind: 'percent', percent: 10 } },
    ] });
    expect(h.start).toHaveBeenCalledWith('/opt/fake/agy', ANTIGRAVITY_CLI_USAGE_ARGS, '/tmp/fake-agy-usage');
    expect(h.remove).toHaveBeenCalledWith('/tmp/fake-agy-usage');
  });

  it('rejects a reply that took a model turn and backs off without starting again', async () => {
    const h = harness(() => finished(Promise.resolve(MODEL_TURN)));
    const request = h.request();
    const first = await h.read(request);
    expect(first).toMatchObject({ ok: false, cause: 'cli-model-turn' });
    expect(first.ok === false && first.retryAfter).toBeGreaterThanOrEqual(Date.now() + FALLBACK_PARSE_BACKOFF_MS - 1_000);
    expect(await h.read({ ...request, deadline: Date.now() + 5_000 })).toMatchObject({ ok: false, cause: 'cli-backoff' });
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.logger.warn.mock.calls)).not.toContain('invented reply');
  });

  it('does not replay a cached result the caller discarded', async () => {
    const h = harness(() => finished(Promise.resolve(USAGE)));
    const request = h.request();
    const first = await h.read(request);
    expect(first.ok).toBe(true);
    expect(await h.read({ ...request, deadline: Date.now() + 5_000 })).toMatchObject({ ok: true });
    expect(h.start).toHaveBeenCalledTimes(1);
    if (first.ok) first.discard?.();
    expect(await h.read({ ...request, deadline: Date.now() + 5_000 })).toMatchObject({ ok: true });
    expect(h.start).toHaveBeenCalledTimes(2);
  });

  it('latches CLI usage off for the process after a turn-taking reply', async () => {
    const h = harness(() => finished(Promise.resolve(MODEL_TURN)));
    expect(await h.read(h.request())).toMatchObject({ ok: false, cause: 'cli-model-turn' });
    const later = harness(() => finished(Promise.resolve(USAGE)));
    expect(await later.read(later.request())).toEqual({ ok: false, cause: 'cli-model-turn' });
    expect(later.start).not.toHaveBeenCalled();
    expect(await h.read(h.request())).toEqual({ ok: false, cause: 'cli-model-turn' });
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(h.logger.warn).toHaveBeenCalledTimes(1);
    expect(later.logger.warn).not.toHaveBeenCalled();
  });

  it('keeps a different executable usable after another one latched', async () => {
    const h = harness(() => finished(Promise.resolve(MODEL_TURN)));
    await h.read(h.request());
    const other = harness(() => finished(Promise.resolve(USAGE)), '/opt/other/agy');
    expect(await other.read(other.request())).toMatchObject({ ok: true });
  });

  it('does not latch after a zero-turn reply', async () => {
    const h = harness(() => finished(Promise.resolve(USAGE)));
    expect(await h.read(h.request())).toMatchObject({ ok: true });
    expect(await h.read(h.request())).toMatchObject({ ok: true });
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.logger.warn).not.toHaveBeenCalled();
  });

  it('kills the process tree on timeout and backs off on the next read', async () => {
    let close!: () => void;
    const closed = new Promise<void>((resolve) => { close = resolve; });
    const h = harness(() => ({ pid: 4242, result: new Promise<string>(() => undefined), closed,
      kill: jest.fn(), killTree: async () => { close(); } }));
    h.killTree.mockImplementation(async () => { close(); });
    const request = h.request(Date.now() + 50);
    expect(await h.read(request)).toMatchObject({ ok: false, cause: 'cli-timeout' });
    expect(await h.read({ ...request, deadline: Date.now() + 5_000 })).toMatchObject({ ok: false, cause: 'cli-backoff' });
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it('reports a non-zero exit', async () => {
    const h = harness(() => finished(Promise.reject(Object.assign(new Error('exit'), { code: 2, stderr: 'boom' }))));
    expect(await h.read(h.request())).toMatchObject({ ok: false, cause: 'cli-exit-error' });
  });

  it('rejects oversized output as unparseable', async () => {
    const h = harness(() => finished(Promise.resolve('x'.repeat(FALLBACK_MAX_OUTPUT_BYTES + 1))));
    expect(await h.read(h.request())).toMatchObject({ ok: false, cause: 'cli-parse-failed' });
  });

  it('does not start anything when agy is not on the PATH', async () => {
    const h = harness(() => finished(Promise.resolve(USAGE)), null);
    expect(await h.read(h.request())).toEqual({ ok: false, cause: 'cli-not-found' });
    expect(h.start).not.toHaveBeenCalled();
  });

  it('parses only JSON /usage output', () => {
    expect(parseAntigravityCliOutput('not json', 1)).toBeUndefined();
    expect(parseAntigravityCliOutput(JSON.stringify({ type: 'result', num_turns: 0 }), 1)).toBeUndefined();
    expect(parseAntigravityCliOutput(MODEL_TURN, 1)).toEqual({ kind: 'model-turn' });
    expect(parseAntigravityCliOutput(USAGE, 1)).toMatchObject({ kind: 'usage' });
  });
});

describe('Antigravity CLI usage adapter shared-flight decisions', () => {
  afterEach(() => resetAntigravityCliTurnLatchForTests());
  const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };
  function manual() {
    let reply!: (value: string) => void;
    const result = new Promise<string>((resolve) => { reply = resolve; });
    return { reply, handle: (): FallbackProcess => finished(result) };
  }

  it('latches a model turn whose only waiter cancelled after launch', async () => {
    const run = manual();
    const h = harness(run.handle);
    const controller = new AbortController();
    const cancelled = h.read({ ...h.request(), signal: controller.signal });
    await flush();
    expect(h.start).toHaveBeenCalledTimes(1);
    run.reply(MODEL_TURN);
    controller.abort();
    await expect(cancelled).resolves.toMatchObject({ ok: false });
    await flush();
    const otherOwner = { ...h.request(), ownerKey: 'antigravity#cli-store:another-fixture' };
    expect(await h.read(otherOwner)).toEqual({ ok: false, cause: 'cli-model-turn' });
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it('rejects a run whose store account changed and never caches it', async () => {
    const h = harness(() => finished(Promise.resolve(USAGE)));
    const request = h.request();
    let store = 'switched';
    const currentAccountFingerprint = () => store;
    expect(await h.read({ ...request, currentAccountFingerprint })).toMatchObject({ ok: false, cause: 'account-mismatch' });
    store = request.accountFingerprint;
    expect(await h.read({ ...request, currentAccountFingerprint })).toMatchObject({ ok: true });
    expect(h.start).toHaveBeenCalledTimes(2);
  });

  it('does not cache another account\'s windows when the only waiter cancelled during the run', async () => {
    const run = manual();
    const h = harness(run.handle);
    const request = h.request();
    let store = request.accountFingerprint;
    const currentAccountFingerprint = () => store;
    const controller = new AbortController();
    const cancelled = h.read({ ...request, currentAccountFingerprint, signal: controller.signal });
    await flush();
    store = 'other-account';
    run.reply(USAGE);
    controller.abort();
    await expect(cancelled).resolves.toMatchObject({ ok: false });
    await flush();
    store = request.accountFingerprint;
    h.start.mockImplementation(() => finished(Promise.resolve(USAGE)));
    expect(await h.read({ ...request, currentAccountFingerprint })).toMatchObject({ ok: true });
    expect(h.start).toHaveBeenCalledTimes(2);
  });
});
