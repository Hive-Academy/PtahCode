import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, 'ptah-button.css'), 'utf8');
const rules = css
  .split('}')
  .map((chunk) => chunk.trim())
  .filter((chunk) => chunk.includes('{'))
  .map((chunk) => chunk.split('{')[0].trim());

describe('ptah-button.css owner input rules', () => {
  it('scopes danger tone rules to the ghost variant, so other variants ignore them', () => {
    const toneRules = rules.filter(
      (selector) =>
        selector.includes('[data-tone') && !selector.includes("[data-tone='warning']"),
    );
    expect(toneRules.length).toBeGreaterThan(0);
    toneRules.forEach((selector) => expect(selector).toContain('.btn-ghost'));
  });

  it('scopes warning tone rules to the filled primary and outline variants', () => {
    const warningRules = rules.filter((selector) =>
      selector.includes("[data-tone='warning']"),
    );
    expect(warningRules.length).toBeGreaterThan(0);
    warningRules.forEach((selector) =>
      expect(/\.btn-(primary|outline)\[data-tone='warning'\]/.test(selector)).toBe(true),
    );
  });

  it('keeps the disabled look on a selected host', () => {
    const selectedRules = rules.filter((selector) =>
      selector.includes('[data-selected]'),
    );
    expect(selectedRules.length).toBeGreaterThan(0);
    selectedRules.forEach((selector) =>
      expect(selector).toContain(":not(:disabled, [disabled], [aria-disabled='true'])"),
    );
  });

  it('ignores selection on filled primary and danger variants', () => {
    const selectedRules = rules.filter((selector) =>
      selector.includes('[data-selected]'),
    );
    selectedRules.forEach((selector) =>
      expect(selector).toContain(':not(.btn-primary, .btn-error)'),
    );
  });

  it('applies selection to the outline variant and ignores tone there', () => {
    const selectedRules = rules.filter((selector) =>
      selector.includes('[data-selected]'),
    );
    selectedRules.forEach((selector) => expect(selector).not.toContain('btn-outline'));
    const toneRules = rules.filter(
      (selector) =>
        selector.includes('[data-tone') && !selector.includes("[data-tone='warning']"),
    );
    toneRules.forEach((selector) => expect(selector).not.toContain('btn-outline'));
  });
});
