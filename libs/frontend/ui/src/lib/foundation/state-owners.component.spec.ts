import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahAlertComponent, PtahAlertTone } from './alert.component';
import { PtahSkeletonComponent } from './skeleton.component';
import { PtahSpinnerComponent } from './spinner.component';

it('renders an aria-hidden small spinner by default', () => {
  const fixture = TestBed.createComponent(PtahSpinnerComponent);
  fixture.detectChanges();
  const spinner = fixture.nativeElement.querySelector(
    '.loading',
  ) as HTMLElement;
  expect(spinner.classList.contains('loading-spinner')).toBe(true);
  expect(spinner.classList.contains('loading-sm')).toBe(true);
  expect(spinner.getAttribute('aria-hidden')).toBe('true');
});

it.each(['dots', 'ring'] as const)(
  'renders %s with a screen reader label',
  (kind) => {
    const fixture = TestBed.createComponent(PtahSpinnerComponent);
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('size', 'lg');
    fixture.componentRef.setInput('label', 'Loading reviews');
    fixture.detectChanges();
    const spinner = fixture.nativeElement.querySelector(
      '.loading',
    ) as HTMLElement;
    expect(spinner.classList.contains(`loading-${kind}`)).toBe(true);
    expect(spinner.classList.contains('loading-lg')).toBe(true);
    expect(spinner.getAttribute('role')).toBe('status');
    expect(spinner.getAttribute('aria-hidden')).toBeNull();
    expect(spinner.querySelector('.sr-only')?.textContent).toBe(
      'Loading reviews',
    );
  },
);

it('renders the three state-panel skeleton lines by default', () => {
  const fixture = TestBed.createComponent(PtahSkeletonComponent);
  fixture.detectChanges();
  const container = fixture.nativeElement.querySelector(
    '[aria-hidden="true"]',
  ) as HTMLElement;
  const lines = container.querySelectorAll('.skeleton');
  expect(lines).toHaveLength(3);
  expect(Array.from(lines, (line) => line.classList.contains('h-3'))).toEqual([
    true,
    true,
    true,
  ]);
  expect(Array.from(lines, (line) => line.className)).toEqual([
    expect.stringContaining('w-full'),
    expect.stringContaining('w-5/6'),
    expect.stringContaining('w-4/6'),
  ]);
});

it('supports line count and height', () => {
  const fixture = TestBed.createComponent(PtahSkeletonComponent);
  fixture.componentRef.setInput('lines', 2);
  fixture.componentRef.setInput('height', '2rem');
  fixture.detectChanges();
  const lines = fixture.nativeElement.querySelectorAll(
    '.skeleton',
  ) as NodeListOf<HTMLElement>;
  expect(lines).toHaveLength(2);
  expect(lines[0].style.height).toBe('2rem');
});

it('renders one hidden block', () => {
  const fixture = TestBed.createComponent(PtahSkeletonComponent);
  fixture.componentRef.setInput('shape', 'block');
  fixture.detectChanges();
  expect(
    fixture.nativeElement.querySelectorAll('[aria-hidden="true"] .skeleton'),
  ).toHaveLength(1);
  expect(
    fixture.nativeElement.querySelector('.skeleton').classList.contains('h-24'),
  ).toBe(true);
});

@Component({
  standalone: true,
  imports: [PtahAlertComponent],
  template: `<ptah-alert tone="warning" title="Attention" [compact]="true"
    >Review needed<button alertAction type="button">Review</button></ptah-alert
  >`,
})
class Host {}

it.each<PtahAlertTone>(['info', 'success', 'warning', 'error'])(
  'renders %s semantics',
  (tone) => {
    const fixture = TestBed.createComponent(PtahAlertComponent);
    fixture.componentRef.setInput('tone', tone);
    fixture.detectChanges();
    const alert = fixture.nativeElement.querySelector('.alert') as HTMLElement;
    expect(alert.classList.contains(`alert-${tone}`)).toBe(true);
    expect(alert.classList.contains('rounded-[var(--ptah-card-radius)]')).toBe(
      true,
    );
    expect(alert.getAttribute('role')).toBe(
      tone === 'error' || tone === 'warning' ? 'alert' : 'status',
    );
  },
);

it('projects content and action and supports compact title', () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const alert = fixture.nativeElement.querySelector('.alert') as HTMLElement;
  expect(alert.classList.contains('p-2')).toBe(true);
  expect(alert.querySelector('h2')?.textContent).toBe('Attention');
  expect(alert.textContent).toContain('Review needed');
  expect(alert.querySelector('[alertAction]')?.textContent).toBe('Review');
});
