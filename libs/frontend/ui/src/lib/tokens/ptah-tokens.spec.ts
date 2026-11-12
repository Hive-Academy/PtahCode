/**
 * Guard for the Ptah design tokens (TASK_2026_926_6b1f, contract:
 * `.ptah/specs/TASK_2026_926_6b1f/foundation-tokens.md`).
 * Plain node fs: no Angular TestBed. The Tailwind names for these tokens are
 * guarded in `apps/ptah-extension-webview/src/app/design-tokens.spec.ts`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const LIB_SRC = resolve(__dirname, '..');
const CSS = readFileSync(join(__dirname, 'ptah-tokens.css'), 'utf8');

/**
 * Folders (relative to `libs/frontend/ui/src/lib`) that may use tokens only.
 * The token file itself is the one place for raw values. Each component
 * family adds its folder here.
 */
const TOKEN_ONLY_DIRS: readonly string[] = [
  'tokens',
  'button',
  'form-controls',
  'badge',
  'time',
  'charts',
];

const SPACE_STEPS = ['1', '2', '3', '4', '6', '8', '12'] as const;
const TEXT_ROLES = [
  'page-title',
  'section-title',
  'group-title',
  'body',
  'label',
  'hint',
  'caption',
  'code',
] as const;

const TOKEN_NAMES: readonly string[] = [
  ...SPACE_STEPS.map((s) => `--ptah-space-${s}`),
  ...[
    'gap-inline',
    'gap-label',
    'gap-controls',
    'gap-field',
    'gap-group',
    'gap-section',
    'gap-heading',
    'page-gutter',
    'surface-pad',
    'dialog-pad',
    'control-h-xs',
    'control-h-sm',
    'control-h-md',
    'control-h-field',
    'control-px-xs',
    'control-px',
    'control-px-md',
    'icon-xs',
    'icon-sm',
    'icon-md',
    'radius-control',
    'radius-surface',
    'radius-chip',
    'border-width',
    'border-color',
    'border-color-strong',
    'control-edge',
    'control-edge-strong',
    'btn-primary-bg',
    'btn-primary-bg-hover',
    'btn-primary-bg-active',
    'btn-primary-fg',
    'btn-secondary-bg',
    'btn-secondary-bg-hover',
    'btn-secondary-bg-active',
    'btn-secondary-fg',
    'btn-secondary-border',
    'btn-secondary-border-hover',
    'btn-ghost-bg-hover',
    'btn-ghost-bg-active',
    'btn-ghost-fg',
    'btn-danger-bg',
    'btn-danger-bg-hover',
    'btn-danger-bg-active',
    'btn-danger-fg',
    'btn-link-fg',
    'btn-link-fg-hover',
    'btn-link-fg-active',
    'btn-disabled-bg',
    'btn-disabled-fg',
    'btn-disabled-border',
    'btn-disabled-opacity',
    'btn-busy-opacity',
    'btn-spinner-duration',
    'focus-ring-width',
    'focus-ring-offset',
    'focus-ring-color',
    'elevation-0',
    'elevation-1',
    'elevation-2',
    'elevation-3',
    'duration-fast',
    'duration-base',
    'duration-slow',
    'ease-standard',
    'ease-emphasis',
    'state-ok',
    'state-warn',
    'state-err',
    'state-info',
    'badge-h-xs',
    'badge-h-sm',
    'badge-px-xs',
    'badge-px',
    'badge-fill-mix',
    'badge-edge-mix',
    'badge-neutral-ink',
    'badge-accent-ink',
    'status-glyph',
    'status-ring',
    'z-raised',
    'z-menu',
    'z-dialog',
    'z-overlay',
  ].map((n) => `--ptah-${n}`),
  ...TEXT_ROLES.flatMap((r) =>
    ['size', 'leading', 'weight'].map((p) => `--ptah-text-${r}-${p}`),
  ),
];

/** The white-space ladder and the control heights of the contract. */
const TOKEN_VALUES: Readonly<Record<string, string>> = {
  'gap-label': 'var(--ptah-space-1)',
  'gap-inline': 'var(--ptah-space-2)',
  'gap-controls': 'var(--ptah-space-2)',
  'gap-heading': 'var(--ptah-space-3)',
  'gap-field': 'var(--ptah-space-4)',
  'gap-group': 'var(--ptah-space-6)',
  'gap-section': 'var(--ptah-space-8)',
  'control-h-xs': '1.5rem',
  'control-h-sm': '2rem',
  'control-h-md': '2.5rem',
  'control-h-field': '3.25rem',
};

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

describe('ptah design tokens', () => {
  it.each(TOKEN_NAMES)('declares %s', (name) => {
    expect(CSS).toContain(`${name}:`);
  });

  it.each(Object.entries(TOKEN_VALUES))('%s is %s', (name, value) => {
    expect(CSS).toContain(`--ptah-${name}: ${value};`);
  });

  it('has no @layer, @apply or @tailwind', () => {
    expect(CSS).not.toMatch(/@(layer|apply|tailwind)\b/);
  });

  it('keeps spacing scale values at multiples of 0.25rem', () => {
    for (const step of SPACE_STEPS) {
      const match = new RegExp(`--ptah-space-${step}:\\s*([\\d.]+)rem;`).exec(
        CSS,
      );
      expect(match).not.toBeNull();
      const quarters = Number(match?.[1]) / 0.25;
      expect(Number.isInteger(quarters)).toBe(true);
    }
  });

  it('keeps token-only folders free of raw palette and pixel values', () => {
    const raw = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\boklch\(|\b\d+(\.\d+)?px\b/;
    for (const dir of TOKEN_ONLY_DIRS) {
      const files = listFiles(join(LIB_SRC, dir)).filter(
        (f) =>
          /\.(ts|html|css)$/.test(f) &&
          !/\.spec\.ts$/.test(f) &&
          !f.endsWith('ptah-tokens.css'),
      );
      for (const file of files) {
        expect({
          file,
          raw: raw.exec(readFileSync(file, 'utf8'))?.[0],
        }).toEqual({ file, raw: undefined });
      }
    }
  });
});
