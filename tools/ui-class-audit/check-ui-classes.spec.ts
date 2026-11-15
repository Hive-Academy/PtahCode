import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import {
  AuditOptions,
  Baseline,
  DEFAULT_IGNORE_GLOBS,
  DEFAULT_SCAN_GLOBS,
  DYNAMIC_TOKEN,
  SPACING_RULE,
  analyzeClassExpression,
  isBlockedClassToken,
  isRawSpacingToken,
  runAudit,
  scanHtmlFile,
  scanTsFile,
} from './check-ui-classes';

// --- fixtures ---------------------------------------------------------------

const DEMO_LIB_FILE = 'libs/frontend/demo/src/lib/demo.component.html';

it('marks the webview sources as implicit audit dependencies', () => {
  const project = JSON.parse(readFileSync(join(__dirname, 'project.json'), 'utf-8')) as { implicitDependencies: string[] };
  expect(project.implicitDependencies).toContain('ptah-extension-webview');
  expect(project.implicitDependencies).toContain('tag:scope:webview');
});

const DEMO_HTML = [
  '<div class="btn btn-primary">Actions</div>',
  '<input class="input input-bordered" />',
].join('\n');

function makeTempRepo(): { repoRoot: string; baselinePath: string } {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ui-class-audit-'));
  return { repoRoot, baselinePath: join(repoRoot, 'baseline.json') };
}

function spacingBaselineOf(baselinePath: string): string {
  return join(dirname(baselinePath), 'baseline-spacing.json');
}

