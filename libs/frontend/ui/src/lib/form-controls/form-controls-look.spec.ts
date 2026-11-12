import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const field = readFileSync(join(__dirname, 'ptah-field.css'), 'utf8');
const family = readFileSync(join(__dirname, 'ptah-form-controls.css'), 'utf8');
const select = readFileSync(join(__dirname, 'rich-select', 'ptah-select.css'), 'utf8');

describe('form control look contract', () => {
  it('hides the browser search action for family and field controls', () => {
    expect(family).toContain("input[type='search'][data-ptah-control]::-webkit-search-cancel-button");
    expect(family).toContain(".ptah-field__body input[type='search']::-webkit-search-cancel-button");
  });

  it('resets a native field control without a family data attribute', () => {
    const reset = field.match(
      /:is\(\.ptah-field__body, #ptah-field\) :is\(input, textarea, select\):is\([^)]*\),\s*:is\(\.ptah-field__body, #ptah-field\) \.ptah-select__trigger \{([^}]*)\}/,
    );
    expect(reset).not.toBeNull();
    const body = reset?.[1] ?? '';
    for (const declaration of [
      'flex: 1 1 auto;',
      'border: 0;',
      'border-radius: 0;',
      'background-color: transparent;',
      'box-shadow: none;',
      'outline: none;',
    ]) {
      expect(body).toContain(declaration);
    }
    expect(field).toMatch(/:is\(\.ptah-field__body, #ptah-field\) textarea:is\([^)]*\) \{[^}]*resize: none;/);
  });

  it('keeps keyboard focus on the field box', () => {
    expect(field).toContain('.ptah-field__box:has(.ptah-field__body :focus-visible)');
    expect(field).toMatch(/\.ptah-select__trigger:focus-visible[^{}]*\{\s*outline: none;/);
  });

  it('does not add the rail as a second focus mark', () => {
    expect(field).not.toContain(':focus-within .ptah-field__rail');
    expect(field).not.toContain('[data-open]) .ptah-field__rail');
  });

  it('grows the rich select and centers its chevron in a floating field', () => {
    expect(select).toMatch(/\.ptah-field__body > \.ptah-select \{\s*flex: 1 1 auto;/);
    expect(select).toMatch(
      /\.ptah-field\[data-appearance='floating'\] \.ptah-select__chevron \{\s*margin-block-start: calc\(/,
    );
  });

  it('gives the panel search no own focus box', () => {
    expect(select).toMatch(/\.ptah-select__search:focus-visible[^{}]*\{\s*outline: none;\s*box-shadow: none;/);
  });
});
