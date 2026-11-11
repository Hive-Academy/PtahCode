import { effectiveTaskStatus } from './task-status-overlay';

describe('effectiveTaskStatus', () => {
  it.each([
    ['in_review', true, 'done'],
    ['in_progress', true, 'done'],
    ['in_review', false, 'in_review'],
    ['in_progress', false, 'in_progress'],
    ['backlog', true, 'backlog'],
    ['cancelled', true, 'cancelled'],
    ['done', false, 'done'],
  ] as const)('%s merged=%s yields %s', (carrier, merged, expected) => {
    expect(effectiveTaskStatus(carrier, merged)).toBe(expected);
  });
});
