/**
 * Read-only guard for retired role agents (Phase 4, U-D13 (4) and (5)).
 *
 * Host-neutral and free of DI: the `skillSynthesis:*` handlers call it before
 * a write. Lists, history and snapshot-body reads never call it.
 *
 * MARKER FINDING. No reliable marker separates a Ptah-generated role file from
 * a user-written file of the same slug: the registry row, the
 * `.ptah-origin.json` sidecar and the workspace `.claude/agents/<slug>.md`
 * carry no generated-by key. The refusal therefore applies to the slug.
 */
import { RpcUserError } from '@ptah-extension/vscode-core';
import {
  isRetiredRole,
  phaseKindForRole,
  type SkillCloneKind,
} from '@ptah-extension/shared';

/** The clone writes that a retired role refuses. */
export type RoleMutationAction =
  | 'enhance'
  | 'revert'
  | 'rebase'
  | 'keep'
  | 'save';

/** How the caller decides that a slug is a retired role. */
export type RetiredRolePredicate = (slug: string) => boolean;

const ROLE_RETIRED_MESSAGE =
  'This role was replaced by a phase. It is read-only history now, so you cannot change it.';

/**
 * Refuse a write to a retired role agent with `ROLE_RETIRED`.
 *
 * @param isRetired injectable predicate; the default reads `RETIRED_ROLES`
 */
export function assertRoleMutable(
  action: RoleMutationAction,
  kind: SkillCloneKind,
  slug: string,
  isRetired: RetiredRolePredicate = isRetiredRole,
): void {
  if (kind === 'agent' && isRetired(slug)) {
    throw new RpcUserError(ROLE_RETIRED_MESSAGE, 'ROLE_RETIRED');
  }
}

/**
 * Refuse a bulk-origin rebase of any role agent, retired or not. A single
 * rebase of a role that has not retired stays allowed.
 */
export function assertNotBulkRoleRebase(
  origin: 'single' | 'bulk',
  kind: SkillCloneKind,
  slug: string,
): void {
  if (origin === 'bulk' && kind === 'agent' && phaseKindForRole(slug) !== null) {
    throw new RpcUserError(
      'A role agent is not rebased in bulk. Rebase it from its own card.',
      'INVALID_PARAMS',
    );
  }
}
