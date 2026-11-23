import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  BATCHES_FILE,
  LEGACY_BATCHES_FILE,
  type TaskDigest,
  type TaskDocumentKind,
} from '@ptah-extension/shared';
import {
  classifyTaskDocument,
  countTaskOpenQuestions,
  describeTaskDocumentName,
  documentProgress,
  extractTaskDecisions,
  extractTaskProgress,
  extractTaskReview,
  isTaskDigestDocumentOpenable,
  isTaskDigestQuestionSource,
  selectLatestTaskDocuments,
} from './task-digest-rules';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf8');
}

describe('task digest document metadata', () => {
  it('keeps branch and PR outside the digest contract', () => {
    const excludedKeys: Record<Extract<'branch' | 'pr', keyof TaskDigest>, never> = {};
    expect(excludedKeys).toEqual({});
  });

  it.each<[string, TaskDocumentKind]>([
    ['TASK.MD', 'carrier'],
    ['Handoff-2.md', 'handoff'],
    ['handoff.md', 'handoff'],
    ['research-report-review.md', 'reviews'],
    ['Research-Report-Review-round-2.md', 'reviews'],
    ['implementation-report-review.md', 'reviews'],
    ['research-report.md', 'design'],
    ['research-report-v2.md', 'design'],
    ['review-fixes.md', 'reports'],
    ['review-fix-report.md', 'reports'],
    ['test-report.md', 'reports'],
    ['test-fixes-round-2.md', 'reports'],
    ['notes.v2-fixes.md', 'reports'],
    ['notes.report.md', 'other'],
    ['notes-report-.md', 'other'],
    ['design-spec-v3-review.md', 'reviews'],
    ['implementation-plan-review.md', 'reviews'],
    ['context.md', 'requirements'],
    ['task-description.md', 'requirements'],
    ['batches.md', 'batches'],
    ['tasks.md', 'batches'],
    ['decisions.md', 'decisions'],
    ['implementation-plan-task-digest.md', 'plan'],
    ['Visual-design-specification.md', 'design'],
    ['unclassified.png', 'other'],
  ])('classifies %s as %s', (file, kind) => {
    expect(classifyTaskDocument(file)).toBe(kind);
  });

  it.each([
    ['design-spec-rev1-review-stopped.md', 'design-spec', 1, 0],
    ['code-logic-review-round-2.md', 'code-logic', 0, 2],
    ['Design-spec-v3-rereview-r4.md', 'Design-spec', 3, 4],
    ['code-logic-re-review.md', 'code-logic', 0, 1],
    ['re-review.md', '', 0, 1],
    ['re-review-v2.md', '', 0, 2],
    ['review.md', '', 0, 0],
    ['review-3.md', '', 0, 3],
    ['review-round4.md', '', 0, 4],
  ] as const)('extracts the subject, revision and round of %s', (file, subject, revision, round) => {
    expect(describeTaskDocumentName(file)).toMatchObject({ subject, revision, round });
  });

  it('chooses revision, round, mtime, then the smallest original filename by code unit', () => {
    const entries = [
      ['design-spec.md', 100],
      ['design-spec-v2.md', 100],
      ['design-spec-v3.md', 2],
      ['Design-spec-v3.md', 2],
      ['DESIGN-SPEC-V3.md', 1],
      ['design-spec-v2-review-round-5.md', 100],
      ['design-spec-v3-review.md', 1],
      ['code-logic-review.md', 100],
      ['code-logic-review-round-2.md', 1],
    ] as const;
    const documents = entries.map(([name, mtime]) => ({ name, mtime, ...describeTaskDocumentName(name) }));
    expect(new Set(documents.slice(0, 5).map(({ group }) => group))).toEqual(new Set(['design:design-spec']));
    expect(documents.map(({ name }) => name)).toEqual(entries.map(([name]) => name));
    const expected = new Set(['Design-spec-v3.md', 'design-spec-v3-review.md', 'code-logic-review-round-2.md']);
    expect(selectLatestTaskDocuments(documents)).toEqual(expected);
    expect(selectLatestTaskDocuments([...documents].reverse())).toEqual(expected);
  });

  it.each([
    ['Design-spec-v3.MD', 1024 * 1024, true, true],
    ['Design-spec-v3.MD', 1024 * 1024 + 1, true, false],
    ['design-spec-v3.md', 0, false, false],
    ['design-spec.png', 1, true, false],
    ['../design-spec.md', 1, true, false],
  ] as const)('checks eligibility for %s, size %i, regular file %s', (name, size, isFile, expected) => {
    expect(isTaskDigestDocumentOpenable(name, size, isFile)).toBe(expected);
  });
});

