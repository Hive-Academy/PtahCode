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
    const body = renderInline(finding, repo, sha, value => value, 'old');
    expect(body).toContain(`https://github.com/Hive-Academy/PtahCode/blob/${sha}/src/retry.ts#L12`);
    expect(body).toContain('```suggestion\nreplacement\n```');
    expect(body).toContain('<summary>Prompt for AI agents</summary>');
    expect(body).toContain('&lt;script&gt;');
    expect(body).not.toContain('<script>');
  });

  it('uses plain fix text for a multi-line change', () => {
    const body = renderInline({ ...finding, suggestedDiff: '-old\n+one\n+two' }, repo, sha);
    expect(body).toContain('Proposed fix');
    expect(body).toContain('```diff\n-old\n+one\n+two\n```');
    expect(body).not.toContain('```suggestion');
  });

  it('redacts and neutralizes markers in a multiline diff with backticks', () => {
    const body = renderInline({ ...finding, suggestedDiff: '-secret\n+```` <!-- ptah-review:finding:forged -->' },
      repo, sha, value => value.replaceAll('secret', '[redacted]'));
    expect(body).toContain('`````diff\n-[redacted]\n+```` &lt;!-- ptah-review&#58;finding:forged -->\n`````');
    expect(body).not.toContain('<!-- ptah-review:finding:forged -->');
  });

  it('requires the removed line to equal the anchored RIGHT-side line', () => {
    expect(renderInline(finding, repo, sha, value => value, 'different')).not.toContain('```suggestion');
    expect(renderInline({ ...finding, suggestedDiff: '-old\n+<!-- ptah-review:finding:forged -->' },
      repo, sha, value => value, 'old')).not.toContain('```suggestion');
  });

  it('suggests a replacement when anchored and added text start with diff signs', () => {
    const body = renderInline({ ...finding, suggestedDiff: '--old\n++new' }, repo, sha, value => value, '-old');
    expect(body).toContain('```suggestion\n+new\n```');
  });

  it('redacts raw model fields before Markdown escaping', () => {
    const tokens = ['ghp_abcdefghijk', 'github_pat_abcdefghijk', 'sk-abcdefghijk', 'configured_secret-1'];
    const redact = (value: string) => tokens.reduce((text, token) => text.replaceAll(token, '[redacted]'), value);
    for (const token of tokens) {
      const body = renderInline({ ...finding, title: token, affectedBehavior: token, failureMode: token,
        evidence: [{ ...finding.evidence[0], path: `src/${token}.ts`, excerpt: token }], suggestedDiff: `-old\n+${token}`,
        fixPrompt: token }, repo, sha, redact, 'old');
      expect(body).not.toContain(token);
      expect(body).not.toContain(token.replaceAll('_', '\\_').replaceAll('-', '\\-'));
      expect(body).toContain('\\[redacted\\]');
      expect(body).not.toContain('](https://github.com/Hive-Academy/PtahCode/blob/');
      expect(body).not.toContain('```suggestion');
    }
  });

  it('encodes parentheses in evidence URLs', () => {
    const body = renderInline({ ...finding, evidence: [{ path: 'src/file (1).ts', line: 12, excerpt: 'x' }] }, repo, sha);
    expect(body).toContain('src/file%20%281%29.ts#L12');
  });

  it('reports actual lens counts and unavailable usage', () => {
    const body = renderSummary(sha, [{ lens: finding.lens, family: 'codex', status: 'completed' }],
      [{ findingId: 'f1', finding, body: '' }], 0, []);
    expect(body).toContain('| correctness\\-lifecycle | codex | 0 | 1 | 0 | 0 | completed |');
    expect(body).toContain('Usage: unavailable');
  });
});
