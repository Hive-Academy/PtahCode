import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PtahRichSelectComponent } from './rich-select.component';
import type { PtahSelectOption } from './rich-select.types';

const LONG =
  'A very long model name that does not fit in a compact table cell and must wrap in the menu';
const OPTIONS: PtahSelectOption<string>[] = [
  { value: 'low', label: 'Low' },
  { value: 'long', label: LONG },
  { value: 'off', label: 'Off', disabled: true },
];

/** Compact variant: no ptah-field, the row title or the column header names the select. */
@Component({
  standalone: true,
  imports: [PtahRichSelectComponent],
  template: `
    <span id="effort-title">Effort</span>
    <ptah-select size="xs" labelledBy="effort-title" label="Ignored" [options]="options" [(value)]="value" />
    <ptah-select size="sm" label="Sort" [options]="options" />
  `,
})
class CompactHost {
  readonly options = OPTIONS;
  readonly value = signal<string | null>('long');
}

function setup(): { fixture: ComponentFixture<CompactHost>; root: HTMLElement; triggers: HTMLButtonElement[] } {
  const fixture = TestBed.createComponent(CompactHost);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const triggers = [...root.querySelectorAll<HTMLButtonElement>('button[role="combobox"]')];
  return { fixture, root, triggers };
}

function key(target: HTMLElement, k: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

describe('PtahRichSelectComponent compact variant', () => {
  it('takes its name from labelledBy, which wins over label, on the trigger and the listbox', () => {
    const { fixture, root, triggers } = setup();
    const [compact, labelled] = triggers;
    expect(compact.getAttribute('aria-labelledby')).toBe('effort-title');
    expect(compact.hasAttribute('aria-label')).toBe(false);
    expect(labelled.getAttribute('aria-label')).toBe('Sort');
    expect(labelled.hasAttribute('aria-labelledby')).toBe(false);

    key(compact, 'ArrowDown');
    fixture.detectChanges();
    const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
    expect(listbox.getAttribute('aria-labelledby')).toBe('effort-title');
    expect(listbox.hasAttribute('aria-label')).toBe(false);
  });

  it('opens a designed listbox, never a native select menu', () => {
    const { fixture, root, triggers } = setup();
    expect(root.querySelector('select')).toBeNull();
    triggers[0].click();
    fixture.detectChanges();
    const panel = root.querySelector('.ptah-select__panel') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('[role="listbox"]')).not.toBeNull();
    expect(panel.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(panel.querySelector('[role="option"][aria-disabled="true"]')?.textContent).toContain('Off');
    expect(root.querySelector('select')).toBeNull();
  });

  it('shows the full text of a long value in the trigger title', () => {
    const { root } = setup();
    const value = root.querySelector('.ptah-select__value') as HTMLElement;
    expect(value.textContent?.trim()).toBe(LONG);
    expect(value.getAttribute('title')).toBe(LONG);
  });

  it('skips the disabled option on End and returns focus to the trigger on Escape', () => {
    const { fixture, root, triggers } = setup();
    const trigger = triggers[0];
    const active = (): string => root.querySelector('[role="option"][data-active]')?.textContent ?? '';
    trigger.focus();
    key(trigger, 'Home');
    fixture.detectChanges();
    expect(active()).toContain('Low');
    key(trigger, 'End');
    fixture.detectChanges();
    expect(active()).toContain(LONG);
    key(trigger, 'Escape');
    fixture.detectChanges();
    expect(root.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
