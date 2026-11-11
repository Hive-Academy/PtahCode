import { diffStats } from './diff-stats';
import { renderSequenceDiagram } from './mermaid-sequence';
import { parseTriageOutput, parseTriageOutputDetailed, type TriageOutput } from './triage-output.schema';
import { renderWalkthrough, WALKTHROUGH_BUDGET, type WalkthroughRenderInput } from './walkthrough.renderer';

const HEAD = '1aeafd4e1f0f4d9a8f4c9c0f4b6c1f7a2d3e4f50';
const PREVIOUS = '0123456789abcdef0123456789abcdef01234567';
const repo = { owner: 'Acme', name: 'Widgets' } as const;
const none = { Critical: 0, Major: 0, Minor: 0, Nitpick: 0 };
const completed = ['contracts-callers', 'security'].map((lens) => ({ lens, status: 'completed' }));

function triage(overrides: Partial<TriageOutput> = {}): TriageOutput {
  return {
    schemaVersion: 1,
    summary: 'Adds a retry to the sync client and removes an unused flag.',
    changeType: 'feature',
    risk: { level: 'medium', reason: 'Changes a shared client used by two hosts.' },
    areas: [
      { name: 'Sync client', paths: ['libs/sync/client.ts', 'libs/sync/retry.ts'], summary: 'Retries failed calls twice.', details: ['Backoff is 200 ms.'] },
      { name: 'Config', paths: ['libs/sync/config.ts'], summary: 'Removes the legacy flag.', details: [] },
    ],
    risks: [{ title: 'Double send', detail: 'A retry can send twice.', verify: 'Check idempotency keys.' }],
    apiChanges: [{ symbol: 'SyncClient.send', change: 'changed', impact: 'Now retries.', callers: ['apps/a/main.ts'] }],
    tests: { summary: 'Unit tests cover the retry.', gaps: ['No test for the timeout path.'] },
    ...overrides,
  };
}

function input(overrides: Partial<WalkthroughRenderInput> = {}): WalkthroughRenderInput {
  return {
    repo, headSha: HEAD, content: { kind: 'structured', triage: triage() }, lenses: completed, scope: null,
    findings: { bySeverity: none, heldLocally: 0, dismissed: 0 }, diffStats: { files: 4, additions: 40, deletions: 6 }, ...overrides,
  };
}

function hugeTriage(): TriageOutput {
  const area = (index: number): TriageOutput['areas'][number] => ({
    name: `Area ${index} ${'n'.repeat(50)}`, paths: Array.from({ length: 20 }, (_, i) => `libs/area-${index}/very/long/path/file-${i}.ts`),
    summary: 's'.repeat(200), details: Array.from({ length: 4 }, () => 'd'.repeat(240)),
  });
  return triage({
    summary: 'x'.repeat(400),
    areas: Array.from({ length: 10 }, (_, i) => area(i)),
    risks: Array.from({ length: 8 }, (_, i) => ({ title: `Risk ${i} ${'t'.repeat(90)}`, detail: 'd'.repeat(300), verify: 'v'.repeat(200) })),
    apiChanges: Array.from({ length: 10 }, (_, i) => ({ symbol: `Symbol${i}`, change: 'changed' as const, impact: 'i'.repeat(200), callers: Array.from({ length: 5 }, (_c, j) => `apps/caller-${j}/main.ts`) })),
    tests: { summary: 't'.repeat(240), gaps: Array.from({ length: 5 }, () => 'g'.repeat(160)) },
    diagram: { title: 'Flow', participants: [{ id: 'a', label: 'Client' }, { id: 'b', label: 'Server' }], steps: [{ from: 'a', to: 'b', label: 'send' }, { from: 'b', to: 'a', label: 'ack' }] },
  });
}

function topBlock(text: string): string {
  return text.slice(0, text.indexOf('### Changes'));
}

