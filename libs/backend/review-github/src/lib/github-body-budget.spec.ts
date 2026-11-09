import { boundedBody } from './github-body-budget';

describe('GitHub body budget', () => {
  it('retains markers and full required paragraphs for multibyte oversized content', () => {
    const marker = '<!-- ptah-review:finding:f1 -->';
    const body = boundedBody(`### Major · Title\n\n**Impact:** broken\n\n${'🐛'.repeat(40_000)}`, [marker]);
    expect(body).toContain(marker);
    expect(body).toContain('**Impact:** broken');
    expect(body).toContain('sections omitted');
    expect(body.length).toBeLessThanOrEqual(65_536);
  });
  it('keeps legal multibyte content and closes truncated Markdown blocks', () => {
    expect(boundedBody('界'.repeat(30_000), [])).toHaveLength(30_000);
    const body = boundedBody(`Heading\n\n\`\`\`text\n\n${'x'.repeat(70_000)}\n\n\`\`\``, ['<!-- marker -->']);
    expect(body).toContain('\n```\n\n…');
    expect(body).toContain('<!-- marker -->');
  });
  it('ignores details tags inside fences when closing a truncated prefix', () => {
    const body = boundedBody(`<details>\n\n\`\`\`html\n</details>\n\n${'x'.repeat(70_000)}`, ['<!-- marker -->']);
    expect(body).toContain('\n```\n</details>\n\n…');
    expect(body).toContain('<!-- marker -->');
  });
  it('retains a shortened impact paragraph when truncating', () => {
    const body = boundedBody(`### Finding\n\n**Impact:** ${'i'.repeat(4_000)}\n\n${'x'.repeat(70_000)}`,
      ['<!-- marker -->']);
    expect(body).toContain('**Impact:** ');
    expect(body).toContain('i'.repeat(1_000));
    expect(body).toContain('…');
    expect(body).toContain('<!-- marker -->');
  });
});
