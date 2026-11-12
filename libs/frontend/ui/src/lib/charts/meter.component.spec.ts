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

describe('meter hideLabel, valueText and role', () => {
  it('hides the label visually and keeps it in the DOM and aria-label', () => {
    const el = render({ value: 10, hideLabel: true });
    const label = el.querySelector('span') as HTMLElement;
    expect(label.classList.contains('sr-only')).toBe(true);
    expect(label.textContent).toBe('Used');
    expect(el.querySelector('[role="meter"]')?.getAttribute('aria-label')).toBe('Used');
  });

  it('keeps the label visible by default', () => {
    expect(render({ value: 10 }).querySelector('span')?.classList.contains('sr-only')).toBe(false);
  });

  it('replaces the visible text and aria-valuetext with valueText', () => {
    const el = render({ value: 45, valueText: '45%' });
    expect(el.querySelector('.tabular-nums')?.textContent?.trim()).toBe('45%');
    expect(el.querySelector('[role="meter"]')?.getAttribute('aria-valuetext')).toBe('45%');
  });

  it('shows Unavailable for invalid data even with valueText', () => {
    const el = render({ value: 5, max: 0, valueText: '5%' });
    expect(el.textContent).toContain('Unavailable');
    expect(el.querySelector('[role]')).toBeNull();
  });

  it('combines hideLabel and valueText', () => {
    const el = render({ value: 45, hideLabel: true, valueText: '45%' });
    expect(el.querySelector('span')?.classList.contains('sr-only')).toBe(true);
    expect(el.querySelector('[role="meter"]')?.getAttribute('aria-valuetext')).toBe('45%');
    expect(el.textContent).toContain('45%');
  });

  it('renders a determinate progressbar with ARIA values', () => {
    const bar = render({ value: 30, role: 'progressbar' }).querySelector('[role="progressbar"]') as HTMLElement;
    expect(['aria-valuemin', 'aria-valuemax', 'aria-valuenow'].map((a) => bar.getAttribute(a))).toEqual(['0', '100', '30']);
    expect(bar.getAttribute('aria-label')).toBe('Used');
  });

  it.each(['meter', 'progressbar'])('keeps indeterminate a progressbar without values for role %s', (role) => {
    const bar = render({ value: 0, max: 0, indeterminate: true, role }).querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
  });

  it('shows valueText and sets aria-valuetext for an indeterminate bar, still without aria-valuenow', () => {
    const el = render({ value: 0, max: 0, indeterminate: true, valueText: 'Waiting for server' });
    const bar = el.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute('aria-valuetext')).toBe('Waiting for server');
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    expect(el.querySelector('.tabular-nums')?.textContent?.trim()).toBe('Waiting for server');
  });

  it('keeps the In progress text for an indeterminate bar without valueText', () => {
    const el = render({ value: 0, max: 0, indeterminate: true });
    expect(el.querySelector('.tabular-nums')?.textContent?.trim()).toBe('In progress');
    expect(el.querySelector('[role="progressbar"]')?.hasAttribute('aria-valuetext')).toBe(false);
  });

  it('keeps custom text for assistive tech when showValue is false', () => {
    const el = render({ value: 10, showValue: false, valueText: '10 percent' });
    const text = el.querySelector('.tabular-nums') as HTMLElement;
    expect(text.classList.contains('sr-only')).toBe(true);
    expect(text.textContent?.trim()).toBe('10 percent');
  });

  it('keeps a data-testid on the host element', () => {
    const fixture = TestBed.createComponent(PtahMeterComponent);
    fixture.nativeElement.setAttribute('data-testid', 'my-meter');
    fixture.componentRef.setInput('value', 1);
    fixture.componentRef.setInput('max', 2);
    fixture.componentRef.setInput('label', 'Used');
    fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('data-testid')).toBe('my-meter');
    expect(fixture.nativeElement.querySelector('[data-testid]')).toBeNull();
  });

  it('gives no role for invalid data with progressbar', () => {
    expect(render({ value: 5, max: 0, role: 'progressbar' }).querySelector('[role]')).toBeNull();
  });
});
