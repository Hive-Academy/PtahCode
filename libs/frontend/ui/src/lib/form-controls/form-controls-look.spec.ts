import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const field = readFileSync(join(__dirname, 'ptah-field.css'), 'utf8');
const family = readFileSync(join(__dirname, 'ptah-form-controls.css'), 'utf8');
const select = readFileSync(join(__dirname, 'rich-select', 'ptah-select.css'), 'utf8');

describe('form control look contract', () => {
  it('uses one focus border in glass without changing the standard theme focus recipe', () => {
    expect(family).toMatch(/:root\[data-glass='on'\] :is\(\.input, \.textarea, \.select\)\[data-ptah-control\]:is\(:focus, \[data-state='focus'\]\)[^{]*\{[^}]*border-color: var\(--ptah-focus-ring-color\);[^}]*outline: none;[^}]*box-shadow: inset 0 0 0 calc\(var\(--ptah-focus-ring-width\) - var\(--ptah-border-width\)\) var\(--ptah-focus-ring-color\);/);
    expect(family).not.toMatch(/:root\[data-glass='on'\][^{]*\{[^}]*border-width: var\(--ptah-focus-ring-width\)/);
    expect(family).toMatch(/:root\[data-glass='on'\] :is\(\.input, \.textarea, \.select\)\[data-ptah-control\]:is\(:focus-visible, \[data-state='focus'\]\)[^{]*\{[^}]*outline: none;[^}]*box-shadow: inset 0 0 0 /);
    expect(family).toMatch(/:root\[data-glass='on'\] :is\(\.input, \.textarea, \.select\)\[data-ptah-control\][^{]*\{\s*background-clip: padding-box;/);
    expect(family).toContain('outline-offset: var(--ptah-focus-ring-offset);');
  });

  it('keeps the glass fill inside the field box and the standalone trigger border', () => {
    expect(field).toMatch(/^\.ptah-field__box:where\(:root\[data-glass='on'\] \*\) \{\s*background-clip: padding-box;\s*\}/m);
    expect(select).toMatch(/^\.ptah-select__trigger:where\(:root\[data-glass='on'\] \*\) \{\s*background-clip: padding-box;\s*\}/m);
    const focus = select.match(
      /^\.ptah-select :is\(\.ptah-select__trigger, #ptah-control\):is\(:focus, :focus-visible\):where\(:root\[data-glass='on'\] \*\) \{([^}]*)\}/m,
    );
    expect(focus).not.toBeNull();
    for (const declaration of [
      'border-color: var(--ptah-focus-ring-color);',
      'outline: none;',
      'box-shadow: inset 0 0 0 calc(var(--ptah-focus-ring-width) - var(--ptah-border-width)) var(--ptah-focus-ring-color);',
    ]) {
      expect(focus?.[1]).toContain(declaration);
    }
    expect(family).not.toContain('.ptah-select__trigger');
  });
  it('hides the browser search action for family and field controls', () => {
    expect(family).toContain("input[type='search'][data-ptah-control]::-webkit-search-cancel-button");
    expect(field).toContain(".ptah-field__body input[type='search']::-webkit-search-cancel-button");
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

  it('draws one contiguous field edge on click and keyboard focus', () => {
    const focus = field.match(/\.ptah-field \.ptah-field__box:has\(\.ptah-field__body :focus\) \{([^}]*)\}/);
    expect(focus).not.toBeNull();
    expect(focus?.[1]).toContain('border-color: var(--ptah-focus-ring-color);');
    expect(focus?.[1]).toContain('box-shadow: inset 0 0 0 calc(var(--ptah-focus-ring-width) - var(--ptah-border-width)) var(--ptah-focus-ring-color);');
    expect(focus?.[1]).toContain('outline: none;');
    expect(field).not.toMatch(/\.ptah-field__box:has\([^)]*:focus-visible\)[^{]*\{[^}]*outline-offset:/);
  });

  it('removes every inner control edge in mouse and keyboard focus states', () => {
    const focusReset = field.match(/:is\(\.ptah-field__body, #ptah-field\) :is\(input, textarea, select\):is\(:focus, :focus-visible\):is\([^)]*\),\s*:is\(\.ptah-field__body, #ptah-field\) \.ptah-select__trigger:is\(:focus, :focus-visible\):is\([^)]*\) \{([^}]*)\}/);
    expect(focusReset).not.toBeNull();
    for (const declaration of ['outline: none;', 'box-shadow: none;', 'border: 0;']) {
      expect(focusReset?.[1]).toContain(declaration);
    }
  });

  it('does not add the rail as a second focus mark', () => {
    expect(field).not.toContain(':focus-within .ptah-field__rail');
    expect(field).not.toContain('[data-open]) .ptah-field__rail');
  });

  it('grows the rich select and centers its action group in the field', () => {
    expect(select).toMatch(/\.ptah-field__body > \.ptah-select \{\s*flex: 1 1 auto;/);
    expect(select).toMatch(/\.ptah-select__actions \{[^}]*justify-self: end;[^}]*align-self: center;/);
    expect(select).not.toContain('margin-block-start');
  });

  it('gives the panel search no own focus box', () => {
    expect(select).toMatch(
      /^\.ptah-select :is\(\.ptah-select__search, #ptah-select\):focus-visible[^{}]*\{\s*outline: none;\s*box-shadow: none;/m,
    );
  });
});
