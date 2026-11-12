import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PtahCountdownComponent } from './countdown.component';
import { FakePtahClock } from './fake-ptah-clock';

const NOW = Date.UTC(2026, 0, 10, 12, 0, 0);

interface Setup {
  fixture: ComponentFixture<PtahCountdownComponent>;
  emitted: () => number;
}

function setup(clock: FakePtahClock, deadline: number | string): Setup {
  TestBed.configureTestingModule({ providers: [clock.provide()] });
  const fixture = TestBed.createComponent(PtahCountdownComponent);
  let count = 0;
  fixture.componentInstance.expired.subscribe(() => count++);
  fixture.componentRef.setInput('deadline', deadline);
  fixture.detectChanges();
  return { fixture, emitted: () => count };
}

function host(f: ComponentFixture<PtahCountdownComponent>): HTMLElement {
  return f.nativeElement as HTMLElement;
}

function timeText(f: ComponentFixture<PtahCountdownComponent>): string {
  return host(f).querySelector('time')?.textContent ?? '';
}

describe('PtahCountdownComponent', () => {
  it('counts down from the deadline and rounds the last second up', () => {
    const clock = new FakePtahClock(NOW);
    const { fixture } = setup(clock, NOW + 125_000);
    expect(timeText(fixture)).toBe('2:05');
    clock.time.set(NOW + 124_500);
    fixture.detectChanges();
    expect(timeText(fixture)).toBe('0:01');
  });

  it('goes running -> urgent -> expired and emits once', () => {
    const clock = new FakePtahClock(NOW);
    const { fixture, emitted } = setup(clock, NOW + 90_000);
    expect(host(fixture).getAttribute('data-state')).toBe('running');
    clock.time.set(NOW + 40_000);
    fixture.detectChanges();
    expect(host(fixture).getAttribute('data-state')).toBe('urgent');
    clock.time.set(NOW + 90_000);
    fixture.detectChanges();
    expect(host(fixture).getAttribute('data-state')).toBe('expired');
    expect(timeText(fixture)).toBe('0:00');
    clock.time.set(NOW + 95_000);
    fixture.detectChanges();
    expect(emitted()).toBe(1);
    expect(clock.holders).toBe(0);
  });

  it('honors urgentBelowMs and the compact format', () => {
    const clock = new FakePtahClock(NOW);
    const { fixture } = setup(clock, NOW + 200_000);
    fixture.componentRef.setInput('urgentBelowMs', 300_000);
    fixture.componentRef.setInput('format', 'compact');
    fixture.detectChanges();
    expect(host(fixture).getAttribute('data-state')).toBe('urgent');
    expect(timeText(fixture)).toBe('3m 20s');
    expect(host(fixture).querySelector('[aria-live="polite"]')?.textContent).toBe(
      'Less than 5m left',
    );
  });

  it('keeps the urgent announcement when urgentBelowMs changes while urgent', () => {
    const clock = new FakePtahClock(NOW);
    const { fixture } = setup(clock, NOW + 30_000);
    const live = host(fixture).querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('Less than 1m left');
    fixture.componentRef.setInput('urgentBelowMs', 120_000);
    fixture.detectChanges();
    expect(host(fixture).getAttribute('data-state')).toBe('urgent');
    expect(live?.textContent).toBe('Less than 1m left');
  });

  it('emits once when the deadline is already past at first render', () => {
    const clock = new FakePtahClock(NOW);
    const { fixture, emitted } = setup(clock, NOW - 1_000);
    fixture.detectChanges();
    expect(emitted()).toBe(1);
    expect(clock.holders).toBe(0);
  });

  it('emits again for a new deadline value and holds the clock again', () => {
    const clock = new FakePtahClock(NOW);
    const { fixture, emitted } = setup(clock, NOW - 1_000);
    fixture.componentRef.setInput('deadline', NOW + 10_000);
    fixture.detectChanges();
    expect(clock.holders).toBe(1);
    clock.time.set(NOW + 10_000);
    fixture.detectChanges();
    expect(emitted()).toBe(2);
  });

  it('shows -- for an invalid deadline and does not hold the clock or emit', () => {
    const clock = new FakePtahClock(NOW);
    const { fixture, emitted } = setup(clock, 'bad');
    expect(timeText(fixture)).toBe('--');
    expect(host(fixture).querySelector('time')?.getAttribute('title')).toBe('');
    expect(clock.holders).toBe(0);
    expect(emitted()).toBe(0);
  });
});
