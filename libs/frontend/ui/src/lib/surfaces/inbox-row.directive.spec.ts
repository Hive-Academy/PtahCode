import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InboxRowDirective } from './inbox-row.directive';

@Component({
  standalone: true,
  imports: [InboxRowDirective],
  template: `<div role="listbox" aria-label="Machines"><button ptahInboxRow [selected]="selected()">Atlas</button></div>`,
})
class Host {
  readonly selected = signal(false);
}

describe('InboxRowDirective', () => {
  it('makes the button an option with the unselected row classes', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const button = f.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('role')).toBe('option');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-selected')).toBe('false');
    expect(button.classList.contains('block')).toBe(true);
    expect(button.classList.contains('w-full')).toBe(true);
    expect(button.classList.contains('min-h-10')).toBe(true);
    expect(button.classList.contains('hover:bg-[var(--surface-2)]')).toBe(true);
    expect(button.classList.contains('focus-visible:outline-primary')).toBe(true);
    expect(button.classList.contains('border-l-2')).toBe(true);
    expect(button.classList.contains('border-transparent')).toBe(true);
    expect(button.classList.contains('bg-[var(--surface-2)]')).toBe(false);
    expect(button.classList.contains('border-[var(--ptah-gold)]')).toBe(false);
  });

  it('takes the surface tint and the gold active line when selected', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const button = f.nativeElement.querySelector('button') as HTMLButtonElement;
    f.componentInstance.selected.set(true);
    f.detectChanges();
    expect(button.getAttribute('aria-selected')).toBe('true');
    expect(button.classList.contains('bg-[var(--surface-2)]')).toBe(true);
    expect(button.classList.contains('border-[var(--ptah-gold)]')).toBe(true);
    expect(button.classList.contains('border-transparent')).toBe(false);
  });
});
