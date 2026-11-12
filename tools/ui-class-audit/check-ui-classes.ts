#!/usr/bin/env npx ts-node
/**
 * ui-class-audit — ratchet against new raw DaisyUI component classes in
 * Angular templates outside the design system library
 * (`libs/frontend/ui`, published as `@ptah-extension/ui`).
 *
 * Scope: external templates (`.html`) and inline `template:` strings in
 * `.ts` under `apps/ptah-extension-webview/src` and the `src` tree of every
 * `libs/frontend/<lib>` library. Excluded: `libs/frontend/ui` (the design
 * system itself defines these classes), spec/test files,
 * `libs/frontend/webview-e2e-harness` (test harness, same exclusion as
 * degradation-audit) and generated output (`node_modules`, `dist`).
 *
 * Matching rule — a whitespace-separated class token is blocked when, after
 * stripping one leading Tailwind `!` (important) and every Tailwind variant
 * prefix (`foo:` segments before the utility), the remaining utility:
 *   1. equals one of the DaisyUI component roots
 *      `btn`, `input`, `select`, `textarea`, `checkbox`, `toggle`,
 *      `form-control`, `label`, `card`, `badge`, `alert`, `skeleton`; or
 *   2. starts with `<root>-` (a DaisyUI modifier: `btn-primary`, `input-sm`,
 *      `card-body`, `badge-ghost`, `alert-warning`, ...),
 *      EXCEPT `select-none`, `select-text`, `select-all`, `select-auto`,
 *      which are Tailwind user-select utilities, not DaisyUI classes.
 * Words that merely contain a root (`file-input`, `stats-card-header`,
 * `select2`) are never matched because the root must anchor the start.
 * `input-group` IS flagged: it is not a Tailwind utility, and any `input-*`
 * class outside the design system deserves review. HTML tag names
 * (`<select>`, `<input>`, `<textarea>`, `<button>`) are never inspected; only
 * class lists are.
 *
 * Inspected surfaces (per file, reported as file:line:class):
 *   - static `class="..."` and static `ngClass="..."` (Angular passes the
 *     literal string as the directive input);
 *   - `[class.foo]="expr"` bindings — judged on `foo`; the condition is not a
 *     class source;
 *   - `[class]`, `[ngClass]`, `[className]`, `[attr.class]` expression
 *     bindings — every string literal inside the expression (object keys,
 *     array elements, ternary arms, concatenations) is extracted and judged.
 *
 * Dynamic expressions: an expression whose class list cannot be proven safe
 * from its string literals — a call, an identifier, a template literal with
 * substitutions, an unknown node kind, or Angular-only syntax that does not
 * parse as TypeScript — is reported as one `<dynamic>` occurrence for that
 * line. Proven-safe literals (`'text-sm'`, `{ 'active': x }`) pass. A class
 * attribute with `{{ ... }}` interpolation also counts as `<dynamic>`, while
 * its static tokens are still judged individually.
 *
 * Baseline: `baseline.json` holds, per repo-relative file, the allowed count
 * of each blocked token (including `<dynamic>`), normalized to forward
 * slashes. Any count above the baseline fails the run; a decrease passes and
 * is reported. `--update-baseline` is the only thing that ever writes the
 * baseline: it seeds files that are not in the baseline, records decreases
 * and prunes files the scan no longer sees. New files are seeded only when
 * the baseline does not yet exist. It NEVER raises an existing entry, so a
 * new usage in an already-baselined file cannot be absorbed silently; the
 * only escape is a hand-edited, review-visible baseline change.
 *
 * Modeled on `tools/degradation-audit` (committed baseline, fail on
 * increase, allow decreases, never regenerate silently, exit 2 on tool
 * failure such as an unparseable source file).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import fg from 'fast-glob';

// --- matching rule -----------------------------------------------------------

export const BLOCKED_ROOTS = [
  'alert',
  'badge',
  'btn',
  'card',
  'checkbox',
  'form-control',
  'input',
  'label',
  'select',
  'skeleton',
  'textarea',
  'toggle',
] as const;

/** Tailwind user-select utilities that collide with the `select` root. */
const TAILWIND_SELECT_UTILITIES = new Set(['all', 'auto', 'none', 'text']);

