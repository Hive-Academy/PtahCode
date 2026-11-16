import { admitAndRaceSpawn, raceSpawnReply, SPAWN_REPLY_DEADLINE_MS } from './agent-spawn-deadline';

describe('admitAndRaceSpawn', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rejects without a starting reply when the admission was stopped', async () => {
    let exists = true;
    const reply = admitAndRaceSpawn(
      () => 'lane-1',
      () => new Promise<string>(() => undefined),
      () => exists,
      (ticket) => `Status: starting; agent ID: ${ticket}`,
    );
    exists = false;
    const rejection = reply.catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(SPAWN_REPLY_DEADLINE_MS);
    expect(await rejection).toEqual(new Error('Spawn was stopped before it started'));
  });
});

describe('raceSpawnReply', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a fast pipeline result', async () => {
    const result = await raceSpawnReply('lane-1', Promise.resolve('running'));
    expect(result).toEqual({ kind: 'settled', value: 'running' });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('returns the ticket at the deadline and observes late success', async () => {
    let resolvePipeline!: (value: string) => void;
    const pipeline = new Promise<string>((resolve) => { resolvePipeline = resolve; });
    const reply = raceSpawnReply('lane-2', pipeline);
    await jest.advanceTimersByTimeAsync(SPAWN_REPLY_DEADLINE_MS);
    expect(await reply).toEqual({ kind: 'deadline', ticket: 'lane-2' });
    resolvePipeline('running');
    await pipeline;
  });

  it('observes a late failure without an unhandled rejection', async () => {
    let rejectPipeline!: (error: Error) => void;
    const pipeline = new Promise<string>((_, reject) => { rejectPipeline = reject; });
    const reply = raceSpawnReply('lane-3', pipeline);
    await jest.advanceTimersByTimeAsync(SPAWN_REPLY_DEADLINE_MS);
    expect(await reply).toEqual({ kind: 'deadline', ticket: 'lane-3' });
    rejectPipeline(new Error('late failure'));
    await expect(pipeline).rejects.toThrow('late failure');
  });

  it('passes a refusal through before the deadline', async () => {
    await expect(raceSpawnReply('lane-4', Promise.reject(new Error('refused'))))
      .rejects.toThrow('refused');
    expect(jest.getTimerCount()).toBe(0);
  });
});
