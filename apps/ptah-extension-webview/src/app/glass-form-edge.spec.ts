import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');

describe('glass form edge ownership', () => {
  it('keeps the glass inset and focus halo away from family controls', () => {
    expect(css).toMatch(/:root\[data-glass='on'\] :is\(\.input, \.select, \.textarea\):not\(\[data-ptah-control\]\) \{[^}]*box-shadow: inset 0 1px 2px/);
    expect(css).toMatch(/:root\[data-glass='on'\] :is\(\.input, \.select, \.textarea\):not\(\[data-ptah-control\]\):focus,\s*:root\[data-glass='on'\] \.input:not\(\[data-ptah-control\]\):focus-within \{[^}]*outline: 2px solid var\(--glass-focus\);[^}]*box-shadow: 0 0 0 5px/);
    expect(css).toMatch(/:root\[data-glass='on'\] :is\(\.input, \.select, \.textarea\):not\(\[data-ptah-control\]\):disabled/);
  });
});
