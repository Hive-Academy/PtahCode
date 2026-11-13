import { TestBed } from '@angular/core/testing';
import { PtahSparklineComponent } from './sparkline.component';

function render(inputs: Record<string, unknown>): HTMLElement {
  const fixture = TestBed.createComponent(PtahSparklineComponent);
  for (const [key, val] of Object.entries({ label: 'Cost', ...inputs })) {
    fixture.componentRef.setInput(key, val);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PtahSparklineComponent', () => {
  it('draws a line in the accent ink by default', () => {
    const svg = render({ values: [1, 3, 2] }).querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 100 24');
    expect(svg?.classList.contains('text-[var(--ptah-badge-accent-ink)]')).toBe(true);
    expect(svg?.querySelector('polyline')?.getAttribute('points')).toBe('0,22 50,2 100,12');
    expect(svg?.querySelector('polygon')).toBeNull();
  });

  it('adds an area under the line', () => {
    const polygon = render({ values: [0, 10], area: true }).querySelector('polygon');
    expect(polygon?.getAttribute('points')).toBe('0,24 0,22 100,2 100,24');
  });

  it('drops values that are not finite', () => {
    const svg = render({ values: [1, Number.NaN, 2] }).querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Cost: trend from 1 to 2, 2 points');
  });

  it('formats the values in the accessible name', () => {
    const svg = render({
      values: [1, 2.5],
      valueFormat: (n: number) => `${n.toFixed(2)} USD`,
    }).querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Cost: trend from 1.00 USD to 2.50 USD, 2 points');
  });

  it.each([[[]], [[4]]])('shows no trend data for %j', (values) => {
    const el = render({ values });
    expect(el.querySelector('svg')).toBeNull();
    expect(el.textContent).toContain('No trend data');
  });

  it('names the label in the empty-state accessible text', () => {
    const el = render({ values: [] });
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Cost: no trend data');
  });
});
