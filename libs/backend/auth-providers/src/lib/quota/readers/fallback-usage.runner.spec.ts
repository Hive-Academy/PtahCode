import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createNodeFallbackExecutor, runFallbackUsage, type FallbackExecutor, type FallbackProcess } from './fallback-usage.runner';
import { FALLBACK_PARSE_BACKOFF_MS, FALLBACK_SHORT_BACKOFF_MS } from './fallback-usage.constants';

let serial = 0;
function harness() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  let close!: () => void;
  const kill = jest.fn();
  const killTree = jest.fn(async () => { close(); });
  const result = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  const closed = new Promise<void>((yes) => { close = yes; });
  const child: FallbackProcess = { pid: 42, result, closed, kill, killTree };
  const executor: FallbackExecutor = { start: jest.fn(() => child) };
  const run = (overrides: Partial<Parameters<typeof runFallbackUsage<string>>[0]> = {}) =>
    runFallbackUsage({ sourceId: `fake-${++serial}`, ownerKey: '<user>',
      executable: 'fake', version: 'v1', accountFingerprint: '<account>', args: ['-p', '/usage'],
      executor, parse: (text) => text === 'valid' ? text : undefined, ...overrides });
  return { run, resolve, reject, kill, killTree, executor };
}

describe('fallback runner', () => {
  afterEach(() => jest.useRealTimers());
  it('releases a flight after close grace and removes cwd only on actual close', async () => {
    jest.useFakeTimers();
    let close!: () => void;
    const closed = new Promise<void>((resolve) => { close = resolve; });
    const remove = jest.fn(async () => undefined);
    const firstHandle: FallbackProcess = { result: Promise.resolve('valid'), closed,
      kill: jest.fn(), killTree: jest.fn(async () => undefined) };
    const nextHandle: FallbackProcess = { result: Promise.resolve('valid'), closed: Promise.resolve(),
      kill: jest.fn(), isClosed: () => true };
    const executor: FallbackExecutor = { start: jest.fn()
      .mockReturnValueOnce(firstHandle).mockReturnValueOnce(nextHandle) };
    const sourceId = `never-close-${++serial}`;
    const request = { sourceId, ownerKey: 'owner', executable: 'first', version: 'v1',
      accountFingerprint: 'placeholder', args: [], executor, parse: (value: string) => value,
      temporaryCwd: { create: async () => 'temporary', remove } };
    const first = runFallbackUsage(request);
    await jest.advanceTimersByTimeAsync(500);
    await expect(first).resolves.toMatchObject({ ok: true });
    expect(remove).not.toHaveBeenCalled();
    const second = runFallbackUsage({ ...request, executable: 'second' });
    await expect(second).resolves.toMatchObject({ ok: true });
    expect(executor.start).toHaveBeenCalledTimes(2);
    close();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('keeps a joined flight when its first caller aborts during cwd creation', async () => {
    let finishCreate!: (cwd: string) => void;
    const created = new Promise<string>((resolve) => { finishCreate = resolve; });
    const controller = new AbortController();
    const start = jest.fn((): FallbackProcess => ({ result: Promise.resolve('valid'),
      closed: Promise.resolve(), kill: jest.fn(), isClosed: () => true }));
    const request = { sourceId: `shared-create-${++serial}`, ownerKey: 'owner', executable: 'fake',
      version: 'v1', accountFingerprint: 'placeholder', args: [], executor: { start },
      parse: (value: string) => value, temporaryCwd: { create: () => created,
        remove: async () => undefined } };
    const first = runFallbackUsage({ ...request, signal: controller.signal });
    const joined = runFallbackUsage(request);
    controller.abort();
    await expect(first).resolves.toMatchObject({ reason: 'cli-unavailable' });
    finishCreate('temporary');
    await expect(joined).resolves.toMatchObject({ ok: true, value: 'valid' });
    expect(start).toHaveBeenCalledTimes(1);
    await expect(runFallbackUsage(request)).resolves.toMatchObject({ ok: true });
  });
  it('times out a stuck cwd creation and removes the late directory', async () => {
    jest.useFakeTimers();
    let finishCreate!: (cwd: string) => void;
    const created = new Promise<string>((resolve) => { finishCreate = resolve; });
    const remove = jest.fn(async () => undefined);
    const start = jest.fn();
    const pending = runFallbackUsage({ sourceId: `stuck-create-${++serial}`, ownerKey: 'owner',
      executable: 'fake', version: 'v1', accountFingerprint: 'placeholder', args: [],
      executor: { start }, parse: (value: string) => value, timeoutMs: 1_000,
      temporaryCwd: { create: () => created, remove } });
    await jest.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'cli-timeout' });
    expect(start).not.toHaveBeenCalled();
    finishCreate('late');
    await jest.advanceTimersByTimeAsync(0);
    expect(remove).toHaveBeenCalledWith('late');
  });
  it('does not start an executor after the deadline', async () => {
    const h = harness();
    await expect(h.run({ deadline: 100, now: () => 101 })).resolves.toMatchObject({ reason: 'cli-timeout' });
    expect(h.executor.start).not.toHaveBeenCalled();
  });
  it('kills and reaps a timed out process', async () => {
    jest.useFakeTimers();
    const h = harness();
    const pending = h.run();
    await jest.advanceTimersByTimeAsync(8_000);
    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'cli-timeout' });
    expect(h.kill).toHaveBeenCalledTimes(1);
    expect(h.killTree).toHaveBeenCalledTimes(1);
  });
  it('reaps after an early exit', async () => {
    const h = harness();
    const pending = h.run();
    h.reject(Object.assign(new Error('exit'), { code: 1 }));
    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'cli-exit-error' });
    expect(h.killTree).toHaveBeenCalledTimes(1);
  });
  it('disposes the handle and reaps on oversized output', async () => {
    const h = harness();
    const dispose = jest.fn();
    const start = h.executor.start;
    const executor: FallbackExecutor = { start: (exe, args) => ({ ...start(exe, args), dispose }) };
    const pending = h.run({ executor });
    h.resolve('x'.repeat(64 * 1024 + 1));
    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'cli-parse-failed' });
    expect(h.killTree).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
  it('reports a spawn error without holding a gate', async () => {
    const h = harness();
    const sourceId = `spawn-${++serial}`;
    const broken: FallbackExecutor = { start: () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); } };
    await expect(h.run({ sourceId, executor: broken })).resolves.toMatchObject({ reason: 'cli-not-found' });
    const next = h.run({ sourceId });
    h.resolve('valid');
    await expect(next).resolves.toMatchObject({ ok: true });
  });
  it('never logs output or owner information', async () => {
    const h = harness();
    const warn = jest.fn();
    const debug = jest.fn();
    const pending = h.run({ logger: { warn, debug } as never, ownerKey: '<secret-owner>' });
    h.resolve('secret-output');
    await pending;
    const logged = JSON.stringify([...warn.mock.calls, ...debug.mock.calls]);
    expect(logged).not.toContain('secret-output');
    expect(logged).not.toContain('<secret-owner>');
  });
  it('separates caller abort from the shared run', async () => {
    const h = harness();
    const controller = new AbortController();
    const opts = { sourceId: `shared-${++serial}` };
    const first = h.run({ ...opts, signal: controller.signal });
    const second = h.run(opts);
    controller.abort();
    await expect(first).resolves.toMatchObject({ ok: false, reason: 'cli-unavailable' });
    expect(h.kill).not.toHaveBeenCalled();
    h.resolve('valid');
    await expect(second).resolves.toMatchObject({ ok: true, value: 'valid' });
    expect(h.executor.start).toHaveBeenCalledTimes(1);
  });
  it('reaps an explicitly aborted run', async () => {
    const h = harness();
    const runController = new AbortController();
    const pending = h.run({ runSignal: runController.signal });
    runController.abort();
    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'cli-unavailable' });
    expect(h.killTree).toHaveBeenCalledTimes(1);
  });
  it('keeps readAt on cache hits', async () => {
    const h = harness();
    const opts = { sourceId: `cache-${++serial}`, now: () => 100 };
    const first = h.run(opts);
    h.resolve('valid');
    const answer = await first;
    expect(await h.run({ ...opts, now: () => 101 })).toEqual(answer);
  });
  it('backs off parse and exit failures for their respective durations', async () => {
    for (const [output, reason, duration] of [
      ['bad', 'cli-parse-failed', FALLBACK_PARSE_BACKOFF_MS],
      ['exit', 'cli-exit-error', FALLBACK_SHORT_BACKOFF_MS],
    ] as const) {
      const h = harness();
      const opts = { sourceId: `backoff-${++serial}`, now: () => 10 };
      const pending = h.run(opts);
      if (output === 'exit') h.reject(Object.assign(new Error('exit'), { code: 1 }));
      else h.resolve(output);
      await expect(pending).resolves.toMatchObject({ ok: false, reason });
      await expect(h.run(opts)).resolves.toMatchObject({ ok: false, reason: 'cli-backoff', retryAfter: 10 + duration });
    }
  });
  it('refuses a second process for one CLI and a third process overall', async () => {
    const a = harness(); const b = harness(); const c = harness();
    const one = a.run({ sourceId: 'gate-a', ownerKey: 'a' });
    await expect(a.run({ sourceId: 'gate-a', ownerKey: 'b' })).resolves.toMatchObject({ reason: 'cli-busy' });
    const two = b.run({ sourceId: 'gate-b' });
    await expect(c.run({ sourceId: 'gate-c' })).resolves.toMatchObject({ reason: 'cli-busy' });
    a.resolve('valid'); b.resolve('valid');
    await Promise.all([one, two]);
  });
});

