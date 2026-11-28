import { TestBed } from '@angular/core/testing';
import type { SurfaceMeterProps } from '@ptah-extension/shared';
import { DashboardMeterComponent } from './dashboard-meter.component';

describe('DashboardMeterComponent', () => {
  function render(node: SurfaceMeterProps): HTMLElement {
    const fixture = TestBed.createComponent(DashboardMeterComponent);
    fixture.componentRef.setInput('node', node);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  const widths = (element: HTMLElement) => Array.from(
    element.querySelectorAll<HTMLElement>('[role="img"] [style]'), fill => fill.style.width,
  );

  it('renders scaled widths, muted capacity and an accessible summary', () => {
    const element = render({
      title: 'Context',
      segments: [
        { label: 'Used', amount: 20, value: '20k' },
        { label: 'Free', amount: 80, muted: true },
      ],
    });
    expect(element.querySelector('h3')?.textContent).toBe('Context');
    expect(widths(element)).toEqual(['20%', '80%']);
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Used: 20k, 20%; Free: 80, 80%');
    expect(element.querySelector('[role="img"] span:last-child')?.classList.contains('bg-base-content/20')).toBe(true);
    expect(element.querySelector('li:last-child')?.classList.contains('text-base-content-muted')).toBe(true);
    expect(element.querySelector('li:first-child')?.textContent).toContain('20k');
  });

  it('uses a fallback name for a blank title and treats invalid amounts as zero', () => {
    const element = render({ title: '', segments: [
      { label: 'Invalid', amount: NaN }, { label: 'Negative', amount: -5 }, { label: 'Valid', amount: 10 },
    ] });
    expect(element.querySelector('h3')).toBeNull();
    expect(element.querySelector('section')?.getAttribute('aria-label')).toBe('Meter');
    expect(widths(element)).toEqual(['0%', '0%', '100%']);
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label'))
      .toBe('Invalid: 0, 0%; Negative: 0, 0%; Valid: 10, 100%');
  });

  it.each([
    [0, ['0%', '0%']],
    [Number.MAX_VALUE, ['50%', '50%']],
  ])('keeps widths finite for amounts of %s', (amount, expected) => {
    const element = render({ segments: [{ label: 'First', amount }, { label: 'Second', amount }] });
    expect(widths(element)).toEqual(expected);
    expect(element.querySelector('h3')).toBeNull();
  });
});
