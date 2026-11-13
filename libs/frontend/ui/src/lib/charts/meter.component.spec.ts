import { Component } from '@angular/core';
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

it.each([0, 90, 100, 150])('keeps explicit gold at %i percent', (value) => {
  const fill = render({ value, tone: 'gold' }).querySelector('[role="meter"] > div') as HTMLElement;
  expect(fill.classList.contains('bg-[var(--ptah-gold)]')).toBe(true);
});

describe('opt-in bar appearance', () => {
  it('keeps the width transition by default', () => {
    const fill = render({ value: 30 }).querySelector('[role="meter"] > div') as HTMLElement;
    expect(fill.classList.contains('transition-[width]')).toBe(true);
    expect(fill.classList.contains('motion-reduce:transition-none')).toBe(true);
  });

  it('removes the width transition when animate is false', () => {
    const fill = render({ value: 30, animate: false }).querySelector('[role="meter"] > div') as HTMLElement;
    expect(fill.classList.contains('transition-[width]')).toBe(false);
    expect(fill.classList.contains('motion-reduce:transition-none')).toBe(false);
    expect(fill.style.width).toBe('30%');
  });

  it('uses primary fill and primary stripe ink when requested', () => {
    const fill = render({ value: 30, tone: 'primary' }).querySelector('[role="meter"] > div') as HTMLElement;
    const striped = render({ value: 30, tone: 'primary', stripes: true }).querySelector('[role="meter"] > div') as HTMLElement;
    expect(fill.classList.contains('bg-primary')).toBe(true);
    expect(striped.classList.contains('text-primary')).toBe(true);
  });

  it('uses primary on the indeterminate fill too', () => {
    const fill = render({ value: 0, max: 0, indeterminate: true, tone: 'primary' }).querySelector('[role="progressbar"] > div') as HTMLElement;
    expect(fill.classList.contains('bg-primary')).toBe(true);
  });
});

describe('indeterminate appearance', () => {
  it('keeps the original pulse by default', () => {
    const fill = render({ value: 0, max: 0, indeterminate: true }).querySelector('[role="progressbar"] > div') as HTMLElement;
    expect(fill.classList.contains('w-1/3')).toBe(true);
    expect(fill.classList.contains('animate-pulse')).toBe(true);
    expect(fill.classList.contains('ptah-meter-sweep')).toBe(false);
  });

  it('offers a 40 percent sweep with a reduced-motion full-width faint state', () => {
    const el = render({ value: 0, max: 0, indeterminate: true, indeterminateStyle: 'sweep', tone: 'gold' });
    const bar = el.querySelector('[role="progressbar"]') as HTMLElement;
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.classList.contains('ptah-meter-sweep')).toBe(true);
    expect(fill.classList.contains('bg-[var(--ptah-gold)]')).toBe(true);
    expect(fill.classList.contains('animate-pulse')).toBe(false);
    expect(bar.getAttribute('aria-label')).toBe('Used');
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    const styles = Array.from(document.querySelectorAll('style')).map((style) => style.textContent).join('\n');
    expect(styles).toContain('width: 40%');
    expect(styles).toContain('prefers-reduced-motion: reduce');
    expect(styles).toContain('width: 100%; opacity: 0.35');
    expect(styles).toContain('translateX(250%)');
  });
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
  it('uses aria-label by default without aria-labelledby', () => {
    const bar = render({ value: 10 }).querySelector('[role="meter"]') as HTMLElement;
    expect(bar.getAttribute('aria-label')).toBe('Used');
    expect(bar.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('links an external label to the inner progressbar', () => {
    const el = render({ value: 10, barRole: 'progressbar', ariaLabelledby: 'outside-label' });
    const bar = el.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute('aria-labelledby')).toBe('outside-label');
    expect(bar.hasAttribute('aria-label')).toBe(false);
    expect(el.hasAttribute('role')).toBe(false);
  });

  it('links an external label to an indeterminate bar', () => {
    const bar = render({ value: 0, max: 0, indeterminate: true, ariaLabelledby: 'outside-label' }).querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute('aria-labelledby')).toBe('outside-label');
    expect(bar.hasAttribute('aria-label')).toBe(false);
  });

  it('accepts placement classes and a track color override on the host', () => {
    @Component({
      standalone: true,
      imports: [PtahMeterComponent],
      template: '<ptah-meter class="mt-auto shrink-0" style="--ptah-meter-track: red" [value]="10" [max]="100" label="Used" />',
    })
    class HostComponent {}
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('ptah-meter') as HTMLElement;
    expect(host.classList.contains('mt-auto')).toBe(true);
    expect(host.classList.contains('shrink-0')).toBe(true);
    expect(host.style.getPropertyValue('--ptah-meter-track').trim()).toBe('red');
    expect(host.querySelector('[role="meter"]')?.classList.contains('bg-[var(--ptah-meter-track,var(--surface-border-strong))]')).toBe(true);
  });

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
    const bar = render({ value: 30, barRole: 'progressbar' }).querySelector('[role="progressbar"]') as HTMLElement;
    expect(['aria-valuemin', 'aria-valuemax', 'aria-valuenow'].map((a) => bar.getAttribute(a))).toEqual(['0', '100', '30']);
    expect(bar.getAttribute('aria-label')).toBe('Used');
  });

  it.each(['meter', 'progressbar'])('keeps indeterminate a progressbar without values for role %s', (role) => {
    const bar = render({ value: 0, max: 0, indeterminate: true, barRole: role }).querySelector('[role="progressbar"]') as HTMLElement;
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
    expect(render({ value: 5, max: 0, barRole: 'progressbar' }).querySelector('[role]')).toBeNull();
  });

  it('puts the static barRole attribute on the inner bar and no role on the host', () => {
    @Component({
      standalone: true,
      imports: [PtahMeterComponent],
      template: '<ptah-meter [value]="45" [max]="100" label="Step" barRole="progressbar" />',
    })
    class HostComponent {}
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('ptah-meter') as HTMLElement;
    expect(host.hasAttribute('role')).toBe(false);
    expect(host.querySelectorAll('[role]').length).toBe(1);
    expect(host.querySelector('[role="progressbar"]')).not.toBeNull();
  });
});

