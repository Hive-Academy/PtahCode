import { TestBed } from '@angular/core/testing';
import type { RemoteSessionView } from '../../services/machines-store';
import { initialSessionEventState } from '../../services/session-event-reducer';
import { sessionEvent } from '../../services/testing/machines-fixtures';
import { ReconnectBannerComponent } from './reconnect-banner.component';
import { SessionSyncChipComponent } from './session-sync-chip.component';
import {
  replaySummary,
  sessionSyncState,
  type ReplaySummary,
  type SessionSyncState,
} from './session-sync';

function view(overrides: Partial<RemoteSessionView> = {}): RemoteSessionView {
  return {
    ...initialSessionEventState('s1'),
    mode: 'log',
    epoch: 'e1',
    machineId: 'm1',
    machineState: 'connected',
    stale: false,
    watchOnly: false,
    lockUnavailable: false,
    catchingUp: false,
    error: null,
    ...overrides,
  };
}

function renderBanner(summary: ReplaySummary): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(ReconnectBannerComponent);
  fixture.componentRef.setInput('summary', summary);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function renderChip(state: SessionSyncState): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(SessionSyncChipComponent);
  fixture.componentRef.setInput('state', state);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('session sync state (4.8)', () => {
  it('a gap with held events reads "Fetching missing events"', () => {
    const gap = view({
      last: 4,
      target: 4,
      held: [sessionEvent(6, 'session:stats', {})],
      recovery: 'requested',
      catchingUp: true,
    });
    expect(sessionSyncState(gap)).toBe('fetching');
  });

  it('an outstanding attach or replay reads "Catching up..."', () => {
    expect(sessionSyncState(view({ mode: 'attaching' }))).toBe('catching-up');
    expect(
      sessionSyncState(view({ last: 2, target: 9, catchingUp: true })),
    ).toBe('catching-up');
  });

  it('caught up, and nothing for a snapshot or a failed attach', () => {
    expect(sessionSyncState(view())).toBe('caught-up');
    expect(sessionSyncState(view({ mode: 'snapshot' }))).toBeNull();
    expect(sessionSyncState(view({ mode: 'detached' }))).toBeNull();
    expect(sessionSyncState(null)).toBeNull();
  });

  it('a summary is complete only when caught up', () => {
    expect(replaySummary(1204, view({ last: 1241, target: 1241 }))).toEqual({
      fromSeq: 1204,
      toSeq: 1241,
      complete: true,
    });
    expect(
      replaySummary(1204, view({ last: 1210, target: 1241, catchingUp: true }))
        .complete,
    ).toBe(false);
  });
});

describe('ReconnectBannerComponent', () => {
  it('states the replayed range once complete', () => {
    const host = renderBanner({ fromSeq: 1204, toSeq: 1241, complete: true });
    const banner = host.querySelector('[data-testid="reconnect-banner"]');
    expect(banner?.getAttribute('role')).toBe('status');
    expect(
      host.querySelector('[data-testid="reconnect-banner-text"]')?.textContent,
    ).toBe(
      'Replayed 37 events from #1204 to #1241 while the link was down. No gaps, duplicates removed.',
    );
  });

  it('claims nothing while the replay runs', () => {
    const host = renderBanner({ fromSeq: 10, toSeq: 12, complete: false });
    const text =
      host.querySelector('[data-testid="reconnect-banner-text"]')?.textContent ??
      '';
    expect(text).toContain('Replaying events from #10');
    expect(text).not.toContain('No gaps');
  });

  it('says when nothing was missed', () => {
    const host = renderBanner({ fromSeq: 5, toSeq: 5, complete: true });
    expect(host.textContent).toContain(
      'No events were missed while the link was down.',
    );
  });

  it('closes only on the user action', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(ReconnectBannerComponent);
    fixture.componentRef.setInput('summary', {
      fromSeq: 1,
      toSeq: 2,
      complete: true,
    });
    fixture.detectChanges();
    const closed = jest.fn();
    fixture.componentInstance.dismissed.subscribe(closed);
    (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLButtonElement>(
      '[data-testid="reconnect-banner-close"]',
    )?.click();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe('SessionSyncChipComponent', () => {
  it.each([
    ['caught-up', 'Caught up'],
    ['catching-up', 'Catching up...'],
    ['fetching', 'Fetching missing events'],
  ] as const)('%s reads "%s"', (state, label) => {
    const host = renderChip(state);
    expect(
      host.querySelector('[data-testid="session-sync-chip"]')?.textContent?.trim(),
    ).toBe(label);
    expect(host.querySelector('button')).toBeNull();
  });

  it('the marker does not spin under reduced motion', () => {
    const marker = renderChip('fetching').querySelector('.animate-spin');
    expect(marker?.className).toContain('motion-reduce:animate-none');
  });
});
