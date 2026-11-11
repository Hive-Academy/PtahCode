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

const { interpolate, oklch, wcagContrast } = require('culori/require');
const config = require('../../tailwind.config.js') as {
  theme: { extend: Record<string, Record<string, unknown>> };
  daisyui: { themes: Array<Record<string, Record<string, string>>> };
};

const TOKEN_FILE = 'libs/frontend/ui/src/lib/tokens/ptah-tokens.css';
const BUTTON_CSS_FILE = 'libs/frontend/ui/src/lib/button/ptah-button.css';
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
  it('imports the token and button look files before the Tailwind layers', () => {
    const importAt = stylesCss.indexOf(`@import '../../../${TOKEN_FILE}';`);
    const buttonImportAt = stylesCss.indexOf(
      `@import '../../../${BUTTON_CSS_FILE}';`,
    );
    expect(importAt).toBeGreaterThan(-1);
    expect(buttonImportAt).toBeGreaterThan(importAt);
    expect(buttonImportAt).toBeLessThan(stylesCss.indexOf('@tailwind base'));
  });

  it('scopes every rule of the button look to directive hosts', () => {
    const css = readFileSync(join(WORKSPACE_ROOT, BUTTON_CSS_FILE), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@keyframes[^{]*\{[\s\S]*?\}\s*\}/g, '');
    const preludes = [...css.matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1].trim())
      .filter((prelude) => prelude && !prelude.startsWith('@'));
    expect(preludes.length).toBeGreaterThan(30);
    expect(css).not.toContain('data-ptah-look');
    const unscoped = preludes
      .flatMap((prelude) => prelude.split(/,(?![^(]*\))/))
      .map((selector) => selector.trim())
      .filter((selector) => !selector.startsWith('.btn[data-ptah-button]'));
    expect(unscoped).toEqual([]);
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
      ...['--p', '--pc', '--su', '--wa', '--er', '--erc', '--in'],
      ...['--b1', '--b2', '--b3', '--bc'],
    ]);
    const missing = [...tokenCss.matchAll(/var\((--[a-z0-9-]+)\)/g)]
      .map((m) => m[1])
      .filter((n) => !own.has(n) && !outer.has(n) && !fromTheme.has(n));
    expect(missing).toEqual([]);
  });
});

describe('Ptah reference theme contrast (ptah-glass and ptah-glass-light)', () => {
  const customThemes: Record<string, Record<string, string>> = Object.assign(
    {},
    ...config.daisyui.themes,
  );
  const referenceThemes = ['ptah-glass', 'ptah-glass-light'] as const;

  function resolveSurfaces(theme: Record<string, string>) {
    const b1 = theme['base-100'];
    const b2 = theme['base-200'];
    const b3 = theme['base-300'];
    return {
      'base-100': b1,
      'base-200': b2,
      'base-300': b3,
      'surface-0': b1,
      'surface-1': interpolate([b1, b2], 'oklch')(0.88),
      'surface-2': b2,
      'surface-3': interpolate([b2, b3], 'oklch')(0.86),
    } as const;
  }

  describe.each(referenceThemes)('%s muted and button contrast', (themeName) => {
    const theme = customThemes[themeName];
    const muted = oklch(`oklch(${theme['--bcm']})`);
    const surfaces = resolveSurfaces(theme);
    const controlEdge = interpolate(
      [theme['base-100'], theme['base-content']],
      'oklch',
    )(0.55);

    it.each(Object.keys(surfaces) as Array<keyof typeof surfaces>)(
      'keeps base-content-muted >= 4.5:1 on %s',
      (surfaceKey) => {
        expect(wcagContrast(muted, surfaces[surfaceKey])).toBeGreaterThanOrEqual(
          4.5,
        );
      },
    );

    it('keeps proposed button variant text >= 4.5:1 against its fill', () => {
      expect(
        wcagContrast(theme['primary-content'], theme['primary']),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        wcagContrast(theme['error-content'], theme['error']),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        wcagContrast(theme['base-content'], surfaces['surface-2']),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        wcagContrast(theme['base-content'], surfaces['base-100']),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        wcagContrast(theme['primary'], surfaces['base-100']),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        wcagContrast(theme['primary'], surfaces['base-200']),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        wcagContrast(theme['primary'], surfaces['base-300']),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps control edge and focus ring >= 3:1 against base-100, base-200 and base-300', () => {
      for (const surface of ['base-100', 'base-200', 'base-300'] as const) {
        expect(
          wcagContrast(controlEdge, surfaces[surface]),
        ).toBeGreaterThanOrEqual(3);
        expect(
          wcagContrast(theme['primary'], surfaces[surface]),
        ).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
