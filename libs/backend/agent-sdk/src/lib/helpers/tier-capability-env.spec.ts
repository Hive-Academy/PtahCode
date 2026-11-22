/**
 * `buildTierCapabilityEnv` — the tier `_SUPPORTED_CAPABILITIES` env from the
 * capabilities a provider declares for its live models
 * (`liveModelCapabilities`). `buildStaticTierCapabilityEnv` is the older
 * static-row variant, still read by the CLI registry until it moves.
 *
 * The runtime gates effort per model id and does not recognise non-Claude ids,
 * so without these keys effort is silently dropped for such providers. The
 * value is an allowlist, so a tier is written only when its model declares a
 * list — never a partial or guessed one.
 */

import 'reflect-metadata';

import {
  getAnthropicProvider,
  getProviderLiveModelCapabilities,
} from '@ptah-extension/shared';
import {
  buildStaticTierCapabilityEnv,
  buildTierCapabilityEnv,
  buildTierEnvDefaults,
} from './sdk-model-service';

const KIMI_CAPABILITIES =
  'thinking,interleaved_thinking,effort,xhigh_effort,max_effort';

const KIMI_TIERS = getAnthropicProvider('kimi-code')?.defaultTiers as {
  opus: string;
  sonnet: string;
  haiku: string;
};

describe('buildTierCapabilityEnv', () => {
  it('writes the declared live capabilities for every tier with a model id', () => {
    const declared = getProviderLiveModelCapabilities('kimi-code');
    expect(declared?.join(',')).toBe(KIMI_CAPABILITIES);
    expect(buildTierCapabilityEnv('kimi-code', KIMI_TIERS)).toEqual({
      ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES: KIMI_CAPABILITIES,
      ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES: KIMI_CAPABILITIES,
      ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES: KIMI_CAPABILITIES,
    });
  });

  it('applies to a live id that no repository list knows', () => {
    expect(
      buildTierCapabilityEnv('kimi-code', { opus: 'kimi-catalogue-new' }),
    ).toEqual({
      ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES: KIMI_CAPABILITIES,
    });
  });

  it('skips tiers with no model id', () => {
    expect(
      buildTierCapabilityEnv('kimi-code', { opus: 'k3', sonnet: '' }),
    ).toEqual({
      ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES: KIMI_CAPABILITIES,
    });
  });

  it('leaves the key unset for a provider that declares no capabilities', () => {
    expect(getProviderLiveModelCapabilities('z-ai')).toBeUndefined();
    expect(
      buildTierCapabilityEnv('z-ai', { opus: 'glm-x', sonnet: 'glm-y' }),
    ).toEqual({});
  });

  it('returns an empty env for an unknown provider', () => {
    expect(buildTierCapabilityEnv('no-such-provider', KIMI_TIERS)).toEqual({});
  });

  it('is forwarded to the subprocess env by buildTierEnvDefaults', () => {
    const defaults = buildTierEnvDefaults({
      ANTHROPIC_BASE_URL: 'https://api.kimi.ai/coding/',
      ANTHROPIC_DEFAULT_OPUS_MODEL: KIMI_TIERS.opus,
      ...buildTierCapabilityEnv('kimi-code', { opus: KIMI_TIERS.opus }),
    });
    expect(
      defaults['ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES'],
    ).toBe(KIMI_CAPABILITIES);
  });
});

describe('buildStaticTierCapabilityEnv', () => {
  it('writes one capability key per kimi-code default tier', () => {
    expect(buildStaticTierCapabilityEnv('kimi-code', KIMI_TIERS)).toEqual({
      ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES: KIMI_CAPABILITIES,
      ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES: KIMI_CAPABILITIES,
      ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES: KIMI_CAPABILITIES,
    });
  });

  it('matches a suffixed id against its own static entry', () => {
    expect(
      buildStaticTierCapabilityEnv('kimi-code', { opus: 'k3.1-pro[1m]' }),
    ).toEqual({
      ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES: KIMI_CAPABILITIES,
    });
  });

  it('skips tiers with no model id or an undeclared model', () => {
    expect(
      buildStaticTierCapabilityEnv('kimi-code', {
        opus: 'k3',
        sonnet: '',
        haiku: 'not-a-kimi-model',
      }),
    ).toEqual({
      ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES: KIMI_CAPABILITIES,
    });
  });

  it('returns an empty env for an unknown provider', () => {
    expect(
      buildStaticTierCapabilityEnv('no-such-provider', KIMI_TIERS),
    ).toEqual({});
  });

  it('returns an empty env for a provider whose static models declare nothing', () => {
    const zai = getAnthropicProvider('z-ai')?.defaultTiers as {
      opus: string;
      sonnet: string;
      haiku: string;
    };
    expect(buildStaticTierCapabilityEnv('z-ai', zai)).toEqual({});
  });

  it('is forwarded to the subprocess env by buildTierEnvDefaults', () => {
    const defaults = buildTierEnvDefaults({
      ANTHROPIC_BASE_URL: 'https://api.kimi.ai/coding/',
      ANTHROPIC_DEFAULT_OPUS_MODEL: KIMI_TIERS.opus,
      ...buildStaticTierCapabilityEnv('kimi-code', KIMI_TIERS),
    });
    expect(defaults['ANTHROPIC_DEFAULT_OPUS_MODEL']).toBe(KIMI_TIERS.opus);
    expect(
      defaults['ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES'],
    ).toBe(KIMI_CAPABILITIES);
    expect(
      defaults['ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES'],
    ).toBe(KIMI_CAPABILITIES);
  });
});
