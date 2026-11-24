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

it('uses one accessible value for a segmented meter with partial coverage and a marker', () => {
  const spoken = '20 input, 20 output. Cache usage was not reported.';
  const el = create({
    value: 40,
    marker: 80,
    unreported: 'partial',
    segments: [
      { value: 20, tone: 'info', label: 'Input' },
      { value: 20, tone: 'ok', label: 'Output' },
    ],
    valueText: spoken,
  });
  const bar = el.querySelector('[role="meter"]');
  expect(bar?.getAttribute('aria-valuetext')).toBe(spoken);
  expect(bar?.getAttribute('aria-valuenow')).toBe('40');
  expect(bar?.querySelector('[data-meter-marker]')?.getAttribute('aria-hidden')).toBe('true');
  const stub = el.querySelector('.ptah-meter-unreported');
  expect(stub?.getAttribute('aria-hidden')).toBe('true');
  expect(stub?.parentElement).toBe(bar?.parentElement);
});
