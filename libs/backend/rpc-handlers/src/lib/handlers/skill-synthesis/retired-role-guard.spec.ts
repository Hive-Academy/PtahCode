import 'reflect-metadata';
import { RpcUserError } from '@ptah-extension/vscode-core';

import {
  assertNotBulkRoleRebase,
  assertRoleMutable,
  type RoleMutationAction,
} from './retired-role-guard';

const ACTIONS: readonly RoleMutationAction[] = [
  'enhance',
  'revert',
  'rebase',
  'keep',
  'save',
];
const retiredBackend = (slug: string): boolean => slug === 'backend-developer';

describe('assertRoleMutable', () => {
  it.each(ACTIONS)('refuses %s for a retired role agent', (action) => {
    let thrown: unknown;
    try {
      assertRoleMutable(action, 'agent', 'backend-developer', retiredBackend);
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RpcUserError);
    expect((thrown as RpcUserError).errorCode).toBe('ROLE_RETIRED');
  });

  it('allows a non-role slug', () => {
    expect(() =>
      assertRoleMutable('save', 'agent', 'my-own-agent', retiredBackend),
    ).not.toThrow();
  });

  it('allows a retired slug of another kind', () => {
    expect(() =>
      assertRoleMutable('save', 'skill', 'backend-developer', retiredBackend),
    ).not.toThrow();
  });

  it('allows every role while RETIRED_ROLES is empty (default predicate)', () => {
    for (const action of ACTIONS) {
      expect(() =>
        assertRoleMutable(action, 'agent', 'backend-developer'),
      ).not.toThrow();
    }
  });
});

describe('assertNotBulkRoleRebase', () => {
  it('refuses a bulk rebase of a role agent that has not retired', () => {
    expect(() =>
      assertNotBulkRoleRebase('bulk', 'agent', 'team-leader'),
    ).toThrow(RpcUserError);
  });

  it('allows a single rebase of a role agent', () => {
    expect(() =>
      assertNotBulkRoleRebase('single', 'agent', 'team-leader'),
    ).not.toThrow();
  });

  it('allows a bulk rebase of a non-role agent and of a skill', () => {
    expect(() =>
      assertNotBulkRoleRebase('bulk', 'agent', 'my-own-agent'),
    ).not.toThrow();
    expect(() =>
      assertNotBulkRoleRebase('bulk', 'skill', 'team-leader'),
    ).not.toThrow();
  });
});
