import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahButtonDirective } from './button.directive';

@Component({ standalone: true, imports: [PtahButtonDirective], template: `<button ptahButton variant="primary" [busy]="busy()" aria-label="Save" (click)="count = count + 1">Save</button>` })
class Host { readonly busy = signal(true); count = 0; }

it('keeps a busy button focusable and marks it unavailable', () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  expect(button.classList.contains('btn-primary')).toBe(true);
  expect(button.getAttribute('aria-disabled')).toBe('true');
  expect(button.disabled).toBe(false);
  expect(button.classList.contains('opacity-60')).toBe(true);
  button.click();
  button.focus();
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  button.click(); // Native keyboard activation dispatches a click.
  button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  button.click();
  expect(fixture.componentInstance.count).toBe(0);
  fixture.componentInstance.busy.set(false);
  fixture.detectChanges();
  button.click();
  expect(fixture.componentInstance.count).toBe(1);
});
