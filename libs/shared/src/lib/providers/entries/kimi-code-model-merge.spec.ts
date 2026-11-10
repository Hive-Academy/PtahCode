import {
  KIMI_CODE_PROVIDER_ENTRY,
  KIMI_CODE_MODEL_CAPABILITIES,
} from './kimi-code-provider-entry';
import {
  isKimiCodeModelsPayload,
  mergeKimiCodeModels,
} from './kimi-code-model-merge';

const staticModels = KIMI_CODE_PROVIDER_ENTRY.staticModels ?? [];

describe('mergeKimiCodeModels', () => {
  it('keeps every static model in static order when live names only a subset', () => {
    const result = mergeKimiCodeModels({ data: [{ id: 'k3.1-pro' }] });
    expect(result).toEqual(staticModels);
    expect(result.map((model) => model.id)).toEqual(
      staticModels.map((model) => model.id),
    );
  });

  it('appends live-only models after static rows and ignores a static base id alias', () => {
    const result = mergeKimiCodeModels({
      data: [
        { id: 'new-model', name: 'New Model', context_length: 1234 },
        { id: 'k3.1-pro', name: 'Overridden' },
      ],
    });
    expect(result.map((model) => model.id)).toEqual([
      ...staticModels.map((model) => model.id),
      'new-model',
    ]);
    expect(result.slice(0, staticModels.length)).toEqual(staticModels);
    expect(result[staticModels.length]).toMatchObject({
      name: 'New Model',
      contextLength: 1234,
      supportsToolUse: true,
      capabilities: KIMI_CODE_MODEL_CAPABILITIES,
    });
  });

  it('appends duplicate live ids once, preserving their first metadata', () => {
    const result = mergeKimiCodeModels({
      data: [
        { id: 'next', name: 'First' },
        { id: 'next', name: 'Second' },
      ],
    });
    expect(result.slice(staticModels.length)).toEqual([
      expect.objectContaining({ id: 'next', name: 'First' }),
    ]);
  });

  it('uses the id and zero context for a live-only model with no metadata', () => {
    expect(
      mergeKimiCodeModels({ data: [{ id: 'next' }] }).slice(
        staticModels.length,
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'next',
        name: 'next',
        contextLength: 0,
        description: 'next (Kimi Code subscription)',
      }),
    ]);
  });

  it.each([
    undefined,
    {},
    { data: [] },
    { data: [{ name: 'missing id' }] },
    { data: 'wrong type' },
  ])('falls back to static models for malformed or empty input', (payload) => {
    expect(mergeKimiCodeModels(payload)).toEqual(staticModels);
    expect(isKimiCodeModelsPayload(payload)).toBe(false);
  });

  it('accepts a payload with a data list of ids', () => {
    expect(isKimiCodeModelsPayload({ data: [{ id: 'future-kimi' }] })).toBe(
      true,
    );
  });
});
