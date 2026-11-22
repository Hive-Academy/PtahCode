import { parseModelsApiRows } from './models-api-parser';

describe('parseModelsApiRows', () => {
  it('maps an OpenRouter row with pricing strings and tool parameters', () => {
    expect(
      parseModelsApiRows([
        {
          id: 'anthropic/claude-opus-4.5',
          name: 'Claude Opus 4.5',
          description: 'Big model',
          context_length: 200000,
          supported_parameters: ['tools', 'temperature'],
          pricing: {
            prompt: '0.000005',
            completion: '0.000025',
            input_cache_read: '0.0000005',
            input_cache_write: '0.00000625',
          },
        },
      ]),
    ).toEqual([
      {
        id: 'anthropic/claude-opus-4.5',
        name: 'Claude Opus 4.5',
        description: 'Big model',
        contextLength: 200000,
        contextLengthSource: 'provider',
        supportsToolUse: true,
        inputCostPerToken: 0.000005,
        outputCostPerToken: 0.000025,
        cacheReadCostPerToken: 0.0000005,
        cacheCreationCostPerToken: 0.00000625,
      },
    ]);
  });

  it('maps a Requesty row: tool flag, top-level prices, array pricing ignored', () => {
    const [model] = parseModelsApiRows([
      {
        id: 'openai/gpt-5',
        supports_tool_calling: true,
        input_price: 0.000001,
        output_price: 0.000002,
        context_window: 400000,
        pricing: [{ tier: 1 }],
      },
    ]);
    expect(model).toEqual({
      id: 'openai/gpt-5',
      name: 'openai/gpt-5',
      description: '',
      contextLength: 400000,
      contextLengthSource: 'provider',
      supportsToolUse: true,
      inputCostPerToken: 0.000001,
      outputCostPerToken: 0.000002,
    });
  });

  it('takes the name from name, then display_name, then id', () => {
    const names = parseModelsApiRows([
      { id: 'a', name: 'Name A', display_name: 'Display A' },
      { id: 'b', display_name: 'Display B' },
      { id: 'c', name: '' },
    ]).map((m) => m.name);
    expect(names).toEqual(['Name A', 'Display B', 'c']);
  });

  it('marks tool support unknown when the row reports neither field', () => {
    const [model] = parseModelsApiRows([
      { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' },
    ]);
    expect(model.supportsToolUse).toBe(false);
    expect(model.toolUseUnknown).toBe(true);
  });

  it('reports a known "no" without the unknown marker', () => {
    const rows = parseModelsApiRows([
      { id: 'a', supported_parameters: ['temperature'] },
      { id: 'b', supports_tool_calling: false },
    ]);
    for (const model of rows) {
      expect(model.supportsToolUse).toBe(false);
      expect(model).not.toHaveProperty('toolUseUnknown');
    }
  });

  it('prefers supported_parameters over supports_tool_calling', () => {
    const [model] = parseModelsApiRows([
      { id: 'a', supported_parameters: [], supports_tool_calling: true },
    ]);
    expect(model.supportsToolUse).toBe(false);
  });

  it('skips invalid rows and keeps the valid ones', () => {
    const rows = parseModelsApiRows([
      null,
      'string-row',
      42,
      ['array'],
      {},
      { id: '' },
      { id: 7 },
      { id: 'kept' },
    ]);
    expect(rows.map((m) => m.id)).toEqual(['kept']);
  });

  it('drops a non-positive, non-finite or non-numeric context length', () => {
    const rows = parseModelsApiRows([
      { id: 'zero', context_length: 0 },
      { id: 'neg', context_length: -1 },
      { id: 'inf', context_length: Number.POSITIVE_INFINITY },
      { id: 'str', context_length: '128000' },
    ]);
    for (const model of rows) {
      expect(model.contextLength).toBe(0);
      expect(model).not.toHaveProperty('contextLengthSource');
    }
  });

  it('drops empty, negative and non-numeric prices', () => {
    const [model] = parseModelsApiRows([
      {
        id: 'a',
        pricing: { prompt: '', completion: '-1', input_cache_read: 'abc' },
        input_price: Number.NaN,
      },
    ]);
    expect(model).not.toHaveProperty('inputCostPerToken');
    expect(model).not.toHaveProperty('outputCostPerToken');
    expect(model).not.toHaveProperty('cacheReadCostPerToken');
  });

  it('does not attach capabilities (the caller does)', () => {
    const [model] = parseModelsApiRows([{ id: 'a', capabilities: ['effort'] }]);
    expect(model).not.toHaveProperty('capabilities');
  });
});
