import { boundedBody } from './github-body-budget';

describe('GitHub body budget', () => {
  it('retains markers and full required paragraphs for multibyte oversized content', () => {
    const marker = '<!-- ptah-review:finding:f1 -->';
    const body = boundedBody(`### Major · Title\n\n**Impact:** broken\n\n${'🐛'.repeat(20_000)}`, [marker]);
    expect(body).toContain(marker);
    expect(body).toContain('**Impact:** broken');
    expect(body).toContain('sections omitted');
    expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(65_536);
  });
});
