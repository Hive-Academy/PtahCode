import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FakePtahClock } from './fake-ptah-clock';
import { PtahRelativeTimeComponent } from './relative-time.component';

const NOW = Date.UTC(2026, 0, 10, 12, 0, 0);

function setup(
  clock: FakePtahClock,
  value: number,
): ComponentFixture<PtahRelativeTimeComponent> {
  TestBed.configureTestingModule({ providers: [clock.provide()] });
  const fixture = TestBed.createComponent(PtahRelativeTimeComponent);
  fixture.componentRef.setInput('value', value);
  fixture.detectChanges();
  return fixture;
}

describe('PtahRelativeTimeComponent', () => {
  it('renders relative text with an absolute title and datetime', () => {
    const fixture = setup(new FakePtahClock(NOW), NOW - 300_000);
    const el = fixture.nativeElement as HTMLElement;
    const time = el.querySelector('time');
    expect(time?.textContent).toBe('5m ago');
    expect(time?.getAttribute('datetime')).toBe(new Date(NOW - 300_000).toISOString());
    expect(time?.getAttribute('title')).toBe(new Date(NOW - 300_000).toLocaleString());
    expect(el.getAttribute('role')).toBeNull();
    expect(el.querySelector('[aria-live]')).toBeNull();
  });

  it('keeps the same text node until the formatted text changes', () => {
    const clock = new FakePtahClock(NOW);
    const fixture = setup(clock, NOW - 120_000);
    const time = (fixture.nativeElement as HTMLElement).querySelector('time');
    const textNode = time?.firstChild;
    clock.time.set(NOW + 1_000);
    fixture.detectChanges();
    expect(time?.textContent).toBe('2m ago');
    expect(time?.firstChild).toBe(textNode);
    clock.time.set(NOW + 60_000);
    fixture.detectChanges();
    expect(time?.textContent).toBe('3m ago');
  });

  it('holds no clock for an invalid value and holds it once the value is valid', () => {
    const clock = new FakePtahClock(NOW);
    const fixture = setup(clock, Number.NaN);
    const time = (fixture.nativeElement as HTMLElement).querySelector('time');
    expect(time?.textContent).toBe('');
    expect(clock.holders).toBe(0);
    fixture.componentRef.setInput('value', NOW - 60_000);
    fixture.detectChanges();
    expect(clock.holders).toBe(1);
    expect(time?.textContent).toBe('1m ago');
  });

  it('holds the clock until destroy', () => {
    const clock = new FakePtahClock(NOW);
    const fixture = setup(clock, NOW);
    expect(clock.holders).toBe(1);
    fixture.destroy();
    expect(clock.holders).toBe(0);
  });
});