function writeRepoFile(repoRoot: string, relPath: string, content: string): void {
  const abs = join(repoRoot, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
}

function auditOptions(
  repoRoot: string,
  baselinePath: string,
  updateBaseline = false,
): AuditOptions {
  return {
    repoRoot,
    scanGlobs: DEFAULT_SCAN_GLOBS,
    ignoreGlobs: DEFAULT_IGNORE_GLOBS,
    baselinePath,
    spacingBaselinePath: spacingBaselineOf(baselinePath),
    updateBaseline,
  };
}

function readBaseline(baselinePath: string): Baseline {
  return JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline;
}

// --- matching rule ----------------------------------------------------------

describe('isBlockedClassToken', () => {
  it('blocks every DaisyUI component root', () => {
    for (const token of [
      'btn',
      'input',
      'select',
      'textarea',
      'card',
      'badge',
      'alert',
      'skeleton',
    ]) {
      expect(isBlockedClassToken(token)).toBe(true);
    }
  });

  it('blocks DaisyUI modifiers of the roots', () => {
    for (const token of [
      'btn-primary',
      'btn-ghost',
      'input-sm',
      'input-bordered',
      'select-bordered',
      'textarea-xs',
      'card-body',
      'card-title',
      'badge-ghost',
      'badge-sm',
      'alert-warning',
      'alert-error',
    ]) {
      expect(isBlockedClassToken(token)).toBe(true);
    }
  });

  it('allows the Tailwind user-select utilities that collide with select', () => {
    for (const token of ['select-none', 'select-text', 'select-all', 'select-auto']) {
      expect(isBlockedClassToken(token)).toBe(false);
    }
  });

  it('never matches HTML tag names or words that merely contain a root', () => {
    for (const token of [
      'file-input',
      'stats-card-header',
      'select2',
      'btnwrap',
      'cardigan',
      'alertness',
      'flex',
      'text-sm',
      'w-full',
    ]) {
      expect(isBlockedClassToken(token)).toBe(false);
    }
  });

  it('blocks Tailwind-variant and important forms of a blocked utility', () => {
    for (const token of [
      'dark:btn',
      'md:btn-primary',
      'hover:input-bordered',
      '!btn',
      '!badge-error',
      'dark:md:!select-bordered',
    ]) {
      expect(isBlockedClassToken(token)).toBe(true);
    }
  });

  it('blocks input-group (documented decision: not a Tailwind utility)', () => {
    expect(isBlockedClassToken('input-group')).toBe(true);
  });

  it('does not block custom input-* classes (false positive: input-preview-block)', () => {
    expect(isBlockedClassToken('input-preview-block')).toBe(false);
    expect(isBlockedClassToken('input-info')).toBe(true);
    expect(isBlockedClassToken('input-xs')).toBe(true);
  });
});

// --- static template scanning ------------------------------------------------

describe('scanHtmlFile', () => {
  const FILE = 'demo/demo.component.html';

  it('reports file, line and class for static class lists', () => {
    const html = [
      '<div class="flex text-sm">A</div>',
      '<button class="btn btn-primary">Go</button>',
      '<span class="badge badge-ghost">Hi</span>',
    ].join('\n');
    expect(scanHtmlFile(html, FILE)).toEqual([
      { file: FILE, line: 2, token: 'btn' },
      { file: FILE, line: 2, token: 'btn-primary' },
      { file: FILE, line: 3, token: 'badge' },
      { file: FILE, line: 3, token: 'badge-ghost' },
    ]);
  });

  it('never matches HTML tag names', () => {
    const html = [
      '<select></select>',
      '<input type="text">',
      '<textarea placeholder="btn"></textarea>',
      '<button>Plain</button>',
    ].join('\n');
    expect(scanHtmlFile(html, FILE)).toEqual([]);
  });

  it('does not match Tailwind utilities or words containing a root', () => {
    const html =
      '<div class="select-none select-text select-all select-auto text-sm file-input stats-card-header select2 flex">A</div>';
    expect(scanHtmlFile(html, FILE)).toEqual([]);
  });

  it('flags blocked tokens in [class.foo] bindings but not safe ones', () => {
    const html = [
      '<button [class.btn-primary]="isActive()">Go</button>',
      '<button [class.select-none]="isOff()">Off</button>',
    ].join('\n');
    expect(scanHtmlFile(html, FILE)).toEqual([
      { file: FILE, line: 1, token: 'btn-primary' },
    ]);
  });

  it('flags blocked tokens inside static [ngClass] object and array literals', () => {
    const html = [
      `<div [ngClass]="{ 'btn': isBtn(), 'badge-ghost': isBadge() }">A</div>`,
      `<div [ngClass]="['btn', 'btn-ghost']">B</div>`,
    ].join('\n');
    expect(scanHtmlFile(html, FILE)).toEqual([
      { file: FILE, line: 1, token: 'btn' },
      { file: FILE, line: 1, token: 'badge-ghost' },
      { file: FILE, line: 2, token: 'btn' },
      { file: FILE, line: 2, token: 'btn-ghost' },
    ]);
  });

  it('flags blocked tokens in [class] string literals and safe literals pass', () => {
    const html = [
      `<div [class]="'btn btn-primary'">A</div>`,
      `<div [class]="isWide() ? 'text-sm' : 'text-lg'">B</div>`,
      `<div [className]="'btn'">C</div>`,
    ].join('\n');
    expect(scanHtmlFile(html, FILE)).toEqual([
      { file: FILE, line: 1, token: 'btn' },
      { file: FILE, line: 1, token: 'btn-primary' },
      { file: FILE, line: 3, token: 'btn' },
    ]);
  });

  it('reports a dynamic occurrence for expressions it cannot prove safe', () => {
    const html = [
      `<div [class]="chipClass(source) + ' shrink-0'">A</div>`,
      `<div [class]="isWide() ? 'btn' : 'text-sm'">B</div>`,
      `<div [class]="'btn' + extraClasses">C</div>`,
    ].join('\n');
    expect(scanHtmlFile(html, FILE)).toEqual([
      { file: FILE, line: 1, token: DYNAMIC_TOKEN },
      { file: FILE, line: 2, token: 'btn' },
      { file: FILE, line: 3, token: 'btn' },
      { file: FILE, line: 3, token: DYNAMIC_TOKEN },
    ]);
  });

  it('proves an identifier key in an ngClass object literal', () => {
    const html = `<div [ngClass]="{ btn: isBtn(), 'text-sm': true }">A</div>`;
    expect(scanHtmlFile(html, FILE)).toEqual([
      { file: FILE, line: 1, token: 'btn' },
    ]);
  });

  it('ignores class attributes inside HTML comments', () => {
    const html = [
      '<!-- <div class="btn btn-primary">hidden</div> -->',
      '<div class="btn">Visible</div>',
      '<!--',
      '<span class="badge">also hidden</span>',
      '-->',
    ].join('\n');
    expect(scanHtmlFile(html, FILE)).toEqual([
      { file: FILE, line: 2, token: 'btn' },
    ]);
  });

  it('counts interpolation in a static class list as dynamic', () => {
    const html = `<div class="btn {{ extra }}">A</div>`;
    expect(scanHtmlFile(html, FILE)).toEqual([
      { file: FILE, line: 1, token: 'btn' },
      { file: FILE, line: 1, token: DYNAMIC_TOKEN },
    ]);
  });

  it('does not inspect unrelated attribute values that mention classes', () => {
    const html = [
      '<div title="class=btn is not an attribute"></div>',
      '<div [attr.aria-label]="\'btn\'">A</div>',
    ].join('\n');
    expect(scanHtmlFile(html, FILE)).toEqual([]);
  });

  it('judges [attr.class] like [class]', () => {
    const html = `<div [attr.class]="'btn'">A</div>`;
    expect(scanHtmlFile(html, FILE)).toEqual([
      { file: FILE, line: 1, token: 'btn' },
    ]);
  });
});

// --- inline template scanning -------------------------------------------------

describe('scanTsFile', () => {
  const FILE = 'demo/demo-inline.component.ts';

  it('detects blocked classes in inline templates with source line numbers', () => {
    const source = [
      "import { Component } from '@angular/core';",
      '',
      '@Component({',
      "  selector: 'demo-x',",
      "  template: '<button class=\"btn btn-primary\">Go</button>',",
      '})',
      'export class DemoXComponent {}',
    ].join('\n');
    expect(scanTsFile(source, FILE)).toEqual([
      { file: FILE, line: 5, token: 'btn' },
      { file: FILE, line: 5, token: 'btn-primary' },
    ]);
  });

  it('maps multi-line backtick templates to the right lines', () => {
    const source = [
      '@Component({',
      '  template: `',
      '    <div class="card">',
      '      <span class="badge badge-ghost">Hi</span>',
      '    </div>',
      '  `,',
      '})',
      'export class DemoXComponent {}',
    ].join('\n');
    expect(scanTsFile(source, FILE)).toEqual([
      { file: FILE, line: 3, token: 'card' },
      { file: FILE, line: 4, token: 'badge' },
      { file: FILE, line: 4, token: 'badge-ghost' },
    ]);
  });

  it('reports a dynamic occurrence for a non-literal template value', () => {
    const source = [
      '@Component({',
      '  template: getTemplate(),',
      '})',
      'export class DemoXComponent {}',
    ].join('\n');
    expect(scanTsFile(source, FILE)).toEqual([
      { file: FILE, line: 2, token: DYNAMIC_TOKEN },
    ]);
  });

  it('scans the static text of an interpolated template and keeps the dynamic token', () => {
    const source = [
      '@Component({',
      '  template: `',
      '    <div class="btn ${cls}">Go</div>',
      '  `,',
      '})',
      'export class DemoYComponent {}',
    ].join('\n');
    const result = scanTsFile(source, FILE);
    expect(result).toContainEqual({ file: FILE, line: 3, token: 'btn' });
    expect(result.some((o) => o.token === DYNAMIC_TOKEN)).toBe(true);
  });

  it('keeps source lines when a substitution spans several lines', () => {
    const source = [
      '@Component({',
      '  template: `',
      '    <p>${a ?',
      "      b : c}</p>",
      '    <div class="btn">Go</div>',
      '  `,',
      '})',
      'export class DemoZComponent {}',
    ].join('\n');
    expect(scanTsFile(source, FILE)).toContainEqual({
      file: FILE,
      line: 5,
      token: 'btn',
    });
  });

  it('reports one dynamic occurrence per class binding with a substitution', () => {
    const source = [
      '@Component({',
      '  template: `',
      '    <div class="${RAW}">A</div>',
      '    <div class="p-2">B</div>',
      '    <div [ngClass]="${EXPR}">C</div>',
      '  `,',
      '})',
      'export class DemoWComponent {}',
    ].join('\n');
    const dynamic = scanTsFile(source, FILE).filter(
      (o) => o.token === DYNAMIC_TOKEN,
    );
    // two bindings plus the template-level occurrence
    expect(dynamic.map((o) => o.line).sort()).toEqual([2, 3, 5]);
  });

  it('ignores blocked-root words outside template properties', () => {
    const source = [
      "const label = 'btn';",
      "const parts = ['btn-primary', 'card-body'];",
      "export const config = { template: 'page.html' };",
    ].join('\n');
    expect(scanTsFile(source, FILE)).toEqual([]);
  });

  it('throws on a source file that does not parse', () => {
    expect(() => scanTsFile('function {{{', FILE)).toThrow(/parse failure/);
  });
});

// --- expression analysis -------------------------------------------------------

describe('analyzeClassExpression', () => {
  it('proves a ternary of safe literals safe', () => {
    expect(analyzeClassExpression("a ? 'text-sm' : 'text-lg'")).toEqual({
      blockedTokens: [],
      dynamic: false,
    });
  });

  it('extracts blocked tokens from a ternary while ignoring the condition', () => {
    expect(analyzeClassExpression("kind === 'btn' ? 'btn' : 'btn-ghost'")).toEqual({
      blockedTokens: ['btn', 'btn-ghost'],
      dynamic: false,
    });
  });

  it('treats an empty binding as safe', () => {
    expect(analyzeClassExpression('')).toEqual({ blockedTokens: [], dynamic: false });
  });

  it('flags a template literal with substitutions as dynamic but keeps static tokens', () => {
    expect(analyzeClassExpression('`btn ${extra}`')).toEqual({
      blockedTokens: ['btn'],
      dynamic: true,
    });
  });

  it('flags Angular-only syntax that does not parse as TypeScript', () => {
    expect(analyzeClassExpression("'btn' | classNamePipe: x")).toEqual({
      blockedTokens: [],
      dynamic: true,
    });
  });
});

// --- baseline ratchet through runAudit ------------------------------------------

describe('runAudit baseline ratchet', () => {
  let repoRoot: string;
  let baselinePath: string;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    const repo = makeTempRepo();
    repoRoot = repo.repoRoot;
    baselinePath = repo.baselinePath;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('fails a blocked class in a new file', async () => {
    writeRepoFile(repoRoot, DEMO_LIB_FILE, DEMO_HTML);
    const result = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(result.failed).toBe(true);
    expect(result.comparison.failures).toEqual([
      { file: DEMO_LIB_FILE, token: 'btn', count: 1, baseline: 0 },
      { file: DEMO_LIB_FILE, token: 'btn-primary', count: 1, baseline: 0 },
      { file: DEMO_LIB_FILE, token: 'input', count: 1, baseline: 0 },
      { file: DEMO_LIB_FILE, token: 'input-bordered', count: 1, baseline: 0 },
    ]);
  });

  it('seeds the baseline for new files with --update-baseline', async () => {
    writeRepoFile(repoRoot, DEMO_LIB_FILE, DEMO_HTML);
    const result = await runAudit(auditOptions(repoRoot, baselinePath, true));
    expect(result.baselineWritten).toBe(true);
    expect(readBaseline(baselinePath)).toEqual({
      [DEMO_LIB_FILE]: { btn: 1, 'btn-primary': 1, input: 1, 'input-bordered': 1 },
    });
  });

  it('does not admit a new file after the initial seed, even with --update-baseline', async () => {
    writeRepoFile(repoRoot, DEMO_LIB_FILE, DEMO_HTML);
    await runAudit(auditOptions(repoRoot, baselinePath, true));
    const added = 'libs/frontend/demo/src/lib/added.component.html';
    writeRepoFile(repoRoot, added, '<button class="btn">New</button>');

    const update = await runAudit(auditOptions(repoRoot, baselinePath, true));
    expect(update.failed).toBe(true);
    expect(update.comparison.failures).toContainEqual({
      file: added, token: 'btn', count: 1, baseline: 0,
    });
    expect(readBaseline(baselinePath)[added]).toBeUndefined();
  });

  it('passes unchanged usage after the baseline is seeded', async () => {
    writeRepoFile(repoRoot, DEMO_LIB_FILE, DEMO_HTML);
    await runAudit(auditOptions(repoRoot, baselinePath, true));
    const result = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(result.failed).toBe(false);
    expect(result.comparison.failures).toEqual([]);
    expect(result.comparison.decreases).toEqual([]);
    expect(result.comparison.staleFiles).toEqual([]);
  });

  it('fails a same-file increment and --update-baseline never raises the count', async () => {
    writeRepoFile(repoRoot, DEMO_LIB_FILE, DEMO_HTML);
    await runAudit(auditOptions(repoRoot, baselinePath, true));

    writeRepoFile(
      repoRoot,
      DEMO_LIB_FILE,
      `${DEMO_HTML}\n<button class="btn">Extra</button>`,
    );
    const result = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(result.failed).toBe(true);
    expect(result.comparison.failures).toEqual([
      { file: DEMO_LIB_FILE, token: 'btn', count: 2, baseline: 1 },
    ]);

    const update = await runAudit(auditOptions(repoRoot, baselinePath, true));
    expect(update.failed).toBe(true);
    expect(readBaseline(baselinePath)).toEqual({
      [DEMO_LIB_FILE]: { btn: 1, 'btn-primary': 1, input: 1, 'input-bordered': 1 },
    });
  });

  it('passes a removal and reports the decrease', async () => {
    writeRepoFile(repoRoot, DEMO_LIB_FILE, DEMO_HTML);
    await runAudit(auditOptions(repoRoot, baselinePath, true));

    writeRepoFile(
      repoRoot,
      DEMO_LIB_FILE,
      '<input class="input input-bordered" />',
    );
    const result = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(result.failed).toBe(false);
    expect(result.comparison.decreases).toEqual([
      { file: DEMO_LIB_FILE, token: 'btn', baseline: 1, count: 0 },
      { file: DEMO_LIB_FILE, token: 'btn-primary', baseline: 1, count: 0 },
    ]);
    const lines = logSpy.mock.calls.map((call: unknown[]) =>
      call.map(String).join(' '),
    );
    expect(lines.some((line) => /decreased since baseline/.test(line))).toBe(true);
    expect(
      lines.some((line) => line.includes(`${DEMO_LIB_FILE}: btn 1 -> 0`)),
    ).toBe(true);
  });

  it('records the decrease in the baseline only with --update-baseline', async () => {
    writeRepoFile(repoRoot, DEMO_LIB_FILE, DEMO_HTML);
    await runAudit(auditOptions(repoRoot, baselinePath, true));

    writeRepoFile(
      repoRoot,
      DEMO_LIB_FILE,
      '<input class="input input-bordered" />',
    );
    const plain = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(plain.baselineWritten).toBe(false);
    expect(readBaseline(baselinePath)).toEqual({
      [DEMO_LIB_FILE]: { btn: 1, 'btn-primary': 1, input: 1, 'input-bordered': 1 },
    });

    const update = await runAudit(auditOptions(repoRoot, baselinePath, true));
    expect(update.baselineWritten).toBe(true);
    expect(readBaseline(baselinePath)).toEqual({
      [DEMO_LIB_FILE]: { input: 1, 'input-bordered': 1 },
    });
  });

  it('fails a new blocked token in an existing file even when others are flat', async () => {
    writeRepoFile(repoRoot, DEMO_LIB_FILE, DEMO_HTML);
    await runAudit(auditOptions(repoRoot, baselinePath, true));

    writeRepoFile(
      repoRoot,
      DEMO_LIB_FILE,
      `${DEMO_HTML}\n<div class="card">C</div>`,
    );
    const result = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(result.failed).toBe(true);
    expect(result.comparison.failures).toEqual([
      { file: DEMO_LIB_FILE, token: 'card', count: 1, baseline: 0 },
    ]);
  });

  it('prunes a stale baseline entry only with --update-baseline', async () => {
    writeRepoFile(repoRoot, DEMO_LIB_FILE, DEMO_HTML);
    await runAudit(auditOptions(repoRoot, baselinePath, true));

    rmSync(join(repoRoot, DEMO_LIB_FILE));
    const plain = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(plain.failed).toBe(false);
    expect(plain.comparison.staleFiles).toEqual([DEMO_LIB_FILE]);
    expect(readBaseline(baselinePath)).not.toEqual({});

    const update = await runAudit(auditOptions(repoRoot, baselinePath, true));
    expect(update.baselineWritten).toBe(true);
    expect(readBaseline(baselinePath)).toEqual({});
  });

  it('excludes libs/frontend/ui, spec files and test harnesses from the scan', async () => {
    writeRepoFile(
      repoRoot,
      'libs/frontend/ui/src/lib/legacy.component.html',
      '<button class="btn btn-primary">Design system</button>',
    );
    writeRepoFile(
      repoRoot,
      'libs/frontend/demo/src/lib/demo.component.spec.ts',
      "import { Component } from '@angular/core';\n@Component({ template: '<div class=\"btn\">Spec</div>' })\nexport class SpecHost {}\n",
    );
    writeRepoFile(
      repoRoot,
      'libs/frontend/webview-e2e-harness/src/lib/harness.component.html',
      '<button class="btn">Harness</button>',
    );
    const result = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(result.occurrences).toEqual([]);
    expect(result.counts).toEqual({});
    expect(result.failed).toBe(false);
  });

  it('detects blocked classes in inline templates under the scan roots', async () => {
    writeRepoFile(
      repoRoot,
      'libs/frontend/demo/src/lib/demo-inline.component.ts',
      [
        "import { Component } from '@angular/core';",
        '',
        '@Component({',
        "  selector: 'demo-inline',",
        '  template: `',
        '    <div class="card">',
        '      <span class="badge">Inline</span>',
        '    </div>',
        '  `,',
        '})',
        'export class DemoInlineComponent {}',
      ].join('\n'),
    );
    const result = await runAudit(auditOptions(repoRoot, baselinePath, true));
    expect(result.occurrences).toEqual([
      {
        file: 'libs/frontend/demo/src/lib/demo-inline.component.ts',
        line: 6,
        token: 'card',
      },
      {
        file: 'libs/frontend/demo/src/lib/demo-inline.component.ts',
        line: 7,
        token: 'badge',
      },
    ]);
    expect(readBaseline(baselinePath)).toEqual({
      'libs/frontend/demo/src/lib/demo-inline.component.ts': {
        badge: 1,
        card: 1,
      },
    });
  });

  it('scans the ptah-extension-webview app root', async () => {
    writeRepoFile(
      repoRoot,
      'apps/ptah-extension-webview/src/app/app.html',
      '<div class="alert alert-error">E</div>',
    );
    const result = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(result.counts['apps/ptah-extension-webview/src/app/app.html']).toEqual({
      alert: 1,
      'alert-error': 1,
    });
  });
});

// --- raw spacing rule (settings scope) -----------------------------------------

describe('isRawSpacingToken', () => {
  it('blocks numeric scale, px and auto values of every spacing utility', () => {
    for (const token of [
      'gap-2',
      'gap-x-3',
      'gap-y-0.5',
      'p-4',
      'px-4',
      'py-2.5',
      'pt-1',
      'pr-0',
      'pb-6',
      'pl-3',
      'ps-2',
      'pe-2',
      'p-px',
      'm-0',
      'mx-auto',
      'my-1',
      'mt-0.5',
      'mr-1.5',
      'mb-2',
      'ml-px',
      'ms-1',
      'me-1',
      'space-x-2',
      'space-y-0.5',
    ]) {
      expect(isRawSpacingToken(token)).toBe(true);
    }
  });

  it('blocks negative margins', () => {
    for (const token of ['-mt-2', '-mx-1', '-m-px', '-ml-0.5', 'md:-mb-1']) {
      expect(isRawSpacingToken(token)).toBe(true);
    }
  });

  it('blocks variant and important forms', () => {
    for (const token of [
      'md:gap-2',
      'hover:px-4',
      'dark:md:!mt-1',
      '!p-2',
      'p-2!',
      '[@container(min-width:640px)]:gap-4',
    ]) {
      expect(isRawSpacingToken(token)).toBe(true);
    }
  });

  it('allows arbitrary values that use a --ptah- token', () => {
    for (const token of [
      'gap-[var(--ptah-gap-group)]',
      'px-[var(--ptah-surface-pad)]',
      'mt-[var(--ptah-gap-heading)]',
      '-mt-[var(--ptah-gap-label)]',
      'md:gap-[var(--ptah-gap-field)]',
      '[@container(min-width:640px)]:gap-[var(--ptah-gap-group)]',
      'p-(--ptah-gap-controls)',
    ]) {
      expect(isRawSpacingToken(token)).toBe(false);
    }
  });

  it('blocks arbitrary values without a --ptah- token', () => {
    for (const token of [
      'gap-[7px]',
      'p-[var(--other-pad)]',
      'mt-[2rem]',
      'px-(--my-pad)',
    ]) {
      expect(isRawSpacingToken(token)).toBe(true);
    }
  });

  it('does not match other utilities or theme aliases', () => {
    for (const token of [
      'flex',
      'text-sm',
      'pointer-events-none',
      'max-w-2',
      'min-h-0',
      'place-items-center',
      'space-x-reverse',
      'gap-ptah-field',
      'py',
      'w-4',
      'top-2',
      'inset-x-0',
    ]) {
      expect(isRawSpacingToken(token)).toBe(false);
    }
  });
});

describe('raw spacing template scanning', () => {
  const FILE = 'libs/frontend/chat/src/lib/settings/demo.component.html';

  it('judges static class, [class], [ngClass] and [class.x] and never reports dynamic', () => {
    const html = [
      '<div class="flex gap-2 gap-[var(--ptah-gap-group)] btn">A</div>',
      `<div [class]="wide() ? 'px-4' : 'px-[var(--ptah-surface-pad)]'">B</div>`,
      `<div [ngClass]="{ 'mt-1': on(), 'text-sm': true }">C</div>`,
      '<div [class.-mb-2]="tight()">D</div>',
      `<div [class]="chipClass() + ' py-1'">E</div>`,
      '<div class="p-3 {{ extra }}">F</div>',
    ].join('\n');
    expect(scanHtmlFile(html, FILE, SPACING_RULE)).toEqual([
      { file: FILE, line: 1, token: 'gap-2' },
      { file: FILE, line: 2, token: 'px-4' },
      { file: FILE, line: 3, token: 'mt-1' },
      { file: FILE, line: 4, token: '-mb-2' },
      { file: FILE, line: 5, token: 'py-1' },
      { file: FILE, line: 6, token: 'p-3' },
    ]);
  });

  it('scans inline templates and drops the dynamic template occurrence', () => {
    const source = [
      '@Component({',
      '  template: `',
      '    <div class="gap-1 ${cls}">A</div>',
      '  `,',
      '})',
      'export class DemoComponent {}',
      '@Component({ template: getTemplate() })',
      'export class OtherComponent {}',
    ].join('\n');
    expect(scanTsFile(source, 'x.ts', SPACING_RULE)).toEqual([
      { file: 'x.ts', line: 3, token: 'gap-1' },
    ]);
  });
});

describe('runAudit raw spacing rule', () => {
  const SETTINGS_FILE =
    'libs/frontend/chat/src/lib/settings/demo/demo.component.html';
  const ACCOUNTS_FILE =
    'libs/frontend/chat/src/lib/settings/providers/accounts/demo-row.component.html';
  let repoRoot: string;
  let baselinePath: string;
  let spacingPath: string;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    const repo = makeTempRepo();
    repoRoot = repo.repoRoot;
    baselinePath = repo.baselinePath;
    spacingPath = spacingBaselineOf(baselinePath);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function logLines(): string[] {
    return logSpy.mock.calls.map((call: unknown[]) =>
      call.map(String).join(' '),
    );
  }

  it('does not flag raw spacing outside the settings scope', async () => {
    writeRepoFile(
      repoRoot,
      'libs/frontend/chat/src/lib/chat/x.component.html',
      '<div class="gap-2 px-4">A</div>',
    );
    writeRepoFile(
      repoRoot,
      'apps/ptah-extension-webview/src/app/app.html',
      '<div class="mt-1">A</div>',
    );
    const result = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(result.spacing.occurrences).toEqual([]);
    expect(result.failed).toBe(false);
  });

  it('does not scan settings spec files', async () => {
    writeRepoFile(
      repoRoot,
      'libs/frontend/chat/src/lib/settings/demo/demo.component.spec.ts',
      "@Component({ template: '<div class=\"gap-2\">Spec</div>' })\nexport class SpecHost {}\n",
    );
    const result = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(result.spacing.occurrences).toEqual([]);
  });

  it('fails a raw spacing utility in a settings file and names the rule', async () => {
    writeRepoFile(
      repoRoot,
      SETTINGS_FILE,
      '<div class="gap-2 gap-[var(--ptah-gap-group)]">A</div>',
    );
    const result = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(result.failed).toBe(true);
    expect(result.comparison.failures).toEqual([]);
    expect(result.spacing.comparison.failures).toEqual([
      { file: SETTINGS_FILE, token: 'gap-2', count: 1, baseline: 0 },
    ]);
    expect(
      logLines().some(
        (line) =>
          line.includes(`${SETTINGS_FILE}:1: gap-2`) &&
          line.includes('raw spacing utility') &&
          line.includes('use a pattern component or a --ptah-* token'),
      ),
    ).toBe(true);
  });

  it('does not double count a dynamic expression in the settings scope', async () => {
    writeRepoFile(
      repoRoot,
      SETTINGS_FILE,
      `<div [class]="chip() + ' gap-2'">A</div>`,
    );
    const result = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(result.counts[SETTINGS_FILE]).toEqual({ [DYNAMIC_TOKEN]: 1 });
    expect(result.spacing.counts[SETTINGS_FILE]).toEqual({ 'gap-2': 1 });
  });

  it('ratchets the spacing baseline up and down', async () => {
    writeRepoFile(repoRoot, SETTINGS_FILE, '<div class="gap-2 px-4">A</div>');
    const seed = await runAudit(auditOptions(repoRoot, baselinePath, true));
    expect(seed.spacing.baselineWritten).toBe(true);
    expect(readBaseline(spacingPath)).toEqual({
      [SETTINGS_FILE]: { 'gap-2': 1, 'px-4': 1 },
    });

    // An increase fails, and --update-baseline never raises the count.
    writeRepoFile(
      repoRoot,
      SETTINGS_FILE,
      '<div class="gap-2 px-4">A</div>\n<p class="gap-2">B</p>',
    );
    const up = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(up.failed).toBe(true);
    expect(up.spacing.comparison.failures).toEqual([
      { file: SETTINGS_FILE, token: 'gap-2', count: 2, baseline: 1 },
    ]);
    const upUpdate = await runAudit(auditOptions(repoRoot, baselinePath, true));
    expect(upUpdate.failed).toBe(true);
    expect(readBaseline(spacingPath)).toEqual({
      [SETTINGS_FILE]: { 'gap-2': 1, 'px-4': 1 },
    });

    // A decrease passes and is recorded only with --update-baseline.
    writeRepoFile(
      repoRoot,
      SETTINGS_FILE,
      '<div class="gap-[var(--ptah-gap-group)] px-4">A</div>',
    );
    const down = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(down.failed).toBe(false);
    expect(down.spacing.comparison.decreases).toEqual([
      { file: SETTINGS_FILE, token: 'gap-2', baseline: 1, count: 0 },
    ]);
    expect(readBaseline(spacingPath)).toEqual({
      [SETTINGS_FILE]: { 'gap-2': 1, 'px-4': 1 },
    });
    const downUpdate = await runAudit(auditOptions(repoRoot, baselinePath, true));
    expect(downUpdate.spacing.baselineWritten).toBe(true);
    expect(readBaseline(spacingPath)).toEqual({ [SETTINGS_FILE]: { 'px-4': 1 } });
  });

  it('keeps spacing tokens out of baseline.json and leaves it untouched', async () => {
    writeRepoFile(repoRoot, SETTINGS_FILE, '<div class="btn gap-2">A</div>');
    await runAudit(auditOptions(repoRoot, baselinePath, true));
    expect(readBaseline(baselinePath)).toEqual({ [SETTINGS_FILE]: { btn: 1 } });
    expect(readBaseline(spacingPath)).toEqual({ [SETTINGS_FILE]: { 'gap-2': 1 } });

    // Only spacing changes: baseline.json stays byte-identical.
    const before = readFileSync(baselinePath, 'utf8');
    writeRepoFile(repoRoot, SETTINGS_FILE, '<div class="btn">A</div>');
    const update = await runAudit(auditOptions(repoRoot, baselinePath, true));
    expect(update.baselineWritten).toBe(false);
    expect(update.spacing.baselineWritten).toBe(true);
    expect(readFileSync(baselinePath, 'utf8')).toBe(before);
    expect(readBaseline(spacingPath)).toEqual({});
  });

  it('never seeds a converted accounts file, so its raw spacing fails', async () => {
    writeRepoFile(
      repoRoot,
      ACCOUNTS_FILE,
      '<div class="px-4 gap-[var(--ptah-gap-inline)]">A</div>',
    );
    writeRepoFile(repoRoot, SETTINGS_FILE, '<div class="gap-2">A</div>');
    await runAudit(auditOptions(repoRoot, baselinePath, true));
    expect(readBaseline(spacingPath)).toEqual({ [SETTINGS_FILE]: { 'gap-2': 1 } });
    const after = await runAudit(auditOptions(repoRoot, baselinePath));
    expect(after.failed).toBe(true);
    expect(after.spacing.comparison.failures).toEqual([
      { file: ACCOUNTS_FILE, token: 'px-4', count: 1, baseline: 0 },
    ]);
  });
});

describe('committed spacing baseline', () => {
  it('is a lint input of the audit', () => {
    const project = JSON.parse(
      readFileSync(join(__dirname, 'project.json'), 'utf-8'),
    ) as { targets: { lint: { inputs: string[] } } };
    expect(project.targets.lint.inputs).toContain(
      '{projectRoot}/baseline-spacing.json',
    );
  });

  it('holds only settings files and no converted accounts file', () => {
    const spacing = JSON.parse(
      readFileSync(join(__dirname, 'baseline-spacing.json'), 'utf-8'),
    ) as Baseline;
    const files = Object.keys(spacing);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(file.startsWith('libs/frontend/chat/src/lib/settings/')).toBe(true);
      expect(file.includes('/settings/providers/accounts/')).toBe(false);
    }
  });
});
