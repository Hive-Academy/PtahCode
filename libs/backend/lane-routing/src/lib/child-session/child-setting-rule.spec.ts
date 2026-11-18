import { rankChildSettings } from './child-setting-rule';

const models = ['default', 'claude-fable-5-2', 'claude-opus-5-5', 'claude-haiku-4-5', 'claude-sonnet-5', 'claude-sonnet-5-5'];
describe('rankChildSettings', () => {
  it.each(['You coordinate task 2281; implement code; git commit and CI', 'Coordinate CI and git changes', '', 'Write a summary'])(
    'defaults to balanced/high for %s', (brief) => {
      expect(rankChildSettings({ brief, models })).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'high', reason: { rule: 'unknown-kind-floor' } });
    },
  );
  it('requires explicit coordination for small/low', () => {
    expect(rankChildSettings({ brief: 'Git status', models, workKind: 'coordination' })).toMatchObject({ model: 'claude-haiku-4-5', effort: 'low', reason: { rule: 'coordination-only', input: 'workKind coordination' } });
  });
  it.each(['implement', 'tests', 'docs', 'research'])('enforces the code phase %s over coordination', (phaseKind) => {
    expect(rankChildSettings({ brief: 'coordinate git CI', models, phaseKind, workKind: 'coordination' })).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'high', reason: { rule: 'code-work-kind', input: `phase.kind ${phaseKind}` } });
  });
  it.each(['plan', 'architecture', 'design', 'review', 'document-review', 'visual-review', 'batch', 'completion'])('uses strong/high for %s', (phaseKind) => {
    expect(rankChildSettings({ brief: '', models, phaseKind, workKind: 'coordination' })).toMatchObject({ model: 'claude-opus-5-5', effort: 'high', reason: { rule: 'deep-work-kind' } });
  });
  it.each(['investigation', 'design', 'security'] as const)('uses strong/high for workKind %s', (workKind) => {
    expect(rankChildSettings({ brief: '', models, workKind })).toMatchObject({ model: 'claude-opus-5-5', effort: 'high', reason: { rule: 'deep-work-kind', input: `workKind ${workKind}` } });
  });
  it.each(['unknown cause', 'root cause', 'security', 'architecture', 'design', 'investigate'])('escalates untyped %s', (brief) => {
    expect(rankChildSettings({ brief, models })).toMatchObject({ model: 'claude-opus-5-5', reason: { rule: 'deep-work-text' } });
  });
  it('does not use text in preference to explicit code kind', () => {
    expect(rankChildSettings({ brief: 'design', models, workKind: 'code' }).reason.rule).toBe('code-work-kind');
  });
  it('orders the real mixed-generation catalog newest first, then the strong fallback, then the 200k reserve', () => {
    const catalog = [...models, 'claude-sonnet-4-6', 'claude-sonnet-4-5-20250929', 'claude-3-7-sonnet-20250219'];
    expect(rankChildSettings({ brief: '', models: catalog }).candidates).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5-20250929', 'claude-opus-5-5', 'claude-3-7-sonnet-20250219']);
  });
  it('uses the old generation when it is the only admitted balanced candidate', () => {
    expect(rankChildSettings({ brief: '', models: ['claude-sonnet-5', 'claude-haiku-4-5'] }).model).toBe('claude-sonnet-5');
  });
  it('promotes missing balanced to strong, never small or Fable', () => {
    expect(rankChildSettings({ brief: '', models: ['claude-haiku-5-5', 'claude-fable-5-2', 'claude-opus-5-5'] }).model).toBe('claude-opus-5-5');
    expect(rankChildSettings({ brief: '', models: ['default', 'claude-haiku-5-5', 'claude-fable-5-2'] }).model).toBeUndefined();
  });
  it('falls back from strong to balanced for deep work, never to small', () => {
    const deep = rankChildSettings({ brief: '', models: ['claude-haiku-5-5', 'claude-sonnet-5-5'], phaseKind: 'architecture' });
    expect(deep).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'high', reason: { rule: 'deep-work-kind' } });
    expect(rankChildSettings({ brief: '', models: ['glm-4.6-flash', 'glm-4.6'], workKind: 'security' }).model).toBe('glm-4.6');
    expect(rankChildSettings({ brief: '', models: ['claude-haiku-5-5'], phaseKind: 'review' }).model).toBeUndefined();
  });
  it('does not report an empty catalog for a pinned model', () => {
    expect(rankChildSettings({ brief: '', models: [], model: 'claude-opus-5-5', phaseKind: 'implement' }).reason).toEqual({ rule: 'code-work-kind', input: 'phase.kind implement' });
  });
  it('keeps the effort floor with an empty catalog', () => {
    expect(rankChildSettings({ brief: '', models: [] })).toEqual({ effort: 'high', modelSource: 'default', effortSource: 'ranking', candidates: [], reason: { rule: 'catalog-empty', input: 'no explicit kind' } });
  });
  it('sees deep-work text beyond 8000 characters', () => {
    expect(rankChildSettings({ brief: `${'x'.repeat(8001)} unknown cause`, models }).reason.rule).toBe('deep-work-text');
  });
  it('keeps other provider family words', () => {
    expect(rankChildSettings({ brief: '', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] }).model).toBe('gemini-2.5-pro');
    expect(rankChildSettings({ brief: '', models: ['gpt-5-mini', 'gpt-5'], workKind: 'coordination' }).model).toBe('gpt-5-mini');
  });
});
