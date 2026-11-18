import { notesWarningError, SubagentNotesWarnings } from './subagent-notes-warnings';

it('bounds and removes paths from setup error messages', () => {
  const value = notesWarningError(new TypeError('Cannot access /private/work/file.md or "folder with spaces/file.md": ' + 'details '.repeat(100)));
  expect(value).toMatch(/^TypeError: Cannot access \[path\]/);
  expect(value).not.toContain('private'); expect(value).not.toContain('folder');
  expect(value.length).toBeLessThanOrEqual(200);
  expect(notesWarningError('arbitrary external payload')).toBe('Unknown error');
});

it('caps failures per agent, resets successful attempts, and cleans up on finish or session release', () => {
  const warnings = new SubagentNotesWarnings(); const logger = { error: jest.fn() };
  const fail = jest.fn(() => { throw new Error('setup failed'); });
  for (let i = 0; i < 5; i++) expect(warnings.run('session', 'agent', logger, fail)).toBe(false);
  expect(fail).toHaveBeenCalledTimes(3); expect(logger.error).toHaveBeenCalledTimes(3);
  expect(warnings.run('session', 'sibling', logger, () => undefined)).toBe(true);
  warnings.finish('agent'); expect(warnings.run('session', 'agent', logger, () => undefined)).toBe(true);
  warnings.run('session', 'agent', logger, fail); warnings.rekey('session', 'new-session'); warnings.release('new-session');
  expect(warnings.run('new-session', 'agent', logger, () => undefined)).toBe(true);
});
