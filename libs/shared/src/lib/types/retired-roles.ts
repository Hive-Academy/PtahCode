import type { PhaseKind } from './phase-contract.types';

/** A legacy role slug that Phase 4 retired, with the phase that replaces it. */
export interface RetiredRoleV1 {
  readonly slug: string;
  readonly phaseKind: PhaseKind;
  /** Phase 4 step that retired the role. */
  readonly step: 1 | 2 | 3 | 4;
}

/**
 * The phase kind that each of the 14 legacy role slugs maps to. Values come
 * from the compatibility appendix of the orchestration `agent-catalog.md`.
 * This is the only alias table: consumers read it through
 * {@link phaseKindForRole}.
 */
export const ROLE_PHASE_ALIASES: Readonly<Record<string, PhaseKind>> =
  Object.freeze({
    'project-manager': 'plan',
    'software-architect': 'architecture',
    'team-leader': 'batch',
    'backend-developer': 'implement',
    'frontend-developer': 'implement',
    'devops-engineer': 'implement',
    'senior-tester': 'tests',
    'code-style-reviewer': 'review',
    'code-logic-reviewer': 'review',
    'visual-reviewer': 'visual-review',
    'researcher-expert': 'research',
    'modernization-detector': 'research',
    'ui-ux-designer': 'design',
    'technical-content-writer': 'docs',
  } satisfies Record<string, PhaseKind>);

/**
 * The roles that Phase 4 retired so far. Each Phase 4 step adds its roles.
 * Every entry must use the phase kind of {@link ROLE_PHASE_ALIASES}.
 */
export const RETIRED_ROLES: readonly RetiredRoleV1[] = Object.freeze([]);

function normalize(slug: string): string {
  return slug.trim().toLowerCase();
}

/** True when the slug (case-insensitive, trimmed) is a retired role. */
export function isRetiredRole(slug: string): boolean {
  const key = normalize(slug);
  return RETIRED_ROLES.some((role) => role.slug === key);
}

/**
 * The phase kind for a legacy role slug (case-insensitive, trimmed), or null
 * for an unknown slug such as `general-purpose`, `Explore` or `unknown`.
 */
export function phaseKindForRole(slug: string): PhaseKind | null {
  const key = normalize(slug);
  return Object.prototype.hasOwnProperty.call(ROLE_PHASE_ALIASES, key)
    ? ROLE_PHASE_ALIASES[key]
    : null;
}
