import { PTAH_CLI_PERMISSION_CAPABILITIES, resolveCliLaneDefaultPair } from './cli-lane-defaults.types';

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

  it('rejects a partial row without a supported pair', () => {
    expect(resolveCliLaneDefaultPair(PTAH_CLI_PERMISSION_CAPABILITIES, { network: 'deny' }))
      .toHaveProperty('unsupported');
  });
});
