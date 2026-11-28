import { parentLanePermission } from './parent-lane-permission';

describe('parentLanePermission', () => {
  const lifecycle = { find: (_id: string) => undefined };
  const levels = new Map([['thread', 'auto-edit']]);
  const codex = {
    resolveLiveSessionId: jest.fn((id: string) =>
      id === 'tab' ? 'thread' : id,
    ),
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

  it('leaves an unknown bound id uncapped on resume', () => {
    expect(
      parentLanePermission('unknown', lifecycle, codex, {
        unknownParent: 'uncapped',
      }),
    ).toBeUndefined();
  });

  it('still caps a live plan parent on resume', () => {
    expect(
      parentLanePermission(
        'other',
        { find: () => ({ permissionLevel: 'plan' }) },
        codex,
        { unknownParent: 'uncapped' },
      ),
    ).toBe('plan');
  });

  it.each([undefined, '', '  '])(
    'leaves absent or blank caller %p parentless',
    (id) => {
      expect(parentLanePermission(id, lifecycle, codex)).toBeUndefined();
      expect(codex.getPermissionLevel).not.toHaveBeenCalled();
    },
  );

  it('uses the lifecycle permission when Codex has none', () => {
    expect(
      parentLanePermission(
        'other',
        { find: () => ({ permissionLevel: 'yolo' }) },
        codex,
      ),
    ).toBe('yolo');
  });

  it.each(['plan', 'ask', 'auto-edit', 'yolo'])(
    'inherits Claude mode %s',
    (permissionLevel) => {
      expect(
        parentLanePermission('other', { find: () => ({ permissionLevel }) }, codex),
      ).toBe(permissionLevel);
    },
  );

  it('caps unrecognized Claude permission metadata to plan on spawn', () => {
    expect(
      parentLanePermission('other', { find: () => ({ permissionLevel: 'unknown' }) }, codex),
    ).toBe('plan');
  });

  describe('live provider-session callers (Antigravity)', () => {
    it.each([
      ['yolo', 'yolo'],
      ['auto-edit', 'auto-edit'],
      ['plan', 'plan'],
      ['ask', 'ask'],
    ] as const)(
      'resolves live provider-session level %s to %p instead of failing closed to plan',
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
          parentLanePermission('ag-tab', lifecycle, codex, {
            providerSessions,
          }),
        ).toBe(expected);
        expect(providerSessions.resolveLiveSessionId).toHaveBeenCalledWith(
          'ag-tab',
        );
        expect(providerSessions.getPermissionLevel).toHaveBeenCalledWith(
          'ag-conv-1',
        );
      },
    );

    it('still caps an unknown caller to plan when neither Codex nor provider sessions know it', () => {
      const providerSessions = {
        resolveLiveSessionId: jest.fn(() => undefined),
        getPermissionLevel: jest.fn(() => undefined),
      };

      expect(
        parentLanePermission('unknown-ag-tab', lifecycle, codex, {
          providerSessions,
        }),
      ).toBe('plan');
    });

    it('leaves an unknown caller uncapped on resume when provider sessions are present', () => {
      const providerSessions = {
        resolveLiveSessionId: jest.fn(() => undefined),
        getPermissionLevel: jest.fn(() => undefined),
      };

      expect(
        parentLanePermission('unknown-ag-tab', lifecycle, codex, {
          unknownParent: 'uncapped',
          providerSessions,
        }),
      ).toBeUndefined();
    });
  });
});
