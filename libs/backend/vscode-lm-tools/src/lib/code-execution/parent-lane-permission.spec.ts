import 'reflect-metadata';
import { parentLanePermission } from './parent-lane-permission';

describe('parentLanePermission', () => {
  it('reads a Codex thread behind a tab and preserves its plan cap', () => {
    const codex = { getPermissionLevel: jest.fn(() => 'plan' as const) };
    expect(parentLanePermission('tab', { find: () => ({ realSessionId: 'thread' }) }, codex)).toBe('plan');
    expect(codex.getPermissionLevel).toHaveBeenCalledWith('thread');
  });

  it('caps unknown bound sessions and allows callers with no parent to bypass the lookup', () => {
    expect(parentLanePermission('unknown', { find: () => undefined }, undefined)).toBe('plan');
    const maybeCaller: string | undefined = undefined;
    expect(maybeCaller ? parentLanePermission(maybeCaller, undefined, undefined) : undefined).toBeUndefined();
  });

  it('delegates Codex tab resolution to the shared resolver', () => {
    const codex = {
      resolveLiveSessionId: jest.fn(() => 'live-thread'),
      getPermissionLevel: jest.fn(() => 'auto-edit' as const),
    };
    expect(parentLanePermission('tab', undefined, codex)).toBe('auto-edit');
    expect(codex.getPermissionLevel).toHaveBeenCalledWith('live-thread');
  });
});
