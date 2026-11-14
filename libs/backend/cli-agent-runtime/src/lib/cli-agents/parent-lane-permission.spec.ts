import { parentLanePermission } from './parent-lane-permission';

describe('parentLanePermission', () => {
  const lifecycle = { find: (_id: string) => undefined };
  const levels = new Map([['thread', 'auto-edit']]);
  const codex = {
    resolveLiveSessionId: jest.fn((id: string) => id === 'tab' ? 'thread' : id),
    getPermissionLevel: jest.fn((id: string) => levels.get(id)),
  };

  beforeEach(() => jest.clearAllMocks());

  it('resolves a tab id to its live permission level', () => {
    expect(parentLanePermission('tab', lifecycle, codex)).toBe('auto-edit');
    expect(codex.getPermissionLevel).toHaveBeenCalledWith('thread');
  });

  it('accepts a live thread id without changing it', () => {
    expect(parentLanePermission('thread', lifecycle, codex)).toBe('auto-edit');
    expect(codex.resolveLiveSessionId).toHaveBeenCalledWith('thread');
  });

  it('caps an unknown bound id to plan', () => {
    expect(parentLanePermission('unknown', lifecycle, codex)).toBe('plan');
  });

  it.each([undefined, '', '  '])('leaves absent or blank caller %p parentless', (id) => {
    expect(parentLanePermission(id, lifecycle, codex)).toBeUndefined();
    expect(codex.getPermissionLevel).not.toHaveBeenCalled();
  });

  it('uses the lifecycle permission when Codex has none', () => {
    expect(parentLanePermission('other', { find: () => ({ permissionLevel: 'yolo' }) }, codex)).toBe('yolo');
  });

  it('does not cap an ask parent', () => {
    expect(parentLanePermission('other', { find: () => ({ permissionLevel: 'ask' }) }, codex)).toBeUndefined();
  });
});