describe('production Node executor cleanup', () => {
  function fake() {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const order: string[] = [];
    const kill = jest.fn(() => { order.push('direct'); child.emit('exit', null); child.emit('close', null); return true; });
    const child = Object.assign(new EventEmitter(), { pid: 42, stdout, stderr, exitCode: null, signalCode: null, kill });
    const spawnFake = jest.fn(() => child);
    const executor = createNodeFallbackExecutor(spawnFake);
    const tree = jest.fn(async () => { order.push('tree'); });
    const run = (overrides: Partial<Parameters<typeof runFallbackUsage<string>>[0]> = {}) =>
      runFallbackUsage({ sourceId: `node-${++serial}`, ownerKey: '<user>', executable: 'fake',
        version: 'v1', accountFingerprint: '<account>', args: [], executor,
        parse: (output) => output, killTree: tree, ...overrides });
    return { child, stdout, stderr, kill, tree, order, run, spawnFake };
  }
  afterEach(() => jest.useRealTimers());
  it('tree-kills before direct kill on timeout', async () => {
    jest.useFakeTimers();
    const h = fake(); const pending = h.run();
    await jest.advanceTimersByTimeAsync(8_000);
    await pending;
    expect(h.order).toEqual(['tree', 'direct']);
  });
  it('passes cwd to the spawn options', async () => {
    const h = fake(); const pending = h.run({ cwd: 'isolated-dir' });
    expect(h.spawnFake).toHaveBeenCalledWith('fake', [], expect.objectContaining({ cwd: 'isolated-dir', stdio: ['ignore', 'pipe', 'pipe'] }));
    Object.assign(h.child, { exitCode: 0 }); h.child.emit('exit', 0); h.child.emit('close', 0);
    await pending;
  });
  it('skips all kills after normal exit', async () => {
    const h = fake(); const pending = h.run();
    Object.assign(h.child, { exitCode: 0 }); h.child.emit('exit', 0); h.child.emit('close', 0);
    await expect(pending).resolves.toMatchObject({ ok: true });
    expect(h.order).toEqual([]);
  });
  it.each(['linux', 'win32'] as const)('handles exit before close on %s', async (platform) => {
    jest.useFakeTimers();
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { configurable: true, value: platform });
    try {
      const h = fake(); const pending = h.run();
      h.child.emit('exit', 0);
      await jest.advanceTimersByTimeAsync(8_000);
      // A reused Windows PID must never be tree-killed after the parent exited.
      expect(h.tree).toHaveBeenCalledTimes(platform === 'win32' ? 0 : 1);
      h.child.emit('close', 0);
      await pending;
    } finally {
      if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
    }
  });
  it('tree-kills when output reaches the cap', async () => {
    const h = fake(); const pending = h.run();
    h.stdout.emit('data', Buffer.alloc(64 * 1024 + 1));
    await expect(pending).resolves.toMatchObject({ reason: 'cli-parse-failed' });
    expect(h.order).toEqual(['tree', 'direct']);
  });
  it('bounds a hung tree kill and releases the gate', async () => {
    jest.useFakeTimers(); const h = fake();
    const sourceId = `hung-${++serial}`;
    const first = h.run({ sourceId, killTree: () => new Promise<void>(() => undefined) });
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(first).resolves.toMatchObject({ reason: 'cli-timeout' });
    expect(h.kill).toHaveBeenCalled();
    const second = h.run({ sourceId, executable: 'another' });
    h.child.emit('exit', 0); h.child.emit('close', 0);
    await expect(second).resolves.toMatchObject({ ok: true });
  });
});


