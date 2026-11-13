import { TestBed } from '@angular/core/testing';
import { PtahRingComponent } from './ring.component';

function render(inputs: Record<string, unknown>): HTMLElement {
  const fixture = TestBed.createComponent(PtahRingComponent);
  for (const [key, val] of Object.entries({ max: 100, label: 'Context', ...inputs })) {
    fixture.componentRef.setInput(key, val);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const arc = (el: HTMLElement): Element | null => el.querySelector('circle[pathLength="100"]');

describe('PtahRingComponent', () => {
  it.each([[10, 'text-[var(--ptah-gold)]'], [90, 'text-state-need'], [100, 'text-state-err']])('maps %i to %s', (value, ink) => {
    expect(arc(render({ value }))?.classList.contains(ink)).toBe(true);
  });

  it('draws the percent as the dash length and centers the percent text', () => {
    const el = render({ value: 25 });
    expect(arc(el)?.getAttribute('stroke-dasharray')).toBe('25 100');
    expect(el.textContent).toContain('25%');
    expect(el.textContent).toContain('25 / 100');
  });

  it('clamps the arc over the max and keeps the real value', () => {
    const el = render({ value: 130 });
    expect(arc(el)?.getAttribute('stroke-dasharray')).toBe('100 100');
    expect(el.textContent).toContain('130 / 100');
  });

  it('shows unavailable and no arc for invalid data', () => {
    const el = render({ value: Number.NaN });
    expect(arc(el)).toBeNull();
    expect(el.textContent).toContain('Unavailable');
  });

  it('omits the center text when showValue is false', () => {
    const el = render({ value: 25, showValue: false });
    expect(el.textContent).not.toContain('25%');
    expect(el.textContent).toContain('25 / 100');
  });

  it('uses a fixed tone when one is set', () => {
    expect(arc(render({ value: 99, tone: 'ok' }))?.classList.contains('text-state-done')).toBe(true);
  });
});

describe('PtahRingComponent inputs', () => {
  const box = (el: HTMLElement): HTMLElement => el.querySelector('span.relative') as HTMLElement;

  it('bare renders the svg only', () => {
    const el = render({ value: 25, bare: true });
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.textContent?.trim()).toBe('');
    expect(el.querySelector('[role]')).toBeNull();
    expect(el.querySelector('div')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the default side text, center text, role and value', () => {
    const el = render({ value: 25 });
    expect(el.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('25');
    expect(el.querySelector('.absolute')?.textContent).toContain('25%');
    expect(el.textContent).toContain('Context');
    expect(el.textContent).toContain('25 / 100');
    const [center, sub] = render({ value: 25, size: 'row', subText: 'ready' }).querySelectorAll('.absolute span');
    expect(center.className).toBe('');
    expect(sub.className).toBe('text-xs');
  });

  it('centerOnly hides side text while keeping center text and meter semantics', () => {
    const el = render({ value: 25, centerOnly: true, centerText: '1/4', showValue: false });
    expect(el.textContent?.trim()).toBe('1/4');
    expect(el.querySelector('[role="meter"]')?.getAttribute('aria-label')).toBe('Context');
    expect(el.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('25');
    expect(el.querySelector('div')?.getAttribute('aria-hidden')).toBeNull();
  });

  it('centerText replaces the percent and subText shows below it', () => {
    const el = render({ value: 25, centerText: '3/12', subText: 'steps', size: 'md' });
    expect(el.textContent).toContain('3/12');
    expect(el.textContent).toContain('steps');
    expect(el.querySelector('.absolute')?.textContent).not.toContain('25%');
  });

  it('hides subText at xs and sm', () => {
    const el = render({ value: 25, subText: 'steps', size: 'sm' });
    expect(el.querySelector('.absolute .hidden')?.textContent).toBe('steps');
  });

  it('indeterminate pulses and shows the default or custom text', () => {
    expect(render({ value: 0, max: 0, indeterminate: true }).textContent).toContain('In progress');
    const el = render({ value: 0, max: 0, indeterminate: true, valueText: 'Indexing' });
    expect(el.textContent).toContain('Indexing');
    expect(el.querySelector('.animate-pulse.motion-reduce\\:animate-none')).not.toBeNull();
    expect(el.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('can keep an image role during an indeterminate core pulse', () => {
    const el = render({ value: 0, max: 0, indeterminate: true, pulseStyle: 'core', indeterminateRole: 'img', ariaLabel: 'Checking readiness' });
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Checking readiness');
    expect(el.querySelector('[role="img"]')?.hasAttribute('aria-valuenow')).toBe(false);
    expect(el.querySelector('.ring-pulse')).not.toBeNull();
  });

  it.each([
    ['normal', 'font-normal'],
    ['medium', 'font-medium'],
    ['semibold', 'font-semibold'],
  ])('maps centerTextWeight %s to %s', (weight, cls) => {
    const el = render({ value: 25, centerTextWeight: weight });
    expect(el.querySelector('.absolute span')?.classList.contains(cls)).toBe(true);
  });

  it.each([
    ['normal', 'font-normal'],
    ['medium', 'font-medium'],
    ['semibold', 'font-semibold'],
  ])('maps subTextWeight %s to %s', (weight, cls) => {
    const el = render({ value: 25, size: 'row', subText: 'ready', subTextWeight: weight });
    expect(el.querySelector('.absolute span:last-child')?.classList.contains(cls)).toBe(true);
    expect(el.querySelector('.absolute span:last-child')?.classList.contains('text-xs')).toBe(true);
  });

  it('valueText replaces the side text', () => {
    expect(render({ value: 25, valueText: 'Quarter' }).textContent).toContain('Quarter');
  });

  it('uses custom automatic warn and danger cut-offs', () => {
    const thresholds = { warn: 60, danger: 85 };
    expect(arc(render({ value: 59, thresholds }))?.classList.contains('text-[var(--ptah-gold)]')).toBe(true);
    expect(arc(render({ value: 60, thresholds }))?.classList.contains('text-state-need')).toBe(true);
    expect(arc(render({ value: 85, thresholds }))?.classList.contains('text-state-err')).toBe(true);
    expect(arc(render({ value: 85, thresholds, tone: 'ok' }))?.classList.contains('text-state-done')).toBe(true);
  });

  it('normalizes reversed and non-finite thresholds', () => {
    expect(arc(render({ value: 70, thresholds: { warn: 90, danger: 60 } }))?.classList.contains('text-state-err')).toBe(true);
    expect(arc(render({ value: 85, thresholds: { warn: Number.NaN, danger: Infinity } }))?.classList.contains('text-state-need')).toBe(false);
    expect(arc(render({ value: 92, thresholds: { warn: Number.NaN, danger: Infinity } }))?.classList.contains('text-state-need')).toBe(true);
    expect(arc(render({ value: 100, thresholds: { warn: Number.NaN, danger: Infinity } }))?.classList.contains('text-state-err')).toBe(true);
  });

  it('keeps default geometry, track, role and quarter-arc pulse', () => {
    const el = render({ value: 25 });
    const circles = el.querySelectorAll('circle');
    expect(circles[0].getAttribute('stroke-width')).toBe('4');
    expect(circles[1].getAttribute('stroke-width')).toBe('4');
    expect(circles[0].getAttribute('r')).toBe('15');
    expect(circles[0].classList.contains('text-[var(--ptah-ring-track,var(--surface-border-strong))]')).toBe(true);
    expect(el.querySelector('[role="meter"]')?.getAttribute('aria-label')).toBe('Context');
    const pending = render({ value: 0, max: 0, indeterminate: true });
    expect(pending.querySelector('.ring-pulse')).toBeNull();
    expect(arc(pending)?.getAttribute('stroke-dasharray')).toBe('25 100');
  });

  it('supports an image role, label and core pulse', () => {
    const el = render({ value: 50, size: 'row', semanticRole: 'img', ariaLabel: 'Half used' });
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Half used');
    expect(el.querySelector('[role="img"]')?.hasAttribute('aria-valuenow')).toBe(false);
    const pending = render({ value: 0, max: 0, indeterminate: true, pulseStyle: 'core' });
    expect(pending.querySelector('.ring-pulse')).not.toBeNull();
    expect(arc(pending)).toBeNull();
  });

  it('hides a zero arc and fades the arc only when asked', () => {
    expect(arc(render({ value: 0, hideZeroArc: true }))?.getAttribute('opacity')).toBe('0');
    expect(arc(render({ value: 0 }))?.getAttribute('opacity')).toBeNull();
    expect(arc(render({ value: 50, fadeArc: true }))?.classList.contains('fade-arc')).toBe(true);
    expect(arc(render({ value: 50 }))?.classList.contains('fade-arc')).toBe(false);
  });

  it('keeps the stat tile ring as a named size with its own geometry, soft track and text', () => {
    const el = render({ value: 50, size: 'tile', centerOnly: true, tone: 'accent', subText: 'hidden' });
    const circles = el.querySelectorAll('circle');
    expect(circles[0].getAttribute('stroke-width')).toBe('3.857142857142857');
    expect(circles[0].getAttribute('r')).toBe('16.071428571428573');
    expect(circles[0].classList.contains('text-[var(--ptah-ring-track-soft,var(--surface-border-strong))]')).toBe(true);
    expect(box(el).classList.contains('h-[var(--ptah-stat-value-h,3.5rem)]')).toBe(true);
    expect(el.querySelector('.absolute')?.classList.contains('text-base-content')).toBe(true);
    expect(el.querySelector('.absolute span:last-child')?.classList.contains('hidden')).toBe(true);
  });

  it.each([
    ['stat', 'h-8'],
    ['row', 'h-14'],
    ['lg', 'h-[var(--ptah-ring-size-lg,6rem)]'],
    ['xl', 'h-[var(--ptah-ring-size-xl,7rem)]'],
    ['md', 'h-16'],
  ])('maps size %s to its box class', (size, cls) => {
    expect(box(render({ value: 25, size })).classList.contains(cls)).toBe(true);
  });

  it('shows center text at stat size and hides its sub text', () => {
    const el = render({ value: 25, size: 'stat', centerText: '25', subText: 'pts' });
    expect(el.querySelector('.absolute')?.classList.contains('text-[0.625rem]')).toBe(true);
    expect(el.querySelector('.absolute .hidden')?.textContent).toBe('pts');
  });

  it('omits a percent too wide for stat, but shows a short percent', () => {
    expect(render({ value: 25, size: 'stat', centerOnly: true }).textContent?.trim()).toBe('');
    expect(render({ value: 9, size: 'stat', centerOnly: true }).textContent?.trim()).toBe('9%');
  });
});