/** Sentinel token for class expressions that cannot be proven safe. */
export const DYNAMIC_TOKEN = '<dynamic>';

export function isBlockedClassToken(rawToken: string): boolean {
  let token = rawToken;
  const lastColon = token.lastIndexOf(':');
  if (lastColon >= 0) token = token.slice(lastColon + 1); // Tailwind variants
  if (token.startsWith('!')) token = token.slice(1); // Tailwind important
  for (const root of BLOCKED_ROOTS) {
    if (token === root) return true;
    if (!token.startsWith(`${root}-`)) continue;
    const modifier = token.slice(root.length + 1);
    if (root === 'select' && TAILWIND_SELECT_UTILITIES.has(modifier)) {
      continue; // Tailwind user-select utility, not a DaisyUI class
    }
    return true;
  }
  return false;
}

function rootOfToken(token: string): string | undefined {
  for (const root of BLOCKED_ROOTS) {
    if (token === root || token.startsWith(`${root}-`)) return root;
  }
  return undefined;
}

/**
 * Remediation is top-down (TASK_2026_904): the fix for a raw DaisyUI class is
 * to move the markup into a component extracted from a polished page into
 * `@ptah-extension/ui`, not to swap in a generic foundation primitive.
 */
const EXTRACT_HINT = 'move this markup into an extracted component in @ptah-extension/ui';

function replacementHint(token: string): string {
  if (token === DYNAMIC_TOKEN) {
    return `dynamic class expression cannot be proven safe; ${EXTRACT_HINT}`;
  }
  const root = rootOfToken(token);
  return root === undefined ? EXTRACT_HINT : `${EXTRACT_HINT} (raw ${root} class)`;
}

// --- template scanning --------------------------------------------------------

export interface ClassOccurrence {
  /** Repo-relative path with forward slashes. */
  file: string;
  /** 1-based line of the class attribute or expression. */
  line: number;
  /** Blocked class token, or DYNAMIC_TOKEN. */
  token: string;
}

interface TemplateHit {
  /** 0-based character offset of the owning attribute within the template. */
  offset: number;
  token: string;
}

/**
 * Every quoted attribute in a template. The name character class covers
 * Angular binding forms (`[class]`, `[class.foo]`, `[(ngModel)]`, `(click)`,
 * `*ngIf`, `@`/`#` refs) so one pass classifies every class-family surface.
 * A name can never start inside a quoted value, so `title="use class=btn"`
 * cannot produce a match.
 */
const ATTRIBUTE_RE =
  /([@#*()[\]{}.\w:$-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const CLASS_TOKEN_BINDING_RE = /^\[class\.([^.\]]+)\]$/;

interface AttributeMatch {
  name: string;
  value: string;
  offset: number;
}

function* iterateAttributes(template: string): Generator<AttributeMatch> {
  ATTRIBUTE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_RE.exec(template)) !== null) {
    yield {
      name: match[1],
      value: match[2] !== undefined ? match[2] : (match[3] ?? ''),
      offset: match.index,
    };
  }
}

/** Blank out HTML comments, preserving length and line breaks. */
function blankHtmlComments(template: string): string {
  let out = '';
  let cursor = 0;
  for (;;) {
    const start = template.indexOf('<!--', cursor);
    if (start === -1) {
      out += template.slice(cursor);
      return out;
    }
    const end = template.indexOf('-->', start);
    const stop = end === -1 ? template.length : end + 3;
    out += template.slice(cursor, start);
    out += template.slice(start, stop).replace(/[^\n]/g, ' ');
    cursor = stop;
  }
}

function classTokens(value: string): string[] {
  return value.split(/\s+/).filter((token) => token.length > 0);
}

// --- expression analysis ([class] / [ngClass] family) ------------------------

interface ExpressionAnalysis {
  tokens: string[];
  dynamic: boolean;
}

