import { sessionModelDisplayName } from './session-model-name';

describe('sessionModelDisplayName (round 8)', () => {
  it('uses the catalog name first', () => {
    expect(sessionModelDisplayName('claude-fable-5-2', [{ id: 'claude-fable-5-2', name: 'Fable 5.2 (catalog)' }])).toBe('Fable 5.2 (catalog)');
  });

  it('keeps the shared formatter for families it knows', () => {
    expect(sessionModelDisplayName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
  });

  it('reads a Claude-style id of another family, with or without a date', () => {
    expect(sessionModelDisplayName('claude-fable-5-2')).toBe('Fable 5.2');
    expect(sessionModelDisplayName('claude-fable-5-20261001')).toBe('Fable 5');
  });

  it('leaves any other id raw', () => {
    expect(sessionModelDisplayName('gpt-5.5-mini')).toBe('gpt-5.5-mini');
  });
});
