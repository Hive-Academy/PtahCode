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
