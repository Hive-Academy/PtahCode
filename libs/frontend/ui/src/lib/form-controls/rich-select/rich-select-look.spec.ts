/**
 * TASK_2026_969_3aab round 2: the look of `ptah-select`.
 * Pins the action group (clear, then chevron, at the inline end), the size
 * input, the automatic search and the opaque panel. jsdom does not compute
 * the cascade, so the CSS checks read the CSS text of the owner files.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PtahControlSize } from '../form-control.types';
import { PtahFieldComponent } from '../../surfaces/field.component';
import { PTAH_SELECT_SEARCH_MIN_OPTIONS, PtahRichSelectComponent } from './rich-select.component';
import type { PtahSelectOption } from './rich-select.types';

const SELECT_CSS = readFileSync(join(__dirname, 'ptah-select.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const TOKEN_CSS = readFileSync(join(__dirname, '..', '..', 'tokens', 'ptah-tokens.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** Splits a selector list at the commas outside parentheses. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++;
    else if (list[i] === ')') depth--;
    else if (list[i] === ',' && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  return [...parts, list.slice(start)].map((p) => p.trim().replace(/\s+/g, ' '));
}

/** Each rule of the CSS text as `[selectors, body]`. */
const RULES: ReadonlyArray<readonly [string[], string]> = [...SELECT_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
  (m) => [splitTopLevel(m[1]), m[2]] as const,
);

/** The body of the rule for this selector alone, else of the first list that has it. */
function ruleBody(selector: string): string {
  const rule =
    RULES.find(([selectors]) => selectors.length === 1 && selectors[0] === selector) ??
    RULES.find(([selectors]) => selectors.includes(selector));
  if (!rule) throw new Error(`No rule for ${selector}`);
  return rule[1];
}

const SHORT: PtahSelectOption<string>[] = [
  { value: 'openai', label: 'OpenAI', group: 'Cloud' },
  { value: 'ollama', label: 'Ollama', group: 'Local' },
];
const LONG: PtahSelectOption<string>[] = Array.from({ length: PTAH_SELECT_SEARCH_MIN_OPTIONS }, (_, i) => ({
  value: `m${i}`,
  label: `Model ${i}`,
}));

@Component({
  standalone: true,
  imports: [PtahFieldComponent, PtahRichSelectComponent],
  template: `
    <ptah-field label="Provider">
      <ptah-select id="in-field" [options]="short" clearable [(value)]="provider" />
    </ptah-field>
    <ptah-select id="standalone" label="Sort" [size]="size()" [options]="short" clearable [(value)]="sort" />
    <ptah-select id="short" label="Region" [options]="short" />
    <ptah-select id="long" label="Model" [options]="long" />
    <ptah-select id="forced" label="Forced" [options]="short" searchable />
  `,
})
class LookHost {
  readonly short = SHORT;
  readonly long = LONG;
  readonly provider = signal<string | null>('openai');
  readonly sort = signal<string | null>(null);
  readonly size = signal<PtahControlSize>('sm');
}

