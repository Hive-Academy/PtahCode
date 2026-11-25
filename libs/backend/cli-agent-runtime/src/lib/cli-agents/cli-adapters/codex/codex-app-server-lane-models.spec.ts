import { codexAdvertisedEfforts, codexLaneModels, codexUnsendableEfforts } from './codex-app-server-lane-models';

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

describe('Codex catalog efforts', () => {
  it('keeps native efforts in catalog order and identifies efforts Ptah cannot send', () => {
    const efforts = codexAdvertisedEfforts([
      {
        id: 'first', model: 'first', displayName: 'First', isDefault: true,
        supportedEfforts: ['future-effort', 'high', 'low'],
      },
      {
        id: 'second', model: 'second', displayName: 'Second', isDefault: false,
        supportedEfforts: ['high', 'none', 'xhigh', 'future-effort'],
      },
    ]);

    expect(efforts).toEqual(['future-effort', 'high', 'low', 'none', 'xhigh']);
    expect(codexUnsendableEfforts(efforts)).toEqual(['future-effort', 'none']);
  });

  it('returns no unsendable efforts when all efforts can be sent', () => {
    expect(codexUnsendableEfforts(['low', 'medium', 'high', 'xhigh'])).toEqual([]);
  });
});
