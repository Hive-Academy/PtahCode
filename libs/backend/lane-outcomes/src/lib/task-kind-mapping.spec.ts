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
