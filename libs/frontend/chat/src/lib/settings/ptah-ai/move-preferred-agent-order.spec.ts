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
  it('keeps a later duplicate of a saved id at its index', () => {
    const duplicateSaved = ['codex', 'uninstalled', 'codex', 'copilot', 'copilot', 'pi'];
    expect(applyDisplayedAgentOrder(duplicateSaved, ['copilot', 'codex', 'pi'])).toEqual([
      'copilot', 'uninstalled', 'codex', 'codex', 'copilot', 'pi',
    ]);
    expect(duplicateSaved).toEqual(['codex', 'uninstalled', 'codex', 'copilot', 'copilot', 'pi']);
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
