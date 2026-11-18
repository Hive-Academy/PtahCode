/**
 * TASK_2026_2276_af6c: the five chart series inks (plus "other") must clear
 * 3:1 (WCAG non-text contrast) against the panel surfaces of both themes.
 * The values are read from ptah-tokens.css, so a token edit is measured here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// culori ships no types for its CommonJS entry; the two functions are typed below.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const culori = require('culori/require') as {
  wcagContrast: (a: string, b: string) => number;
};

const CSS = readFileSync(join(__dirname, 'ptah-tokens.css'), 'utf8');
const SERIES = ['1', '2', '3', '4', '5', 'other'] as const;
const DARK_SURFACES = ['#17191d', '#202329'] as const;
const LIGHT_SURFACES = ['#ffffff', '#f7f3fd'] as const;
const GRAPHICS_AA = 3;

function seriesBlock(selectorStart: string): string {
  const start = CSS.indexOf('/* ---- Chart series inks');
  const end = CSS.indexOf('/* ---- end chart series inks');
  const section = CSS.slice(start, end);
  const at = section.indexOf(selectorStart);
  expect(at).toBeGreaterThanOrEqual(0);
  return section.slice(at, section.indexOf('}', at));
}

function tokenValue(block: string, key: string): string {
  const match = new RegExp(`--ptah-series-${key}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`--ptah-series-${key} is missing`);
  return match[1].trim();
}

describe('chart series tokens', () => {
  const dark = seriesBlock(':root,');
  const light = seriesBlock(":root[data-theme-mode='light']");

  it.each(SERIES)('series %s clears 3:1 on the dark surfaces', (key) => {
    for (const surface of DARK_SURFACES) {
      expect(culori.wcagContrast(tokenValue(dark, key), surface)).toBeGreaterThanOrEqual(GRAPHICS_AA);
    }
  });

  it.each(SERIES)('series %s clears 3:1 on the light surfaces', (key) => {
    for (const surface of LIGHT_SURFACES) {
      expect(culori.wcagContrast(tokenValue(light, key), surface)).toBeGreaterThanOrEqual(GRAPHICS_AA);
    }
  });

  it('keeps the five named inks distinct in each theme', () => {
    for (const block of [dark, light]) {
      const values = SERIES.map((key) => tokenValue(block, key));
      expect(new Set(values).size).toBe(values.length);
    }
  });
});
