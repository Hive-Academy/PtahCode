import { ChildWindowRegistry } from './child-window-registry';

function fakeWindow(id: number) {
  let closed: (() => void) | undefined;
  let destroyed = false;
  return {
    webContents: { id },
    isDestroyed: () => destroyed,
    isMinimized: () => false,
    restore: jest.fn(),
    focus: jest.fn(),
    close: jest.fn(() => { destroyed = true; closed?.(); }),
    once: jest.fn((_event: 'closed', listener: () => void) => { closed = listener; }),
    loadFile: jest.fn(async () => undefined),
  };
}

describe('ChildWindowRegistry', () => {
  let registry: ChildWindowRegistry;
  beforeEach(() => {
    registry = new ChildWindowRegistry();
    registry.registerView('display', { singleton: true, allowedMethods: new Set(['displayWindow:getState']) });
  });

  it('exposes registration without a window factory', () => {
    expect('createWindow' in registry).toBe(false);
    expect(typeof registry.register).toBe('function');
  });

  it('keys by view and instance and enforces singleton policy', () => {
    const first = fakeWindow(11);
    registry.register('display', 'one', first);
    expect(registry.get('display', 'one')).toBe(first);
    expect(registry.get('display', 'two')).toBeNull();
    expect(() => registry.register('display', 'two', fakeWindow(12))).toThrow('already open');
  });

  it('resolves trusted sender context and its RPC allowlist', () => {
    const child = fakeWindow(11);
    const context = { root: '/workspace' };
    registry.register('display', 'one', child, context);
    expect(registry.sender(11)).toEqual({ viewKind: 'display', instanceId: 'one', context });
    expect(registry.allowsSender(11, 1, 'displayWindow:getState')).toBe(true);
    expect(registry.allowsSender(11, 1, 'chat:start')).toBe(false);
    expect(registry.allowsSender(1, 1, 'chat:start')).toBe(true);
    expect(registry.allowsSender(99, 1, 'displayWindow:getState')).toBe(false);
  });

  it('removes the saved sender ID after webContents becomes inaccessible', () => {
    const child = fakeWindow(23);
    const contents = child.webContents;
    Object.defineProperty(child, 'webContents', {
      get: () => {
        if (child.isDestroyed()) throw new Error('Object has been destroyed');
        return contents;
      },
    });
    registry.register('display', 'one', child);
    child.close();
    expect(registry.senderIds()).toEqual([]);
    expect(registry.get('display', 'one')).toBeNull();
  });

  it('unregisters on close and closes all children', () => {
    const child = fakeWindow(11);
    registry.register('display', 'one', child);
    registry.closeAll();
    expect(child.close).toHaveBeenCalledTimes(1);
    expect(registry.sender(11)).toBeNull();
    expect(registry.get('display', 'one')).toBeNull();
  });

  it('keeps Git singleton and sender policy separate from Display', async () => {
    registry.registerView('git', { singleton: true, allowedMethods: new Set(['gitWindow:getScope']) });
    const git = fakeWindow(30);
    registry.register('git', 'default', git);
    expect(() => registry.register('git', 'another', fakeWindow(31))).toThrow('already open');
    expect(registry.allows(30, 'gitWindow:getScope')).toBe(true);
    expect(registry.allows(30, 'displayWindow:getState')).toBe(false);
    await registry.loadRenderer('git', git, '/app');
    expect(git.loadFile).toHaveBeenCalledWith(expect.stringContaining('index.html'), { query: { ptahWindow: 'git' } });
    registry.unregister('git', 'default', git);
    expect(registry.sender(30)).toBeNull();
  });
});
