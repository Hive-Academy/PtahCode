/** Swap displayed installed neighbors in the full order, preserving every other index.
 * null means an edge move (or an unknown row), so callers need not write anything.
 */
export function movePreferredAgentOrder(
  saved: readonly string[], installed: readonly string[], id: string, direction: -1 | 1,
): string[] | null {
  const index = installed.indexOf(id);
  const neighbor = installed[index + direction];
  if (index < 0 || neighbor === undefined) return null;
  const order = [...saved];
  for (const lane of installed) if (!order.includes(lane)) order.push(lane);
  const from = order.indexOf(id);
  const to = order.indexOf(neighbor);
  order[from] = neighbor;
  order[to] = id;
  return order;
}