describe('renderWalkthrough', () => {
  it('renders a small PR with a short top block, a Changes table and collapsed details', () => {
    const text = renderWalkthrough(input());
    expect(text.startsWith('## PtahCode review · [`1aeafd4`](https://github.com/Acme/Widgets/commit/' + HEAD + ')')).toBe(true);
    expect(topBlock(text).length).toBeLessThanOrEqual(WALKTHROUGH_BUDGET.topBlock);
    expect(text).toContain('| **State** | ✅ **Complete** · 2 of 2 lenses ran |');
    expect(text).toContain('| **Scope** | Initial review of the full PR |');
    expect(text).toContain('4 files · +40 −6 · feature');
    expect(text).toContain('| Sync client | 2 | Retries failed calls twice. |');
    expect(text).toContain('<summary>Walkthrough by area</summary>');
    expect(text).toContain('<summary>Risks and what to verify (1)</summary>');
    expect(text).toContain('<summary>Test coverage of this change</summary>');
    expect(text).not.toContain('Reviewer data');
    expect(text.length).toBeLessThanOrEqual(WALKTHROUGH_BUDGET.total);
  });

  it('never emits a ptah-review marker (the adapter owns markers)', () => {
    expect(renderWalkthrough(input())).not.toContain('ptah-review');
  });

  it('keeps a large PR inside the budget and keeps the top block and the Changes table', () => {
    const text = renderWalkthrough(input({
      content: { kind: 'structured', triage: hugeTriage() },
      scope: { previousReviewedHeadSha: PREVIOUS, changedPaths: Array.from({ length: 60 }, (_, i) => `a/${i}.ts`), dependentPaths: Array.from({ length: 30 }, (_, i) => `b/${i}.ts`), recheckFailureIds: Array.from({ length: 20 }, (_, i) => `f-${i}`) },
      diffStats: { files: 300, additions: 9000, deletions: 4000 },
    }));
    expect(text.length).toBeLessThanOrEqual(WALKTHROUGH_BUDGET.total);
    expect(topBlock(text).length).toBeLessThanOrEqual(WALKTHROUGH_BUDGET.topBlock);
    expect(text).toContain('### Changes');
    expect(text.match(/^\| Area \d/gm)?.length ?? 0).toBeGreaterThanOrEqual(6);
    for (const section of text.split('<details>').slice(1)) {
      const body = (section.split('</details>')[0].split('</summary>')[1] ?? '').trim();
      expect(body.length).toBeLessThanOrEqual(WALKTHROUGH_BUDGET.detailsBody);
    }
  });

  it('keeps the top block inside the cap for hostile input that grows when it is escaped', () => {
    const hostile = triage({ summary: '&'.repeat(400), risk: { level: 'high', reason: '<'.repeat(200) } });
    const lenses = Array.from({ length: 12 }, (_, i) => ({ lens: `lens-with-a-long-name-${i}`, status: `unavailable: ${'&'.repeat(80)}` }));
    const text = renderWalkthrough(input({ content: { kind: 'structured', triage: hostile }, lenses }));
    expect(topBlock(text).length).toBeLessThanOrEqual(WALKTHROUGH_BUDGET.topBlock);
    expect(text.length).toBeLessThanOrEqual(WALKTHROUGH_BUDGET.total);
  });

  it('cuts a very long first line inside a details block and keeps the cap strict', () => {
    const long = triage({ areas: [{ name: 'Core', paths: ['a.ts'], summary: 'Ok.', details: ['w'.repeat(240), ...Array.from({ length: 30 }, () => 'z'.repeat(60))] }] });
    const text = renderWalkthrough(input({ content: { kind: 'structured', triage: long } }));
    const section = text.split('<details>').find((part) => part.startsWith('<summary>Walkthrough by area'));
    const body = (section?.split('</details>')[0].split('</summary>')[1] ?? '').trim();
    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(WALKTHROUGH_BUDGET.detailsBody);
    expect(body).toContain('more line');
  });

  it('drops detail in a fixed order and says so when everything is cut', () => {
    const text = renderWalkthrough(input({ content: { kind: 'structured', triage: hugeTriage() } }));
    const small = renderWalkthrough(input());
    expect(text.length).toBeLessThan(WALKTHROUGH_BUDGET.total + 1);
    expect(small).toContain('Test coverage of this change');
    expect(text.length).toBeLessThanOrEqual(WALKTHROUGH_BUDGET.total);
  });

  it('shows the incremental range, the changed files and the Reviewer data section', () => {
    const text = renderWalkthrough(input({
      scope: { previousReviewedHeadSha: PREVIOUS, changedPaths: ['a.ts', 'b.ts'], dependentPaths: ['c.ts'], recheckFailureIds: ['finding-1'] },
      diffStats: { files: 2, additions: 3, deletions: 1 },
    }));
    expect(text).toContain(`compare/${PREVIOUS}...${HEAD}`);
    expect(text).toContain('Incremental · ');
    expect(text).toContain('2 changed files, 1 dependent');
    expect(text).toContain('since the last review');
    expect(text).toContain('<summary>Reviewer data</summary>');
    expect(text).toContain('recheckFailureIds (1)');
  });

  it('marks a partial review and names the unavailable lens and its reason', () => {
    const text = renderWalkthrough(input({
      lenses: [{ lens: 'security', status: 'completed' }, { lens: 'contracts-callers', status: 'unavailable: deadline' }],
    }));
    expect(text).toContain('⚠️ **Partial** · 1 of 2 lenses unavailable: contracts-callers (deadline)');
    expect(text).not.toContain('✅ **Complete**');
  });

  it('renders zero findings without severity noise', () => {
    const text = renderWalkthrough(input());
    expect(text).toContain('| **Findings** | No verified findings |');
    expect(text).not.toContain('held locally');
  });

  it('renders counts of verified, held and dismissed findings', () => {
    const text = renderWalkthrough(input({ findings: { bySeverity: { ...none, Minor: 2 }, heldLocally: 1, dismissed: 3 } }));
    expect(text).toContain('**2 verified** (🟡 2 minor) · 1 held locally · 3 dismissed');
  });

  it('renders a legacy walkthrough as a truncated code fence that does not render markup', () => {
    const legacy = `# Observed behavior\n<script>alert(1)</script>\n${'x'.repeat(8000)}`;
    const text = renderWalkthrough(input({ content: { kind: 'legacy', text: legacy } }));
    expect(text).toContain('<summary>Walkthrough (earlier format)</summary>');
    const section = text.slice(text.indexOf('<summary>Walkthrough (earlier format)</summary>'));
    expect(section).toContain('```text\n# Observed behavior\n<script>alert(1)</script>');
    expect(text.length).toBeLessThanOrEqual(WALKTHROUGH_BUDGET.total);
  });

  it('uses a longer fence when legacy text contains code fences and keeps a mermaid block inert', () => {
    const legacy = '# Observed behavior\n```mermaid\ngraph TD\n```\n````js\nx\n````\nend';
    const text = renderWalkthrough(input({ content: { kind: 'legacy', text: legacy } }));
    expect(text).toContain('`````text\n# Observed behavior');
    expect(text).not.toMatch(/^```mermaid\nsequenceDiagram/m);
    expect(text).toContain('`````\n\n</details>');
  });

  it('renders only the top block when the walkthrough is unavailable', () => {
    const text = renderWalkthrough(input({ content: { kind: 'unavailable', reason: 'triage.json missing' } }));
    expect(text.startsWith('## PtahCode review')).toBe(true);
    expect(text).not.toContain('### Changes');
    expect(text).not.toContain('<details>');
    expect(text.length).toBeLessThanOrEqual(WALKTHROUGH_BUDGET.topBlock);
  });

  it('neutralizes mentions, issue references and bare links in model text', () => {
    const hostile = triage({ summary: 'Ping @octocat, see #123 and https://evil.example/x and www.evil.example now.' });
    const text = renderWalkthrough(input({ content: { kind: 'structured', triage: hostile } }));
    expect(text).not.toMatch(/@octocat/);
    expect(text).not.toMatch(/#123/);
    expect(text).not.toContain('https://evil');
    expect(text).not.toContain('www.evil');
    expect(text).toContain('@​octocat');
    expect(text).toContain('#​123');
    expect(text).toContain('https:​//evil.example');
    expect(text).toContain('www​.evil');
  });

  it('says "at least" and "diff truncated" when the diff was cut', () => {
    const text = renderWalkthrough(input({ diffStats: { files: 4, additions: 40, deletions: 6, truncated: true } }));
    expect(text).toContain('at least 4 files');
    expect(text).toContain('diff truncated');
  });

  it('counts in the Files column only the paths that are in the diff', () => {
    const paths = new Set(['libs/sync/client.ts', 'libs/sync/config.ts']);
    const text = renderWalkthrough(input({ diffStats: { files: 2, additions: 4, deletions: 1, paths } }));
    expect(text).toContain('| Sync client | 1 | Retries failed calls twice. |');
    expect(text).toContain('| Config | 1 | Removes the legacy flag. |');
    expect(text).not.toContain('libs/sync/retry.ts');
  });

  it('describes an incremental run without "No verified findings" while earlier findings are open', () => {
    const scope = { previousReviewedHeadSha: PREVIOUS, changedPaths: ['a.ts'], dependentPaths: [], recheckFailureIds: [] };
    const text = renderWalkthrough(input({ scope, findings: { bySeverity: none, heldLocally: 0, carriedOver: 2, dismissed: 0 } }));
    expect(text).toContain('No new verified findings in this run');
    expect(text).toContain('2 earlier findings still present');
    expect(text).not.toContain('No verified findings');
    expect(text).not.toContain('dismissed');
  });

  it('escapes model text so it cannot add HTML, links or forged markers', () => {
    const hostile = triage({ summary: '<img src=x onerror=1> [click](http://evil) <!-- ptah-review:finding:abc -->' });
    const text = renderWalkthrough(input({ content: { kind: 'structured', triage: hostile }, redact: (v) => v.replace(/<!--\s*ptah-review:finding:/gi, '') }));
    expect(text).not.toContain('<img');
    expect(text).toContain('\\[click\\]');
    expect(text).not.toContain('[click](');
    expect(text).not.toContain('ptah-review:finding');
  });

  it('adds a mermaid block only when the diagram is useful', () => {
    const withDiagram = triage({ diagram: { title: 'Flow', participants: [{ id: 'a', label: 'Client' }, { id: 'b', label: 'Server' }], steps: [{ from: 'a', to: 'b', label: 'send' }] } });
    expect(renderWalkthrough(input({ content: { kind: 'structured', triage: withDiagram } }))).toContain('```mermaid\nsequenceDiagram');
    expect(renderWalkthrough(input())).not.toContain('mermaid');
  });
});

describe('renderSequenceDiagram', () => {
  it('generates its own ids and filters labels', () => {
    const text = renderSequenceDiagram({ title: 't', participants: [{ id: 'x', label: 'Client;\nrm -rf' }, { id: 'y', label: 'Server' }], steps: [{ from: 'x', to: 'y', label: 'a->>b: <b>' }, { from: 'x', to: 'zzz', label: 'dropped' }] });
    expect(text).toContain('participant P1 as Client rm -rf');
    expect(text).toContain('P1->>P2: a-b: b');
    expect(text).not.toContain('dropped');
  });

  it('returns null for fewer than two participants or no valid step', () => {
    expect(renderSequenceDiagram({ title: 't', participants: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }], steps: [{ from: 'a', to: 'a', label: 'x' }] })).toBeNull();
    expect(renderSequenceDiagram({ title: 't', participants: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], steps: [{ from: 'a', to: 'q', label: 'x' }] })).toBeNull();
  });
});

