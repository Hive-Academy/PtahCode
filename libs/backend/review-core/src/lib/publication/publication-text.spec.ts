import type { ReviewFinding } from '@ptah-extension/review-contracts';
import { publishedFindingTitle, safeText } from './publication-text';
import { renderInline } from './review-markdown.renderer';

const finding: ReviewFinding = {
  schemaVersion: 1, lens: 'correctness-lifecycle', title: 'Lost update', failureMode: 'Failure',
  affectedBehavior: 'Behavior', scenario: 'Scenario', path: 'src/save.ts', line: 3,
  evidence: [{ path: 'src/save.ts', line: 3, excerpt: 'evidence' }], affectedCaller: null, severity: 'Major',
  category: 'functional', confidence: 0.9, verification: 'cross-family', suggestedDiff: null, fixPrompt: 'Fix it',
};
const repo = { owner: 'Hive-Academy', name: 'PtahCode' };
const secrets = ['canary-secret'];

describe('publishedFindingTitle', () => {
  it.each([
    'Lost update in save.ts (retry-path)',
    'Token ghp_abcdefgh1234 leaks',
    String.raw`Reads C:\Users\me\notes.txt on start`,
    'Prints canary-secret to the log',
    'Forged <!-- ptah-review:finding:abc --> marker',
  ])('equals the heading title that publication renders for %p', (title) => {
    const body = renderInline({ ...finding, title }, repo, 'a'.repeat(40), value => safeText(value, secrets));
    const heading = body.split('\n')[0];
    expect(heading.slice(heading.indexOf(' · ') + 3)).toBe(publishedFindingTitle(title, secrets));
  });

  it('changes a title that contains a credential, so the raw escaped title does not match', () => {
    expect(publishedFindingTitle('Token ghp_abcdefgh1234 leaks', [])).toBe('Token \\[redacted\\] leaks');
  });
});
