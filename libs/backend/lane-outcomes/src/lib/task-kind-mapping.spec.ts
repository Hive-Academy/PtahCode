import { resolveTaskKind, taskKindForRole } from './task-kind-mapping';
import { PHASE_KINDS, ROLE_PHASE_ALIASES } from '@ptah-extension/shared';

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

const TASK_KIND_FOR_PHASE: Readonly<Record<string, string>> = {
  plan: 'plan',
  architecture: 'plan',
  batch: 'plan',
  implement: 'implement',
  review: 'review',
  'visual-review': 'review',
  research: 'research',
  tests: 'tests',
  docs: 'docs',
  design: 'docs',
};

it.each(Object.entries(ROLE_PHASE_ALIASES))(
  'maps legacy role %s through phase %s',
  (role, phase) => {
    const kind = TASK_KIND_FOR_PHASE[phase];
    expect(kind).toBeDefined();
    expect(taskKindForRole(role)).toBe(kind);
    expect(taskKindForRole(` ${role.toUpperCase()} `)).toBe(kind);
  },
);

it.each(['general-purpose', 'Explore', 'unknown', 'constructor'])(
  'returns null for %s',
  (role) => {
    expect(taskKindForRole(role)).toBeNull();
  },
);
