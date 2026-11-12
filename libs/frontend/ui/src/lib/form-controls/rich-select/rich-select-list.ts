import type {
  PtahSelectGroup,
  PtahSelectItem,
  PtahSelectOption,
} from './rich-select.types';

/** Lower case and no diacritics, for the search and the type-ahead. */
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** True when each word of the query occurs in the label, description, group or keywords. */
export function matchesQuery<T>(option: PtahSelectOption<T>, query: string): boolean {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeText(
    [option.label, option.description, option.group, ...(option.keywords ?? [])]
      .filter(Boolean)
      .join(' '),
  );
  return words.every((word) => haystack.includes(word));
}

/**
 * Filters the options with the query and puts them in groups. The groups keep
 * the order of their first option. The index of each item is its position in
 * the flat list, which the keyboard path uses.
 */
export function buildGroups<T>(
  options: readonly PtahSelectOption<T>[],
  query: string,
  idPrefix: string,
): PtahSelectGroup<T>[] {
  const order: (string | null)[] = [];
  const buckets = new Map<string | null, PtahSelectOption<T>[]>();
  for (const option of options) {
    if (!matchesQuery(option, query)) continue;
    const key = option.group ?? null;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)?.push(option);
  }
  let index = 0;
  return order.map((name, groupIndex) => ({
    name,
    headerId: `${idPrefix}-group-${groupIndex}`,
    items: (buckets.get(name) ?? []).map((option) => {
      const item = { option, index, id: `${idPrefix}-option-${index}` };
      index += 1;
      return item;
    }),
  }));
}

export function flatItems<T>(groups: readonly PtahSelectGroup<T>[]): PtahSelectItem<T>[] {
  return groups.flatMap((group) => group.items);
}

export type ActiveMove = 'next' | 'previous' | 'first' | 'last';

/** The next enabled index for a move. Returns -1 when no option is enabled. No wrap. */
export function moveActive<T>(
  items: readonly PtahSelectItem<T>[],
  current: number,
  move: ActiveMove,
): number {
  const enabled = items.filter((item) => !item.option.disabled).map((item) => item.index);
  if (!enabled.length) return -1;
  if (move === 'first') return enabled[0];
  if (move === 'last') return enabled[enabled.length - 1];
  if (move === 'next') return enabled.find((i) => i > current) ?? (current < 0 ? enabled[0] : current);
  const before = enabled.filter((i) => i < current);
  return before.length ? before[before.length - 1] : current < 0 ? enabled[enabled.length - 1] : current;
}

/**
 * Type-ahead: the first enabled option after `from` whose label starts with
 * the buffer. It wraps to the start. Returns -1 when nothing matches.
 */
export function typeAheadIndex<T>(
  items: readonly PtahSelectItem<T>[],
  buffer: string,
  from: number,
): number {
  const prefix = normalizeText(buffer);
  if (!prefix) return -1;
  const ordered = [...items.slice(from + 1), ...items.slice(0, from + 1)];
  const hit = ordered.find(
    (item) => !item.option.disabled && normalizeText(item.option.label).startsWith(prefix),
  );
  return hit ? hit.index : -1;
}
