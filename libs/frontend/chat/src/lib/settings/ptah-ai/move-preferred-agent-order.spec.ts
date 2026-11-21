import { applyDisplayedAgentOrder } from './move-preferred-agent-order';

describe('applyDisplayedAgentOrder', () => {
  const saved = ['codex', 'uninstalled', 'copilot', 'pi'];
  // Ported from movePreferredAgentOrder: a neighbour swap gives the same result.
  it.each([
    ['codex down', ['copilot', 'codex', 'pi']],
    ['copilot up', ['copilot', 'codex', 'pi']],
  ] as const)('keeps an undisplayed saved id in its slot (%s)', (_name, displayed) => {
    expect(applyDisplayedAgentOrder(saved, displayed)).toEqual(['copilot', 'uninstalled', 'codex', 'pi']);
    expect(saved).toEqual(['codex', 'uninstalled', 'copilot', 'pi']);
  });
  it('writes nothing when the displayed order is unchanged', () => {
    expect(applyDisplayedAgentOrder(saved, ['codex', 'copilot', 'pi'])).toBeNull();
  });
  it('appends missing displayed ids in display order before it places them', () => {
    expect(applyDisplayedAgentOrder(['uninstalled', 'codex'], ['codex', 'pi', 'copilot'])).toEqual([
      'uninstalled', 'codex', 'pi', 'copilot',
    ]);
  });
  /** The rows rank by the first occurrence of each id (`byPreferredOrder`). */
  const ranked = (order: readonly string[], shown: readonly string[]) =>
    [...new Set(order)].filter((id) => shown.includes(id));
  it('moves the stale duplicates of displayed ids behind the displayed order', () => {
    const duplicateSaved = ['codex', 'uninstalled', 'codex', 'copilot', 'copilot', 'pi'];
    const displayed = ['copilot', 'codex', 'pi'];
    const order = applyDisplayedAgentOrder(duplicateSaved, displayed);
    expect(order).toEqual(['copilot', 'uninstalled', 'codex', 'pi', 'codex', 'copilot']);
    expect(ranked(order ?? [], displayed)).toEqual(displayed);
    expect(duplicateSaved).toEqual(['codex', 'uninstalled', 'codex', 'copilot', 'copilot', 'pi']);
  });
  it('does not let an earlier stale duplicate outrank the displayed order (PR review B)', () => {
    const displayed = ['B', 'C', 'A'];
    const order = applyDisplayedAgentOrder(['A', 'A', 'B', 'C'], displayed);
    expect(order).toEqual(['B', 'C', 'A', 'A']);
    expect(ranked(order ?? [], displayed)).toEqual(displayed);
    // An undisplayed id keeps its slot between the duplicates.
    expect(applyDisplayedAgentOrder(['A', 'x', 'A', 'B', 'C'], displayed)).toEqual([
      'B', 'x', 'C', 'A', 'A',
    ]);
  });
  it('writes nothing when a saved order with duplicates already ranks the displayed order', () => {
    expect(applyDisplayedAgentOrder(['A', 'A', 'B', 'C'], ['A', 'B', 'C'])).toBeNull();
  });
  it('places a drag over two or more positions into the displayed slots', () => {
    expect(
      applyDisplayedAgentOrder(
        ['codex', 'cursor', 'antigravity', 'glm-1', 'copilot'],
        ['antigravity', 'codex', 'glm-1', 'copilot', 'opencode'],
      ),
    ).toEqual(['antigravity', 'cursor', 'codex', 'glm-1', 'copilot', 'opencode']);
    expect(applyDisplayedAgentOrder(['a', 'x', 'b', 'c', 'd'], ['d', 'a', 'b', 'c'])).toEqual([
      'd', 'x', 'a', 'b', 'c',
    ]);
  });
  it('writes the appended ids when only unsaved ids are new', () => {
    expect(applyDisplayedAgentOrder(['codex'], ['codex', 'pi'])).toEqual(['codex', 'pi']);
  });
});