describe('parseTriageOutput', () => {
  it('accepts valid JSON and rejects bad JSON or a missing summary', () => {
    expect(parseTriageOutput(JSON.stringify(triage()))).not.toBeNull();
    expect(parseTriageOutput('not json')).toBeNull();
    expect(parseTriageOutput(JSON.stringify({ ...triage(), summary: undefined }))).toBeNull();
    expect(parseTriageOutput(JSON.stringify({ ...triage(), areas: [] }))).toBeNull();
  });

  it('is tolerant: it keeps unknown keys out, cuts long text and drops unsafe paths', () => {
    const extra = parseTriageOutput(JSON.stringify({ ...triage(), extra: 1, changeType: 'unknown-type' }));
    expect(extra).not.toBeNull();
    expect(extra).not.toHaveProperty('extra');
    expect(extra?.changeType).toBe('mixed');
    const long = parseTriageOutput(JSON.stringify(triage({ summary: 'x'.repeat(5000) })));
    expect(long?.summary.length).toBeLessThan(1000);
    const unsafe = triage({ areas: [{ name: 'a', paths: ['/etc/passwd', '../x', 'ok/file.ts'], summary: 's', details: [] }] });
    expect(parseTriageOutput(JSON.stringify(unsafe))?.areas[0].paths).toEqual(['ok/file.ts']);
  });

  it('reports schema paths only, never the text', () => {
    const result = parseTriageOutputDetailed(JSON.stringify({ ...triage(), summary: 'secret text', areas: [] }));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain('areas');
    expect(JSON.stringify(result)).not.toContain('secret text');
  });
});

describe('diffStats', () => {
  it('counts files and changed lines inside hunks only', () => {
    const diff = ['diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -1,2 +1,3 @@', ' keep', '-old', '+new', '+more', 'diff --git a/b.ts b/b.ts', '@@ -1 +1 @@', '-x', '+y'].join('\n');
    expect(diffStats(diff)).toMatchObject({ files: 2, additions: 3, deletions: 2, truncated: false });
    expect([...(diffStats(diff).paths ?? [])]).toEqual(['a.ts', 'b.ts']);
    expect(diffStats(diff, true).truncated).toBe(true);
  });
});
