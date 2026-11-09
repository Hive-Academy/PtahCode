import { ReviewFindingSchema } from '@ptah-extension/review-contracts';
import { renderInline, renderSummary } from './review-markdown.renderer';

const sha = 'a'.repeat(40);
const repo = { owner: 'Hive-Academy', name: 'PtahCode' };
const finding = ReviewFindingSchema.parse({ schemaVersion: 1, lens: 'correctness-lifecycle',
  title: '<broken> | retry', failureMode: 'Retry fails', affectedBehavior: 'Request remains pending',
  scenario: 'Timeout', path: 'src/retry.ts', line: 12,
  evidence: [{ path: 'src/retry.ts', line: 12, excerpt: '<script>alert(1)</script>' }],
  affectedCaller: null, severity: 'Major', category: 'stability', confidence: 0.9,
  verification: 'cross-family', suggestedDiff: '-old\n+replacement', fixPrompt: 'Fix <retry>' });

describe('review Markdown renderer', () => {
  it('renders safe evidence links, an anchored replacement, and a collapsed prompt', () => {
    const body = renderInline(finding, repo, sha);
    expect(body).toContain(`https://github.com/Hive-Academy/PtahCode/blob/${sha}/src/retry.ts#L12`);
    expect(body).toContain('```suggestion\nreplacement\n```');
    expect(body).toContain('<summary>Prompt for AI agents</summary>');
    expect(body).toContain('&lt;script&gt;');
    expect(body).not.toContain('<script>');
  });

  it('uses plain fix text for a multi-line change', () => {
    const body = renderInline({ ...finding, suggestedDiff: '-old\n+one\n+two' }, repo, sha);
    expect(body).toContain('Proposed fix');
    expect(body).not.toContain('```suggestion');
  });

  it('reports actual lens counts and unavailable usage', () => {
    const body = renderSummary(sha, [{ lens: finding.lens, family: 'codex', verdict: 'completed' }],
      [{ findingId: 'f1', finding, body: '' }], 0, []);
    expect(body).toContain('| correctness\\-lifecycle | codex | 0 | 1 | 0 | 0 | completed |');
    expect(body).toContain('Usage: unavailable');
  });
});
