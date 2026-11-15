import { AgentSpawnDedupe } from './agent-spawn-dedupe';

describe('AgentSpawnDedupe', () => {
  afterEach(() => jest.useRealTimers());

  it('shares an in-flight spawn and replays it until the 120 second window ends', async () => {
    jest.useFakeTimers();
    const dedupe = new AgentSpawnDedupe<{ agentId: string }>();
    const start = jest
      .fn()
      .mockResolvedValueOnce({ agentId: 'lane-1' })
      .mockResolvedValueOnce({ agentId: 'lane-2' });
    const args = { task: 'work', cli: 'codex' as const };
    const first = await dedupe.run('caller', '/root', args, start);
    const second = await dedupe.run('caller', '/root', args, start);
    expect(second.replay).toBe(true);
    expect(await first.promise).toEqual({ agentId: 'lane-1' });
    expect(await second.promise).toEqual({ agentId: 'lane-1' });
    expect(
      (await (await dedupe.run('caller', '/root', args, start)).promise)
        .agentId,
    ).toBe('lane-1');
    jest.advanceTimersByTime(120_001);
    expect(
      (await (await dedupe.run('caller', '/root', args, start)).promise)
        .agentId,
    ).toBe('lane-2');
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('scopes explicit keys and lets force bypass derived dedupe', async () => {
    const dedupe = new AgentSpawnDedupe<{ agentId: string }>();
    let next = 0;
    const start = async () => ({ agentId: `lane-${++next}` });
    const first = await (
      await dedupe.run(
        'caller',
        '/root',
        { task: 'one', idempotencyKey: 'key' },
        start,
      )
    ).promise;
    const replay = await (
      await dedupe.run(
        'caller',
        '/root',
        { task: 'two', idempotencyKey: 'key' },
        start,
      )
    ).promise;
    const distinct = await (
      await dedupe.run(
        'caller',
        '/root',
        { task: 'two', idempotencyKey: 'other' },
        start,
      )
    ).promise;
    expect(replay).toEqual(first);
    expect(distinct.agentId).not.toBe(first.agentId);
    const forced = await (
      await dedupe.run('caller', '/root', { task: 'one', force: true }, start)
    ).promise;
    expect(forced.agentId).not.toBe(first.agentId);
    const forcedWithKey = await dedupe.run(
      'caller',
      '/root',
      { task: 'one', idempotencyKey: 'key', force: true },
      start,
    );
    expect(forcedWithKey.replay).toBe(false);
    expect((await forcedWithKey.promise).agentId).not.toBe(first.agentId);
  });

  it('starts a fresh spawn when the validity check rejects', async () => {
    const dedupe = new AgentSpawnDedupe<{ agentId: string }>();
    let next = 0;
    const start = async () => ({ agentId: `lane-${++next}` });
    const isStillValid = jest.fn().mockRejectedValue(new Error('status down'));
    const args = { task: 'work' };
    await (
      await dedupe.run('caller', '/root', args, start, isStillValid)
    ).promise;
    const second = await dedupe.run(
      'caller',
      '/root',
      args,
      start,
      isStillValid,
    );
    expect(second.replay).toBe(false);
    expect((await second.promise).agentId).toBe('lane-2');
  });

  it('evicts failures so a retry can start', async () => {
    const dedupe = new AgentSpawnDedupe<{ agentId: string }>();
    const start = jest
      .fn()
      .mockRejectedValueOnce(new Error('no lane'))
      .mockResolvedValueOnce({ agentId: 'lane' });
    await expect(
      (await dedupe.run('caller', '/root', { task: 'work' }, start)).promise,
    ).rejects.toThrow('no lane');
    expect(
      (
        await (
          await dedupe.run('caller', '/root', { task: 'work' }, start)
        ).promise
      ).agentId,
    ).toBe('lane');
  });

  it('replays a running lane and replaces a terminal lane', async () => {
    const dedupe = new AgentSpawnDedupe<{ agentId: string }>();
    const start = jest
      .fn()
      .mockResolvedValueOnce({ agentId: 'first' })
      .mockResolvedValueOnce({ agentId: 'second' });
    const valid = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await (
      await dedupe.run('caller', '/root', { task: 'retry' }, start, valid)
    ).promise;
    const running = await dedupe.run(
      'caller',
      '/root',
      { task: 'retry' },
      start,
      valid,
    );
    expect(running.replay).toBe(true);
    expect((await running.promise).agentId).toBe('first');
    const terminal = await dedupe.run(
      'caller',
      '/root',
      { task: 'retry' },
      start,
      valid,
    );
    expect(terminal.replay).toBe(false);
    expect((await terminal.promise).agentId).toBe('second');
  });

  it('keeps in-flight entries when evicting a settled entry at capacity', async () => {
    const dedupe = new AgentSpawnDedupe<{ agentId: string }>();
    const pending = () => new Promise<{ agentId: string }>(() => undefined);
    await (
      await dedupe.run('caller', '/root', { task: 'settled' }, async () => ({
        agentId: 'done',
      }))
    ).promise;
    for (let i = 0; i < 199; i++) {
      await dedupe.run('caller', '/root', { task: `pending-${i}` }, pending);
    }
    const added = await dedupe.run('caller', '/root', { task: 'new' }, pending);
    expect(added.replay).toBe(false);
    expect(
      (await dedupe.run('caller', '/root', { task: 'pending-0' }, pending))
        .replay,
    ).toBe(true);
    expect(
      (
        await dedupe.run('caller', '/root', { task: 'settled' }, async () => ({
          agentId: 'fresh',
        }))
      ).replay,
    ).toBe(false);
  });

  it('runs without storing when all 200 entries are in flight', async () => {
    const dedupe = new AgentSpawnDedupe<{ agentId: string }>();
    const pending = jest.fn(
      () => new Promise<{ agentId: string }>(() => undefined),
    );
    for (let i = 0; i < 200; i++) {
      await dedupe.run('caller', '/root', { task: `pending-${i}` }, pending);
    }
    expect(
      (await dedupe.run('caller', '/root', { task: 'overflow' }, pending))
        .replay,
    ).toBe(false);
    expect(
      (await dedupe.run('caller', '/root', { task: 'overflow' }, pending))
        .replay,
    ).toBe(false);
    expect(
      (await dedupe.run('caller', '/root', { task: 'pending-0' }, pending))
        .replay,
    ).toBe(true);
    expect(pending).toHaveBeenCalledTimes(202);
  });

  it('replaces an in-flight entry after five minutes', async () => {
    jest.useFakeTimers();
    const dedupe = new AgentSpawnDedupe<{ agentId: string }>();
    const pending = jest.fn(
      () => new Promise<{ agentId: string }>(() => undefined),
    );
    await dedupe.run('caller', '/root', { task: 'hung' }, pending);
    expect(
      (await dedupe.run('caller', '/root', { task: 'hung' }, pending)).replay,
    ).toBe(true);
    jest.advanceTimersByTime(300_001);
    expect(
      (await dedupe.run('caller', '/root', { task: 'hung' }, pending)).replay,
    ).toBe(false);
  });
});