describe('extractTaskReview', () => {
  it('counts heading findings and exact table tags without counting summary rows or finding details', () => {
    expect(extractTaskReview('standard-review.md', fixture('standard-review.md'))).toMatchObject({
      verdict: 'REVISE', serious: 2, moderate: 1, minor: 1,
    });
  });

  it.each([
    ['design-spec-v3-review.md', 'design-spec', 3, 0],
    ['implementation-plan-review.md', 'implementation-plan', 0, 0],
    ['implementation-plan-task-digest-review.md', 'implementation-plan-task-digest', 0, 1],
  ] as const)('parses the real review excerpt from %s', (file, subject, revision, minor) => {
    expect(extractTaskReview(file, fixture(file))).toEqual({
      file, subject, revision, round: 0, verdict: 'REVISE', serious: 1, moderate: 1, minor, extraction: 'ok',
    });
  });

  it.each([
    ['## verdict — APPROVED or REVISE', 'APPROVED'],
    ['## Verdict\n\n**REVISE after recheck.**\nAPPROVED', 'REVISE'],
    ['APPROVED\n## Summary', null],
    ['## Verdict\n### APPROVED', null],
    ['## Verdict\n> APPROVED\nREVISE', null],
    ['## Verdict\napproved\nREVISE', null],
    ['## Verdict\nUndecided\n## Verdict APPROVED', null],
  ] as const)('scopes the verdict in %j', (text, verdict) => {
    expect(extractTaskReview('review.md', text).verdict).toBe(verdict);
  });

  it('counts each finding once across item and heading grammars', () => {
    const text = [
      '## Serious findings',
      '- First',
      '  - Nested',
      ' - [Moderate] — Overrides the heading',
      '| **Minor** |',
      '#### mOdErAtE ####',
      '2. Second',
      '#### Follow-up',
      '- Third',
      '## Other',
      '- Outside',
      '* **serious** item',
    ].join('\n');
    expect(extractTaskReview('review.md', text)).toMatchObject({ serious: 3, moderate: 2, minor: 1 });
  });

  it('normalizes BOM and line endings and hides fenced examples in a capped prefix', () => {
    const text = [
      '\uFEFF~~~md',
      '## Verdict APPROVED',
      '- Serious example',
      '~~~~',
      '\x60\x60\x60\x60md',
      '\x60\x60\x60',
      '- Moderate example',
      '\x60\x60\x60\x60',
      '## Verdict REVISE',
      '- Minor finding',
      '~~~',
      '* Minor unfinished example',
    ].join('\r\n');
    expect(extractTaskReview('review.md', text, 'capped')).toMatchObject({
      verdict: 'REVISE', serious: 0, moderate: 0, minor: 1, extraction: 'capped',
    });
  });
});

describe('extractTaskDecisions', () => {
  it('selects the first table headed by a number sign and counts pending cells once per row', () => {
    const text = [
      '| No. | Topic |',
      '| --- | --- |',
      '| # | This cell is in a data row |',
      '| 1 | Ignored |',
      '',
      fixture('decisions.md').trimEnd(),
      '| 4 | Fourth | Pending | Awaiting | | yes |',
      '',
      '| # | Decision |',
      '| 5 | Pending but ignored |',
    ].join('\r');
    expect(extractTaskDecisions(text)).toEqual({ rows: 4, pendingUser: 3 });
  });

  it('returns zero counts when the only table is a fenced example', () => {
    expect(extractTaskDecisions('~~~\n| # |\n| Pending |\n~~~')).toEqual({ rows: 0, pendingUser: 0 });
  });
});

