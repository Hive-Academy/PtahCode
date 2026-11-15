import { PHASE_KINDS } from './phase-contract.types';
import {
  RETIRED_ROLES,
  ROLE_PHASE_ALIASES,
  isRetiredRole,
  phaseKindForRole,
} from './retired-roles';

const ENTRIES = Object.entries(ROLE_PHASE_ALIASES);

/** Number of legacy slugs expected for each phase kind. */
const SLUGS_PER_KIND: Readonly<Record<string, number>> = {
  plan: 1,
  architecture: 1,
  batch: 1,
  implement: 3,
  tests: 1,
  review: 2,
  'visual-review': 1,
  research: 2,
  design: 1,
  docs: 1,
};

describe('retired roles', () => {
  it('maps all 14 slugs', () => {
    expect(ENTRIES).toHaveLength(14);
    expect(new Set(Object.keys(ROLE_PHASE_ALIASES)).size).toBe(14);
    for (const [slug, kind] of ENTRIES) {
      expect(phaseKindForRole(slug)).toBe(kind);
    }
  });

  it('keeps the expected slug count for each phase kind', () => {
    const counts: Record<string, number> = {};
    for (const [, kind] of ENTRIES) {
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    expect(counts).toEqual(SLUGS_PER_KIND);
  });

  it('uses only known phase kinds', () => {
    for (const kind of Object.values(ROLE_PHASE_ALIASES)) {
      expect(PHASE_KINDS).toContain(kind);
    }
  });

  it('returns null for unknown and prototype keys', () => {
    for (const slug of [
      'general-purpose',
      'Explore',
      'unknown',
      '',
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
    ]) {
      expect(phaseKindForRole(slug)).toBeNull();
    }
  });

  it('ignores case and surrounding whitespace', () => {
    for (const [slug, kind] of ENTRIES) {
      expect(phaseKindForRole(`  ${slug.toUpperCase()} `)).toBe(kind);
    }
  });

  it('freezes the alias table', () => {
    expect(Object.isFrozen(ROLE_PHASE_ALIASES)).toBe(true);
    expect(Object.isFrozen(RETIRED_ROLES)).toBe(true);
  });

  it('retires implementation roles in step 1 and verification roles in step 2', () => {
    expect(RETIRED_ROLES).toEqual([
      { slug: 'backend-developer', phaseKind: 'implement', step: 1 },
      { slug: 'frontend-developer', phaseKind: 'implement', step: 1 },
      { slug: 'devops-engineer', phaseKind: 'implement', step: 1 },
      { slug: 'code-logic-reviewer', phaseKind: 'review', step: 2 },
      { slug: 'code-style-reviewer', phaseKind: 'review', step: 2 },
      { slug: 'senior-tester', phaseKind: 'tests', step: 2 },
      { slug: 'visual-reviewer', phaseKind: 'visual-review', step: 2 },
    ]);
    expect(isRetiredRole('project-manager')).toBe(false);
  });

  it('keeps each retired entry equal to its alias', () => {
    for (const role of RETIRED_ROLES) {
      expect(role.phaseKind).toBe(ROLE_PHASE_ALIASES[role.slug]);
      expect([1, 2, 3, 4]).toContain(role.step);
      expect(isRetiredRole(` ${role.slug.toUpperCase()} `)).toBe(true);
    }
  });
});
