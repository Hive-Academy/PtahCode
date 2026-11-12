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

  describe('boxed layout', () => {
    const DAY = 86_400_000;

    function boxes(f: ComponentFixture<PtahCountdownComponent>): string[] {
      return Array.from(host(f).querySelectorAll('.ptah-cd-box')).map(
        (b) =>
          `${b.querySelector('.ptah-cd-value')?.textContent}${b.querySelector('.ptah-cd-unit')?.textContent}`,
      );
    }

    it('keeps the inline layout and the md size as defaults', () => {
      const clock = new FakePtahClock(NOW);
      const { fixture } = setup(clock, NOW + 125_000);
      expect(host(fixture).getAttribute('data-layout')).toBe('inline');
      expect(host(fixture).getAttribute('data-size')).toBe('md');
      expect(host(fixture).querySelector('.ptah-cd-box')).toBeNull();
    });

    it('shows days, hours, min and sec boxes with two-digit values', () => {
      const clock = new FakePtahClock(NOW);
      const { fixture } = setup(clock, NOW + 2 * DAY + 3 * 3_600_000 + 4 * 60_000 + 5_000);
      fixture.componentRef.setInput('layout', 'boxed');
      fixture.detectChanges();
      expect(boxes(fixture)).toEqual(['02days', '03hours', '04min', '05sec']);
    });

    it('drops the leading zero units and always keeps min and sec', () => {
      const clock = new FakePtahClock(NOW);
      const { fixture } = setup(clock, NOW + 65_000);
      fixture.componentRef.setInput('layout', 'boxed');
      fixture.detectChanges();
      expect(boxes(fixture)).toEqual(['01min', '05sec']);
    });

    it('derives the boxes from the clock time and rounds the last second up', () => {
      const clock = new FakePtahClock(NOW);
      const { fixture } = setup(clock, NOW + 90_000);
      fixture.componentRef.setInput('layout', 'boxed');
      fixture.detectChanges();
      clock.time.set(NOW + 89_500);
      fixture.detectChanges();
      expect(boxes(fixture)).toEqual(['00min', '01sec']);
    });

    it('shows 00 boxes when expired and keeps the state', () => {
      const clock = new FakePtahClock(NOW);
      const { fixture } = setup(clock, NOW - 1_000);
      fixture.componentRef.setInput('layout', 'boxed');
      fixture.detectChanges();
      expect(boxes(fixture)).toEqual(['00min', '00sec']);
      expect(host(fixture).getAttribute('data-state')).toBe('expired');
    });

    it('shows -- boxes for an invalid deadline', () => {
      const clock = new FakePtahClock(NOW);
      const { fixture } = setup(clock, 'bad');
      fixture.componentRef.setInput('layout', 'boxed');
      fixture.detectChanges();
      expect(boxes(fixture)).toEqual(['--min', '--sec']);
    });

    it.each(['sm', 'md', 'lg'] as const)('sets data-size %s', (size) => {
      const clock = new FakePtahClock(NOW);
      const { fixture } = setup(clock, NOW + 65_000);
      fixture.componentRef.setInput('layout', 'boxed');
      fixture.componentRef.setInput('size', size);
      fixture.detectChanges();
      expect(host(fixture).getAttribute('data-size')).toBe(size);
    });

    it('shows a 3-digit day value and an exact hour boundary', () => {
      const clock = new FakePtahClock(NOW);
      const { fixture } = setup(clock, NOW + 100 * DAY + 5_000);
      fixture.componentRef.setInput('layout', 'boxed');
      fixture.detectChanges();
      expect(boxes(fixture)).toEqual(['100days', '00hours', '00min', '05sec']);
      fixture.componentRef.setInput('deadline', NOW + 3_600_000);
      fixture.detectChanges();
      expect(boxes(fixture)).toEqual(['01hours', '00min', '00sec']);
    });

    it('announces urgent and expired once and emits once in the boxed layout', () => {
      const clock = new FakePtahClock(NOW);
      const { fixture, emitted } = setup(clock, NOW + 90_000);
      fixture.componentRef.setInput('layout', 'boxed');
      fixture.detectChanges();
      const live = host(fixture).querySelector('[aria-live="polite"]');
      expect(live?.textContent).toBe('');
      clock.time.set(NOW + 40_000);
      fixture.detectChanges();
      expect(host(fixture).getAttribute('data-state')).toBe('urgent');
      expect(live?.textContent).toBe('Less than 1m left');
      clock.time.set(NOW + 41_000);
      fixture.detectChanges();
      expect(live?.textContent).toBe('Less than 1m left');
      clock.time.set(NOW + 90_000);
      fixture.detectChanges();
      expect(live?.textContent).toBe('Expired');
      expect(emitted()).toBe(1);
    });

    it('switches layout at run time and has no sr text when inline', () => {
      const clock = new FakePtahClock(NOW);
      const { fixture } = setup(clock, NOW + 65_000);
      expect(host(fixture).querySelector('.ptah-time-sr')).toBeNull();
      fixture.componentRef.setInput('layout', 'boxed');
      fixture.detectChanges();
      expect(host(fixture).querySelector('.ptah-cd-boxes')).not.toBeNull();
      fixture.componentRef.setInput('layout', 'inline');
      fixture.detectChanges();
      expect(host(fixture).querySelector('.ptah-cd-boxes')).toBeNull();
      expect(timeText(fixture)).toBe('1:05');
    });

    it('stays silent for ticks: the boxes are hidden, the sr text and live region are stable', () => {
      const clock = new FakePtahClock(NOW);
      const { fixture } = setup(clock, NOW + 300_000);
      fixture.componentRef.setInput('layout', 'boxed');
      fixture.detectChanges();
      const el = host(fixture);
      expect(el.getAttribute('role')).toBe('timer');
      expect(el.getAttribute('aria-live')).toBe('off');
      expect(el.querySelector('.ptah-cd-boxes')?.getAttribute('aria-hidden')).toBe('true');
      expect(el.querySelector('.ptah-time-sr')?.textContent).toBe('5:00');
      expect(el.querySelector('[aria-live="polite"]')?.textContent).toBe('');
      clock.time.set(NOW + 1_000);
      fixture.detectChanges();
      expect(el.querySelector('[aria-live="polite"]')?.textContent).toBe('');
    });
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
