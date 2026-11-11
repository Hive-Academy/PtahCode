import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import {
  AuditOptions,
  Baseline,
  DEFAULT_IGNORE_GLOBS,
  DEFAULT_SCAN_GLOBS,
  DYNAMIC_TOKEN,
  analyzeClassExpression,
  isBlockedClassToken,
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
