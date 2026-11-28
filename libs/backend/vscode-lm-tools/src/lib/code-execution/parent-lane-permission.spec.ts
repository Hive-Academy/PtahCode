import 'reflect-metadata';
import { parentLanePermission } from './parent-lane-permission';

describe('parentLanePermission', () => {
  it('reads a Codex thread behind a tab and preserves its plan cap', () => {
    const codex = { getPermissionLevel: jest.fn(() => 'plan' as const) };
    expect(
      parentLanePermission(
        'tab',
        { find: () => ({ realSessionId: 'thread' }) },
        codex,
      ),
    ).toBe('plan');
    expect(codex.getPermissionLevel).toHaveBeenCalledWith('thread');
  });

  it('caps unknown bound sessions and allows callers with no parent to bypass the lookup', () => {
    expect(
      parentLanePermission('unknown', { find: () => undefined }, undefined),
    ).toBe('plan');
    const maybeCaller: string | undefined = undefined;
    expect(
      maybeCaller
        ? parentLanePermission(maybeCaller, undefined, undefined)
        : undefined,
    ).toBeUndefined();
  });

  it('delegates Codex tab resolution to the shared resolver', () => {
    const codex = {
      resolveLiveSessionId: jest.fn(() => 'live-thread'),
      getPermissionLevel: jest.fn(() => 'auto-edit' as const),
    };
    expect(parentLanePermission('tab', undefined, codex)).toBe('auto-edit');
    expect(codex.getPermissionLevel).toHaveBeenCalledWith('live-thread');
  });

  it.each([
    ['yolo', 'yolo'],
    ['auto-edit', 'auto-edit'],
    ['plan', 'plan'],
    ['ask', 'ask'],
  ] as const)(
    'resolves a live provider-session (Antigravity) caller with level %s to %p',
    (liveLevel, expected) => {
      const providerSessions = {
        resolveLiveSessionId: jest.fn((id: string) =>
          id === 'ag-tab' ? 'ag-conv-1' : undefined,
        ),
        getPermissionLevel: jest.fn((id: string) =>
          id === 'ag-conv-1' ? liveLevel : undefined,
        ),
      };

      expect(
        parentLanePermission('ag-tab', undefined, undefined, providerSessions),
      ).toBe(expected);
      expect(providerSessions.resolveLiveSessionId).toHaveBeenCalledWith(
        'ag-tab',
      );
      expect(providerSessions.getPermissionLevel).toHaveBeenCalledWith(
        'ag-conv-1',
      );
    },
  );

  it('caps unknown bound sessions to plan when provider sessions do not recognize them', () => {
    const providerSessions = {
      resolveLiveSessionId: jest.fn(() => undefined),
      getPermissionLevel: jest.fn(() => undefined),
    };

    expect(
      parentLanePermission(
        'unknown',
        { find: () => undefined },
        undefined,
        providerSessions,
      ),
    ).toBe('plan');
  });
});
