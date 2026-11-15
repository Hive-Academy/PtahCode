import { extractStackSummary } from './stack-summary.extractor';

describe('extractStackSummary', () => {
  it('reads verified structured items', () => {
    const result = extractStackSummary({ 'project-profile':
      '```stack-summary\n{"items":[{"kind":"framework","name":"Angular","evidence":"package.json","sourcePhase":"project-profile"}]}\n```' });
    expect(result.summary).toEqual({ source: 'structured', items: [
      { kind: 'framework', name: 'Angular', evidence: 'package.json', sourcePhase: 'project-profile' },
    ] });
  });

  it('returns a warning for malformed structured data', () => {
    const result = extractStackSummary({ 'project-profile': '```stack-summary\n{"items":[{"kind":"unknown"}]}\n```' });
    expect(result.summary.items).toEqual([]);
    expect(result.warning).toBeDefined();
  });

  it('keeps valid items from the other phase when one block is malformed', () => {
    const result = extractStackSummary({
      'project-profile': '```stack-summary\n{"items":[{"kind":"framework","name":"Angular","evidence":"package.json","sourcePhase":"project-profile"}]}\n```',
      'architecture-assessment': '```stack-summary\n{"items": broken}\n```',
    });
    expect(result.summary.items.map((item) => item.name)).toEqual(['Angular']);
    expect(result.warning).toBe('Malformed stack summary JSON');
  });

  it('extracts bounded legacy items under known headings', () => {
    const result = extractStackSummary({ 'project-profile': '### Frameworks\n- Angular 22\n### Other\n- Guess' });
    expect(result.summary).toEqual({ source: 'legacy', items: [
      { kind: 'framework', name: 'Angular', evidence: '- Angular 22', sourcePhase: 'project-profile' },
    ] });
  });

  it('recognizes the older Tech Stack format', () => {
    const result = extractStackSummary({ 'project-profile': '### Tech Stack\n- Language: TypeScript 6\n- Framework: Angular 22' });
    expect(result.summary.items.map((item) => [item.kind, item.name])).toEqual([
      ['language', 'TypeScript'], ['framework', 'Angular'],
    ]);
  });
});
