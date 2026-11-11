import { InFlightCoalescer } from './in-flight-coalescer';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('InFlightCoalescer', () => {
  it('joins early but starts a fresh run after max join age', async () => {
    let now = 0;
    const coalescer = new InFlightCoalescer<number>(5_000, () => now);
    const first = deferred<number>();
    const second = deferred<number>();
    const firstStart = jest.fn(() => first.promise);
    const secondStart = jest.fn(() => second.promise);
    const a = coalescer.run('key', firstStart);
    now = 4_999;
    expect(coalescer.run('key', secondStart)).toBe(a);
    expect(secondStart).not.toHaveBeenCalled();
    now = 5_000;
    const b = coalescer.run('key', secondStart);
    expect(b).not.toBe(a);
    first.resolve(1);
    await expect(a).resolves.toBe(1);
    now = 5_001;
    expect(coalescer.run('key', secondStart)).toBe(b);
    expect(secondStart).toHaveBeenCalledTimes(1);
    second.resolve(2);
    await expect(b).resolves.toBe(2);
    expect(firstStart).toHaveBeenCalledTimes(1);
  });

  it('does not retain a failed run', async () => {
    const coalescer = new InFlightCoalescer<number>();
    await expect(coalescer.run('key', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    await expect(coalescer.run('key', async () => 2)).resolves.toBe(2);
  });
});
