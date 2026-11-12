import { TestBed } from '@angular/core/testing';
import { PtahMeterComponent } from './meter.component';

function render(inputs: Record<string, unknown>): HTMLElement {
  const fixture = TestBed.createComponent(PtahMeterComponent);
  for (const [key, val] of Object.entries({ max: 100, label: 'Used', ...inputs })) {
    fixture.componentRef.setInput(key, val);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

it.each([[0, 'bg-[var(--ptah-gold)]'], [89, 'bg-[var(--ptah-gold)]'], [90, 'bg-state-need'], [99, 'bg-state-need'], [100, 'bg-state-err'], [120, 'bg-state-err']])('maps %i to %s', (value, ink) => {
  const fixture = TestBed.createComponent(PtahMeterComponent);
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('max', 100);
  fixture.componentRef.setInput('label', 'Used');
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[role="meter"] > div').classList.contains(ink)).toBe(true);
});

it('clamps negative values and reserves unavailable for invalid input', () => {
  const fixture = TestBed.createComponent(PtahMeterComponent);
  fixture.componentRef.setInput('value', -5);
  fixture.componentRef.setInput('max', 100);
  fixture.componentRef.setInput('label', 'Used');
  fixture.detectChanges();
  const meter = fixture.nativeElement.querySelector('[role="meter"]') as HTMLElement;
  expect(meter.getAttribute('aria-valuenow')).toBe('0');
  expect((meter.firstElementChild as HTMLElement).style.width).toBe('0%');
  fixture.componentRef.setInput('max', 0);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[role="meter"]')).toBeNull();
  expect(fixture.nativeElement.textContent).toContain('Unavailable');
});

it('keeps the default track and text classes', () => {
  const el = render({ value: 10 });
  expect(el.querySelector('[role="meter"]')?.classList.contains('h-1.5')).toBe(true);
  expect(el.firstElementChild?.classList.contains('text-xs')).toBe(true);
});

it('uses a fixed tone when one is set', () => {
  const el = render({ value: 99, tone: 'info' });
  expect(el.querySelector('[role="meter"] > div')?.classList.contains('bg-state-run')).toBe(true);
});

it('clamps the bar over the max and keeps the real value in text', () => {
  const el = render({ value: 150, unit: '%' });
  const meter = el.querySelector('[role="meter"]') as HTMLElement;
  expect((meter.firstElementChild as HTMLElement).style.width).toBe('100%');
  expect(meter.getAttribute('aria-valuenow')).toBe('100');
  expect(meter.getAttribute('aria-valuetext')).toBe('150% / 100%');
  expect(el.textContent).toContain('150% / 100%');
});

it('hides the value visually but keeps it for assistive tech', () => {
  const el = render({ value: 10, showValue: false });
  expect(el.querySelector('.tabular-nums')?.classList.contains('sr-only')).toBe(true);
});
