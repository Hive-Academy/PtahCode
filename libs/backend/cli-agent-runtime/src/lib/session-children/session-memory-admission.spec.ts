import { SessionMemoryAdmission, SessionMemoryTicket } from './session-memory-admission';

describe('SessionMemoryAdmission', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('admits immediately when memory is sufficient', async () => {
    const admission = new SessionMemoryAdmission(
      () => ({ minFreeMemoryGb: 1, spawnQueueTimeoutMs: 5000 }),
      () => 2 * 1024 ** 3,
    );
    const ticket = new SessionMemoryTicket('fast');
    await expect(admission.wait(ticket)).resolves.toBeUndefined();
    expect(ticket.waiting).toBe(false);
    ticket.admitted();
  });

  it('queues in FIFO order and rechecks memory before each admission', async () => {
    let freeMemory = 500 * 1024 ** 2;
    const admission = new SessionMemoryAdmission(
      () => ({ minFreeMemoryGb: 1, spawnQueueTimeoutMs: 5000 }),
      () => freeMemory,
    );
    const first = new SessionMemoryTicket('first');
    const second = new SessionMemoryTicket('second');
    let secondAdmitted = false;
    const firstWait = admission.wait(first);
    const secondWait = admission.wait(second).then(() => { secondAdmitted = true; });
    expect(first.waiting).toBe(true);
    expect(second.waiting).toBe(true);
    freeMemory = 2 * 1024 ** 3;
    admission.wake();
    await firstWait;
    expect(secondAdmitted).toBe(false);
    first.admitted();
    jest.advanceTimersByTime(1000);
    await secondWait;
    expect(secondAdmitted).toBe(true);
    second.admitted();
  });

  it('times out a queued ticket and clears its timer', async () => {
    const admission = new SessionMemoryAdmission(
      () => ({ minFreeMemoryGb: 1, spawnQueueTimeoutMs: 50 }),
      () => 0,
    );
    const ticket = new SessionMemoryTicket('timeout');
    const wait = admission.wait(ticket);
    const rejected = expect(wait).rejects.toThrow('timed out');
    jest.advanceTimersByTime(50);
    await rejected;
    expect(ticket.pending).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels a queued ticket and clears its timer', async () => {
    const admission = new SessionMemoryAdmission(
      () => ({ minFreeMemoryGb: 1, spawnQueueTimeoutMs: 5000 }),
      () => 0,
    );
    const ticket = new SessionMemoryTicket('cancel');
    const wait = admission.wait(ticket);
    const rejected = expect(wait).rejects.toThrow('cancelled');
    admission.cancel(ticket);
    admission.cancel(ticket);
    await rejected;
    expect(ticket.pending).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});
