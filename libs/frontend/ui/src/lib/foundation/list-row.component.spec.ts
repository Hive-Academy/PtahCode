import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Listbox, Option } from '@angular/aria/listbox';
import { PtahListRowComponent } from './list-row.component';

@Component({ standalone: true, imports: [Listbox, Option, PtahListRowComponent], template: `<div ngListbox selectionMode="explicit" aria-label="Items" [value]="['two']"><div ptahListRow ngOption value="one" title="One" [current]="true"></div><div ptahListRow ngOption value="two" title="Two"></div><div ptahListRow ngOption value="three" title="Three" [disabled]="true"></div></div>` })
class Host {}

it('works as an Angular Aria option and marks route current', () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const row = fixture.nativeElement.querySelector('[ngOption]') as HTMLElement;
  expect(row.getAttribute('role')).toBe('option');
  expect(row.getAttribute('aria-current')).toBe('page');
  expect(row.classList.contains('min-h-10')).toBe(true);
  const selected = fixture.nativeElement.querySelectorAll('[ngOption]')[1] as HTMLElement;
  expect(selected.getAttribute('aria-selected')).toBe('true');
  expect(selected.classList.contains('aria-selected:bg-base-200')).toBe(true);
  expect(selected.classList.contains('aria-selected:border-l-[var(--ptah-gold)]')).toBe(true);
  const disabled = fixture.nativeElement.querySelectorAll('[ngOption]')[2] as HTMLElement;
  expect(disabled.getAttribute('aria-disabled')).toBe('true');
  expect(disabled.classList.contains('aria-disabled:opacity-50')).toBe(true);
});
