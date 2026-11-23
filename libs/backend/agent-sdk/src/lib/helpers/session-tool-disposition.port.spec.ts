import 'reflect-metadata';
import { SessionToolDispositionRegistry } from './session-tool-disposition.port';

describe('SessionToolDispositionRegistry', () => {
  const paused = { phase: 'paused' as const };

  it('has no disposition by default', () => {
    const registry = new SessionToolDispositionRegistry();
    expect(
      registry.lookup({ tabId: 'tab-1', sdkSessionId: 'sdk-1' }),
    ).toBeUndefined();
    expect(registry.lookup({})).toBeUndefined();
  });

  it('sets, looks up and clears by either identifier', () => {
    const registry = new SessionToolDispositionRegistry();
    registry.set({ tabId: 'tab-1', sdkSessionId: 'sdk-1' }, paused);
    expect(registry.lookup({ tabId: 'tab-1' })).toBe(paused);
    expect(registry.lookup({ sdkSessionId: 'sdk-1' })).toBe(paused);
    expect(registry.lookup({ tabId: 'other' })).toBeUndefined();
    registry.clear({ sdkSessionId: 'sdk-1' });
    expect(registry.lookup({ tabId: 'tab-1' })).toBe(paused);
    registry.clear({ tabId: 'tab-1' });
    expect(
      registry.lookup({ tabId: 'tab-1', sdkSessionId: 'sdk-1' }),
    ).toBeUndefined();
  });

  it('prefers the tab entry over the SDK session entry', () => {
    const registry = new SessionToolDispositionRegistry();
    const running = { phase: 'running' as const };
    registry.set({ tabId: 'tab-1' }, running);
    registry.set({ sdkSessionId: 'sdk-1' }, paused);
    expect(registry.lookup({ tabId: 'tab-1', sdkSessionId: 'sdk-1' })).toBe(
      running,
    );
    expect(registry.lookup({ sdkSessionId: 'sdk-1' })).toBe(paused);
  });
});
