import { PHASE_KINDS } from './phase-contract.types';
import {
  RETIRED_ROLES,
  ROLE_PHASE_ALIASES,
  isRetiredRole,
  phaseKindForRole,
} from './retired-roles';

const EXPECTED: Readonly<Record<string, string>> = {
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
};

describe('retired roles', () => {
  it('maps all 14 slugs', () => {
    expect(Object.keys(ROLE_PHASE_ALIASES)).toHaveLength(14);
    for (const [slug, kind] of Object.entries(EXPECTED)) {
      expect(phaseKindForRole(slug)).toBe(kind);
    }
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
    expect(phaseKindForRole('  Software-Architect ')).toBe('architecture');
  });

  it('freezes the alias table', () => {
    expect(Object.isFrozen(ROLE_PHASE_ALIASES)).toBe(true);
    expect(Object.isFrozen(RETIRED_ROLES)).toBe(true);
  });

  it('starts with no retired role', () => {
    expect(RETIRED_ROLES).toHaveLength(0);
    expect(isRetiredRole('backend-developer')).toBe(false);
  });

  it('keeps each retired entry equal to its alias', () => {
    for (const role of RETIRED_ROLES) {
      expect(role.phaseKind).toBe(ROLE_PHASE_ALIASES[role.slug]);
      expect(isRetiredRole(` ${role.slug.toUpperCase()} `)).toBe(true);
    }
  });
});
