import {
  capRouteDeadline,
  createRouteDeadline,
  withinBudget,
} from './route-deadline';

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('route-deadline', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('classifies an already-resolved promise as deadline when setup overruns the monotonic clock', async () => {
    let now = 1000;
    const deadline = createRouteDeadline(1010, () => now);
    let seenSignal: AbortSignal | undefined;

    const result = await withinBudget(deadline, (signal) => {
      seenSignal = signal;
      // Spend 20 ms synchronously during setup, past the 10 ms remaining budget.
      now += 20;
      return Promise.resolve('too-late');
    });

    expect(result).toEqual({ kind: 'deadline' });
    expect(seenSignal?.aborted).toBe(true);
  });

  it('classifies an already-rejected promise as deadline when setup overruns and observes the rejection', async () => {
    let now = 1000;
    const deadline = createRouteDeadline(1010, () => now);
    const lateError = jest.fn();
    let seenSignal: AbortSignal | undefined;
    const boom = new Error('late setup failure');

    const result = await withinBudget(
      deadline,
      (signal) => {
        seenSignal = signal;
        now += 20;
        return Promise.reject(boom);
      },
      lateError,
    );

    expect(result).toEqual({ kind: 'deadline' });
    expect(seenSignal?.aborted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(lateError).toHaveBeenCalledTimes(1);
    expect(lateError).toHaveBeenCalledWith(boom);
  });

  it('observes a pending losing promise when setup overruns the monotonic clock', async () => {
    let now = 1000;
    const deadline = createRouteDeadline(1010, () => now);
    const pending = deferred<string>();
    const lateError = jest.fn();
    let seenSignal: AbortSignal | undefined;

    const result = await withinBudget(
      deadline,
      (signal) => {
        seenSignal = signal;
        now += 15;
        return pending.promise;
      },
      lateError,
    );

    expect(result).toEqual({ kind: 'deadline' });
    expect(seenSignal?.aborted).toBe(true);

    const lateBoom = new Error('rejected after cutoff');
    pending.reject(lateBoom);
    await Promise.resolve();
    await Promise.resolve();
    expect(lateError).toHaveBeenCalledTimes(1);
    expect(lateError).toHaveBeenCalledWith(lateBoom);
  });

  it('classifies a synchronous throw after cutoff as deadline and aborts', async () => {
    let now = 1000;
    const deadline = createRouteDeadline(1010, () => now);
    const lateError = jest.fn();
    let seenSignal: AbortSignal | undefined;
    const boom = new Error('sync throw after cutoff');

    const result = await withinBudget(
      deadline,
      (signal) => {
        seenSignal = signal;
        now += 25;
        throw boom;
      },
      lateError,
    );

    expect(result).toEqual({ kind: 'deadline' });
    expect(seenSignal?.aborted).toBe(true);
    expect(lateError).toHaveBeenCalledTimes(1);
    expect(lateError).toHaveBeenCalledWith(boom);
  });

  it('classifies a synchronous throw before cutoff as error without aborting', async () => {
    let now = 1000;
    const deadline = createRouteDeadline(1010, () => now);
    let seenSignal: AbortSignal | undefined;
    const boom = new Error('sync throw before cutoff');

    const result = await withinBudget(deadline, (signal) => {
      seenSignal = signal;
      now += 4;
      throw boom;
    });

    expect(result).toEqual({ kind: 'error', error: boom });
    expect(seenSignal?.aborted).toBe(false);
  });

  it('schedules the timeout using remaining time after synchronous setup, not the stale pre-call value', async () => {
    jest.useFakeTimers();
    let now = 1000;
    const deadline = createRouteDeadline(1010, () => now);
    const pending = deferred<string>();
    let seenSignal: AbortSignal | undefined;

    const race = withinBudget(deadline, (signal) => {
      seenSignal = signal;
      // Consume 7 ms synchronously, leaving 3 ms.
      now += 7;
      return pending.promise;
    });

    await jest.advanceTimersByTimeAsync(3);
    await expect(race).resolves.toEqual({ kind: 'deadline' });
    expect(seenSignal?.aborted).toBe(true);
  });

  it('classifies settlement after the monotonic cutoff as deadline even before the timer fires', async () => {
    jest.useFakeTimers();
    let now = 1000;
    const deadline = createRouteDeadline(1050, () => now);
    const lateResolve = deferred<string>();
    let resolveSignal: AbortSignal | undefined;

    const resolveRace = withinBudget(deadline, (signal) => {
      resolveSignal = signal;
      return lateResolve.promise;
    });

    now = 1060;
    lateResolve.resolve('settled-past-cutoff');
    await expect(resolveRace).resolves.toEqual({ kind: 'deadline' });
    expect(resolveSignal?.aborted).toBe(true);

    now = 2000;
    const rejectDeadline = createRouteDeadline(2050, () => now);
    const lateReject = deferred<string>();
    const lateError = jest.fn();
    let rejectSignal: AbortSignal | undefined;
    const boom = new Error('rejected-past-cutoff');

    const rejectRace = withinBudget(
      rejectDeadline,
      (signal) => {
        rejectSignal = signal;
        return lateReject.promise;
      },
      lateError,
    );

    now = 2060;
    lateReject.reject(boom);
    await expect(rejectRace).resolves.toEqual({ kind: 'deadline' });
    expect(rejectSignal?.aborted).toBe(true);
    expect(lateError).toHaveBeenCalledTimes(1);
    expect(lateError).toHaveBeenCalledWith(boom);
  });

  it('returns deadline immediately for NaN or exhausted budgets and caps sub-budgets monotonically', async () => {
    const task = jest.fn(async () => 'never');
    const nanDeadline = createRouteDeadline(Number.NaN, () => 1000);
    await expect(withinBudget(nanDeadline, task)).resolves.toEqual({
      kind: 'deadline',
    });
    expect(task).not.toHaveBeenCalled();

    let now = 100;
    const capped = capRouteDeadline(createRouteDeadline(500, () => now), 50);
    expect(capped.remainingMs()).toBe(50);
    now = 150;
    expect(capped.remainingMs()).toBe(0);
    await expect(withinBudget(capped, task)).resolves.toEqual({
      kind: 'deadline',
    });
    expect(task).not.toHaveBeenCalled();
  });
});
