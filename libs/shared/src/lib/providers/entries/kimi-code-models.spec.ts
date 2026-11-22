import { KIMI_CODE_MODEL_CAPABILITIES } from './kimi-code-provider-entry';
import { parseKimiCodeModels } from './kimi-code-models';

describe('parseKimiCodeModels', () => {
  it.each([null, undefined, 'models', 42, {}, { data: 'x' }, { models: [] }])(
    'returns null for a bad envelope (%p)',
    (payload) => {
      expect(parseKimiCodeModels(payload)).toBeNull();
    },
  );

  it('returns only the live rows, with the SDK capability allowlist', () => {
    const models = parseKimiCodeModels({
      data: [{ id: 'k4', name: 'K4', context_length: 262144 }],
    });
    expect(models).toEqual([
      {
        id: 'k4',
        name: 'K4',
        description: 'K4 (Kimi Code subscription)',
        contextLength: 262144,
        supportsToolUse: false,
        toolUseUnknown: true,
        capabilities: [...KIMI_CODE_MODEL_CAPABILITIES],
      },
    ]);
  });

  it('skips invalid and duplicate rows', () => {
    const models = parseKimiCodeModels({
      data: [
        { id: '' },
        { name: 'no id' },
        'k3',
        { id: 'k3', context_length: -1 },
        { id: 'k3' },
        { id: 'k3', name: 'duplicate' },
        { id: 'kimi-for-coding', contextLength: 1048576 },
      ],
    });
    expect(
      models?.map((model) => [model.id, model.name, model.contextLength]),
    ).toEqual([
      ['k3', 'k3', 0],
      ['kimi-for-coding', 'kimi-for-coding', 1048576],
    ]);
  });

  it('marks tool use unknown unless the row reports it', () => {
    const models = parseKimiCodeModels({
      data: [
        { id: 'a', supports_tool_use: true },
        { id: 'b', supportsToolUse: false },
        { id: 'c' },
      ],
    });
    expect(
      models?.map(({ id, supportsToolUse, toolUseUnknown }) => ({
        id,
        supportsToolUse,
        toolUseUnknown,
      })),
    ).toEqual([
      { id: 'a', supportsToolUse: true, toolUseUnknown: undefined },
      { id: 'b', supportsToolUse: false, toolUseUnknown: undefined },
      { id: 'c', supportsToolUse: false, toolUseUnknown: true },
    ]);
  });

  it('returns [] for an empty list and null when no row is readable', () => {
    expect(parseKimiCodeModels({ data: [] })).toEqual([]);
    expect(parseKimiCodeModels({ data: [{ id: 7 }] })).toBeNull();
  });

  it('never merges repository rows', () => {
    expect(
      parseKimiCodeModels({ data: [{ id: 'k9' }] })?.map((m) => m.id),
    ).toEqual(['k9']);
  });
});
