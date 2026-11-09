import { TestBed } from '@angular/core/testing';
import { PtahMeterComponent } from './meter.component';

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