function parseTemplateExpression(
  value: string,
): ts.Expression | undefined {
  const sourceFile = ts.createSourceFile(
    '__ui-class-audit-expression__.ts',
    `(${value})`,
    ts.ScriptTarget.ES2022,
    false,
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] }
  ).parseDiagnostics;
  if (parseDiagnostics && parseDiagnostics.length > 0) return undefined;
  const statement = sourceFile.statements[0];
  if (
    statement &&
    ts.isExpressionStatement(statement) &&
    ts.isParenthesizedExpression(statement.expression)
  ) {
    return statement.expression.expression;
  }
  return undefined;
}

function collectStringTokens(text: string, out: ExpressionAnalysis): void {
  for (const token of classTokens(text)) out.tokens.push(token);
}

function walkExpression(node: ts.Node, out: ExpressionAnalysis): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    collectStringTokens(node.text, out);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    // `${}` substitutions cannot be judged; the static chunks still apply.
    out.dynamic = true;
    collectStringTokens(node.head.text, out);
    for (const span of node.templateSpans) {
      collectStringTokens(span.literal.text, out);
    }
    return;
  }
  if (ts.isObjectLiteralExpression(node)) {
    // ngClass object form: the keys are the class names, values are guards.
    // A quoted key, an identifier key (`{btn: x}`) and a shorthand key
    // (`{btn}`) are all static class names in TypeScript, so each is judged;
    // computed or otherwise exotic keys stay dynamic.
    for (const property of node.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        (ts.isStringLiteral(property.name) || ts.isIdentifier(property.name))
      ) {
        collectStringTokens(property.name.text, out);
        continue;
      }
      if (
        ts.isShorthandPropertyAssignment(property) &&
        ts.isIdentifier(property.name)
      ) {
        collectStringTokens(property.name.text, out);
        continue;
      }
      out.dynamic = true;
    }
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      if (ts.isOmittedExpression(element)) continue;
      walkExpression(element, out);
    }
    return;
  }
  if (ts.isParenthesizedExpression(node)) {
    walkExpression(node.expression, out);
    return;
  }
  if (ts.isConditionalExpression(node)) {
    // The condition is not a class source; both arms are.
    walkExpression(node.whenTrue, out);
    walkExpression(node.whenFalse, out);
    return;
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    walkExpression(node.left, out);
    walkExpression(node.right, out);
    return;
  }
  out.dynamic = true; // calls, identifiers, comparisons, everything else
}

/**
 * Judge a `[class]`-family expression. Returns the blocked tokens it
 * definitely applies plus whether any part could not be proven safe.
 */
export function analyzeClassExpression(
  value: string,
): { blockedTokens: string[]; dynamic: boolean } {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { blockedTokens: [], dynamic: false };
  const expression = parseTemplateExpression(trimmed);
  if (!expression) return { blockedTokens: [], dynamic: true };
  const analysis: ExpressionAnalysis = { tokens: [], dynamic: false };
  walkExpression(expression, analysis);
  const blockedTokens = analysis.tokens.filter((token) =>
    isBlockedClassToken(token),
  );
  return { blockedTokens, dynamic: analysis.dynamic };
}

/** All blocked-class hits in one template string, offsets relative to it. */
export function findTemplateHits(template: string): TemplateHit[] {
  const scanned = blankHtmlComments(template);
  const hits: TemplateHit[] = [];
  for (const attribute of iterateAttributes(scanned)) {
    if (attribute.name === 'class' || attribute.name === 'ngClass') {
      for (const token of classTokens(attribute.value)) {
        if (isBlockedClassToken(token)) {
          hits.push({ offset: attribute.offset, token });
        }
      }
      if (attribute.value.includes('{{')) {
        // Interpolation can expand to anything; static tokens above still count.
        hits.push({ offset: attribute.offset, token: DYNAMIC_TOKEN });
      }
      continue;
    }
    const boundToken = CLASS_TOKEN_BINDING_RE.exec(attribute.name);
    if (boundToken !== null) {
      if (isBlockedClassToken(boundToken[1])) {
        hits.push({ offset: attribute.offset, token: boundToken[1] });
      }
      continue;
    }
    if (
      attribute.name === '[class]' ||
      attribute.name === '[ngClass]' ||
      attribute.name === '[className]' ||
      attribute.name === '[attr.class]'
    ) {
      const { blockedTokens, dynamic } = analyzeClassExpression(
        attribute.value,
      );
      for (const token of blockedTokens) {
        hits.push({ offset: attribute.offset, token });
      }
      if (dynamic) {
        hits.push({ offset: attribute.offset, token: DYNAMIC_TOKEN });
      }
    }
  }
  return hits;
}

