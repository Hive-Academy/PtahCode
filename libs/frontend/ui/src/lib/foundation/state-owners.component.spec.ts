import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  PtahAlertComponent,
  PtahAlertLive,
  PtahAlertTone,
} from './alert.component';
import { PtahSkeletonComponent, PtahSkeletonSize } from './skeleton.component';
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

it.each<[PtahSkeletonSize, string]>([
  ['sm', 'h-2'],
  ['md', 'h-3'],
  ['lg', 'h-4'],
])('renders %s lines with %s and no inline style', (size, heightClass) => {
  const fixture = TestBed.createComponent(PtahSkeletonComponent);
  fixture.componentRef.setInput('lines', 2);
  fixture.componentRef.setInput('size', size);
  fixture.detectChanges();
  const lines = fixture.nativeElement.querySelectorAll(
    '.skeleton',
  ) as NodeListOf<HTMLElement>;
  expect(lines).toHaveLength(2);
  lines.forEach((line) => {
    expect(line.classList.contains(heightClass)).toBe(true);
    expect(line.getAttribute('style')).toBeNull();
  });
});

it('updates the line count when the lines input changes', () => {
  const fixture = TestBed.createComponent(PtahSkeletonComponent);
  fixture.componentRef.setInput('lines', 5);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelectorAll('.skeleton')).toHaveLength(5);
  fixture.componentRef.setInput('lines', 1);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelectorAll('.skeleton')).toHaveLength(1);
  fixture.componentRef.setInput('lines', -2);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelectorAll('.skeleton')).toHaveLength(0);
});

it('renders one hidden block', () => {
  const fixture = TestBed.createComponent(PtahSkeletonComponent);
  fixture.componentRef.setInput('shape', 'block');
  fixture.detectChanges();
  expect(
    fixture.nativeElement.querySelectorAll('[aria-hidden="true"] .skeleton'),
  ).toHaveLength(1);
  const block = fixture.nativeElement.querySelector('.skeleton') as HTMLElement;
  expect(block.classList.contains('h-24')).toBe(true);
  expect(block.getAttribute('style')).toBeNull();
});

it.each<[PtahSkeletonSize, string]>([
  ['sm', 'h-12'],
  ['lg', 'h-40'],
])('renders a %s block with %s', (size, heightClass) => {
  const fixture = TestBed.createComponent(PtahSkeletonComponent);
  fixture.componentRef.setInput('shape', 'block');
  fixture.componentRef.setInput('size', size);
  fixture.detectChanges();
  const block = fixture.nativeElement.querySelector('.skeleton') as HTMLElement;
  expect(block.classList.contains(heightClass)).toBe(true);
  expect(block.classList.contains('h-24')).toBe(false);
});

@Component({
  standalone: true,
  imports: [PtahAlertComponent],
  template: `
    <ptah-alert
      tone="warning"
      title="Attention"
      [compact]="true"
      [headingLevel]="3"
      live="assertive"
    >
      Review needed
      <button alertAction type="button">Review</button>
    </ptah-alert>
  `,
})
class Host {}

it.each<PtahAlertTone>(['info', 'success', 'warning', 'error'])(
  'renders %s tone with no live role by default',
  (tone) => {
    const fixture = TestBed.createComponent(PtahAlertComponent);
    fixture.componentRef.setInput('tone', tone);
    fixture.detectChanges();
    const alert = fixture.nativeElement.querySelector('.alert') as HTMLElement;
    expect(alert.classList.contains(`alert-${tone}`)).toBe(true);
    expect(alert.classList.contains('rounded-[var(--ptah-card-radius)]')).toBe(
      true,
    );
    expect(alert.classList.contains('p-[var(--ptah-surface-pad)]')).toBe(true);
    expect(alert.getAttribute('role')).toBeNull();
  },
);

it.each<[PtahAlertLive, string | null]>([
  ['off', null],
  ['polite', 'status'],
  ['assertive', 'alert'],
])('maps live=%s to role %s', (live, role) => {
  const fixture = TestBed.createComponent(PtahAlertComponent);
  fixture.componentRef.setInput('live', live);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  expect(host.querySelector('.alert')?.getAttribute('role') ?? null).toBe(
    role,
  );
  expect(host.querySelectorAll('[role]')).toHaveLength(role === null ? 0 : 1);
});

it('renders the title as a paragraph, not a heading, by default', () => {
  const fixture = TestBed.createComponent(PtahAlertComponent);
  fixture.componentRef.setInput('title', 'Heads up');
  fixture.detectChanges();
  const alert = fixture.nativeElement.querySelector('.alert') as HTMLElement;
  expect(alert.querySelector('h2, h3, h4')).toBeNull();
  const title = alert.querySelector('p.font-semibold') as HTMLElement;
  expect(title.textContent?.trim()).toBe('Heads up');
  expect(title.classList.contains('text-sm')).toBe(true);
});

it.each([2, 3, 4] as const)('renders an h%s title for headingLevel', (level) => {
  const fixture = TestBed.createComponent(PtahAlertComponent);
  fixture.componentRef.setInput('title', 'Heads up');
  fixture.componentRef.setInput('headingLevel', level);
  fixture.detectChanges();
  const alert = fixture.nativeElement.querySelector('.alert') as HTMLElement;
  expect(alert.querySelectorAll('h2, h3, h4')).toHaveLength(1);
  expect(alert.querySelector(`h${level}`)?.textContent?.trim()).toBe(
    'Heads up',
  );
  expect(alert.querySelector('p.font-semibold')).toBeNull();
});

it('projects content and action and supports compact title', () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const alert = fixture.nativeElement.querySelector('.alert') as HTMLElement;
  expect(alert.classList.contains('p-2')).toBe(true);
  expect(alert.classList.contains('text-xs')).toBe(true);
  expect(alert.classList.contains('p-[var(--ptah-surface-pad)]')).toBe(false);
  expect(alert.getAttribute('role')).toBe('alert');
  expect(alert.querySelector('h3')?.textContent?.trim()).toBe('Attention');
  expect(alert.textContent).toContain('Review needed');
  const action = alert.querySelector('[alertAction]') as HTMLElement;
  expect(action.textContent).toBe('Review');
  const wrapper = action.parentElement as HTMLElement;
  expect(wrapper.classList.contains('flex')).toBe(true);
  expect(wrapper.classList.contains('gap-[var(--ptah-gap-controls)]')).toBe(
    true,
  );
});
