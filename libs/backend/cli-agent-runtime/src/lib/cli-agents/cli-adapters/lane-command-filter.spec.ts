import {
  blockedLaneCommand,
  blockedLaneCommandReason,
  filterLaneCommands,
  isRawCommandDelivery,
  leadingLaneCommand,
  matchesLaneCommand,
} from './lane-command-filter';

describe('lane-command-filter', () => {
  const hidden = ['always-approve'] as const;

  it('recognises a raw /command delivery only when the text is the trimmed raw body', () => {
    expect(isRawCommandDelivery('/context', '  /context')).toBe(true);
    expect(isRawCommandDelivery('[Ptah message m1 from the user]\n\n/context', '/context')).toBe(false);
    expect(isRawCommandDelivery('hello', 'hello')).toBe(false);
    expect(isRawCommandDelivery('/context', undefined)).toBe(false);
  });

  it('drops hidden names from the list, case-insensitively', () => {
    const commands = [
      { name: 'compact', description: 'Compact' },
      { name: 'Always-Approve', description: 'Toggle' },
      { name: 'context' },
    ];
    expect(filterLaneCommands(commands, hidden).map((c) => c.name)).toEqual(['compact', 'context']);
    expect(filterLaneCommands(commands, [])).toEqual(commands);
  });

  it.each(['/always-approve on', '  /always-approve', '\n/Always-Approve off'])(
    'detects %j as blocked',
    (text) => {
      expect(blockedLaneCommand(text, hidden)).toBe('always-approve');
    },
  );

  it.each(['please /always-approve', '/always-approved', 'ordinary text', '/', ''])(
    'does not block %j',
    (text) => {
      expect(blockedLaneCommand(text, hidden)).toBeUndefined();
    },
  );

  it('blocks nothing with an empty hidden list', () => {
    expect(blockedLaneCommand('/always-approve on', [])).toBeUndefined();
  });

  it('reads the leading command token and matches advertised names', () => {
    expect(leadingLaneCommand('  /compact now')).toBe('compact');
    expect(leadingLaneCommand('compact')).toBeUndefined();
    expect(matchesLaneCommand('/Compact', ['compact'])).toBe(true);
    expect(matchesLaneCommand('/compacted', ['compact'])).toBe(false);
  });

  it('words the refusal with the command name', () => {
    expect(blockedLaneCommandReason('always-approve')).toBe(
      'Ptah does not allow /always-approve in a lane: its approval mode is set at spawn.',
    );
  });
});
