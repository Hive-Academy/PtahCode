import { TestBed } from '@angular/core/testing';
import { LoggingService } from './logging.service';
import { RendererFrameMonitorService } from './renderer-frame-monitor.service';

describe('RendererFrameMonitorService', () => {
  const originalObserver = globalThis.PerformanceObserver;

  afterEach(() => {
    TestBed.resetTestingModule();
    globalThis.PerformanceObserver = originalObserver;
    jest.restoreAllMocks();
  });

  it('samples long frames and disconnects on destroy', () => {
    let report: PerformanceObserverCallback | undefined;
    const observe = jest.fn();
    const disconnect = jest.fn();
    class FakeObserver {
      static supportedEntryTypes = ['long-animation-frame'];
      constructor(callback: PerformanceObserverCallback) { report = callback; }
      observe = observe;
      disconnect = disconnect;
      takeRecords = (): PerformanceEntryList => [];
    }
    globalThis.PerformanceObserver = FakeObserver as typeof PerformanceObserver;
    const warn = jest.fn();
    TestBed.configureTestingModule({
      providers: [RendererFrameMonitorService, { provide: LoggingService, useValue: { warn } }],
    });
    TestBed.inject(RendererFrameMonitorService);
    expect(observe).toHaveBeenCalledWith({ type: 'long-animation-frame' });
    const now = jest.spyOn(performance, 'now').mockReturnValue(20_000);
    report?.({ getEntries: () => [{ duration: 250 }] } as PerformanceObserverEntryList,
      {} as PerformanceObserver);
    now.mockReturnValue(20_001);
    report?.({ getEntries: () => [{ duration: 300 }] } as PerformanceObserverEntryList,
      {} as PerformanceObserver);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'RendererFrame',
      'long frame {"durationMs":250,"entryType":"long-animation-frame"}',
    );
    TestBed.resetTestingModule();
    expect(disconnect).toHaveBeenCalled();
  });

  it('logs the longer of two scripts with the blocking duration', () => {
    let report: PerformanceObserverCallback | undefined;
    const observe = jest.fn();
    class FakeObserver {
      static supportedEntryTypes = ['long-animation-frame'];
      constructor(callback: PerformanceObserverCallback) { report = callback; }
      observe = observe;
      disconnect = jest.fn();
      takeRecords = (): PerformanceEntryList => [];
    }
    globalThis.PerformanceObserver = FakeObserver as typeof PerformanceObserver;
    const warn = jest.fn();
    TestBed.configureTestingModule({
      providers: [RendererFrameMonitorService, { provide: LoggingService, useValue: { warn } }],
    });
    TestBed.inject(RendererFrameMonitorService);
    expect(observe).toHaveBeenCalledWith({ type: 'long-animation-frame' });
    jest.spyOn(performance, 'now').mockReturnValue(20_000);
    const entry = {
      name: 'long-animation-frame',
      entryType: 'long-animation-frame',
      startTime: 18_000,
      duration: 250,
      blockingDuration: 180.6,
      scripts: [
        { duration: 40, invoker: 'IMG.el', sourceURL: 'file:///D:/repo/app.js?v=2', sourceFunctionName: 'paint' },
        { duration: 150, invoker: 'HTMLElement.onclick', sourceURL: 'https://cdn.example.com/bundles/main.js', sourceFunctionName: 'handleClick' },
      ],
    };
    report?.({
      getEntries: () => [entry],
      getEntriesByName: (): PerformanceEntryList => [],
      getEntriesByType: (): PerformanceEntryList => [],
    } as PerformanceObserverEntryList, {} as PerformanceObserver);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'RendererFrame',
      'long frame {"durationMs":250,"entryType":"long-animation-frame","blockingMs":181,"script":{"ms":150,"invoker":"HTMLElement.onclick","fn":"handleClick","src":"main.js"}}',
    );
  });

  it('reduces a long source URL to its last segment and cuts strings to 80 characters', () => {
    let report: PerformanceObserverCallback | undefined;
    class FakeObserver {
      static supportedEntryTypes = ['long-animation-frame'];
      constructor(callback: PerformanceObserverCallback) { report = callback; }
      observe = jest.fn();
      disconnect = jest.fn();
      takeRecords = (): PerformanceEntryList => [];
    }
    globalThis.PerformanceObserver = FakeObserver as typeof PerformanceObserver;
    const warn = jest.fn();
    TestBed.configureTestingModule({
      providers: [RendererFrameMonitorService, { provide: LoggingService, useValue: { warn } }],
    });
    TestBed.inject(RendererFrameMonitorService);
    jest.spyOn(performance, 'now').mockReturnValue(20_000);
    const entry = {
      name: 'long-animation-frame',
      entryType: 'long-animation-frame',
      startTime: 18_000,
      duration: 300,
      scripts: [{
        duration: 90,
        invoker: 'X'.repeat(100),
        sourceURL: 'file:///D:/very/deep/nested/path/to/some/module/file.worker.js?cache=buster&v=1',
      }],
    };
    report?.({
      getEntries: () => [entry],
      getEntriesByName: (): PerformanceEntryList => [],
      getEntriesByType: (): PerformanceEntryList => [],
    } as PerformanceObserverEntryList, {} as PerformanceObserver);
    const expected = `long frame ${JSON.stringify({
      durationMs: 300,
      entryType: 'long-animation-frame',
      script: { ms: 90, invoker: 'X'.repeat(80), fn: '', src: 'file.worker.js' },
    })}`;
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('RendererFrame', expected);
  });

  it('logs only the file name from a backslash source URL', () => {
    let report: PerformanceObserverCallback | undefined;
    class FakeObserver {
      static supportedEntryTypes = ['long-animation-frame'];
      constructor(callback: PerformanceObserverCallback) { report = callback; }
      observe = jest.fn();
      disconnect = jest.fn();
      takeRecords = (): PerformanceEntryList => [];
    }
    globalThis.PerformanceObserver = FakeObserver as typeof PerformanceObserver;
    const warn = jest.fn();
    TestBed.configureTestingModule({
      providers: [RendererFrameMonitorService, { provide: LoggingService, useValue: { warn } }],
    });
    TestBed.inject(RendererFrameMonitorService);
    jest.spyOn(performance, 'now').mockReturnValue(20_000);
    const entry = {
      name: 'long-animation-frame', entryType: 'long-animation-frame',
      startTime: 18_000, duration: 300,
      scripts: [{ duration: 90, sourceURL: 'C:\\Users\\name\\repo\\app.js?query#fragment' }],
    };
    report?.({
      getEntries: () => [entry],
      getEntriesByName: (): PerformanceEntryList => [],
      getEntriesByType: (): PerformanceEntryList => [],
    } as PerformanceObserverEntryList, {} as PerformanceObserver);
    expect(warn).toHaveBeenCalledWith('RendererFrame', expect.stringContaining('"src":"app.js"'));
  });
});
