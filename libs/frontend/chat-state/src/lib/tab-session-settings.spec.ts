import { resolveTabEffort, resolveTabModel } from './tab-session-settings';

const origin = {
  parentTabId: 'parent',
  parentSessionId: null,
  label: 'child',
  branch: 'b',
  worktreePath: 'w',
  startedAt: 1,
};

describe('resolveTabModel', () => {
  it('prefers the tab override over the session model and the global model', () => {
    expect(
      resolveTabModel(
        { overrideModel: 'a', sessionModel: 'b', agentOrigin: { ...origin, model: 'c' } },
        'd',
      ),
    ).toEqual({ model: 'a', origin: 'override' });
  });

  it('uses the model a parent pinned for a child before the global model', () => {
    expect(
      resolveTabModel({ agentOrigin: { ...origin, model: 'haiku' } }, 'default'),
    ).toEqual({ model: 'haiku', origin: 'session' });
  });

  it('uses the model restored with the session before the global model', () => {
    expect(resolveTabModel({ sessionModel: 'restored' }, 'default')).toEqual({
      model: 'restored',
      origin: 'session',
    });
  });

  it('falls back to the global model, or null when there is none', () => {
    expect(resolveTabModel({}, 'default')).toEqual({ model: 'default', origin: 'global' });
    expect(resolveTabModel(undefined, undefined)).toEqual({ model: null, origin: 'global' });
  });
});

describe('resolveTabEffort', () => {
  it('keeps the three states of the override', () => {
    expect(resolveTabEffort({ overrideEffort: 'low' }, 'high')).toEqual({
      effort: 'low',
      origin: 'override',
    });
    // null is an explicit "default" choice: it beats the global effort.
    expect(resolveTabEffort({ overrideEffort: null }, 'high')).toEqual({
      effort: null,
      origin: 'override',
    });
    expect(resolveTabEffort({ overrideEffort: undefined }, 'high')).toEqual({
      effort: 'high',
      origin: 'global',
    });
  });

  it('uses the effort a parent pinned for a child before the global effort', () => {
    expect(
      resolveTabEffort({ agentOrigin: { ...origin, effort: 'xhigh' } }, 'medium'),
    ).toEqual({ effort: 'xhigh', origin: 'session' });
  });
});
