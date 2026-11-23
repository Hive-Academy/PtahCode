import {
  CLI_LANE_BUILT_IN_NETWORK_ORDER, CLI_LANE_BUILT_IN_PERMISSION_ORDER, PTAH_CLI_PERMISSION_CAPABILITIES, resolveCliLaneDefaultPair,
} from './cli-lane-defaults.types';

describe('resolveCliLaneDefaultPair', () => {
  it('fills the built-in pair from supported capabilities', () => {
    expect(resolveCliLaneDefaultPair(PTAH_CLI_PERMISSION_CAPABILITIES)).toEqual({
      permission: 'yolo', network: 'allow', permissionSource: 'built-in', networkSource: 'built-in',
    });
  });

  it('fills a saved partial row with a supported companion field', () => {
    expect(resolveCliLaneDefaultPair(PTAH_CLI_PERMISSION_CAPABILITIES, { permission: 'plan' })).toEqual({
      permission: 'plan', network: 'allow', permissionSource: 'saved', networkSource: 'built-in',
    });
  });

  it('walks the built-in order to the first supported permission and network', () => {
    expect(resolveCliLaneDefaultPair({
      permissionModes: {
        plan: { state: 'supported', networkModes: ['deny'] },
        ask: { state: 'supported', networkModes: ['deny'] },
        yolo: { state: 'unsupported', reason: 'no flag', networkModes: [] },
      },
      networkModes: { allow: { state: 'supported' }, deny: { state: 'supported' } },
    })).toEqual({ permission: 'ask', network: 'deny', permissionSource: 'built-in', networkSource: 'built-in' });
  });

  it('has no default when no permission mode is supported', () => {
    expect(resolveCliLaneDefaultPair({
      permissionModes: { plan: { state: 'unsupported', reason: 'none', networkModes: [] } },
      networkModes: { allow: { state: 'supported' }, deny: { state: 'supported' } },
    })).toHaveProperty('unsupported');
  });

  it('exports the most capable first built-in orders', () => {
    expect(CLI_LANE_BUILT_IN_PERMISSION_ORDER).toEqual(['yolo', 'auto-edit', 'ask', 'plan']);
    expect(CLI_LANE_BUILT_IN_NETWORK_ORDER).toEqual(['allow', 'deny']);
  });

  it('rejects a partial row without a supported pair', () => {
    expect(resolveCliLaneDefaultPair(PTAH_CLI_PERMISSION_CAPABILITIES, { network: 'deny' }))
      .toHaveProperty('unsupported');
  });
});
