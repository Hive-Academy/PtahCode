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

@Component({
  standalone: true,
  imports: [PtahStatComponent],
  template: `<ptah-stat label="Runs" [value]="3" iconPlacement="center-end"><svg ptahStatIcon></svg></ptah-stat>`,
})
class CenterIconHost {}

@Component({
  standalone: true,
  imports: [PtahStatComponent],
  template: `<ptah-stat label="Ring" [value]="3" appearance="surface"><i class="media" ptahStatMedia></i></ptah-stat>`,
})
class MediaHost {}

describe('PtahStatComponent consumer parity inputs', () => {
  const valueEl = (el: HTMLElement) => el.querySelector('.tabular-nums') as HTMLElement;

  it('keeps the value colour and the card appearance by default', () => {
    const { el } = make({});
    expect([...valueEl(el).classList].sort()).toEqual(['font-semibold', 'tabular-nums', 'text-lg']);
    expect(el.getAttribute('data-appearance')).toBe('card');
    expect(el.classList.contains('surface-2')).toBe(false);
  });

  it.each([
    ['primary', 'text-primary'],
    ['success', 'text-success'],
    ['error', 'text-error'],
    ['muted', 'text-base-content-muted'],
    ['ok', 'text-state-done'],
    ['secondary', 'text-secondary'],
    ['warning', 'text-warning'],
    ['info', 'text-state-run'],
    ['warn', 'text-state-need'],
    ['err', 'text-state-err'],
    ['neutral', 'text-[var(--ptah-badge-neutral-ink)]'],
    ['accent', 'text-[var(--ptah-badge-accent-ink)]'],
  ])('colours the value with valueTone %s', (tone, cls) => {
    expect(valueEl(make({ valueTone: tone }).el).classList.contains(cls)).toBe(true);
  });

  it('draws the surface appearance with the surface-2 classes and no card padding rule', () => {
    const { el } = make({ appearance: 'surface' });
    expect(el.getAttribute('data-appearance')).toBe('surface');
    for (const c of ['surface-2', 'rounded-xl', 'p-4', 'min-w-0', 'overflow-hidden']) {
      expect(el.classList.contains(c)).toBe(true);
    }
    expect(el.classList.contains('rounded-2xl')).toBe(false);
  });

  it('uses a 2xl radius only when requested for a surface', () => {
    const { el } = make({ appearance: 'surface', radius: '2xl' });
    expect(el.classList.contains('rounded-2xl')).toBe(true);
    expect(el.classList.contains('rounded-xl')).toBe(false);
    expect(make({ radius: '2xl' }).el.classList.contains('rounded-2xl')).toBe(false);
  });

  it('allows a square surface for cron statistics', () => {
    const { el } = make({ appearance: 'surface', radius: 'none' });
    expect(el.classList.contains('surface-2')).toBe(true);
    expect(el.classList.contains('rounded-xl')).toBe(false);
    expect(el.classList.contains('rounded-2xl')).toBe(false);
  });

  it('keeps the icon at top end and the existing row gap by default', () => {
    const f = TestBed.createComponent(HostComponent);
    f.detectChanges();
    const el = f.nativeElement.querySelector('ptah-stat') as HTMLElement;
    expect(el.hasAttribute('data-icon-placement')).toBe(false);
    expect(el.firstElementChild?.classList.contains('gap-0.5')).toBe(true);
    expect(el.querySelector('[ptahStatIcon]')).not.toBeNull();
  });

  it('places the projected icon at center end when requested', () => {
    const f = TestBed.createComponent(CenterIconHost);
    f.detectChanges();
    const el = f.nativeElement.querySelector('ptah-stat') as HTMLElement;
    expect(el.getAttribute('data-icon-placement')).toBe('center-end');
    expect(el.firstElementChild?.classList.contains('gap-0')).toBe(true);
    expect(el.querySelector('[ptahStatIcon]')).not.toBeNull();
  });

  it('uses medium weight and word wrapping only when requested', () => {
    const defaultValue = valueEl(make({}).el);
    expect(defaultValue.classList.contains('font-semibold')).toBe(true);
    expect(defaultValue.classList.contains('font-medium')).toBe(false);
    expect(defaultValue.classList.contains('break-words')).toBe(false);
    const value = valueEl(make({ valueWeight: 'medium', valueWrap: 'break-words' }).el);
    expect(value.classList.contains('font-medium')).toBe(true);
    expect(value.classList.contains('font-semibold')).toBe(false);
    expect(value.classList.contains('break-words')).toBe(true);
    expect(value.classList.contains('min-w-0')).toBe(true);
  });

  it('projects the media slot before the value', () => {
    const f = TestBed.createComponent(MediaHost);
    f.detectChanges();
    const media = f.nativeElement.querySelector('.media') as HTMLElement;
    expect(media.nextElementSibling?.classList.contains('tabular-nums')).toBe(true);
  });

  it('shows the hint as the caption line', () => {
    const { el } = make({ hint: 'in 2 hours' });
    const hint = [...el.querySelectorAll('span')].find((span) => span.textContent === 'in 2 hours') as HTMLElement;
    expect(hint.classList.contains('text-xs')).toBe(true);
    expect(hint.classList.contains('text-base-content-muted')).toBe(true);
    expect(hint.classList.contains('stat-desc')).toBe(false);
  });

  it('uses stat-desc styling for an opted-in hint', () => {
    const { el } = make({ hint: 'in 2 hours', hintStyle: 'stat-desc' });
    const hint = [...el.querySelectorAll('span')].find((span) => span.textContent === 'in 2 hours') as HTMLElement;
    expect(hint.classList.contains('stat-desc')).toBe(true);
    expect(hint.classList.contains('text-base-content-muted')).toBe(true);
  });
});

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
