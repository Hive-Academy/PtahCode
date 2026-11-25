import type { CliModelInfo } from './cli-adapters/cli-adapter.interface';
import { NativeEffortRegistry } from './native-effort.registry';

describe('NativeEffortRegistry', () => {
  const native = {
    provenance: 'native',
    supported: ['minimal', 'vendor-level', 'high'],
    default: 'vendor-level',
  } as const;
  const noEffort = { provenance: 'native', supported: [], default: null } as const;
  const unknown = { provenance: 'unknown' } as const;
  const models: readonly CliModelInfo[] = [
    { id: 'first', name: 'First', efforts: native },
    { id: 'default', name: 'Default', isDefault: true, efforts: noEffort },
    { id: 'unreported', name: 'Unreported' },
  ];

  let registry: NativeEffortRegistry;

  beforeEach(() => {
    registry = new NativeEffortRegistry();
  });

  it('stores the exact native list and resolves the lane-marked default', () => {
    registry.recordCatalog('codex', models);

    expect(registry.lookup('codex', 'first')).toEqual(native);
    expect(registry.lookup('codex', 'default')).toEqual(noEffort);
    expect(registry.lookup('codex', undefined)).toEqual(noEffort);
    expect(registry.lookup('codex', 'lane-default')).toEqual(noEffort);
    expect(registry.lookup('codex', 'unreported')).toEqual(unknown);
    expect(registry.lookup('codex', 'missing')).toEqual(unknown);
    expect(registry.lookup('copilot', 'first')).toEqual(unknown);
  });

  it('keeps an unmarked or unreported default unknown', () => {
    registry.recordCatalog('codex', [models[0]]);
    expect(registry.lookup('codex', undefined)).toEqual(unknown);

    registry.recordCatalog('codex', [
      models[0],
      { id: 'unreported', name: 'Unreported', isDefault: true },
    ]);
    expect(registry.lookup('codex', 'lane-default')).toEqual(unknown);
  });

  it('replaces one lane catalog, including stale session entries and its default', () => {
    registry.recordCatalog('codex', models);
    registry.recordCatalog('claude', models);
    registry.recordSession('codex', 'session-only', native);
    registry.recordCatalog('codex', [
      { id: 'first', name: 'First', isDefault: true, efforts: native },
    ]);

    expect(registry.lookup('codex', undefined)).toEqual(native);
    expect(registry.lookup('codex', 'default')).toEqual(unknown);
    expect(registry.lookup('codex', 'session-only')).toEqual(unknown);
    expect(registry.lookup('claude', undefined)).toEqual(noEffort);

    registry.recordCatalog('codex', []);
    expect(registry.lookup('codex', 'first')).toEqual(unknown);
    expect(registry.lookup('codex', undefined)).toEqual(unknown);
  });

  it('updates session evidence per model and ignores non-native reports', () => {
    registry.recordCatalog('grok', models);
    registry.recordSession('grok', 'default', native);
    registry.recordSession('grok', 'default', unknown);
    registry.recordSession('grok', 'first', {
      provenance: 'ptah-fallback',
      supported: [],
      default: null,
    });
    registry.recordSession('antigravity', 'unlisted', native);
    registry.recordSession('antigravity', 'unreported', unknown);

    expect(registry.lookup('grok', undefined)).toEqual(native);
    expect(registry.lookup('grok', 'first')).toEqual(native);
    expect(registry.lookup('antigravity', 'unlisted')).toEqual(native);
    expect(registry.lookup('antigravity', 'unreported')).toEqual(unknown);
    expect(registry.lookup('antigravity', undefined)).toEqual(unknown);
  });
});
