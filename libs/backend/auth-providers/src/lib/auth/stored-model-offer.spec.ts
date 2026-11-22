import { ANTHROPIC_DIRECT_PROVIDER_ID } from '@ptah-extension/shared';
import {
  isClaudeModel,
  isStoredModelOffered,
  type CachedModelIdsReader,
} from './stored-model-offer';

function catalogs(byProvider: Record<string, readonly string[]>) {
  const reader: CachedModelIdsReader = (providerId) =>
    byProvider[providerId] ?? null;
  return jest.fn(reader);
}

describe('isClaudeModel', () => {
  it.each(['opus', 'Sonnet', 'default', 'claude-opus-4-7', 'claude-x[1m]'])(
    'treats %s as a Claude id or alias',
    (model) => expect(isClaudeModel(model)).toBe(true),
  );

  it('does not treat a vendor id as Claude', () => {
    expect(isClaudeModel('gpt-6-luna')).toBe(false);
  });
});

describe('isStoredModelOffered', () => {
  it('keeps a Claude alias on every provider', () => {
    expect(isStoredModelOffered('sonnet', 'openrouter', catalogs({}))).toBe(
      true,
    );
  });

  it("keeps a model the serving provider's catalogue lists", () => {
    const reader = catalogs({
      openrouter: ['vendor/model'],
      requesty: ['vendor/model'],
    });
    expect(isStoredModelOffered('vendor/model', 'openrouter', reader)).toBe(
      true,
    );
  });

  it("refuses a model only another provider's catalogue lists", () => {
    const reader = catalogs({
      openrouter: ['vendor/other'],
      'z-ai': ['glm-x'],
    });
    expect(isStoredModelOffered('glm-x', 'openrouter', reader)).toBe(false);
  });

  it('refuses a non-Claude id on direct Anthropic when another catalogue lists it', () => {
    const reader = catalogs({ 'z-ai': ['glm-x'] });
    expect(
      isStoredModelOffered('glm-x', ANTHROPIC_DIRECT_PROVIDER_ID, reader),
    ).toBe(false);
  });

  it('keeps the stored model when no catalogue is on hand at all', () => {
    expect(isStoredModelOffered('glm-x', 'openrouter', catalogs({}))).toBe(
      true,
    );
  });

  // M8 (documented regression): a provider never listed on this machine
  // claims no model. Its saved id is kept and the vendor answers it, because
  // no repository model list stands in for the missing catalogue.
  it('keeps a saved id of a provider that was never listed on this machine', () => {
    const reader = catalogs({ openrouter: ['vendor/model'] });
    expect(isStoredModelOffered('glm-5.3', 'openrouter', reader)).toBe(true);
    expect(reader).toHaveBeenCalledWith('z-ai');
  });
});
