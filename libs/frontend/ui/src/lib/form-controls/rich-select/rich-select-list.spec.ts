import { buildGroups, flatItems, matchesQuery, moveActive, typeAheadIndex } from './rich-select-list';
import type { PtahSelectOption } from './rich-select.types';

const OPTIONS: PtahSelectOption<string>[] = [
  { value: 'a', label: 'Anthropic', group: 'Cloud' },
  { value: 'o', label: 'Ollama', group: 'Local', keywords: ['llama'] },
  { value: 'x', label: 'OpenAI', group: 'Cloud', disabled: true },
  { value: 'c', label: 'Custom', description: 'Any URL' },
];

describe('rich select list helpers', () => {
  it('groups options in the order of the first option of each group', () => {
    const groups = buildGroups(OPTIONS, '', 's');
    expect(groups.map((g) => g.name)).toEqual(['Cloud', 'Local', null]);
    expect(groups[0].items.map((i) => i.option.value)).toEqual(['a', 'x']);
    expect(flatItems(groups).map((i) => i.index)).toEqual([0, 1, 2, 3]);
    expect(flatItems(groups)[0].id).toBe('s-option-0');
  });

  it('matches each word in the label, description, group or keywords', () => {
    expect(matchesQuery(OPTIONS[1], 'lla')).toBe(true);
    expect(matchesQuery(OPTIONS[3], 'any url')).toBe(true);
    expect(matchesQuery(OPTIONS[0], 'cloud anth')).toBe(true);
    expect(matchesQuery(OPTIONS[0], 'local')).toBe(false);
    expect(flatItems(buildGroups(OPTIONS, 'zzz', 's'))).toHaveLength(0);
  });

  it('moves the active option past disabled options and stops at the ends', () => {
    const items = flatItems(buildGroups(OPTIONS, '', 's'));
    // Order: Anthropic, OpenAI (disabled), Ollama, Custom.
    expect(moveActive(items, 0, 'next')).toBe(2);
    expect(moveActive(items, 2, 'previous')).toBe(0);
    expect(moveActive(items, 0, 'previous')).toBe(0);
    expect(moveActive(items, -1, 'last')).toBe(3);
    expect(moveActive(items, 3, 'first')).toBe(0);
  });

  it('finds the next option that starts with the typed text', () => {
    const items = flatItems(buildGroups(OPTIONS, '', 's'));
    expect(typeAheadIndex(items, 'o', 0)).toBe(2);
    expect(typeAheadIndex(items, 'c', 0)).toBe(3);
    expect(typeAheadIndex(items, 'q', 0)).toBe(-1);
  });
});
