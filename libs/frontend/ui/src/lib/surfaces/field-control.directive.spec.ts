import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahFieldControlDirective } from './field-control.directive';

@Component({ standalone: true, imports: [PtahFieldControlDirective], template: `<input ptahFieldControl aria-describedby="help" />` })
class Host {}

it('adds the control classes and preserves description', () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  expect(input.classList.contains('input-sm')).toBe(true);
  expect(input.getAttribute('aria-describedby')).toBe('help');
});
