import { getAnthropicProvider } from '@ptah-extension/shared';
import {
  isNativeChildModelProfile,
  nativeChildModelIds,
  resolveNativeTierAlias,
} from './child-model-admission';

describe('native child model admission', () => {
  it('unions old catalog IDs, static IDs and tier IDs without duplicates', () => {
    const provider = getAnthropicProvider('claude-cli');
    const catalog = [{ value: 'old-sdk-model' }, { value: 'claude-opus-5-5' }];
    const ids = nativeChildModelIds(catalog);
    expect(ids).toEqual(
      expect.arrayContaining([
        'old-sdk-model',
        ...(provider?.staticModels ?? []).map((model) => model.id),
        ...Object.values(provider?.defaultTiers ?? {}),
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(catalog).toHaveLength(2);
  });

  it('retains verified native IDs when discovery returns no models', () => {
    expect(nativeChildModelIds([])).toEqual(
      expect.arrayContaining([
        'claude-opus-5-5',
        'claude-sonnet-5-5',
        'claude-haiku-5-5',
        'claude-fable-5-2',
      ]),
    );
  });

  it.each([
    ['opus', 'claude-opus-5-5'],
    ['sonnet', 'claude-sonnet-5-5'],
    ['haiku', 'claude-haiku-5-5'],
    ['fable', 'claude-fable-5-2'],
    ['default', 'default'],
    ['claude-opus-4-8', 'claude-opus-4-8'],
    ['unknown', 'unknown'],
  ])('resolves %s to %s', (model, expected) => {
    expect(resolveNativeTierAlias(model)).toBe(expected);
  });

  it('recognizes only an explicit profile without provider auth overrides as native', () => {
    expect(isNativeChildModelProfile({ authEnv: {} })).toBe(true);
    expect(isNativeChildModelProfile(undefined)).toBe(false);
    expect(isNativeChildModelProfile(null)).toBe(false);
    for (const key of [
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
    ]) {
      expect(
        isNativeChildModelProfile({ authEnv: { [key]: 'override' } }),
      ).toBe(false);
    }
  });
});
