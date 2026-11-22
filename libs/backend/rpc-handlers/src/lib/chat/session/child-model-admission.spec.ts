import { getAnthropicProvider } from '@ptah-extension/shared';
import {
  isNativeChildModelProfile,
  nativeChildModelIds,
  resolveNativeTierAlias,
} from './child-model-admission';

/** The claude-cli tier preference; a preference, never an admitted list. */
function preferred(tier: 'opus' | 'sonnet' | 'haiku'): string {
  const id = getAnthropicProvider('claude-cli')?.defaultTiers?.[tier];
  if (!id) throw new Error(`claude-cli has no ${tier} preference`);
  return id;
}

describe('native child model admission', () => {
  describe('nativeChildModelIds', () => {
    it('returns the catalog ids only, without duplicates', () => {
      const catalog = [
        { value: 'old-sdk-model' },
        { value: 'claude-live-model' },
        { value: 'old-sdk-model' },
      ];
      expect(nativeChildModelIds(catalog)).toEqual([
        'old-sdk-model',
        'claude-live-model',
      ]);
    });

    it('adds no repository ids when discovery returns no models', () => {
      expect(nativeChildModelIds([])).toEqual([]);
    });
  });

  describe('resolveNativeTierAlias', () => {
    it.each(['opus', 'sonnet', 'haiku'] as const)(
      'resolves %s to its preference when the catalog lists it',
      (tier) => {
        const warn = jest.fn();
        const catalog = [preferred('opus'), preferred('sonnet'), preferred('haiku')];
        expect(resolveNativeTierAlias(tier, catalog, { warn })).toBe(
          preferred(tier),
        );
        expect(warn).not.toHaveBeenCalled();
      },
    );

    it('admits the live successor of a retired preference and warns with both ids', () => {
      const warn = jest.fn();
      const catalog = ['claude-opus-99-2', 'claude-opus-99-0', 'claude-sonnet-99-0'];
      const resolved = resolveNativeTierAlias('opus', catalog, { warn });
      expect(resolved).toBe('claude-opus-99-0');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Native tier preference is not live'),
        { tier: 'opus', preferred: preferred('opus'), resolved: 'claude-opus-99-0' },
      );
    });

    it('prefers the successor version over an older one; suffixed ids are not candidates', () => {
      const warn = jest.fn();
      const catalog = ['claude-haiku-3', 'claude-haiku-10', 'claude-haiku-9[1m]'];
      expect(resolveNativeTierAlias('haiku', catalog, { warn })).toBe(
        'claude-haiku-10',
      );
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('keeps the alias when the catalog has no id of that tier', () => {
      const warn = jest.fn();
      expect(
        resolveNativeTierAlias('sonnet', ['claude-opus-99-0', 'sonnet[1m]'], {
          warn,
        }),
      ).toBe('sonnet');
      expect(warn).not.toHaveBeenCalled();
    });

    it('resolves fable to the newest live claude-fable id by numeric compare', () => {
      expect(
        resolveNativeTierAlias('fable', [
          'claude-fable-5-2',
          'claude-fable-5-10',
          'claude-fable-5[1m]',
          'claude-fable-preview',
        ]),
      ).toBe('claude-fable-5-10');
    });

    it('keeps fable when the catalog lists no claude-fable id', () => {
      expect(resolveNativeTierAlias('fable', ['claude-opus-99-0'])).toBe(
        'fable',
      );
    });

    it.each(['default', 'claude-opus-4-8', 'unknown'])(
      'returns %s unchanged',
      (model) => {
        expect(resolveNativeTierAlias(model, ['claude-opus-99-0'])).toBe(
          model,
        );
      },
    );
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
