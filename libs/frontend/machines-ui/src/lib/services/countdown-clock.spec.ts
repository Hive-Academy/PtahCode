import { DOCUMENT } from '@angular/common';
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

  it('pauses while hidden and refreshes immediately when visible', () => {
    let hidden = false;
    let listener: EventListenerOrEventListenerObject | undefined;
    const documentMock = {
      get hidden() { return hidden; },
      addEventListener: (type: string, callback: EventListenerOrEventListenerObject) => {
        if (type === 'visibilitychange') listener = callback;
      },
      removeEventListener: jest.fn(),
    };
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: documentMock }] });
    const clock = TestBed.inject(CountdownClock);
    const release = clock.acquire();
    const changeVisibility = (value: boolean): void => {
      hidden = value;
      const event = new Event('visibilitychange');
      if (typeof listener === 'function') listener(event);
      else listener?.handleEvent(event);
    };
    changeVisibility(true);
    expect(jest.getTimerCount()).toBe(0);
    jest.setSystemTime(1_050_000);
    expect(clock.now()).toBe(1_000_000);
    changeVisibility(false);
    expect(clock.now()).toBe(1_050_000);
    expect(jest.getTimerCount()).toBe(1);
    release();
  });
});
