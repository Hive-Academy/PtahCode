import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahFieldComponent } from '../surfaces/field.component';
import { PtahCheckboxDirective } from './checkbox.directive';
import { PtahControlSize, PtahTextTone } from './form-control.types';
import { PtahInputDirective } from './input.directive';
import { PtahSelectDirective } from './select.directive';
import { PtahTextareaDirective } from './textarea.directive';
import { PtahToggleDirective } from './toggle.directive';

@Component({
  standalone: true,
  imports: [
    PtahInputDirective,
    PtahTextareaDirective,
    PtahSelectDirective,
    PtahCheckboxDirective,
    PtahToggleDirective,
  ],
  template: `
    <input
      data-testid="input"
      ptahInput
      [size]="size()"
      [tone]="tone()"
      [invalid]="invalid()"
      [label]="label()"
    />
    <textarea data-testid="textarea" ptahTextarea tone="mono"></textarea>
    <select data-testid="select" ptahSelect [size]="size()">
      <option>One</option>
    </select>
    <input
      data-testid="static-name"
      ptahInput
      aria-label="Static name"
      [label]="label()"
    />
    <input
      data-testid="checkbox"
      type="checkbox"
      ptahCheckbox
      label="Select row"
    />
    <input
      data-testid="toggle"
      type="checkbox"
      ptahToggle
      size="xs"
      label="Auto save"
    />
    <input
      data-testid="disabled-toggle"
      type="checkbox"
      ptahToggle
      disabled
      label="Locked"
    />
  `,
})
class ControlsHost {
  readonly size = signal<PtahControlSize>('sm');
  readonly tone = signal<PtahTextTone>('default');
  readonly invalid = signal(false);
  readonly label = signal<string | undefined>('Name');
}

@Component({
  standalone: true,
  imports: [
    PtahFieldComponent,
    PtahInputDirective,
    PtahSelectDirective,
    PtahTextareaDirective,
  ],
  template: `<ptah-field label="Port" [error]="error()">
      <input data-testid="field-input" ptahInput [invalid]="invalid()" />
    </ptah-field>
    <ptah-field label="Mode" [error]="error()">
      <select data-testid="field-select" ptahSelect>
        <option>One</option>
      </select>
    </ptah-field>
    <ptah-field label="Notes" [error]="error()">
      <textarea data-testid="field-textarea" ptahTextarea></textarea>
    </ptah-field>`,
})
class FieldHost {
  readonly error = signal<string | null>(null);
  readonly invalid = signal(false);
}

function setup() {
  const fixture = TestBed.createComponent(ControlsHost);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const get = <T extends HTMLElement>(id: string): T =>
    root.querySelector(`[data-testid="${id}"]`) as T;
  return { fixture, get };
}

