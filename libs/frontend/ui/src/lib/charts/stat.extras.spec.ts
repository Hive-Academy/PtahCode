import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { PtahStatComponent } from './stat.component';

function make(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(PtahStatComponent);
  for (const [key, val] of Object.entries({ label: 'Sessions', value: 7, ...inputs })) {
    fixture.componentRef.setInput(key, val);
  }
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

@Component({
  standalone: true,
  imports: [PtahStatComponent],
  template: `<ptah-stat label="Runs" [value]="3" hint="h"><svg ptahStatIcon></svg><p class="extra">More</p></ptah-stat>`,
})
class HostComponent {}

describe('PtahStatComponent extras', () => {
  it('keeps the default DOM when no extra input is set', () => {
    const { el } = make({});
    expect(el.querySelector('[data-testid]')).toBeNull();
    expect(el.querySelector('[aria-busy]')).toBeNull();
    expect(el.querySelectorAll('button').length).toBe(0);
  });

  it('shows the unit after the value', () => {
    expect(make({ unit: 'ms' }).el.querySelector('[data-testid="stat-unit"]')?.textContent).toBe('ms');
  });

  it('hides the unit when the value is unavailable', () => {
    const { el } = make({ unit: 'ms', value: '' });
    expect(el.querySelector('[data-testid="stat-unit"]')).toBeNull();
    expect(el.textContent).toContain('Unavailable');
  });

  it('shows a skeleton with hidden text and aria-busy when loading', () => {
    const { el } = make({ loading: true });
    expect(el.querySelector('[data-testid="stat-skeleton"]')).not.toBeNull();
    expect(el.querySelector('.skeleton')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.sr-only')?.textContent).toBe('Loading');
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('.tabular-nums')).toBeNull();
  });

  it('shows the error as an alert with a named Retry button and emits retry', () => {
    const { fixture, el } = make({ error: 'Could not load.' });
    let count = 0;
    fixture.componentInstance.retry.subscribe(() => count++);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not load.');
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Retry Sessions');
    button.click();
    expect(count).toBe(1);
  });

  it('is not busy when both loading and error are set', () => {
    const { el } = make({ loading: true, error: 'Could not load.' });
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('[aria-busy]')).toBeNull();
  });

  it('projects the content slot after the hint and the icon slot', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.extra')?.textContent).toBe('More');
    expect(el.querySelector('svg[ptahStatIcon]')).not.toBeNull();
  });

  it.each([
    ['good', 'text-state-done'],
    ['bad', 'text-state-err'],
    ['neutral', 'text-[var(--ptah-badge-neutral-ink)]'],
  ])('maps %s polarity to a tone and names it for assistive tech', (polarity, cls) => {
    const { el } = make({ polarity, trend: 'up', delta: '4%' });
    const pill = el.querySelector('[data-testid="stat-pill"]') as HTMLElement;
    expect(pill.classList.contains(cls)).toBe(true);
    expect(pill.querySelector('[aria-hidden="true"]')?.textContent).toBe('▲');
    expect(pill.textContent).toContain('up');
    expect(pill.textContent).toContain('4%');
    expect(pill.querySelector('.sr-only')?.textContent).toBe(`, ${polarity}`);
  });

  it('keeps the label a span by default', () => {
    const { el } = make({});
    expect(el.querySelector('h2,h3,h4,h5,h6')).toBeNull();
    expect(el.querySelector('span.text-xs')?.textContent).toBe('Sessions');
  });

  it.each([2, 3, 4, 5, 6])('renders the label as h%s with the same classes', (level) => {
    const { el } = make({ headingLevel: level });
    const h = el.querySelector(`h${level}`) as HTMLElement;
    expect(h.textContent).toBe('Sessions');
    expect(h.classList.contains('text-xs')).toBe(true);
    expect(h.classList.contains('text-base-content-muted')).toBe(true);
  });

  it('formats the value with a function', () => {
    expect(make({ valueFormat: (v: string | number) => `${v}!` }).el.textContent).toContain('7!');
  });

  it('formats a number with Intl options', () => {
    expect(make({ value: 0.5, valueFormat: { style: 'percent' } }).el.textContent).toContain('50%');
  });

  it('uses a custom placeholder and keeps the default', () => {
    expect(make({ value: '', placeholder: 'N/A' }).el.textContent).toContain('N/A');
    expect(make({ value: '' }).el.textContent).toContain('Unavailable');
  });

  it('shows only the passed copy, never a raw Error or its stack', () => {
    const err = new Error('boom at C:/src/app.ts:1');
    const { el } = make({ error: err });
    const alert = el.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).not.toContain('boom');
    expect(alert.textContent).not.toContain('app.ts');
    const copy = make({ error: 'Could not load.' }).el.querySelector('[role="alert"] .text-state-err');
    expect(copy?.textContent).toBe('Could not load.');
  });

  it('supports data-testid on the host as the test hook', () => {
    const { fixture } = make({});
    const host = fixture.nativeElement as HTMLElement;
    host.setAttribute('data-testid', 'sessions-stat');
    expect(host.matches('[data-testid="sessions-stat"]')).toBe(true);
    expect(host.querySelector('[data-testid="sessions-stat"]')).toBeNull();
  });

  it('draws no pill when polarity is set without a delta or trend', () => {
    expect(make({ polarity: 'good' }).el.querySelector('[data-testid="stat-pill"]')).toBeNull();
  });
});
