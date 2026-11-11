/**
 * TASK_2026_926_6b1f: the Tailwind names for the Ptah design tokens.
 *
 * `tailwind.config.js` gives each token a `ptah-` name. This spec makes sure
 * that each name points to a token that `ptah-tokens.css` declares, that the
 * application imports the token file, and that the application defines every
 * outer token the token file reads without a fallback.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const config = require('../../tailwind.config.js') as {
  theme: { extend: Record<string, Record<string, unknown>> };
};

const TOKEN_FILE = 'libs/frontend/ui/src/lib/tokens/ptah-tokens.css';
const WORKSPACE_ROOT = join(__dirname, '..', '..', '..', '..');
const tokenCss = readFileSync(join(WORKSPACE_ROOT, TOKEN_FILE), 'utf8');
const stylesCss = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');

const declared = (css: string): Set<string> =>
  new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

/** Sections with older `ptah-` names that are not design tokens. */
const NOT_TOKEN_SECTIONS = new Set(['animation', 'keyframes']);

/** `ptah-` keys of `theme.extend`, as `[section, key, value]`. */
const ptahEntries = Object.entries(config.theme.extend)
  .filter(([section]) => !NOT_TOKEN_SECTIONS.has(section))
  .flatMap(([section, values]) =>
    Object.entries(values)
      .filter(([key]) => key.startsWith('ptah-'))
      .map(([key, value]) => [section, key, JSON.stringify(value)] as const),
  );

describe('Ptah design tokens in the application', () => {
  it('imports the token file before the Tailwind layers', () => {
    const importAt = stylesCss.indexOf(`@import '../../../${TOKEN_FILE}';`);
    expect(importAt).toBeGreaterThan(-1);
    expect(importAt).toBeLessThan(stylesCss.indexOf('@tailwind base'));
  });

  it('has a Tailwind name for each token group', () => {
    const sections = new Set(ptahEntries.map(([section]) => section));
    expect([...sections].sort()).toEqual([
      'borderRadius',
      'boxShadow',
      'fontSize',
      'height',
      'minHeight',
      'outlineColor',
      'outlineOffset',
      'outlineWidth',
      'spacing',
      'transitionDuration',
      'transitionTimingFunction',
    ]);
  });

  it.each(ptahEntries)('%s.%s reads only declared tokens', (_s, _k, value) => {
    const tokens = declared(tokenCss);
    const used = [...value.matchAll(/var\((--ptah-[a-z0-9-]+)/g)].map(
      (m) => m[1],
    );
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !tokens.has(name))).toEqual([]);
  });

  it('defines each outer token that the token file reads without a fallback', () => {
    const own = declared(tokenCss);
    const outer = declared(stylesCss);
    // DaisyUI sets these on each theme (see `themes` in tailwind.config.js).
    const fromTheme = new Set([
      ...['--rounded-btn', '--rounded-box', '--rounded-badge'],
      ...['--p', '--su', '--wa', '--er', '--in'],
    ]);
    const missing = [...tokenCss.matchAll(/var\((--[a-z0-9-]+)\)/g)]
      .map((m) => m[1])
      .filter((n) => !own.has(n) && !outer.has(n) && !fromTheme.has(n));
    expect(missing).toEqual([]);
  });
});