describe('documentProgress', () => {
  it('counts only team-leader task headings in batches and keeps legacy checkboxes', () => {
    const batches = '## Batch 1: Work — COMPLETE\n### Task 1.1: First — COMPLETE\n### Batch 1 verification\n- [x] Build\n- [ ] Lint\n### Task 1.2: Second — PENDING';
    expect(documentProgress(batches, BATCHES_FILE)).toEqual({ done: 1, total: 2 });
    expect(documentProgress('- [x] First\n- [ ] Second', LEGACY_BATCHES_FILE)).toEqual({ done: 1, total: 2 });
  });

  it('falls back to checkboxes for a batches file without task headings', () => {
    expect(documentProgress('- [x] First\n- [x] Second\n- [ ] Third', BATCHES_FILE)).toEqual({ done: 2, total: 3 });
  });

  it('falls back to status lines and ignores fenced examples even when they have higher precedence', () => {
    const text = '\uFEFF~~~\r### Task 1: Example — COMPLETE\r- [x] Example\r~~~\rstatus: DONE\rstatus: blocked';
    expect(documentProgress(text, 'BATCHES.MD')).toEqual({ done: 1, total: 2 });
    expect(documentProgress('## Batch 1 — COMPLETE', BATCHES_FILE)).toBeNull();
  });

  it('keeps progress markers and their values on the same line', () => {
    expect(documentProgress('-\n[x] Not a checkbox\nstatus:\nDONE', BATCHES_FILE)).toBeNull();
  });

  it('uses batches first and falls back to the legacy file when batches is absent', () => {
    expect(extractTaskProgress('- [ ] First', '- [x] Second')).toEqual({ done: 0, total: 1, source: BATCHES_FILE });
    expect(extractTaskProgress(null, '- [x] Second')).toEqual({ done: 1, total: 1, source: LEGACY_BATCHES_FILE });
    expect(extractTaskProgress('', '- [x] Second')).toBeNull();
    expect(extractTaskProgress(null, null)).toBeNull();
  });
});

describe('digest extraction on whitespace-only documents', () => {
  it.each([
    ['progress', (input: string) => extractTaskProgress(input, null), null],
    ['decisions', extractTaskDecisions, { rows: 0, pendingUser: 0 }],
    ['open questions', countTaskOpenQuestions, 0],
    ['review', (input: string) => extractTaskReview('review.md', input), {
      verdict: null, serious: 0, moderate: 0, minor: 0,
    }],
  ] as const)('%s processes 65,536 newlines and spaces in under 200 ms each', (_name, extract, expected) => {
    for (const char of ['\n', ' ']) {
      const input = char.repeat(65_536);
      const start = performance.now();
      const result = extract(input);
      expect(performance.now() - start).toBeLessThan(200);
      expect(result).toEqual(typeof expected === 'object' && expected !== null
        ? expect.objectContaining(expected)
        : expected);
    }
  });

  it('scans a long fence followed by an embedded Unicode line separator in under 200 ms', () => {
    const input = '~'.repeat(65_500) + '\u2028notes\n# Verdict APPROVED';
    const start = performance.now();
    const result = extractTaskReview('review.md', input);
    expect(performance.now() - start).toBeLessThan(200);
    expect(result.verdict).toBeNull();
  });
});

describe('open questions', () => {
  it.each([
    ['CONTEXT.MD', false, true],
    ['task-description.md', false, true],
    ['implementation-plan.md', true, true],
    ['Implementation-plan-v3.MD', true, true],
    ['implementation-plan-v2.md', false, false],
    ['implementation-plan-review.md', true, false],
    ['implementation-plan-task-digest.md', true, false],
  ] as const)('checks %s with latest=%s', (name, latest, eligible) => {
    expect(isTaskDigestQuestionSource(name, latest)).toBe(eligible);
  });

  it('counts only unresolved top-level items within eligible heading sections', () => {
    const text = [
      '- Outside',
      '## Open Questions',
      '- First',
      '  - Nested',
      '* [x] Finished',
      '1. Resolved: Answered',
      '- Answered (resolved)',
      '- ',
      '### Follow-up',
      '2. Second',
      '~~~',
      '## Fenced heading',
      '- Not visible',
      '~~~',
      '## Next section',
      '- Outside',
      '### Open questions for the team',
      '* [ ] Third',
      '### Peer section',
      '- Outside again',
    ].join('\n');
    expect(countTaskOpenQuestions(text)).toBe(3);
  });
});
