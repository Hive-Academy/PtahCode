import { modelPickerGroups } from './model-picker-groups';

const pinned = (values: string[]) => values.map((value) => ({ value, resolvedModel: value }));

describe('modelPickerGroups', () => {
  const old = [
    'claude-fable-5-1', 'claude-haiku-4-5-20251001', 'claude-sonnet-5',
    'claude-opus-5', 'claude-fable-5', 'claude-opus-4-8',
    'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6',
  ];

  it('uses the final alias in CLI 2.1.321', () => {
    const rows = [
      { value: 'default', resolvedModel: 'claude-fable-5-2' },
      { value: 'opus', resolvedModel: 'claude-opus-5-5' },
      { value: 'fable', resolvedModel: 'claude-fable-5-2' },
      { value: 'sonnet', resolvedModel: 'claude-sonnet-5-5' },
      { value: 'haiku', resolvedModel: 'claude-haiku-5-5' },
      ...pinned(old),
    ];
    expect(modelPickerGroups(rows)).toEqual([
      ...Array(5).fill('primary'), ...Array(9).fill('other'),
    ]);
  });

  it('uses the later Fable alias in CLI 2.1.318', () => {
    const rows = [
      { value: 'default', resolvedModel: 'claude-fable-5-2' },
      { value: 'opus', resolvedModel: 'claude-opus-5-5' },
      ...pinned(['claude-fable-5-2']),
      { value: 'sonnet', resolvedModel: 'claude-sonnet-5-5' },
      { value: 'haiku', resolvedModel: 'claude-haiku-5-5' },
      { value: 'fable', resolvedModel: 'claude-fable-5-1' },
      ...pinned(old.slice(1)),
    ];
    expect(modelPickerGroups(rows)).toEqual([
      ...Array(6).fill('primary'), ...Array(8).fill('other'),
    ]);
  });

  it('keeps a Codex proxy catalog together', () => {
    const rows = [
      { value: 'default', resolvedModel: 'gpt-6.1-sol[1m]' },
      ...pinned(['gpt-6.1-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']),
    ];
    expect(modelPickerGroups(rows)).toEqual(Array(4).fill('primary'));
  });

  it('ignores a context suffix when detecting an alias', () => {
    expect(modelPickerGroups([
      { value: 'default' },
      { value: 'claude-fable-5-2[1m]', resolvedModel: 'claude-fable-5-2' },
      { value: 'older', resolvedModel: 'older' },
    ])).toEqual(Array(3).fill('primary'));
  });
});
