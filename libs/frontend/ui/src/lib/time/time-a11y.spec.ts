/**
 * Accessibility of the timer owners (TASK_2026_975_b61e). `role="timer"` is
 * silent. A separate polite live region changes text only on a state change.
 * Every value has a `<time datetime>` and an absolute title. The owners are
 * static text, so they have no tab stop and no focus ring of their own.
 */
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahCountdownComponent } from './countdown.component';
import { FakePtahClock } from './fake-ptah-clock';
import { formatAbsolute } from './format-relative';
import { PtahRelativeTimeComponent } from './relative-time.component';
import { PTAH_COUNTDOWN_STYLES } from './time.styles';
import { PtahTimerComponent } from './timer.component';

const NOW = Date.UTC(2026, 0, 10, 12, 0, 0);

@Component({
  standalone: true,
  imports: [PtahTimerComponent, PtahCountdownComponent, PtahRelativeTimeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (shown()) {
      <ptah-timer [startedAt]="start" [endedAt]="endedAt()" label="Run time" />
      <ptah-countdown [deadline]="deadline" label="Lease" (expired)="expiredCount = expiredCount + 1" />
      <ptah-relative-time [value]="start" />
    }`,
})
class HostComponent {
  readonly start = NOW - 30_000;
  readonly deadline = NOW + 90_000;
  readonly endedAt = signal<number | null>(null);
  readonly shown = signal(true);
  expiredCount = 0;
}

function setup() {
  const clock = new FakePtahClock(NOW);
  TestBed.configureTestingModule({ providers: [clock.provide()] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = (selector: string): HTMLElement => {
    const found = el.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`missing ${selector}`);
    return found;
  };
  const tick = (now: number): void => {
    clock.time.set(now);
    fixture.detectChanges();
  };
  return { clock, fixture, q, tick };
}

describe('timer owners accessibility', () => {
  it.each([
    ['ptah-timer', 'Run time'],
    ['ptah-countdown', 'Lease'],
  ])('%s has role timer, a silent host and a name', (selector, name) => {
    const host = setup().q(selector);
    expect(host.getAttribute('role')).toBe('timer');
    expect(host.getAttribute('aria-live')).toBe('off');
    expect(host.getAttribute('aria-label')).toBe(name);
    expect(host.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it.each(['ptah-timer', 'ptah-countdown', 'ptah-relative-time'])(
    '%s has a datetime and an absolute title, and no tab stop',
    (selector) => {
      const host = setup().q(selector);
      const time = host.querySelector('time');
      expect(time?.getAttribute('datetime')).toBeTruthy();
      expect(time?.getAttribute('title')).toBeTruthy();
      expect(host.hasAttribute('tabindex')).toBe(false);
      expect(host.querySelector('[tabindex]')).toBeNull();
    },
  );

  it('puts the absolute time in the titles', () => {
    const { q } = setup();
    expect(q('ptah-timer time').title).toBe(`Started ${formatAbsolute(NOW - 30_000)}`);
    expect(q('ptah-countdown time').title).toBe(`Ends ${formatAbsolute(NOW + 90_000)}`);
    expect(q('ptah-countdown time').getAttribute('datetime')).toBe(
      new Date(NOW + 90_000).toISOString(),
    );
  });

  it('keeps the live regions unchanged on plain ticks', () => {
    const { q, tick } = setup();
    const live = q('ptah-countdown [aria-live="polite"]');
    const timerLive = q('ptah-timer [aria-live="polite"]');
    const texts: string[] = [];
    for (let s = 1; s <= 25; s++) {
      tick(NOW + s * 1_000);
      texts.push(`${live.textContent}|${timerLive.textContent}`);
    }
    expect(new Set(texts)).toEqual(new Set(['|']));
    tick(NOW + 31_000);
    expect(live.textContent).toBe('Less than 1m left');
    tick(NOW + 45_000);
    expect(live.textContent).toBe('Less than 1m left');
    tick(NOW + 90_000);
    expect(live.textContent).toBe('Expired');
  });

  it('says Stopped once when the timer freezes, and releases its holder', () => {
    const { clock, fixture, q } = setup();
    expect(clock.holders).toBe(3);
    fixture.componentInstance.endedAt.set(NOW);
    fixture.detectChanges();
    expect(q('ptah-timer [aria-live="polite"]').textContent).toBe('Stopped');
    expect(clock.holders).toBe(2);
  });

  it('emits expired once after a jump past the deadline and releases its holder', () => {
    const { clock, fixture, q, tick } = setup();
    tick(NOW + 10 * 60_000);
    tick(NOW + 11 * 60_000);
    expect(fixture.componentInstance.expiredCount).toBe(1);
    expect(q('ptah-countdown').getAttribute('data-state')).toBe('expired');
    expect(clock.holders).toBe(2);
  });

  it('releases every holder on destroy', () => {
    const { clock, fixture } = setup();
    fixture.componentInstance.shown.set(false);
    fixture.detectChanges();
    expect(clock.holders).toBe(0);
  });

  it('turns off the countdown transition and animation under reduced motion', () => {
    const rule = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:host\s*\{([^}]*)\}/.exec(
      PTAH_COUNTDOWN_STYLES,
    );
    expect(rule?.[1]).toContain('transition: none');
    expect(rule?.[1]).toContain('animation: none');
    expect(PTAH_COUNTDOWN_STYLES).not.toMatch(/@keyframes/);
  });
});