function lineOfOffset(content: string, offset: number): number {
  let line = 1;
  for (let idx = 0; idx < offset && idx < content.length; idx += 1) {
    if (content.charCodeAt(idx) === 10) line += 1;
  }
  return line;
}

/** Scan an external template file. */
export function scanHtmlFile(content: string, relFile: string): ClassOccurrence[] {
  return findTemplateHits(content).map((hit) => ({
    file: relFile,
    line: lineOfOffset(content, hit.offset),
    token: hit.token,
  }));
}

/**
 * Scan a TypeScript source file for inline `template:` property values.
 * A file that fails to parse is a tool failure, never a skipped file.
 */
export function scanTsFile(content: string, relFile: string): ClassOccurrence[] {
  const sourceFile = ts.createSourceFile(
    relFile,
    content,
    ts.ScriptTarget.ES2022,
    true,
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] }
  ).parseDiagnostics;
  if (parseDiagnostics && parseDiagnostics.length > 0) {
    const first = parseDiagnostics[0];
    const message = ts.flattenDiagnosticMessageText(first.messageText, ' ');
    throw new Error(`parse failure in ${relFile}: ${message}`);
  }

  const occurrences: ClassOccurrence[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'template'
    ) {
      const initializer = node.initializer;
      if (
        ts.isStringLiteral(initializer) ||
        ts.isNoSubstitutionTemplateLiteral(initializer)
      ) {
        const contentStart = initializer.getStart() + 1; // skip the opening quote
        for (const hit of findTemplateHits(initializer.text)) {
          occurrences.push({
            file: relFile,
            line:
              sourceFile.getLineAndCharacterOfPosition(
                contentStart + hit.offset,
              ).line + 1,
            token: hit.token,
          });
        }
      } else {
        if (ts.isTemplateExpression(initializer)) {
          // Scan the static text; each `${...}` becomes a neutral placeholder.
          // `pieces` maps an offset in the joined text back to a source position,
          // so a substitution that spans lines cannot shift later hits.
          const placeholder = '__expr__';
          const pieces: Array<{ start: number; src: number }> = [
            { start: 0, src: initializer.head.getStart() + 1 },
          ];
          let staticText = initializer.head.text;
          for (const span of initializer.templateSpans) {
            staticText += placeholder;
            pieces.push({
              start: staticText.length,
              src: span.literal.getStart() + 1,
            });
            staticText += span.literal.text;
          }
          const lineAt = (offset: number): number => {
            let piece = pieces[0];
            for (const candidate of pieces) {
              if (candidate.start <= offset) piece = candidate;
            }
            return (
              sourceFile.getLineAndCharacterOfPosition(
                piece.src + (offset - piece.start),
              ).line + 1
            );
          };
          for (const hit of findTemplateHits(staticText)) {
            occurrences.push({
              file: relFile,
              line: lineAt(hit.offset),
              token: hit.token,
            });
          }
          // A plain class attribute that holds a substitution cannot be proven safe
          // (`[class]` and `[ngClass]` bindings already give their own token):
          // one dynamic occurrence per such binding.
          const classBinding =
            /(?<![\w.-])class\s*=\s*("[^"]*"|'[^']*')/g;
          for (const match of staticText.matchAll(classBinding)) {
            if (match[1].includes(placeholder)) {
              occurrences.push({
                file: relFile,
                line: lineAt(match.index ?? 0),
                token: DYNAMIC_TOKEN,
              });
            }
          }
        }
        // `template: someExpression` — cannot be proven safe.
        occurrences.push({
          file: relFile,
          line:
            sourceFile.getLineAndCharacterOfPosition(initializer.getStart())
              .line + 1,
          token: DYNAMIC_TOKEN,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return occurrences;
}

// --- baseline ----------------------------------------------------------------

/** Per repo-relative file, the allowed count of each blocked token. */
export type Baseline = Record<string, Record<string, number>>;

export interface BaselineComparison {
  /** Token counts above their baseline (each one fails the run). */
  failures: Array<{ file: string; token: string; count: number; baseline: number }>;
  /** Token counts below their baseline (allowed; --update-baseline records). */
  decreases: Array<{ file: string; token: string; baseline: number; count: number }>;
  /** Baseline entries for files the current scan no longer reports. */
  staleFiles: string[];
}

function loadBaseline(baselinePath: string): Baseline {
  if (!fs.existsSync(baselinePath)) return {};
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as Baseline;
}

function writeBaseline(baselinePath: string, baseline: Baseline): void {
  const files = Object.keys(baseline).sort((a, b) => a.localeCompare(b, 'en'));
  const sorted: Baseline = {};
  for (const file of files) {
    const target: Record<string, number> = {};
    const tokens = baseline[file] ?? {};
    for (const token of Object.keys(tokens).sort((a, b) =>
      a.localeCompare(b, 'en'),
    )) {
      const count = tokens[token] ?? 0;
      if (count > 0) target[token] = count;
    }
    sorted[file] = target;
  }
  fs.writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

export function occurrenceCounts(occurrences: ClassOccurrence[]): Baseline {
  const counts: Baseline = {};
  for (const occurrence of occurrences) {
    const fileCounts = counts[occurrence.file] ?? {};
    fileCounts[occurrence.token] = (fileCounts[occurrence.token] ?? 0) + 1;
    counts[occurrence.file] = fileCounts;
  }
  return counts;
}

export function compareWithBaseline(
  counts: Baseline,
  baseline: Baseline,
): BaselineComparison {
  const failures: BaselineComparison['failures'] = [];
  const decreases: BaselineComparison['decreases'] = [];
  const staleFiles: string[] = [];
  const files = Array.from(
    new Set([...Object.keys(counts), ...Object.keys(baseline)]),
  ).sort((a, b) => a.localeCompare(b, 'en'));
  for (const file of files) {
    const fileCounts = counts[file];
    const fileBaseline = baseline[file];
    if (fileCounts && !fileBaseline) {
      // A file the baseline has never seen: every blocked token is an increase.
      for (const token of Object.keys(fileCounts).sort((a, b) =>
        a.localeCompare(b, 'en'),
      )) {
        const count = fileCounts[token] ?? 0;
        failures.push({ file, token, count, baseline: 0 });
      }
      continue;
    }
    if (!fileCounts) {
      // Baseline entry the scan no longer produces (deleted, migrated, excluded).
      staleFiles.push(file);
      continue;
    }
    const tokens = Array.from(
      new Set([
        ...Object.keys(fileCounts),
        ...Object.keys(fileBaseline ?? {}),
      ]),
    ).sort((a, b) => a.localeCompare(b, 'en'));
    for (const token of tokens) {
      const count = fileCounts[token] ?? 0;
      const allowed = fileBaseline?.[token] ?? 0;
      if (count > allowed) {
        failures.push({ file, token, count, baseline: allowed });
      } else if (count < allowed) {
        decreases.push({ file, token, baseline: allowed, count });
      }
    }
  }
  return { failures, decreases, staleFiles };
}

/**
 * The baseline `--update-baseline` writes: seeds files the baseline has never
 * seen on the initial seed, records decreases and prunes stale files. Never
 * raises a count after the baseline exists, even for a new file.
 */
export function nextBaselineAfterUpdate(
  counts: Baseline,
  baseline: Baseline,
  initialSeed = false,
): Baseline {
  const next: Baseline = {};
  for (const file of Object.keys(counts).sort((a, b) =>
    a.localeCompare(b, 'en'),
  )) {
    const fileCounts = counts[file] ?? {};
    const fileBaseline = baseline[file];
    const kept: Record<string, number> = {};
    for (const token of Object.keys(fileCounts).sort((a, b) =>
      a.localeCompare(b, 'en'),
    )) {
      const count = fileCounts[token] ?? 0;
      if (!fileBaseline) {
        // A new file after the initial seed must remain over baseline.
        if (initialSeed && count > 0) kept[token] = count;
        continue;
      }
      const allowed = fileBaseline[token] ?? 0;
      const value = count > allowed ? allowed : count;
      if (value > 0) kept[token] = value;
    }
    if (Object.keys(kept).length > 0) next[file] = kept;
  }
  return next;
}

// --- runner --------------------------------------------------------------------

export const DEFAULT_SCAN_GLOBS = [
  'apps/ptah-extension-webview/src/**/*.html',
  'apps/ptah-extension-webview/src/**/*.ts',
  'libs/frontend/**/src/**/*.html',
  'libs/frontend/**/src/**/*.ts',
];

export const DEFAULT_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  'libs/frontend/ui/**',
  'libs/frontend/webview-e2e-harness/**',
  '**/*.spec.ts',
  '**/*.test.ts',
];

export interface AuditOptions {
  repoRoot: string;
  scanGlobs: string[];
  ignoreGlobs: string[];
  baselinePath: string;
  updateBaseline: boolean;
}

export interface AuditRunResult {
  failed: boolean;
  scannedFiles: number;
  occurrences: ClassOccurrence[];
  counts: Baseline;
  comparison: BaselineComparison;
  baselineWritten: boolean;
  totals: { files: number; tokens: number };
  topFiles: Array<{ file: string; tokens: number }>;
}

const UPDATE_HINT =
  'npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts --update-baseline';

export async function runAudit(options: AuditOptions): Promise<AuditRunResult> {
  const files = (
    await fg(options.scanGlobs, {
      cwd: options.repoRoot,
      ignore: options.ignoreGlobs,
      absolute: true,
    })
  ).sort((a, b) => a.localeCompare(b, 'en'));

  const occurrences: ClassOccurrence[] = [];
  for (const filePath of files) {
    const relFile = path.relative(options.repoRoot, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf8');
    if (filePath.endsWith('.html')) {
      occurrences.push(...scanHtmlFile(content, relFile));
    } else if (filePath.endsWith('.ts')) {
      occurrences.push(...scanTsFile(content, relFile));
    }
  }
  occurrences.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.token.localeCompare(b.token, 'en');
  });

  const counts = occurrenceCounts(occurrences);
  const baseline = loadBaseline(options.baselinePath);
  if (!fs.existsSync(options.baselinePath)) {
    console.log(
      'ui-class-audit: baseline.json not found — every blocked token fails until it is seeded',
    );
  }
  const comparison = compareWithBaseline(counts, baseline);

  console.log(
    `ui-class-audit: scanned ${files.length} file(s) ` +
      '(apps/ptah-extension-webview/src, libs/frontend/**/src; ' +
      'excluding libs/frontend/ui, *.spec.ts, generated output)',
  );

  const failedSet = new Set(
    comparison.failures.map((failure) => `${failure.file}\u0000${failure.token}`),
  );
  if (comparison.failures.length > 0) {
    console.log('\nui-class-audit: blocked class occurrences over baseline');
    for (const occurrence of occurrences) {
      if (!failedSet.has(`${occurrence.file}\u0000${occurrence.token}`)) continue;
      console.log(
        `  ${occurrence.file}:${occurrence.line}: ${occurrence.token} — ${replacementHint(occurrence.token)}`,
      );
    }
  }

  const allFiles = Array.from(
    new Set([...Object.keys(counts), ...Object.keys(baseline)]),
  ).sort((a, b) => a.localeCompare(b, 'en'));
  if (allFiles.length > 0) {
    console.log('\nui-class-audit: per-file totals');
    for (const file of allFiles) {
      const fileCounts = counts[file];
      if (!fileCounts) {
        console.log(
          `  ${file}: 0 token(s) (baseline had entries; run --update-baseline to prune)`,
        );
        continue;
      }
      const summary = Object.keys(fileCounts)
        .sort((a, b) => a.localeCompare(b, 'en'))
        .map((token) => `${token}=${fileCounts[token] ?? 0}`)
        .join(' ');
      const fileFailures = comparison.failures.filter(
        (failure) => failure.file === file,
      );
      if (fileFailures.length > 0) {
        const detail = fileFailures
          .map(
            (failure) =>
              `${failure.token} ${failure.count} > ${failure.baseline}`,
          )
          .join(', ');
        console.log(`  ${file}: ${summary} (FAIL: ${detail})`);
      } else {
        console.log(`  ${file}: ${summary} (ok)`);
      }
    }
  }

  if (comparison.decreases.length > 0) {
    console.log(
      `\nui-class-audit: ${comparison.decreases.length} token count(s) decreased since baseline`,
    );
    for (const decrease of comparison.decreases) {
      console.log(
        `  ${decrease.file}: ${decrease.token} ${decrease.baseline} -> ${decrease.count}`,
      );
    }
    if (!options.updateBaseline) {
      console.log(`  run \`${UPDATE_HINT}\` to record the decrease`);
    }
  }

  if (comparison.failures.length > 0) {
    console.log(
      '\nRaw DaisyUI component classes are blocked outside libs/frontend/ui. ' +
        'Move this markup into an extracted component in @ptah-extension/ui.',
    );
    console.log(
      '  Extract the matching polished-page component (chat, canvas, voice, setup) ' +
        'into @ptah-extension/ui and import it here; do not substitute a generic primitive.',
    );
    console.log(
      `After a real removal, record it with \`${UPDATE_HINT}\` ` +
        '(the flag never raises a count).',
    );
  }

  let baselineWritten = false;
  if (options.updateBaseline) {
    const next = nextBaselineAfterUpdate(
      counts,
      baseline,
      !fs.existsSync(options.baselinePath),
    );
    if (JSON.stringify(next) !== JSON.stringify(baseline)) {
      writeBaseline(options.baselinePath, next);
      baselineWritten = true;
      console.log(
        'ui-class-audit: baseline.json updated ' +
          '(initial seed or decreases; prunes stale files; never raises an established count)',
      );
    } else {
      console.log('ui-class-audit: baseline.json unchanged');
    }
  }

  const totalTokens = occurrences.length;
  const filesWithUsage = Object.keys(counts).length;
  const topFiles = Object.entries(counts)
    .map(([file, fileCounts]) => ({
      file,
      tokens: Object.values(fileCounts).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.tokens - a.tokens || a.file.localeCompare(b.file, 'en'));

  console.log(
    `\nui-class-audit: TOTAL ${totalTokens} blocked token(s) across ${filesWithUsage} file(s); ` +
      `${comparison.failures.length} token count(s) over baseline`,
  );

  return {
    failed: comparison.failures.length > 0,
    scannedFiles: files.length,
    occurrences,
    counts,
    comparison,
    baselineWritten,
    totals: { files: filesWithUsage, tokens: totalTokens },
    topFiles,
  };
}

// --- CLI ------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_PATH = path.join(__dirname, 'baseline.json');

async function main(): Promise<number> {
  const updateBaseline = process.argv.includes('--update-baseline');
  const result = await runAudit({
    repoRoot: REPO_ROOT,
    scanGlobs: DEFAULT_SCAN_GLOBS,
    ignoreGlobs: DEFAULT_IGNORE_GLOBS,
    baselinePath: BASELINE_PATH,
    updateBaseline,
  });
  return result.failed ? 1 : 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(
        'ui-class-audit FAILED:',
        err instanceof Error ? err.message : err,
      );
      process.exit(2);
    });
}
