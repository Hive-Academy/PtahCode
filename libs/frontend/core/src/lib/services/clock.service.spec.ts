import { DOCUMENT } from '@angular/common';
import { EnvironmentInjector, NgZone, createEnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ClockService, injectClock } from './clock.service';

describe(ClockService.name, () => {
  let hidden = false;
  let listener: EventListenerOrEventListenerObject | undefined;
  const documentMock = {
    get hidden() { return hidden; },
    addEventListener: jest.fn((type: string, callback: EventListenerOrEventListenerObject) => {
      if (type === 'visibilitychange') listener = callback;
    }),
    removeEventListener: jest.fn((type: string, callback: EventListenerOrEventListenerObject) => {
      if (type === 'visibilitychange' && listener === callback) listener = undefined;
    }),
  };

  const visibility = (value: boolean): void => {
    hidden = value;
    const event = new Event('visibilitychange');
    if (typeof listener === 'function') listener(event);
    else listener?.handleEvent(event);
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(1_000);
    hidden = false;
    listener = undefined;
    documentMock.addEventListener.mockClear();
    documentMock.removeEventListener.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: documentMock }] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.useRealTimers();
  });

  it('shares one outside-zone interval and releases idempotently', () => {
    const zone = TestBed.inject(NgZone);
    const outside = jest.spyOn(zone, 'runOutsideAngular');
    const clock = TestBed.inject(ClockService);
    const first = clock.acquire();
    const second = clock.acquire();
    expect(jest.getTimerCount()).toBe(1);
    expect(outside).toHaveBeenCalledTimes(1);
    expect(documentMock.addEventListener).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1_000);
    expect(clock.now()).toBe(2_000);
    first();
    first();
    expect(jest.getTimerCount()).toBe(1);
    second();
    second();
    expect(jest.getTimerCount()).toBe(0);
    expect(documentMock.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('refreshes every acquisition, pauses hidden, and refreshes immediately on return', () => {
    const clock = TestBed.inject(ClockService);
    const first = clock.acquire();
    visibility(true);
    expect(jest.getTimerCount()).toBe(0);
    jest.setSystemTime(40_000);
    expect(clock.now()).toBe(1_000);
    const second = clock.acquire();
    expect(clock.now()).toBe(40_000);
    expect(jest.getTimerCount()).toBe(0);
    jest.setSystemTime(50_000);
    visibility(false);
    expect(clock.now()).toBe(50_000);
    expect(jest.getTimerCount()).toBe(1);
    first();
    second();
  });

  it('keeps one interval through repeated visible events and ignores visibility after release', () => {
    const clock = TestBed.inject(ClockService);
    const release = clock.acquire();
    visibility(false);
    visibility(false);
    expect(jest.getTimerCount()).toBe(1);
    release();
    jest.setSystemTime(10_000);
    visibility(false);
    expect(jest.getTimerCount()).toBe(0);
    expect(clock.now()).toBe(1_000);
  });

  it('accepts a release after its injector has been destroyed', () => {
    const clock = TestBed.inject(ClockService);
    const release = clock.acquire();
    TestBed.resetTestingModule();
    expect(jest.getTimerCount()).toBe(0);
    expect(() => { release(); release(); }).not.toThrow();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('releases an unconditional injected clock on injector destroy', () => {
    const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    const clock = TestBed.inject(ClockService);
    const now = runInInjectionContext(injector, () => injectClock());
    expect(now).toBe(clock.now);
    expect(jest.getTimerCount()).toBe(1);
    injector.destroy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('holds an active injected clock without reacquiring on unrelated ticks', () => {
    const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    const clock = TestBed.inject(ClockService);
    const acquire = jest.spyOn(clock, 'acquire');
    const active = signal(false);
    const now = runInInjectionContext(injector, () => injectClock(active));
    expect(now).toBe(clock.now);
    TestBed.tick();
    expect(jest.getTimerCount()).toBe(0);
    active.set(true);
    TestBed.tick();
    expect(acquire).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(3_000);
    TestBed.tick();
    expect(acquire).toHaveBeenCalledTimes(1);
    active.set(false);
    TestBed.tick();
    expect(jest.getTimerCount()).toBe(0);
    injector.destroy();
  });
});
