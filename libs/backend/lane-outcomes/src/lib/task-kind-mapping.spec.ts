import { resolveTaskKind, taskKindForRole } from './task-kind-mapping';
import { PHASE_KINDS } from '@ptah-extension/shared';

it.each(['batch', 'completion'])('maps %s to the plan outcome kind', (kind) => {
  expect(taskKindForRole(kind)).toBe('plan');
});

it('classifies explicit kind before phase and phase before role', () => {
  const role = ['backend', 'developer'].join('-');
  expect(resolveTaskKind('tests', 'review', role)).toEqual({
    taskKind: 'tests', taskKindSource: 'explicit',
  });
  expect(resolveTaskKind(null, 'review', role)).toEqual({
    taskKind: 'review', taskKindSource: 'mapped',
  });
  expect(resolveTaskKind(null, null, role)).toEqual({
    taskKind: 'implement', taskKindSource: 'mapped',
  });
});

it.each(PHASE_KINDS)('maps phase %s directly', kind => {
  const result = resolveTaskKind(null, kind, null);
  expect(result.taskKind).not.toBeNull();
  expect(result.taskKindSource).toBe('mapped');
});

it.each([
  ['project-manager', 'plan'],
  ['software-architect', 'plan'],
  ['team-leader', 'plan'],
  ['backend-developer', 'implement'],
  ['frontend-developer', 'implement'],
  ['devops-engineer', 'implement'],
  ['code-logic-reviewer', 'review'],
  ['code-style-reviewer', 'review'],
  ['visual-reviewer', 'review'],
  ['researcher-expert', 'research'],
  ['modernization-detector', 'research'],
  ['senior-tester', 'tests'],
  ['technical-content-writer', 'docs'],
  ['ui-ux-designer', 'docs'],
])('maps legacy role %s to %s', (role, kind) => {
  expect(taskKindForRole(role)).toBe(kind);
  expect(taskKindForRole(` ${role.toUpperCase()} `)).toBe(kind);
});

it.each(['general-purpose', 'Explore', 'unknown', 'constructor'])(
  'returns null for %s',
  (role) => {
    expect(taskKindForRole(role)).toBeNull();
  },
);
