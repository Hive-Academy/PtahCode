/**
 * Put the displayed ids, in their new order, into the slots that displayed ids hold in the full saved order.
 * Every other index keeps its id: a saved id that the table does not number (a keyless CLI, a CLI that is not
 * installed) stays where it is. A displayed id that is not saved is appended first, in displayed order.
 * The slot of an id is its first index in the full order; a later duplicate of it keeps its index.
 * Works for a drag over any distance and for an up / down neighbour swap.
 * null = the result equals `saved` (nothing to write).
 */
export function applyDisplayedAgentOrder(
  saved: readonly string[],
  displayed: readonly string[],
): string[] | null {
  const order = [...saved];
  for (const id of displayed) if (!order.includes(id)) order.push(id);
  const ids = [...new Set(displayed)];
  const slots = ids.map((id) => order.indexOf(id)).sort((a, b) => a - b);
  slots.forEach((slot, index) => {
    order[slot] = ids[index];
  });
  const unchanged =
    order.length === saved.length &&
    order.every((id, index) => id === saved[index]);
  return unchanged ? null : order;
}
