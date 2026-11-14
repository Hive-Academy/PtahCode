import 'reflect-metadata';
import { RpcUserError } from '@ptah-extension/vscode-core';
import { ROLE_PHASE_ALIASES } from '@ptah-extension/shared';

import {
  assertNotBulkRoleRebase,
  assertRoleMutable,
  type RoleMutationAction,
} from './retired-role-guard';

const [RETIRED_SLUG = 'missing-role', ROLE_SLUG = 'missing-role'] =
  Object.keys(ROLE_PHASE_ALIASES);
const ACTIONS: readonly RoleMutationAction[] = [
  'enhance',
  'revert',
  'rebase',
  'keep',
  'save',
];
const retiredBackend = (slug: string): boolean => slug === RETIRED_SLUG;

describe('assertRoleMutable', () => {
  it.each(ACTIONS)('refuses %s for a retired role agent', (action) => {
    let thrown: unknown;
    try {
      assertRoleMutable(action, 'agent', RETIRED_SLUG, retiredBackend);
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
      assertRoleMutable('save', 'skill', RETIRED_SLUG, retiredBackend),
    ).not.toThrow();
  });

  it('allows every role while RETIRED_ROLES is empty (default predicate)', () => {
    for (const action of ACTIONS) {
      expect(() =>
        assertRoleMutable(action, 'agent', RETIRED_SLUG),
      ).not.toThrow();
    }
  });
});

describe('assertNotBulkRoleRebase', () => {
  it('refuses a bulk rebase of a role agent that has not retired', () => {
    expect(() => assertNotBulkRoleRebase('bulk', 'agent', ROLE_SLUG)).toThrow(
      RpcUserError,
    );
  });

  it('allows a single rebase of a role agent', () => {
    expect(() =>
      assertNotBulkRoleRebase('single', 'agent', ROLE_SLUG),
    ).not.toThrow();
  });

  it('allows a bulk rebase of a non-role agent and of a skill', () => {
    expect(() =>
      assertNotBulkRoleRebase('bulk', 'agent', 'my-own-agent'),
    ).not.toThrow();
    expect(() =>
      assertNotBulkRoleRebase('bulk', 'skill', ROLE_SLUG),
    ).not.toThrow();
  });
});
