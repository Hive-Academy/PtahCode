import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { PtahFieldComponent } from '../../surfaces/field.component';
import { PtahSelectIconDirective } from './rich-select-icon.directive';
import { PtahRichSelectComponent } from './rich-select.component';
import type { PtahSelectOption } from './rich-select.types';

const OPTIONS: PtahSelectOption<string>[] = [
  { value: 'anthropic', label: 'Anthropic', group: 'Cloud', icon: 'cloud', description: 'Hosted' },
  { value: 'openai', label: 'OpenAI', group: 'Cloud', icon: 'cloud', disabled: true },
  { value: 'ollama', label: 'Ollama', group: 'Local', icon: 'chip' },
  { value: 'custom', label: 'Custom', group: 'Local', icon: 'chip' },
];

@Component({
  standalone: true,
  imports: [PtahFieldComponent, PtahRichSelectComponent, PtahSelectIconDirective, FormsModule],
  template: `
    <ptah-field label="Provider" [error]="error()">
      <ptah-select [options]="options" [searchable]="searchable()" clearable [(ngModel)]="model">
        <ng-template ptahSelectIcon let-option let-place="place">
          <i [attr.data-icon]="option.icon" [attr.data-place]="place"></i>
        </ng-template>
      </ptah-select>
    </ptah-field>
    <ptah-select label="Sort" [options]="options" [(value)]="sort" />
  `,
})
class SelectHost {
  readonly options = OPTIONS;
  readonly searchable = signal(false);
  readonly error = signal<string | null>(null);
  model: string | null = null;
  readonly sort = signal<string | null>('ollama');
}

function setup(): { fixture: ComponentFixture<SelectHost>; trigger: HTMLButtonElement; root: HTMLElement } {
  const fixture = TestBed.createComponent(SelectHost);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const trigger = root.querySelector<HTMLButtonElement>('ptah-field [role="combobox"]') as HTMLButtonElement;
  return { fixture, trigger, root };
}

function key(target: HTMLElement, k: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

const active = (root: HTMLElement): string | null =>
  root.querySelector('[role="option"][data-active]')?.textContent?.trim() ?? null;

describe('PtahRichSelectComponent', () => {
  it('is a combobox that the floating label names, with a listbox popup', () => {
    const { fixture, trigger, root } = setup();
    const label = root.querySelector('ptah-field label') as HTMLLabelElement;
    expect(label.htmlFor).toBe(trigger.id);
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.hasAttribute('aria-controls')).toBe(false);

    key(trigger, 'ArrowDown');
    fixture.detectChanges();
    const listbox = root.querySelector('ptah-field [role="listbox"]') as HTMLElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(listbox.id);
    expect(listbox.getAttribute('aria-labelledby')).toBe(label.id);
    expect(root.querySelectorAll('ptah-field [role="group"]')).toHaveLength(2);
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      root.querySelector('[role="option"][data-active]')?.id,
    );
  });

  it('follows the keyboard path: arrows skip disabled, Home, End, type-ahead, Enter, Esc', () => {
    const { fixture, trigger, root } = setup();
    key(trigger, 'ArrowDown');
    fixture.detectChanges();
    expect(active(root)).toContain('Anthropic');
    key(trigger, 'ArrowDown');
    fixture.detectChanges();
    expect(active(root)).toContain('Ollama');
    key(trigger, 'End');
    fixture.detectChanges();
    expect(active(root)).toContain('Custom');
    key(trigger, 'Home');
    fixture.detectChanges();
    expect(active(root)).toContain('Anthropic');
    key(trigger, 'o');
    fixture.detectChanges();
    expect(active(root)).toContain('Ollama');
    key(trigger, 'Enter');
    fixture.detectChanges();
    expect(fixture.componentInstance.model).toBe('ollama');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('Ollama');
    expect(root.querySelector('ptah-field .ptah-select')?.getAttribute('data-ptah-filled')).toBe('true');

    key(trigger, 'Enter');
    fixture.detectChanges();
    expect(active(root)).toContain('Ollama');
    key(trigger, 'Escape');
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement === trigger || !trigger.isConnected).toBe(true);
  });

  it('closes on Tab and does not choose', () => {
    const { fixture, trigger } = setup();
    key(trigger, 'ArrowDown');
    fixture.detectChanges();
    key(trigger, 'Tab');
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.componentInstance.model).toBeNull();
  });

  it('does not choose a disabled option on click', () => {
    const { fixture, trigger, root } = setup();
    trigger.click();
    fixture.detectChanges();
    const disabled = root.querySelector('[role="option"][aria-disabled="true"]') as HTMLElement;
    expect(disabled.textContent).toContain('OpenAI');
    disabled.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.model).toBeNull();
  });

  it('filters with the search input and shows the empty state', () => {
    const { fixture, trigger, root } = setup();
    fixture.componentInstance.searchable.set(true);
    fixture.detectChanges();
    trigger.click();
    fixture.detectChanges();
    const search = root.querySelector('ptah-field input[role="combobox"]') as HTMLInputElement;
    expect(search.getAttribute('aria-label')).toBe('Search options');
    search.value = 'cust';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.querySelectorAll('ptah-field [role="option"]')).toHaveLength(1);
    expect(search.getAttribute('aria-activedescendant')).toBe(
      root.querySelector('ptah-field [role="option"]')?.id,
    );
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.querySelectorAll('ptah-field [role="option"]')).toHaveLength(0);
    expect(root.querySelector('.ptah-select__empty')?.textContent).toContain('No match');
  });

  it('renders the icon template in the trigger and in each option', () => {
    const { fixture, trigger, root } = setup();
    trigger.click();
    fixture.detectChanges();
    expect(root.querySelectorAll('ptah-field [data-place="option"]')).toHaveLength(4);
    (root.querySelector('[role="option"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(trigger.querySelector('[data-icon="cloud"][data-place="trigger"]')).not.toBeNull();
    expect(root.querySelector('.ptah-select__icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('writes ngModel values, clears and takes the field error', async () => {
    const fixture = TestBed.createComponent(SelectHost);
    fixture.componentInstance.model = 'custom';
    fixture.detectChanges();
    // NgModel writes the value in a microtask.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = root.querySelector('ptah-field [role="combobox"]') as HTMLButtonElement;
    expect(trigger.textContent).toContain('Custom');
    (root.querySelector('.ptah-select__clear') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.model).toBeNull();
    expect(trigger.hasAttribute('aria-invalid')).toBe(false);
    fixture.componentInstance.error.set('Select a provider');
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
  });

  it('works with [(value)] and an aria-label when standalone', () => {
    const { fixture, root } = setup();
    const triggers = root.querySelectorAll<HTMLButtonElement>('[role="combobox"]');
    const standalone = triggers[triggers.length - 1];
    expect(standalone.getAttribute('aria-label')).toBe('Sort');
    expect(standalone.textContent).toContain('Ollama');
    standalone.click();
    fixture.detectChanges();
    (Array.from(root.querySelectorAll<HTMLElement>('[role="option"]')).find((o) =>
      o.textContent?.includes('Custom'),
    ) as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.sort()).toBe('custom');
  });
});
