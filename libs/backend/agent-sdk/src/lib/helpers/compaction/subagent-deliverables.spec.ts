import * as notesPaths from './subagent-notes-path';
import * as path from 'node:path';
import { parseSubagentDeliverables, SubagentDeliverables } from './subagent-deliverables';

describe('explicit subagent deliverables', () => {
  it('parses only marked single paths and bullet lists, ignores globs and caps declarations', () => {
    expect(parseSubagentDeliverables('Please write prose.md\nDeliverable: `one.md`\ndELIVERABLES:\n- two.md\n* `three.md`\n- *.ts\nEnd list\n- ignored.md')).toEqual(['one.md', 'two.md', 'three.md']);
    expect(parseSubagentDeliverables('Deliverables:\n' + Array.from({ length: 25 }, (_, i) => `- ${i}.md`).join('\n'))).toHaveLength(20);
    expect(parseSubagentDeliverables({ prompt: 'Deliverable: invalid.md' })).toEqual([]);
  });

  it('isolates agents, rejects escapes, and releases recorded mutations after rekey', () => {
    const root = process.cwd();
    const ledger = new SubagentDeliverables();
    ledger.record('session', 'agent', 'Read', { file_path: 'read.md' }, root);
    ledger.record('session', 'agent', 'Write', { file_path: '../outside.md' }, root);
    ledger.record('session', 'agent', 'Edit', { file_path: 'edited.md' }, root);
    expect(ledger.permitted('agent', ['declared.md', '../outside.md'], root)).toEqual([path.join(root, 'edited.md'), path.join(root, 'declared.md')]);
    expect(ledger.permitted('sibling', [], root)).toEqual([]);
    ledger.rekey('session', 'new-session'); ledger.release('session');
    expect(ledger.permitted('agent', [], root)).toHaveLength(1);
    ledger.release('new-session'); expect(ledger.permitted('agent', [], root)).toEqual([]);
  });
});


it('retains the 50 most recently mutated paths and releases one finished agent', () => {
  const root = process.cwd(); const ledger = new SubagentDeliverables();
  for (let i = 0; i < 50; i++) ledger.record('session', 'agent', 'Write', { file_path: `${i}.md` }, root);
  ledger.record('session', 'agent', 'Edit', { file_path: '0.md' }, root);
  ledger.record('session', 'agent', 'Write', { file_path: '50.md' }, root);
  const permitted = ledger.permitted('agent', [], root);
  expect(permitted).toHaveLength(50);
  expect(permitted).toContain(path.join(root, '0.md'));
  expect(permitted).not.toContain(path.join(root, '1.md'));
  expect(permitted.at(-1)).toBe(path.join(root, '50.md'));
  ledger.record('session', 'sibling', 'Write', { file_path: 'sibling.md' }, root);
  ledger.finish('agent'); expect(ledger.permitted('agent', [], root)).toEqual([]);
  expect(ledger.permitted('sibling', [], root)).toHaveLength(1);
});

it('excludes mutation paths and logs debug when realpath containment throws EACCES', () => {
  const logger = { debug: jest.fn() }; const ledger = new SubagentDeliverables();
  const spy = jest.spyOn(notesPaths, 'insideNotesWorkspace').mockImplementationOnce(() => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }); });
  try {
    expect(() => ledger.record('session', 'agent', 'Write', { file_path: 'denied.md' }, process.cwd(), logger)).not.toThrow();
    expect(ledger.permitted('agent', [], process.cwd())).toEqual([]);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('path excluded'), { errorKind: 'Error' });
  } finally { spy.mockRestore(); }
});

it('rejects prose and URLs but accepts explicit quoted filenames and path-like tokens', () => {
  expect(parseSubagentDeliverables('Deliverable: a summary of findings\nDeliverable: https://example.com/review.md\nDeliverable: `https://example.com/review.md`\nDeliverable: mailto:review@example.com\nDeliverable: C:/repo/review.md\nDeliverable: review.md\nDeliverable: docs/review\nDeliverable: `a summary.md`')).toEqual(['C:/repo/review.md', 'review.md', 'docs/review', 'a summary.md']);
});
