import { resolveTaskKind, taskKindForRole } from './task-kind-mapping';

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
