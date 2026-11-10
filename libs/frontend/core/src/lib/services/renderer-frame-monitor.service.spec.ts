import { TestBed } from '@angular/core/testing';
import { LoggingService } from './logging.service';
import { RendererFrameMonitorService } from './renderer-frame-monitor.service';

function frame(duration: number, fields: Record<string, unknown> = {}): PerformanceEntry {
  return {
    name: 'frame', entryType: 'long-animation-frame', startTime: 0,
    duration, toJSON: () => ({}), ...fields,
  };
}

function entryList(entries: PerformanceEntry[]): PerformanceObserverEntryList {
  return {
    getEntries: () => entries,
    getEntriesByName: () => [],
    getEntriesByType: () => [],
  };
}

describe('RendererFrameMonitorService', () => {
  const originalObserver = globalThis.PerformanceObserver;
  let report: PerformanceObserverCallback | undefined;
  let disconnect: jest.Mock;
  let warn: jest.Mock;

  function start(type: 'long-animation-frame' | 'longtask' = 'long-animation-frame',
    realLogger = false): void {
    disconnect = jest.fn();
    class FakeObserver implements PerformanceObserver {
      static supportedEntryTypes = [type];
      constructor(callback: PerformanceObserverCallback) { report = callback; }
      observe = jest.fn();
      disconnect = disconnect;
      takeRecords = (): PerformanceEntryList => [];
    }
    Object.defineProperty(globalThis, 'PerformanceObserver', {
      configurable: true, writable: true, value: FakeObserver,
    });
    warn = jest.fn();
    TestBed.configureTestingModule({
      providers: realLogger
        ? [RendererFrameMonitorService]
        : [RendererFrameMonitorService, { provide: LoggingService, useValue: { warn } }],
    });
    TestBed.inject(RendererFrameMonitorService);
    jest.spyOn(performance, 'now').mockReturnValue(20_000);
  }

  function send(...entries: PerformanceEntry[]): void {
    if (!report) throw new Error('observer was not installed');
    report(entryList(entries), {
      observe: jest.fn(), disconnect: jest.fn(), takeRecords: () => [],
    });
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    Object.defineProperty(globalThis, 'PerformanceObserver', {
      configurable: true, writable: true, value: originalObserver,
    });
    jest.restoreAllMocks();
    report = undefined;
  });

  it('logs one frame summary, respects threshold and spacing, and disconnects', () => {
    start();
    send(frame(200), frame(250), frame(300));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('RendererFrame', `long frame ${JSON.stringify({
      durationMs: 250, entryType: 'long-animation-frame', scriptCount: 0,
    })}`);
    TestBed.resetTestingModule();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('logs three of five scripts in descending duration with type and layout', () => {
    start();
    const scripts = [20, 80, 40, 100, 60].map((duration) => ({
      duration, invokerType: 'event-listener',
      forcedStyleAndLayoutDuration: 2.6,
      sourceURL: 'file:///private/project/app.js?query',
      invoker: 'C:\\private\\project\\handler.js',
      sourceFunctionName: 'paint',
    }));
    send(frame(250, { blockingDuration: 180.6, scripts }));
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenNthCalledWith(1, 'RendererFrame', `long frame ${JSON.stringify({
      durationMs: 250, entryType: 'long-animation-frame', blockingMs: 181,
      scriptCount: 5,
    })}`);
    for (const [index, ms] of [100, 80, 60].entries()) {
      expect(warn).toHaveBeenNthCalledWith(index + 2,
        'RendererFrame', `long frame script ${JSON.stringify({
          i: index + 1, ms, type: 'event-listener', invoker: 'handler.js',
          fn: 'paint', src: 'app.js', layoutMs: 3,
        })}`);
    }
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private');
  });

  it.each([undefined, []])('reports no scripts when attribution is %s', (scripts) => {
    start();
    send(frame(250, scripts === undefined ? {} : { scripts }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('RendererFrame', `long frame ${JSON.stringify({
      durationMs: 250, entryType: 'long-animation-frame', scriptCount: 0,
    })}`);
  });

  it('omits script fields for longtask fallback', () => {
    start('longtask');
    send(frame(250));
    expect(warn).toHaveBeenCalledWith('RendererFrame', `long frame ${JSON.stringify({
      durationMs: 250, entryType: 'longtask',
    })}`);
  });

  it('keeps complete UTF-8 console lines under 256 bytes at maximum string lengths', () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    start('long-animation-frame', true);
    const worst = ('"' + '\u0001' + '\u{1F600}').repeat(100);
    send(frame(1e308, {
      blockingDuration: 1e308,
      scripts: [100, 90, 80].map((duration) => ({
        duration, invokerType: worst, invoker: worst,
        sourceFunctionName: worst, sourceURL: `file:///private/path/${worst}`,
        forcedStyleAndLayoutDuration: 1e308,
      })),
    }));
    expect(consoleWarn).toHaveBeenCalledTimes(4);
    const lengths = consoleWarn.mock.calls.map((args) => new TextEncoder().encode(
      args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '),
    ).length);
    expect(lengths.every((bytes) => bytes <= 256)).toBe(true);
    expect(lengths).toHaveLength(4);
  });
});
