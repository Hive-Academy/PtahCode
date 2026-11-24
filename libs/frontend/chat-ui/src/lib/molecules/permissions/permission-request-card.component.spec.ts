import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WallClockService } from '@ptah-extension/core';
import type { PermissionRequest } from '@ptah-extension/shared';
import { PermissionRequestCardComponent } from './permission-request-card.component';

describe(PermissionRequestCardComponent.name, () => {
  let fixture: ComponentFixture<PermissionRequestCardComponent>;
  let clock: WallClockService;
  let releases: Array<() => void>;
  let acquire: jest.SpyInstance;
  let clockIntervals: Array<ReturnType<typeof setInterval>>;
  let clearIntervalSpy: jest.SpyInstance;

  const request = (timeoutAt: number, id = 'permission-1'): PermissionRequest => ({
    id,
    toolName: 'Read',
    toolInput: { file_path: 'example.ts' },
    timestamp: 1_000,
    description: 'Read example.ts',
    timeoutAt,
  });

  const render = (value: PermissionRequest): jest.Mock => {
    fixture = TestBed.createComponent(PermissionRequestCardComponent);
    const responded = jest.fn();
    fixture.componentInstance.responded.subscribe(responded);
    fixture.componentRef.setInput('request', value);
    fixture.detectChanges();
    TestBed.tick();
    return responded;
  };

  const renderWithLane = (laneLabel: string, value: PermissionRequest): void => {
    fixture = TestBed.createComponent(PermissionRequestCardComponent);
    fixture.componentRef.setInput('request', value);
    fixture.componentRef.setInput('laneLabel', laneLabel);
    fixture.detectChanges();
    TestBed.tick();
  };

  beforeEach(async () => {
    jest.useFakeTimers({
      doNotFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    }).setSystemTime(1_000);
    await TestBed.configureTestingModule({ imports: [PermissionRequestCardComponent] }).compileComponents();
    clock = TestBed.inject(WallClockService);
    releases = [];
    clockIntervals = [];
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');
    const realAcquire = clock.acquire.bind(clock);
    acquire = jest.spyOn(clock, 'acquire').mockImplementation((cadence) => {
      const priorIntervals = setIntervalSpy.mock.results.length;
      const release = jest.fn(realAcquire(cadence));
      const createdIntervals = setIntervalSpy.mock.results.slice(priorIntervals);
      expect(createdIntervals).toHaveLength(1);
      clockIntervals.push(createdIntervals[0].value);
      releases.push(release);
      return release;
    });
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('offers Always only when a session owns the request', () => {
    render({ ...request(0), canAlwaysAllow: false });
    expect(fixture.nativeElement.querySelector('[aria-label="Always allow this tool in this session"]')).toBeNull();
    fixture.destroy();

    render({ ...request(0), sessionId: '11111111-1111-4111-8111-111111111111' as PermissionRequest['sessionId'], canAlwaysAllow: true });
    expect(fixture.nativeElement.querySelector('[aria-label="Always allow this tool in this session"]')).not.toBeNull();
    fixture.destroy();

    render({ ...request(0), sessionId: '11111111-1111-4111-8111-111111111111' as PermissionRequest['sessionId'], canAlwaysAllow: false });
    expect(fixture.nativeElement.querySelector('[aria-label="Always allow this tool in this session"]')).toBeNull();
  });

  it('denies exactly once at the deadline and releases the shared clock', () => {
    const responded = render(request(3_000));
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(clockIntervals).toHaveLength(1);

    jest.advanceTimersByTime(2_000);
    TestBed.tick();
    fixture.detectChanges();

    expect(responded).toHaveBeenCalledTimes(1);
    expect(responded).toHaveBeenCalledWith({
      id: 'permission-1',
      decision: 'deny',
      reason: 'Request timeout',
    });
    expect(releases[0]).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(clockIntervals[0]);
    jest.advanceTimersByTime(5_000);
    TestBed.tick();
    expect(responded).toHaveBeenCalledTimes(1);
  });

  it('denies once when mounted after the deadline with a stale clock value', () => {
    jest.setSystemTime(5_000);
    const responded = render(request(3_000));

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(responded).toHaveBeenCalledTimes(1);
    expect(responded).toHaveBeenCalledWith({
      id: 'permission-1',
      decision: 'deny',
      reason: 'Request timeout',
    });
    expect(releases[0]).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(clockIntervals[0]);
    TestBed.tick();
    expect(responded).toHaveBeenCalledTimes(1);
  });

  it('does not acquire or auto-deny for an unlimited request', () => {
    const responded = render(request(0));

    expect(acquire).not.toHaveBeenCalled();
    expect(responded).not.toHaveBeenCalled();
    expect(clockIntervals).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('No timeout');
  });

  it('renders no lane badge when no lane label is given (main chat)', () => {
    render(request(0));

    expect(fixture.nativeElement.querySelector('[data-testid="lane-label"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Lane:');
  });

  it('renders the lane label as an outline accent badge right after the title', () => {
    renderWithLane('  Codex lane  ', request(0));

    const badge: HTMLElement | null = fixture.nativeElement.querySelector('[data-testid="lane-label"]');
    expect(badge).not.toBeNull();
    expect(badge?.hasAttribute('data-ptah-badge')).toBe(true);
    expect(badge?.getAttribute('data-tone')).toBe('accent');
    expect(badge?.getAttribute('data-appearance')).toBe('outline');
    expect(badge?.getAttribute('title')).toBe('Lane: Codex lane');
    expect(badge?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Lane: Codex lane');
    expect(badge?.previousElementSibling?.textContent?.trim()).toBe('Permission');
  });

  it('treats a blank lane label as absent', () => {
    renderWithLane('   ', request(0));

    expect(fixture.nativeElement.querySelector('[data-testid="lane-label"]')).toBeNull();
  });
});
