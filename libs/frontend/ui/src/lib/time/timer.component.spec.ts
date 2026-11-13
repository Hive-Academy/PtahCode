import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FakePtahClock } from './fake-ptah-clock';
import { PtahTimerComponent } from './timer.component';

const START = Date.UTC(2026, 0, 10, 12, 0, 0);

function setup(clock: FakePtahClock): ComponentFixture<PtahTimerComponent> {
  TestBed.configureTestingModule({ providers: [clock.provide()] });
  const fixture = TestBed.createComponent(PtahTimerComponent);
  fixture.componentRef.setInput('startedAt', START);
  fixture.detectChanges();
  return fixture;
}

function host(f: ComponentFixture<PtahTimerComponent>): HTMLElement {
  return f.nativeElement as HTMLElement;
}

function timeText(f: ComponentFixture<PtahTimerComponent>): string {
  return host(f).querySelector('time')?.textContent ?? '';
}

describe('PtahTimerComponent', () => {
  it('derives the elapsed time from the timestamp, not from a tick count', () => {
    const clock = new FakePtahClock(START + 5_000);
    const fixture = setup(clock);
    expect(timeText(fixture)).toBe('0:05');
    clock.time.set(START + 3_723_000);
    fixture.detectChanges();
    expect(timeText(fixture)).toBe('1:02:03');
  });

  it('freezes at endedAt, releases the clock and ignores later ticks', () => {
    const clock = new FakePtahClock(START + 5_000);
    const fixture = setup(clock);
    expect(clock.holders).toBe(1);
    fixture.componentRef.setInput('endedAt', new Date(START + 65_000));
    fixture.detectChanges();
    expect(clock.holders).toBe(0);
    expect(timeText(fixture)).toBe('1:05');
    clock.time.set(START + 999_000);
    fixture.detectChanges();
    expect(timeText(fixture)).toBe('1:05');
    expect(host(fixture).getAttribute('data-state')).toBe('frozen');
  });

  it('holds the clock again when it resumes', () => {
    const clock = new FakePtahClock(START);
    const fixture = setup(clock);
    fixture.componentRef.setInput('endedAt', START + 1_000);
    fixture.detectChanges();
    fixture.componentRef.setInput('endedAt', null);
    fixture.detectChanges();
    expect(clock.holders).toBe(1);
    expect(host(fixture).getAttribute('data-state')).toBe('running');
  });

  it('supports the compact format and an ISO string start', () => {
    const clock = new FakePtahClock(START + 303_000);
    const fixture = setup(clock);
    fixture.componentRef.setInput('startedAt', new Date(START).toISOString());
    fixture.componentRef.setInput('format', 'compact');
    fixture.detectChanges();
    expect(timeText(fixture)).toBe('5m 3s');
  });

  it('shows -- and no title or datetime for an invalid start', () => {
    const clock = new FakePtahClock(START);
    const fixture = setup(clock);
    fixture.componentRef.setInput('startedAt', 'bad');
    fixture.detectChanges();
    const time = host(fixture).querySelector('time');
    expect(time?.textContent).toBe('--');
    expect(time?.getAttribute('title')).toBe('');
    expect(time?.hasAttribute('datetime')).toBe(false);
  });

  it('holds no clock for an invalid start and holds it again once the start is valid', () => {
    const clock = new FakePtahClock(START + 5_000);
    const fixture = setup(clock);
    fixture.componentRef.setInput('startedAt', 'bad');
    fixture.detectChanges();
    expect(clock.holders).toBe(0);
    fixture.componentRef.setInput('startedAt', START);
    fixture.detectChanges();
    expect(clock.holders).toBe(1);
    expect(timeText(fixture)).toBe('0:05');
  });

  it('does not announce Stopped when it starts frozen', () => {
    const clock = new FakePtahClock(START + 5_000);
    TestBed.configureTestingModule({ providers: [clock.provide()] });
    const fixture = TestBed.createComponent(PtahTimerComponent);
    fixture.componentRef.setInput('startedAt', START);
    fixture.componentRef.setInput('endedAt', START + 65_000);
    fixture.detectChanges();
    expect(host(fixture).querySelector('.ptah-time-live')?.textContent).toBe('');
  });

  it('announces Stopped only when it changes from running to frozen', () => {
    const clock = new FakePtahClock(START + 5_000);
    const fixture = setup(clock);
    const live = (): string | null | undefined =>
      host(fixture).querySelector('.ptah-time-live')?.textContent;
    expect(live()).toBe('');
    fixture.componentRef.setInput('endedAt', START + 65_000);
    fixture.detectChanges();
    expect(live()).toBe('Stopped');
  });
});