function setup(): { fixture: ComponentFixture<LookHost>; root: HTMLElement } {
  const fixture = TestBed.createComponent(LookHost);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

const host = (root: HTMLElement, id: string): HTMLElement => root.querySelector(`#${id}`) as HTMLElement;
const actionParts = (el: HTMLElement): string[] =>
  Array.from(el.querySelectorAll(':scope > .ptah-select__actions > *')).map((c) => c.getAttribute('class') ?? '');

describe('ptah-select look (round 2)', () => {
  it('puts clear and chevron in one action group after the trigger, in a fixed order', () => {
    const { root } = setup();
    for (const id of ['in-field', 'standalone']) {
      const el = host(root, id);
      expect(el.querySelectorAll('.ptah-select__actions')).toHaveLength(1);
      expect(el.querySelector('.ptah-select__trigger .ptah-select__chevron')).toBeNull();
      expect(el.querySelector('.ptah-select__trigger')?.nextElementSibling?.classList).toContain(
        'ptah-select__actions',
      );
    }
    expect(actionParts(host(root, 'in-field'))).toEqual(['ptah-select__clear', 'ptah-select__chevron']);
    // No value: no clear action, the chevron stays the last part of the same group.
    expect(actionParts(host(root, 'standalone'))).toEqual(['ptah-select__chevron']);
  });

  it('keeps the same action group element and classes when the panel opens and the value changes', () => {
    const { fixture, root } = setup();
    const el = host(root, 'in-field');
    const group = el.querySelector('.ptah-select__actions') as HTMLElement;
    const closed = group.className;
    (el.querySelector('.ptah-select__trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.hasAttribute('data-open')).toBe(true);
    expect(el.querySelector('.ptah-select__actions')).toBe(group);
    expect(group.className).toBe(closed);
    expect(actionParts(el)).toEqual(['ptah-select__clear', 'ptah-select__chevron']);
    fixture.componentInstance.provider.set(null);
    fixture.detectChanges();
    expect(el.querySelector('.ptah-select__actions')).toBe(group);
    expect(el.getAttribute('data-clearable')).toBe('true');
  });

  it('pins the action group at the inline end with rules that the open state does not change', () => {
    const actions = ruleBody('.ptah-select__actions');
    expect(actions).toMatch(/grid-area:\s*1 \/ 1/);
    expect(actions).toMatch(/justify-self:\s*end/);
    expect(actions).toMatch(/align-self:\s*center/);
    expect(actions).toMatch(/margin-inline-end:\s*calc\(var\(--ptah-field-pad-x\) \+ var\(--ptah-border-width\)\)/);
    expect(ruleBody('.ptah-field__body .ptah-select .ptah-select__actions')).toMatch(/margin-inline-end:\s*0/);
    expect(ruleBody('.ptah-select__trigger')).toMatch(/grid-area:\s*1 \/ 1/);
    expect(ruleBody('.ptah-select')).toMatch(/display:\s*grid/);
    // The open state only rotates the chevron around its center.
    const openRules = RULES.flatMap(([selectors]) => selectors).filter((s) => s.includes('[data-open]'));
    expect(openRules).toEqual(['.ptah-select[data-open] .ptah-select__chevron']);
    expect(ruleBody('.ptah-select[data-open] .ptah-select__chevron').trim()).toBe('transform: rotate(180deg);');
    expect(ruleBody('.ptah-select__chevron')).toMatch(/transform-origin:\s*50% 50%/);
    expect(ruleBody('.ptah-select__chevron')).not.toMatch(/margin/);
    // No value-dependent layout: the clear action is not absolute, and no rule reads :has(.ptah-select__clear).
    expect(ruleBody('.ptah-select__clear')).not.toMatch(/position|inset|transform/);
    expect(SELECT_CSS).not.toContain(':has(.ptah-select__clear)');
  });

  it('sets the size data attribute from the size input (default sm) with the control height tokens', () => {
    const { fixture, root } = setup();
    const el = host(root, 'standalone');
    expect(el.getAttribute('data-size')).toBe('sm');
    fixture.componentInstance.size.set('xs');
    fixture.detectChanges();
    expect(el.getAttribute('data-size')).toBe('xs');
    expect(ruleBody('.ptah-select__trigger')).toMatch(/height:\s*var\(--ptah-control-h-sm\)/);
    expect(ruleBody(".ptah-select[data-size='xs'] .ptah-select__trigger")).toMatch(
      /height:\s*var\(--ptah-control-h-xs\)/,
    );
    expect(ruleBody(".ptah-select[data-size='md'] .ptah-select__trigger")).toMatch(
      /height:\s*var\(--ptah-control-h-md\)/,
    );
  });

  it('hides the search input for a short list and shows it for a long list or when forced', () => {
    const { fixture, root } = setup();
    const searchAfterOpen = (id: string): boolean => {
      const el = host(root, id);
      (el.querySelector('.ptah-select__trigger') as HTMLButtonElement).click();
      fixture.detectChanges();
      const found = el.querySelector('.ptah-select__search') !== null;
      (el.querySelector('.ptah-select__trigger') as HTMLButtonElement).click();
      fixture.detectChanges();
      return found;
    };
    expect(PTAH_SELECT_SEARCH_MIN_OPTIONS).toBe(8);
    expect(searchAfterOpen('short')).toBe(false);
    expect(searchAfterOpen('long')).toBe(true);
    expect(searchAfterOpen('forced')).toBe(true);
  });

  it('draws the panel on an opaque token surface, out of flow, with an edge and a shadow', () => {
    const panel = ruleBody('.ptah-select__panel');
    expect(panel).toMatch(/position:\s*fixed/);
    expect(panel).toMatch(/background-color:\s*var\(--ptah-select-panel-bg\)/);
    expect(panel).toMatch(/border:\s*var\(--ptah-border-width\) solid var\(--ptah-select-panel-edge\)/);
    expect(panel).toMatch(/box-shadow:\s*var\(--ptah-elevation-3\)/);
    expect(panel).not.toMatch(/backdrop-filter|opacity/);
    const token = /--ptah-select-panel-bg:\s*([^;]+);/.exec(TOKEN_CSS)?.[1].trim();
    // --surface-3 is a color-mix of two opaque theme colors (styles.css): no alpha, no glass fill.
    expect(token).toBe('var(--surface-3)');
    expect(ruleBody('.ptah-select__group-header')).toMatch(/background-color:\s*var\(--ptah-select-panel-bg\)/);
  });

  it('keeps the quiet focus of the panel search: no outline or shadow, the row marks focus', () => {
    const search = RULES.find(([selectors]) =>
      selectors.some((s) => s.startsWith('.ptah-select :is(.ptah-select__search') && s.includes(':focus-visible')),
    );
    expect(search?.[1]).toMatch(/outline:\s*none/);
    expect(search?.[1]).toMatch(/box-shadow:\s*none/);
    expect(ruleBody('.ptah-select__search-row:focus-within')).toMatch(/border-bottom-color:\s*var\(--ptah-focus-ring-color\)/);
  });
});
