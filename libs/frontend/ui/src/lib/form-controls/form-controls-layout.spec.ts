import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Layout contract of the shared controls in Settings (user feedback of 2026-11-18). */
const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '');
const field = strip(readFileSync(join(__dirname, 'ptah-field.css'), 'utf8'));
const select = strip(readFileSync(join(__dirname, 'rich-select', 'ptah-select.css'), 'utf8'));
const tokens = readFileSync(join(__dirname, '..', 'tokens', 'ptah-tokens.css'), 'utf8');

function body(css: string, selector: string): string {
  const found = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].trim() === selector);
  expect(found.length).toBeGreaterThan(0);
  return found[0]?.[2] ?? '';
}

describe('shared control layout', () => {
  it('fills the container width by default with no weight, so a width utility still wins', () => {
    expect(body(field, ':where(ptah-field)')).toContain('inline-size: 100%;');
    expect(body(select, ':where(ptah-select)')).toContain('inline-size: 100%;');
  });

  it('keeps a fixed message slot in a field grid, so one row has the same top and bottom', () => {
    const slot = body(
      field,
      ":where([data-ptah-pattern='field-grid']) .ptah-field:not(:has(> .ptah-field__footer))::after",
    );
    expect(slot).toContain("content: '';");
    expect(slot).toContain('block-size: var(--ptah-text-label-leading);');
    expect(body(field, '.ptah-field__message')).toContain('line-height: var(--ptah-text-label-leading);');
  });

  it('gives the compact select one width in a setting row and one height in rows and table cells', () => {
    expect(body(select, ":where([data-ptah-pattern='setting-row']) :where(ptah-select, ptah-field)")).toContain(
      'inline-size: var(--ptah-setting-row-control-w);',
    );
    expect(tokens).toMatch(/--ptah-setting-row-control-w:\s*13rem;/);
    const height = body(
      select,
      "[data-ptah-pattern='setting-row'] .ptah-select[data-size]:not(.ptah-field__body > .ptah-select) .ptah-select__trigger,\n.ptah-table-control-cell .ptah-select[data-size] .ptah-select__trigger",
    );
    expect(height).toContain('height: var(--ptah-control-h-sm);');
    expect(height).toContain('min-height: var(--ptah-control-h-sm);');
  });
});
