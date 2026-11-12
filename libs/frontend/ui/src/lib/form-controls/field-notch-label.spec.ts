import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Round 3 (TASK_2026_969_3aab): the floating label is a pure CSS notch label. */
const css = readFileSync(join(__dirname, 'ptah-field.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = readFileSync(join(__dirname, '..', 'tokens', 'ptah-tokens.css'), 'utf8');

const FLOATING = ".ptah-field[data-appearance='floating']";

/** Every rule body whose selector contains each given part. */
function rules(...parts: readonly string[]): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => parts.every((part) => m[1].includes(part)))
    .map((m) => m[2]);
}

function rule(...parts: readonly string[]): string {
  const found = rules(...parts);
  expect(found).toHaveLength(1);
  return found[0];
}

/** The first rule body whose whole selector is the given selector. */
function exact(selector: string): string {
  const found = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].trim() === selector);
  expect(found.length).toBeGreaterThan(0);
  return found[0]?.[2] ?? '';
}

function floatedRule(): { selector: string; body: string } {
  const m = css.match(
    /\.ptah-field\[data-appearance='floating'\]:is\(([\s\S]*?)\)\s*\.ptah-field__label \{([^}]*)\}/,
  );
  expect(m).not.toBeNull();
  return { selector: m?.[1] ?? '', body: m?.[2] ?? '' };
}

describe('ptah-field notch label', () => {
  it('rests in the box at the control text position and size while the control is empty', () => {
    const rest = rule(FLOATING, ':placeholder-shown) .ptah-field__label');
    expect(rest).toContain('font-size: var(--ptah-text-body-size);');
    expect(rest).toContain('background-color: transparent;');
    const base = exact(`${FLOATING} .ptah-field__label`);
    expect(base).toContain('position: absolute;');
    expect(base).toContain('top: 50%;');
    expect(base).toContain('transform: translateY(-50%);');
    expect(base).toContain('inset-inline-start: calc(var(--ptah-field-notch-pad-x) * -1);');
    expect(base).toContain('padding-inline: var(--ptah-field-notch-pad-x);');
    expect(rule(FLOATING, '.ptah-field__body:has(textarea) .ptah-field__label')).toMatch(
      /top: calc\(var\(--ptah-field-textarea-pad-y\)/,
    );
  });

  it('floats on focus, a value, autofill, a real placeholder, a native select and an open or filled ptah-select', () => {
    const { selector } = floatedRule();
    for (const state of [
      ':focus-within',
      ':not(:placeholder-shown)',
      ':autofill',
      "[placeholder]:not([placeholder=' '])",
      ':has(.ptah-field__body select)',
      '.ptah-select:is([data-open], [data-ptah-filled])',
    ]) {
      expect(selector).toContain(state);
    }
  });

  it('centers the floated label on the top border, small, with an opaque notch fill', () => {
    const { body } = floatedRule();
    expect(body).toContain('top: calc(var(--ptah-border-width) * -1);');
    expect(body).toContain('transform: translateY(-50%);');
    expect(body).toContain('font-size: var(--ptah-field-label-float-size);');
    expect(body).toContain('background-color: var(--ptah-field-notch-bg);');
    expect(body).not.toMatch(/background(-color)?:\s*(inherit|transparent)/);
    const token = tokens.match(/--ptah-field-notch-bg:\s*([^;]+);/)?.[1] ?? '';
    expect(token).not.toBe('');
    expect(token).not.toMatch(/inherit|transparent|glass-fill|\/\s*0?\.\d/);
    expect(tokens).toMatch(/--ptah-field-notch-pad-x:\s*var\(--ptah-space-1\);/);
  });

  it('takes the focus color only on focus, and the error color when invalid', () => {
    expect(rule('.ptah-field__box:focus-within .ptah-field__label')).toContain(
      'color: var(--ptah-field-label-fg-active);',
    );
    const active = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, , body]) =>
      body.includes('color: var(--ptah-field-label-fg-active);'),
    );
    expect(active.length).toBeGreaterThan(0);
    for (const [, prelude] of active) {
      expect(prelude).toContain(':focus-within');
      expect(prelude).not.toContain('[data-open]');
    }
    expect(rule("[data-invalid='true']", '.ptah-field__label')).toContain('color: var(--ptah-state-err);');
    expect(floatedRule().body).not.toContain('color: var(--ptah-field-label-fg-active)');
  });

  it('has one CSS transition, no keyframes for the label, and no transition under reduced motion', () => {
    const base = exact(`${FLOATING} .ptah-field__label`);
    expect(base).toMatch(/transition-property: top, font-size, line-height, color, background-color;/);
    expect([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])).toEqual(['ptah-field-busy']);
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(reduced).toMatch(/\.ptah-field\[data-appearance='floating'\] \.ptah-field__label \{\s*transition: none;/);
  });

  it('does not clip the label at the box and keeps the rail inside the rounded corners', () => {
    const box = exact('.ptah-field__box');
    expect(box).not.toMatch(/overflow\s*:/);
    const rail = exact('.ptah-field__rail');
    expect(rail).toContain('inset: 0;');
    expect(rail).toContain('border-radius: calc(var(--ptah-field-radius) - var(--ptah-border-width));');
    expect(rail).toMatch(/mask-image: linear-gradient\(to top, [^;]*var\(--ptah-field-rail-h\)/);
  });

  it('gives the floating control no extra top padding for the label', () => {
    expect(css).not.toContain('--ptah-field-pad-top');
    expect(css).not.toContain('--ptah-field-pad-bottom');
    expect(css).not.toContain('--ptah-field-label-float-top');
    expect(rule(FLOATING, 'textarea:is(.textarea, #ptah-control)')).toContain(
      'padding-block: var(--ptah-field-textarea-pad-y);',
    );
  });
});
