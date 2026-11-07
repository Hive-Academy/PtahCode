import { TestBed } from '@angular/core/testing';
import { CountdownClock } from './countdown-clock';

describe('CountdownClock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    jest.useRealTimers();
  });

  it('runs one interval for all holders and stops after the last release', () => {
    const clock = TestBed.inject(CountdownClock);
    const releases = [clock.acquire(), clock.acquire(), clock.acquire()];
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(3_000);
    expect(clock.now()).toBe(1_003_000);

    releases[0]();
    releases[0]();
    releases[1]();
    expect(jest.getTimerCount()).toBe(1);
    releases[2]();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('refreshes the time on acquire', () => {
    const clock = TestBed.inject(CountdownClock);
    jest.setSystemTime(1_042_000);
    const release = clock.acquire();
    expect(clock.now()).toBe(1_042_000);
    release();
  });

  it('stops its interval when its injector is destroyed', () => {
    TestBed.inject(CountdownClock).acquire();
    expect(jest.getTimerCount()).toBe(1);
    TestBed.resetTestingModule();
    expect(jest.getTimerCount()).toBe(0);
  });
});