describe('form controls family', () => {
  it('marks each host with the family attribute and the default sm size', () => {
    const { get } = setup();
    const input = get<HTMLInputElement>('input');
    expect(input.getAttribute('data-ptah-control')).toBe('input');
    expect(input.classList).toContain('input');
    expect(input.classList).toContain('input-bordered');
    expect(input.classList).toContain('input-sm');
    expect(get('textarea').getAttribute('data-ptah-control')).toBe('textarea');
    expect(get('select').getAttribute('data-ptah-control')).toBe('select');
    expect(get('select').classList).toContain('select-sm');
    expect(get('checkbox').getAttribute('data-ptah-control')).toBe('checkbox');
    expect(get('checkbox').classList).toContain('checkbox-sm');
    expect(get('checkbox').classList).toContain('checkbox-primary');
    expect(get('toggle').getAttribute('data-ptah-control')).toBe('toggle');
    expect(get('toggle').classList).toContain('toggle-xs');
    expect(get('toggle').classList).not.toContain('toggle-sm');
  });

  it('changes the size class with the size input', () => {
    const { fixture, get } = setup();
    fixture.componentInstance.size.set('md');
    fixture.detectChanges();
    expect(get('input').classList).toContain('input-md');
    expect(get('input').classList).not.toContain('input-sm');
    expect(get('select').classList).toContain('select-md');
    fixture.componentInstance.size.set('xs');
    fixture.detectChanges();
    expect(get('input').classList).toContain('input-xs');
  });

  it('writes data-ptah-tone only for a tone other than default', () => {
    const { fixture, get } = setup();
    expect(get('input').hasAttribute('data-ptah-tone')).toBe(false);
    expect(get('textarea').getAttribute('data-ptah-tone')).toBe('mono');
    fixture.componentInstance.tone.set('compact');
    fixture.detectChanges();
    expect(get('input').getAttribute('data-ptah-tone')).toBe('compact');
    fixture.componentInstance.tone.set('default');
    fixture.detectChanges();
    expect(get('input').hasAttribute('data-ptah-tone')).toBe(false);
  });

  it('sets aria-invalid="true" when invalid and removes it when valid', () => {
    const { fixture, get } = setup();
    expect(get('input').hasAttribute('aria-invalid')).toBe(false);
    fixture.componentInstance.invalid.set(true);
    fixture.detectChanges();
    expect(get('input').getAttribute('aria-invalid')).toBe('true');
    fixture.componentInstance.invalid.set(false);
    fixture.detectChanges();
    expect(get('input').hasAttribute('aria-invalid')).toBe(false);
  });

  it('gives an accessible name from label and keeps a static aria-label', () => {
    const { fixture, get } = setup();
    expect(get('input').getAttribute('aria-label')).toBe('Name');
    expect(get('checkbox').getAttribute('aria-label')).toBe('Select row');
    expect(get('static-name').getAttribute('aria-label')).toBe('Name');
    fixture.componentInstance.label.set(undefined);
    fixture.detectChanges();
    expect(get('input').hasAttribute('aria-label')).toBe(false);
    expect(get('static-name').getAttribute('aria-label')).toBe('Static name');
  });

  it('keeps a static aria-label when no label input is set', () => {
    const fixture = TestBed.createComponent(ControlsHost);
    fixture.componentInstance.label.set(undefined);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="static-name"]',
    ) as HTMLElement;
    expect(el.getAttribute('aria-label')).toBe('Static name');
  });

  it('exposes the native roles and the switch role of the toggle', () => {
    const { get } = setup();
    expect(get<HTMLInputElement>('checkbox').type).toBe('checkbox');
    expect(get('checkbox').hasAttribute('role')).toBe(false);
    expect(get('toggle').getAttribute('role')).toBe('switch');
    expect(get('toggle').hasAttribute('aria-checked')).toBe(false);
    expect(get('select').tagName).toBe('SELECT');
    expect(get('textarea').tagName).toBe('TEXTAREA');
  });

  it('keeps native focus and the native checked state (jsdom does not send Space)', () => {
    const { get } = setup();
    for (const id of ['input', 'textarea', 'select', 'checkbox', 'toggle']) {
      const el = get(id);
      expect(el.tabIndex).toBeGreaterThanOrEqual(0);
      el.focus();
      expect(document.activeElement).toBe(el);
    }
    const toggle = get<HTMLInputElement>('toggle');
    expect(toggle.checked).toBe(false);
    toggle.click();
    expect(toggle.checked).toBe(true);
    const checkbox = get<HTMLInputElement>('checkbox');
    checkbox.click();
    expect(checkbox.checked).toBe(true);
  });

  it('keeps native disabled: a disabled toggle does not change', () => {
    const { get } = setup();
    const toggle = get<HTMLInputElement>('disabled-toggle');
    expect(toggle.disabled).toBe(true);
    expect(toggle.hasAttribute('aria-disabled')).toBe(false);
    toggle.click();
    expect(toggle.checked).toBe(false);
  });
});

describe('ptah-field with a family control', () => {
  it('links the label and sets aria-invalid only while the field has an error', () => {
    const fixture = TestBed.createComponent(FieldHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector(
      '[data-testid="field-input"]',
    ) as HTMLInputElement;
    const label = root.querySelector('label') as HTMLLabelElement;
    expect(input.id).not.toBe('');
    expect(label.htmlFor).toBe(input.id);
    expect(input.hasAttribute('aria-invalid')).toBe(false);

    fixture.componentInstance.error.set('Enter a number');
    fixture.detectChanges();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain(
      'ptah-field-description-',
    );

    fixture.componentInstance.error.set(null);
    fixture.detectChanges();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('marks a projected select and textarea invalid with the field error', () => {
    const fixture = TestBed.createComponent(FieldHost);
    fixture.componentInstance.error.set('Required');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    for (const id of ['field-select', 'field-textarea']) {
      const el = root.querySelector(`[data-testid="${id}"]`) as HTMLElement;
      expect(el.getAttribute('aria-invalid')).toBe('true');
    }
  });

  it('keeps aria-invalid while the invalid input is set after the field error clears', () => {
    const fixture = TestBed.createComponent(FieldHost);
    fixture.componentInstance.error.set('Required');
    fixture.componentInstance.invalid.set(true);
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="field-input"]',
    ) as HTMLElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fixture.componentInstance.error.set(null);
    fixture.detectChanges();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fixture.componentInstance.invalid.set(false);
    fixture.detectChanges();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });
});
