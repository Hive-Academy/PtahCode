import { movePreferredAgentOrder } from './move-preferred-agent-order';

describe('movePreferredAgentOrder', () => {
  const saved = ['codex', 'uninstalled', 'copilot', 'pi'];
  const installed = ['codex', 'copilot', 'pi'];
  it.each([['codex', 1], ['copilot', -1]] as const)('preserves uninstalled positions moving %s by %s', (id, direction) => {
    expect(movePreferredAgentOrder(saved, installed, id, direction)).toEqual(['copilot', 'uninstalled', 'codex', 'pi']);
    expect(saved).toEqual(['codex', 'uninstalled', 'copilot', 'pi']);
  });
  it.each([['codex', -1], ['pi', 1], ['absent', 1]] as const)('does not write an edge or unknown move', (id, direction) => {
    expect(movePreferredAgentOrder(saved, installed, id, direction)).toBeNull();
  });
  it('appends missing installed IDs in display order before swapping', () => {
    expect(movePreferredAgentOrder(['uninstalled', 'codex'], installed, 'copilot', 1)).toEqual(['uninstalled', 'codex', 'pi', 'copilot']);
  });
  it.each([['codex', 1], ['copilot', -1]] as const)('preserves duplicate saved IDs moving %s by %s', (id, direction) => {
    const duplicateSaved = ['codex', 'uninstalled', 'codex', 'copilot', 'copilot', 'pi'];
    expect(movePreferredAgentOrder(duplicateSaved, installed, id, direction)).toEqual([
      'copilot', 'uninstalled', 'codex', 'codex', 'copilot', 'pi',
    ]);
    expect(duplicateSaved).toEqual(['codex', 'uninstalled', 'codex', 'copilot', 'copilot', 'pi']);
  });
});