describe('marker and stripes', () => {
  it('draws no marker and keeps the track classes by default', () => {
    const el = render({ value: 10 });
    expect(el.querySelector('[data-meter-marker]')).toBeNull();
    expect(el.querySelector('[role="meter"]')?.classList.contains('relative')).toBe(false);
    expect((el.querySelector('[role="meter"] > div') as HTMLElement).style.backgroundImage).toBe('');
  });

  it('draws an aria-hidden marker at the percent without changing the value', () => {
    const el = render({ value: 30, marker: 80 });
    const tick = el.querySelector('[data-meter-marker]') as HTMLElement;
    expect(tick.style.left).toBe('calc(80% - 0.8px)');
    expect(tick.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('30');
  });

  it('clamps the marker and hides it for non-finite input or invalid data', () => {
    expect((render({ value: 30, marker: 150 }).querySelector('[data-meter-marker]') as HTMLElement).style.left).toBe('calc(100% - 1px)');
    expect(render({ value: 30, marker: Number.NaN }).querySelector('[data-meter-marker]')).toBeNull();
    expect(render({ value: 30, max: 0, marker: 50 }).querySelector('[data-meter-marker]')).toBeNull();
  });

  it('draws stripes in the tone ink over the track color', () => {
    const fill = render({ value: 50, tone: 'err', stripes: true }).querySelector('[role="meter"] > div') as HTMLElement;
    expect(fill.classList.contains('bg-[var(--ptah-badge-neutral-ink)]')).toBe(false);
    expect(fill.className).not.toMatch(/(^|\s)bg-state/);
    expect(fill.classList.contains('text-state-err')).toBe(true);
    expect(fill.style.backgroundImage).toContain('repeating-linear-gradient');
  });
});

describe('label row', () => {
  const row = (el: HTMLElement) => el.querySelector('[data-meter-row]') as HTMLElement;

  it('removes the visual row and mb-1 when label and value are both hidden', () => {
    const el = render({ value: 10, hideLabel: true, showValue: false });
    expect(row(el).classList.contains('mb-1')).toBe(false);
    expect(row(el).classList.contains('flex')).toBe(false);
    expect(row(el).classList.contains('sr-only')).toBe(true);
    expect(el.querySelector('.mb-1')).toBeNull();
    expect(el.querySelector('[role="meter"]')?.getAttribute('aria-label')).toBe('Used');
    expect(el.textContent).toContain('Used');
  });

  it('keeps the accessible name when the bar is indeterminate and bare', () => {
    const el = render({ value: 0, max: 0, indeterminate: true, hideLabel: true, showValue: false });
    expect(el.querySelector('.mb-1')).toBeNull();
    expect(el.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe('Used');
  });

  it.each([
    [{}],
    [{ hideLabel: true }],
    [{ showValue: false }],
  ])('keeps the visual row for %j', (extra) => {
    const el = render({ value: 10, ...extra });
    expect(row(el).classList.contains('mb-1')).toBe(true);
    expect(row(el).classList.contains('flex')).toBe(true);
    expect(row(el).classList.contains('sr-only')).toBe(false);
  });
});
