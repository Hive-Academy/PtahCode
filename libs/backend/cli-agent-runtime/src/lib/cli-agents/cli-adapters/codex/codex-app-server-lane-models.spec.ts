import { codexLaneModels } from './codex-app-server-lane-models';

describe('codexLaneModels', () => {
  it('keeps the server model default and exact effort values', () => {
    expect(codexLaneModels([{
      id: 'catalog-key',
      model: 'codex-model',
      displayName: 'Codex Model',
      isDefault: true,
      supportedEfforts: ['future-effort', 'none', 'high'],
      defaultEffort: 'future-effort',
    }])).toEqual([{
      id: 'codex-model',
      name: 'Codex Model (Codex default)',
      isDefault: true,
      efforts: {
        provenance: 'native',
        supported: ['future-effort', 'none', 'high'],
        default: 'future-effort',
      },
    }]);
  });

  it('represents an unreported effort default as null', () => {
    expect(codexLaneModels([{
      id: 'catalog-key',
      model: 'codex-model',
      displayName: '',
      isDefault: false,
      supportedEfforts: ['high'],
    }])).toEqual([{
      id: 'codex-model',
      name: 'codex-model',
      efforts: { provenance: 'native', supported: ['high'], default: null },
    }]);
  });

  it.each([{}, { supportedEfforts: [] }])(
    'omits effort support for a missing or empty list (%j)',
    (efforts) => {
      expect(codexLaneModels([{
        id: 'catalog-key',
        model: 'codex-model',
        displayName: 'Codex Model',
        isDefault: false,
        defaultEffort: 'high',
        ...efforts,
      }])).toEqual([{ id: 'codex-model', name: 'Codex Model' }]);
    },
  );
});
