import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { PtahToolbarComponent } from './toolbar.component';

it('emits search input and displays count', () => {
  const fixture = TestBed.createComponent(PtahToolbarComponent);
  fixture.componentRef.setInput('count', 5);
  const changed = jest.fn();
  fixture.componentInstance.queryChange.subscribe(changed);
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const bar = input.parentElement as HTMLElement;
  expect(bar.hasAttribute('data-glass-surface')).toBe(false);
  expect(bar.classList.contains('border-b')).toBe(true);
  expect(bar.classList.contains('grid-cols-[minmax(0,1fr)_auto]')).toBe(true);
  input.value = 'run';
  input.dispatchEvent(new Event('input'));
  expect(changed).toHaveBeenCalledWith('run');
  expect(fixture.nativeElement.textContent).toContain('5');
  expect(input.placeholder).toBe('Search');
  expect(input.classList.contains('text-xs')).toBe(true);
  const count = fixture.nativeElement.querySelector('[aria-live="polite"]') as HTMLElement;
  expect(count.textContent?.trim()).toBe('5 results');
});

@Component({ standalone: true, imports: [PtahToolbarComponent], template: '<ptah-toolbar><select sort aria-label="Sort"><option>Newest</option></select></ptah-toolbar>' })
class SortHost {}

it('applies compact text sizing to a projected sort select', () => {
  const fixture = TestBed.createComponent(SortHost);
  fixture.detectChanges();
  const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
  expect(select.parentElement?.classList.contains('text-xs')).toBe(true);
  expect(select.parentElement?.classList.contains('[&_select]:text-xs')).toBe(true);
});
