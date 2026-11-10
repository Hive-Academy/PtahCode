import { rankChildSettings } from './child-setting-rule';

describe('rankChildSettings', () => {
  const models = ['claude-opus-4', 'claude-haiku-4', 'claude-sonnet-4'];

  it('chooses the smallest admitted model for coordination and Git work', () => {
    expect(rankChildSettings('Coordinate CI and git changes', models)).toEqual({
      model: 'claude-haiku-4',
      effort: 'low',
      modelSource: 'ranking',
      effortSource: 'ranking',
    });
  });

  it('chooses the strongest admitted model for unknown causes and security', () => {
    expect(
      rankChildSettings(
        'Investigate unknown cause in security architecture',
        models,
      ),
    ).toEqual({
      model: 'claude-opus-4',
      effort: 'high',
      modelSource: 'ranking',
      effortSource: 'ranking',
    });
  });

  it('leaves both fields omitted for an unmatched brief', () => {
    expect(rankChildSettings('Write a summary', models)).toEqual({
      modelSource: 'default',
      effortSource: 'default',
    });
  });

  it('routes effort when a named account has no available catalog', () => {
    expect(rankChildSettings('Coordinate CI', [])).toEqual({
      effort: 'low',
      modelSource: 'default',
      effortSource: 'ranking',
    });
  });

  it('ranks gemini ids correctly', () => {
    const catalog = ['gemini-2.5-pro', 'gemini-2.5-flash'];
    expect(rankChildSettings('Coordinate CI', catalog).model).toBe(
      'gemini-2.5-flash',
    );
    expect(
      rankChildSettings('Investigate security architecture', catalog).model,
    ).toBe('gemini-2.5-pro');
  });
});
