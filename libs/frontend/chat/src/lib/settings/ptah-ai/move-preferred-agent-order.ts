/**
 * Put the displayed ids, in their new order, into the slots that displayed ids hold in the full saved order.
 * Every other index keeps its id: a saved id that the table does not number (a keyless CLI, a CLI that is not
 * installed) stays where it is. A displayed id that is not saved is appended first, in displayed order.
 * The slots are all the indexes that hold a displayed id, duplicates included. The first slots take the displayed
 * order; the stale duplicate copies move to the slots after them, in their saved sequence. So the rows rank in the
 * displayed order by the first occurrence of each id (`byPreferredOrder`): an earlier stale copy never outranks it.
 * Works for a drag over any distance and for an up / down neighbour swap.
 * null = the saved order already ranks the displayed ids in this order (nothing to write).
 */
export function applyDisplayedAgentOrder(
  saved: readonly string[],
  displayed: readonly string[],
): string[] | null {
  const ids = [...new Set(displayed)];
  const shown = new Set(ids);
  const order = [...saved, ...ids.filter((id) => !saved.includes(id))];
  const slots: number[] = [];
  const ranked: string[] = [];
  const stale: string[] = [];
  order.forEach((id, index) => {
    if (!shown.has(id)) return;
    slots.push(index);
    (ranked.includes(id) ? stale : ranked).push(id);
  });
  if (
    order.length === saved.length &&
    ranked.every((id, index) => id === ids[index])
  )
    return null;
  [...ids, ...stale].forEach((id, index) => {
    order[slots[index]] = id;
  });
  return order;
}
