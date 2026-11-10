import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SetupFieldDirective } from './setup-field.directive';
import { provideSetupFieldLook } from './setup-field.look';

@Component({
  standalone: true,
  imports: [SetupFieldDirective],
  template: `
    <select [ptahSetupField]="'model'" id="model"><option value="a">A</option></select>
    <select [ptahSetupField]="'workspace'" id="workspace" disabled><option value="b">B</option></select>
    <select [ptahSetupField]="undefined" id="default"><option value="c">C</option></select>
  `,
})
class TestHostComponent {}

describe('SetupFieldDirective', () => {
  it('preserves native selects and source class lists', () => {
    TestBed.configureTestingModule({ providers: [provideSetupFieldLook('workspace')] });
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    const selects = Array.from(fixture.nativeElement.querySelectorAll('select')) as HTMLSelectElement[];
    expect(selects.map((select) => select.className)).toEqual([
      'select select-bordered select-sm w-full',
      'select select-bordered select-sm',
      'select select-bordered select-sm',
    ]);
    expect(selects[0].id).toBe('model');
    expect(selects[0].options[0].value).toBe('a');
    expect(selects[1].disabled).toBe(true);
  });
});
