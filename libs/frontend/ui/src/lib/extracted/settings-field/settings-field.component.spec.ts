import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SettingsFieldComponent } from './settings-field.component';

@Component({
  standalone: true,
  imports: [SettingsFieldComponent],
  template: `
    <div ptahSettingsField class="flex min-w-0 flex-col gap-1"
      fieldId="sample" label="Sample" hint="Choose a value."
      [error]="error()" [errorRole]="errorRole()" [errorTestId]="'sample-error'">
      <ng-container ngProjectAs="[settingsFieldControl]">
        <div class="join flex w-full"><input id="sample" aria-describedby="sample-help" [disabled]="disabled()" /></div>
      </ng-container>
      <ng-container ngProjectAs="[settingsFieldBeforeHint]"><span id="before-hint">Readable note</span></ng-container>
      <ng-container ngProjectAs="[settingsFieldAfterError]"><span id="after-error">Stored notice</span></ng-container>
    </div>
  `,
})
class HostComponent {
  readonly error = signal<string | null>(null);
  readonly errorRole = signal<string | null>('alert');
  readonly disabled = signal(false);
}

describe('SettingsFieldComponent', () => {
  it('preserves label association, hint, error, disabled state, and projected control', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const row = host.querySelector('div.flex.min-w-0') as HTMLDivElement;
    const input = row.querySelector('input') as HTMLInputElement;
    expect(row.hasAttribute('ptahSettingsField')).toBe(false);
    expect(row.querySelector('label')?.htmlFor).toBe('sample');
    expect(row.querySelector('.join input')).toBe(input);
    expect(row.querySelector('#sample-help')?.textContent?.trim()).toBe('Choose a value.');
    expect(input.getAttribute('aria-describedby')).toBe('sample-help');

    fixture.componentInstance.error.set('Invalid value');
    fixture.componentInstance.disabled.set(true);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(input.disabled).toBe(true);
    expect(row.querySelector('#sample-error')?.textContent?.trim()).toBe('Invalid value');
    expect(row.querySelector('#sample-error')?.getAttribute('role')).toBe('alert');
  });

  it('omits the role attribute when errorRole is null', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.error.set('Invalid value');
    fixture.componentInstance.errorRole.set(null);
    fixture.detectChanges();
    const error = (fixture.nativeElement as HTMLElement).querySelector('#sample-error');
    expect(error?.hasAttribute('role')).toBe(false);
  });

  it('projects optional slots around hint and error in source order', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.error.set('Invalid value');
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector('div.flex.min-w-0') as HTMLDivElement;
    expect(Array.from(row.children).map((child) => child.id || child.tagName.toLowerCase())).toEqual([
      'label', 'div', 'before-hint', 'sample-help', 'sample-error', 'after-error',
    ]);
    expect(row.hasAttribute('ptahSettingsField')).toBe(false);
  });
});
