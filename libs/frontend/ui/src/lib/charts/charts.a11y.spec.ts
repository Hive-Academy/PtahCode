/**
 * Accessibility of the chart family (TASK_2026_976_2421): role, accessible
 * name, ARIA values (absent for invalid or indeterminate data), text
 * alternatives, visible value text, and reduced-motion classes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahDonutComponent } from './donut.component';
import { PtahMeterComponent } from './meter.component';
import { PtahRingComponent } from './ring.component';
import { PtahSparklineComponent } from './sparkline.component';
import { PtahStackedBarComponent } from './stacked-bar.component';
import { PtahStatComponent } from './stat.component';

function render<T>(type: Type<T>, inputs: Record<string, unknown>): HTMLElement {
  const fixture = TestBed.createComponent(type);
  for (const [key, val] of Object.entries(inputs)) fixture.componentRef.setInput(key, val);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const ARIA_VALUES = ['aria-valuemin', 'aria-valuemax', 'aria-valuenow'];

describe.each([
  ['stacked bar', PtahStackedBarComponent, 'Outcomes: Approved: 3, Failed: 0'],
  ['donut', PtahDonutComponent, 'Outcomes: 3 reviews total. Approved: 3, Failed: 0'],
])('%s accessibility', (_name, type: Type<unknown>, accessibleName) => {
  it('names one image with the chart data and hides its visual details from assistive technology', () => {
    const el = render(type, {
      label: 'Outcomes',
      ...(type === PtahDonutComponent ? { centerCaption: 'reviews' } : {}),
      segments: [
        { label: 'Approved', value: 3, color: 'var(--state-ink-done)' },
        { label: 'Failed', value: 0, color: 'var(--state-ink-err)' },
      ],
    });
    const images = el.querySelectorAll('[role="img"]');
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('aria-label')).toBe(accessibleName);
    expect(images[0].querySelector('g[aria-hidden="true"]')).not.toBeNull();
    expect(el.querySelector('[tabindex]')).toBeNull();
  });

  it('gives empty data an accessible name', () => {
    const el = render(type, { label: 'Outcomes', segments: [] });
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toMatch(/^Outcomes: .*No data$/);
  });
});

describe.each([
  ['ptah-meter', PtahMeterComponent],
  ['ptah-ring', PtahRingComponent],
])('%s accessibility', (_name, type: Type<unknown>) => {
  it('is a named meter with ARIA values and visible value text', () => {
    const el = render(type, { value: 40, max: 200, label: 'Tokens', unit: ' t' });
    const meter = el.querySelector('[role="meter"]') as HTMLElement;
    expect(meter.getAttribute('aria-label')).toBe('Tokens');
    expect(ARIA_VALUES.map((a) => meter.getAttribute(a))).toEqual(['0', '200', '40']);
    expect(el.textContent).toContain('40 t / 200 t');
  });

  it('keeps zero as a real value', () => {
    const meter = render(type, { value: 0, max: 10, label: 'Tokens' }).querySelector('[role="meter"]');
    expect(meter?.getAttribute('aria-valuenow')).toBe('0');
  });

  it('drops the role and the ARIA values for invalid data', () => {
    const el = render(type, { value: 5, max: Number.NaN, label: 'Tokens' });
    expect(el.querySelector('[role]')).toBeNull();
    for (const attr of ARIA_VALUES) expect(el.querySelector(`[${attr}]`)).toBeNull();
    expect(el.textContent).toContain('Unavailable');
  });

  it('keeps aria-valuenow in range over the max and states the real value', () => {
    const meter = render(type, { value: 300, max: 200, label: 'Tokens' }).querySelector('[role="meter"]');
    expect(meter?.getAttribute('aria-valuenow')).toBe('200');
    expect(meter?.getAttribute('aria-valuetext')).toBe('300 / 200');
  });

  it('clamps aria-valuenow for a negative value and states the real value', () => {
    const el = render(type, { value: -5, max: 200, label: 'Tokens', unit: ' t' });
    const meter = el.querySelector('[role="meter"]') as HTMLElement;
    expect(ARIA_VALUES.map((a) => meter.getAttribute(a))).toEqual(['0', '200', '0']);
    expect(meter.getAttribute('aria-valuetext')).toBe('-5 t / 200 t');
    expect(el.textContent).toContain('-5 t / 200 t');
  });

  it('omits aria-valuetext for a value in range', () => {
    const meter = render(type, { value: 40, max: 200, label: 'Tokens' }).querySelector('[role="meter"]');
    expect(meter?.hasAttribute('aria-valuetext')).toBe(false);
  });
});

describe('ptah-meter indeterminate', () => {
  it('is a named progressbar without ARIA values', () => {
    const el = render(PtahMeterComponent, { value: 0, max: 0, label: 'Indexing', indeterminate: true });
    const bar = el.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute('aria-label')).toBe('Indexing');
    for (const attr of ARIA_VALUES) expect(bar.hasAttribute(attr)).toBe(false);
    expect(el.textContent).toContain('In progress');
  });
});

describe('ptah-meter progressbar and custom text', () => {
  it('is a named determinate progressbar with a custom aria-valuetext', () => {
    const el = render(PtahMeterComponent, { value: 45, max: 100, label: 'Step', barRole: 'progressbar', valueText: '45%', hideLabel: true });
    const bar = el.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute('aria-label')).toBe('Step');
    expect(ARIA_VALUES.map((a) => bar.getAttribute(a))).toEqual(['0', '100', '45']);
    expect(bar.getAttribute('aria-valuetext')).toBe('45%');
  });
});

describe('ptah-sparkline accessibility', () => {
  it('is a named image with a trend text alternative', () => {
    const svg = render(PtahSparklineComponent, { values: [3, 5, 9], label: 'Cost' }).querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Cost: trend from 3 to 9, 3 points');
  });

  it('shows text when there is no trend', () => {
    expect(render(PtahSparklineComponent, { values: [3], label: 'Cost' }).textContent).toContain('No trend data');
  });
});

describe('ptah-stat accessibility', () => {
  it.each([['up', '▲'], ['down', '▼'], ['flat', '▬']])('gives the %s trend a text alternative', (trend, glyph) => {
    const el = render(PtahStatComponent, { label: 'Cost', value: '$4', delta: '2%', trend });
    expect(el.querySelector('[aria-hidden="true"]')?.textContent).toBe(glyph);
    expect(el.querySelector('.sr-only')?.textContent).toBe(trend);
    expect(el.textContent).toContain('$4');
  });
});

describe('chart reduced motion', () => {
  const source = (file: string): string => readFileSync(join(__dirname, file), 'utf8');

  it.each(['meter.component.ts', 'ring.component.ts', 'sparkline.component.ts', 'stat.component.ts'])(
    '%s pairs every transition and animation with a motion-reduce class',
    (file) => {
      const code = source(file);
      const transitions = code.match(/\btransition-\[/g)?.length ?? 0;
      const animations = code.match(/\banimate-(?!none)\w+/g)?.length ?? 0;
      expect(code.match(/motion-reduce:transition-none/g)?.length ?? 0).toBe(transitions);
      expect(code.match(/motion-reduce:animate-none/g)?.length ?? 0).toBe(animations);
    },
  );

  it('renders the motion-reduce classes on the moving parts', () => {
    const meter = render(PtahMeterComponent, { value: 4, max: 8, label: 'Used' });
    expect(meter.querySelector('.motion-reduce\\:transition-none')).not.toBeNull();
    const busy = render(PtahMeterComponent, { value: 0, max: 0, label: 'Busy', indeterminate: true });
    expect(busy.querySelector('.animate-pulse.motion-reduce\\:animate-none')).not.toBeNull();
    const ring = render(PtahRingComponent, { value: 4, max: 8, label: 'Used' });
    expect(ring.querySelector('.motion-reduce\\:transition-none')).not.toBeNull();
  });
});

describe('ptah-ring new inputs accessibility', () => {
  it('bare is hidden from assistive technology with no role', () => {
    const el = render(PtahRingComponent, { value: 4, max: 8, label: 'Used', bare: true });
    expect(el.querySelector('div')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[role]')).toBeNull();
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('centerText and subText become aria-valuetext of a ranged ring', () => {
    const meter = render(PtahRingComponent, { value: 4, max: 8, label: 'Used', centerText: '4 of 8', subText: 'steps', size: 'md' }).querySelector('[role="meter"]');
    expect(meter?.getAttribute('aria-valuetext')).toBe('4 of 8 steps');
    expect(meter?.getAttribute('aria-valuenow')).toBe('4');
  });

  it('valueText is the aria-valuetext of a ranged ring', () => {
    const meter = render(PtahRingComponent, { value: 4, max: 8, label: 'Used', valueText: 'Half' }).querySelector('[role="meter"]');
    expect(meter?.getAttribute('aria-valuetext')).toBe('Half');
  });

  it('indeterminate is a named progressbar without ARIA values', () => {
    const el = render(PtahRingComponent, { value: 0, max: 0, label: 'Indexing', indeterminate: true, valueText: 'Indexing files' });
    const bar = el.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute('aria-label')).toBe('Indexing');
    for (const attr of ARIA_VALUES) expect(bar.hasAttribute(attr)).toBe(false);
    expect(bar.getAttribute('aria-valuetext')).toBe('Indexing files');
    expect(el.querySelector('.animate-pulse.motion-reduce\\:animate-none')).not.toBeNull();
  });

  it('indeterminate without valueText has no aria-valuetext', () => {
    const bar = render(PtahRingComponent, { value: 0, max: 0, label: 'Busy', indeterminate: true }).querySelector('[role="progressbar"]');
    expect(bar?.hasAttribute('aria-valuetext')).toBe(false);
  });

  it.each(['lg', 'xl'])('keeps the %s ring named with a meter role', (size) => {
    const meter = render(PtahRingComponent, { value: 4, max: 8, label: 'Used', size }).querySelector('[role="meter"]');
    expect(meter?.getAttribute('aria-label')).toBe('Used');
  });
});

it('exposes the supplied stat text once and hides the visible value and unit', () => {
  const spoken = 'At least approximately 1,200 tokens';
  const el = render(PtahStatComponent, {
    label: 'Usage', value: '1.2k', unit: 'tokens', accuracy: 'lower-bound-approximate', accessibleValue: spoken,
  });
  expect(el.querySelector('.tabular-nums[aria-hidden="true"]')?.textContent).toBe('≥~1.2k');
  expect(el.querySelector('[data-testid="stat-unit"]')?.getAttribute('aria-hidden')).toBe('true');
  expect(Array.from(el.querySelectorAll('.sr-only'), (node) => node.textContent)).toEqual([spoken]);
});

it('opens the stat tooltip on hover and focus and dismisses it with Escape or blur', () => {
  const fixture = TestBed.createComponent(PtahStatComponent);
  fixture.componentRef.setInput('label', 'Usage');
  fixture.componentRef.setInput('value', 42);
  fixture.componentRef.setInput('layout', 'tile');
  fixture.componentRef.setInput('detail', 'Known subtotal');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const tooltip = el.querySelector<HTMLElement>('[role="tooltip"]');
  expect(el.getAttribute('tabindex')).toBe('0');
  expect(tooltip?.id).toBe(el.getAttribute('aria-describedby'));
  expect(tooltip?.hidden).toBe(true);

  el.dispatchEvent(new MouseEvent('mouseenter'));
  fixture.detectChanges();
  expect(tooltip?.hidden).toBe(false);
  el.dispatchEvent(new MouseEvent('mouseleave'));
  fixture.detectChanges();
  expect(tooltip?.hidden).toBe(true);

  el.focus();
  fixture.detectChanges();
  expect(tooltip?.hidden).toBe(false);
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  fixture.detectChanges();
  expect(el.ownerDocument.activeElement).toBe(el);
  expect(tooltip?.hidden).toBe(true);

  el.blur();
  el.focus();
  fixture.detectChanges();
  expect(tooltip?.hidden).toBe(false);
  el.blur();
  fixture.detectChanges();
  expect(tooltip?.hidden).toBe(true);
});
