import { TestBed } from '@angular/core/testing';
import { PtahStatComponent } from './stat.component';

function render(inputs: Record<string, unknown>): HTMLElement {
  const fixture = TestBed.createComponent(PtahStatComponent);
  for (const [key, val] of Object.entries({ label: 'Sessions', ...inputs })) {
    fixture.componentRef.setInput(key, val);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PtahStatComponent', () => {
  it('shows the label and the value as text', () => {
    const el = render({ value: 42 });
    expect(el.textContent).toContain('Sessions');
    expect(el.querySelector('.tabular-nums')?.textContent).toBe('42');
    expect(el.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('shows zero as a value', () => {
    expect(render({ value: 0 }).querySelector('.tabular-nums')?.textContent).toBe('0');
  });

  it.each([[Number.NaN], [''], ['  ']])('shows unavailable for %p', (value) => {
    expect(render({ value }).textContent).toContain('Unavailable');
  });

  it('shows the delta with a glyph and a tone', () => {
    const el = render({ value: '1.2k', delta: '+12%', trend: 'up', tone: 'ok' });
    const delta = el.querySelector('.text-state-done') as HTMLElement;
    expect(delta.textContent).toContain('+12%');
    expect(delta.querySelector('[aria-hidden="true"]')?.textContent).toBe('▲');
    expect(delta.querySelector('.sr-only')?.textContent).toBe('up');
  });

  it('shows a hint', () => {
    expect(render({ value: 3, hint: 'Last 7 days' }).textContent).toContain('Last 7 days');
  });

  it('draws a card by default', () => {
    const fixture = TestBed.createComponent(PtahStatComponent);
    fixture.componentRef.setInput('label', 'Sessions');
    fixture.componentRef.setInput('value', 1);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).getAttribute('data-appearance')).toBe('card');
  });

  it('draws no card for the plain appearance and keeps the text', () => {
    const fixture = TestBed.createComponent(PtahStatComponent);
    fixture.componentRef.setInput('label', 'Sessions');
    fixture.componentRef.setInput('value', 5);
    fixture.componentRef.setInput('appearance', 'plain');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.getAttribute('data-appearance')).toBe('plain');
    expect(el.textContent).toContain('Sessions');
    expect(el.querySelector('.tabular-nums')?.textContent).toBe('5');
  });

  it('scales the value text with the size', () => {
    expect(render({ value: 3, size: 'md' }).querySelector('.text-2xl')).not.toBeNull();
  });
});
