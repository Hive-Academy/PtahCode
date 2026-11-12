import { taskKindForRole } from './task-kind-mapping';

it.each(['batch', 'completion'])('maps %s to the plan outcome kind', (kind) => {
  expect(taskKindForRole(kind)).toBe('plan');
});
