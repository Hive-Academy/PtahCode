import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProvidersSettingsStateService } from '@ptah-extension/core';
import { RoutingDisplayNamesStore } from './routing-display-names.store';

describe('RoutingDisplayNamesStore', () => {
  const agents = signal<{ status: string; data: { id: string; name: string }[] | null }>({ status: 'loading', data: null });
  const models = signal<{ status: string; data: Record<string, { selectedModel: string }> }>({ status: 'ready', data: {} });
  let store: RoutingDisplayNamesStore;

  beforeEach(() => {
    agents.set({ status: 'loading', data: null });
    models.set({ status: 'ready', data: {} });
    TestBed.configureTestingModule({ providers: [{ provide: ProvidersSettingsStateService, useValue: {
      cliAgents: agents,
      cliModels: models,
    } }] });
    store = TestBed.inject(RoutingDisplayNamesStore);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('resolves configured and built-in executors without changing raw IDs', () => {
    expect(store.executor('pc-a').text).toBe('Loading executor…');
    agents.set({ status: 'ready', data: [{ id: 'pc-a', name: 'My CLI' }] });
    expect(store.executor('pc-a').text).toBe('My CLI');
    expect(store.executor('pc-deleted')).toEqual({ text: 'Unknown executor', raw: 'pc-deleted', loading: false });
    expect(store.executor('codex').text).toBe('Codex');
    expect(store.executor('subagent:code-logic-reviewer').text).toBe('Code logic reviewer');
  });

  it('formats route pairs and preserves unknown model IDs', () => {
    expect(store.route('research|research').text).toBe('Research · research');
    expect(store.model('*').text).toBe('All models');
    expect(store.model('id\tFriendly model').text).toBe('Friendly model');
    models.set({ status: 'ready', data: { codex: { selectedModel: 'raw-model\tSaved label' } } });
    expect(store.model('raw-model').text).toBe('Saved label');
    expect(store.model('unlisted-model').raw).toBe('unlisted-model');
  });
});
