import { AgentId } from '@ptah-extension/shared';
import { startingAgent } from './agent-spawn-admission';
import { AgentSpawnMemoryGate } from './agent-spawn-memory-gate';

function lane() {
  return startingAgent({
    agentId: AgentId.create(), cli: 'codex', task: 'test',
    workingDirectory: '/workspace', status: 'starting',
    startedAt: new Date().toISOString(),
  });
}

describe('AgentSpawnMemoryGate', () => {
  let freeGb: number;
  let active: ReturnType<typeof lane>[];
  let failed: jest.Mock;
  let gate: AgentSpawnMemoryGate;

  beforeEach(() => {
    jest.useFakeTimers();
    freeGb = 1;
    active = [];
    failed = jest.fn();
    gate = new AgentSpawnMemoryGate(
      () => freeGb * 1024 ** 3, () => 3, () => 300_000,
      (waiting) => active.some((other) => other !== waiting &&
        !other.info.waitingForMemory && other.info.status === 'running'), failed,
    );
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('starts immediately when there is no other running lane', async () => {
    const next = lane();
    await expect(gate.wait(next)).resolves.toBeUndefined();
    expect(next.info.waitingForMemory).toBeUndefined();
  });

  it('releases one lane per poll after the previous lane leaves starting', async () => {
    const running = lane(); running.info.status = 'running'; active.push(running);
    const first = lane(); const second = lane();
    const order: string[] = [];
    const one = gate.wait(first).then(() => { order.push('first'); });
    const two = gate.wait(second).then(() => { order.push('second'); });
    expect(first.info.waitingForMemory).toBe(true);
    expect(second.info.waitingForMemory).toBe(true);
    freeGb = 4;
    gate.wake();
    await one;
    expect(order).toEqual(['first']);
    expect(second.info.waitingForMemory).toBe(true);
    jest.advanceTimersByTime(1000);
    expect(order).toEqual(['first']);
    first.info.status = 'running';
    gate.wake();
    expect(second.info.waitingForMemory).toBe(true);
    jest.advanceTimersByTime(1000);
    await Promise.all([one, two]);
    expect(order).toEqual(['first', 'second']);
    expect(first.info.waitingForMemory).toBe(false);
  });

  it('releases on exit when no other lane runs', async () => {
    const running = lane(); running.info.status = 'running'; active.push(running);
    const next = lane(); const pending = gate.wait(next);
    running.info.status = 'completed'; gate.wake();
    await expect(pending).resolves.toBeUndefined();
  });

  it('times out once and rejects after five minutes', async () => {
    const running = lane(); running.info.status = 'running'; active.push(running);
    const next = lane(); const pending = gate.wait(next);
    const assertion = expect(pending).rejects.toThrow('waited for memory');
    jest.advanceTimersByTime(300_000);
    await assertion;
    gate.wake();
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('removes a stopped lane and lets force bypass memory', async () => {
    const running = lane(); running.info.status = 'running'; active.push(running);
    const stopped = lane(); const pending = gate.wait(stopped);
    stopped.info.status = 'stopped'; gate.wake();
    await expect(pending).rejects.toThrow('stopped');
    expect(failed).not.toHaveBeenCalled();
    await expect(gate.wait(lane(), true)).resolves.toBeUndefined();
  });

  it('removes a stopped waiter behind the head before checking memory', async () => {
    const running = lane(); running.info.status = 'running'; active.push(running);
    const first = lane(); const stopped = lane();
    const one = gate.wait(first);
    const two = gate.wait(stopped);
    stopped.info.status = 'stopped';
    gate.wake();
    await expect(two).rejects.toThrow('stopped');
    expect(stopped.info.waitingForMemory).toBe(false);
    freeGb = 4;
    gate.wake();
    await one;
  });
});
