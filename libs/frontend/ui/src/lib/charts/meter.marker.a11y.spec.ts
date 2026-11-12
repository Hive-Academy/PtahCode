import { TestBed } from '@angular/core/testing';
import { PtahMeterComponent } from './meter.component';

function create(inputs: Record<string, unknown>): HTMLElement {
  const fixture = TestBed.createComponent(PtahMeterComponent);
  for (const [key, val] of Object.entries({ max: 100, label: 'Used', ...inputs })) {
    fixture.componentRef.setInput(key, val);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ptah-meter marker and stripes a11y', () => {
  it('keeps the ARIA attributes the same with marker and stripes set', () => {
    const base = create({ value: 40 }).querySelector('[role="meter"]') as HTMLElement;
    const rich = create({ value: 40, marker: 80, stripes: true, tone: 'warn' }).querySelector('[role="meter"]') as HTMLElement;
    for (const name of ['aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-label', 'aria-valuetext']) {
      expect(rich.getAttribute(name)).toBe(base.getAttribute(name));
    }
  });

  it('hides the marker from assistive technology', () => {
    const tick = create({ value: 40, marker: 80 }).querySelector('[data-meter-marker]');
    expect(tick?.getAttribute('aria-hidden')).toBe('true');
    expect(tick?.hasAttribute('role')).toBe(false);
  });

  it('keeps the value as text when stripes are on', () => {
    expect(create({ value: 40, stripes: true, tone: 'err' }).textContent).toContain('40 / 100');
  });
});
