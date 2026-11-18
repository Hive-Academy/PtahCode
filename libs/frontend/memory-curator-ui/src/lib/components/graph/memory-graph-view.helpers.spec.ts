import type { MemoryGraphNodeWire } from '@ptah-extension/shared';
import {
  connectedMemories,
  observeGraphPane,
} from './memory-graph-view.helpers';
import { FALLBACK_GRAPH_PALETTE, readGraphPalette } from './graph-palette';

const node = (id: string): MemoryGraphNodeWire => ({
  id,
  subject: id,
  preview: '',
  tier: 'core',
  kind: 'fact',
  salience: 1,
  hits: 0,
  pinned: false,
  sessionId: null,
  workspaceRoot: null,
  createdAt: 0,
  lastUsedAt: 0,
});

describe('memory graph view helpers', () => {
  it('sorts visible connected memories by weight', () => {
    const connected = connectedMemories(
      [node('a')],
      [node('a'), node('b'), node('c')],
      [
        { source: 'a', target: 'b', kind: 'subject', weight: 0.2 },
        { source: 'c', target: 'a', kind: 'session', weight: 0.9 },
      ],
    );
    expect(connected.map((item) => item.node.id)).toEqual(['c', 'b']);
  });
  it('returns no connections for multiple selections', () => {
    expect(
      connectedMemories([node('a'), node('b')], [node('a'), node('b')], []),
    ).toEqual([]);
  });
  it('uses fallback palette when CSS tokens are unavailable', () => {
    const element = document.createElement('div');
    expect(readGraphPalette(element).kind.fact).toBe(
      FALLBACK_GRAPH_PALETTE.kind.fact,
    );
  });
  it('observes layout and releases theme observer', () => {
    const element = document.createElement('div');
    const onLayout = jest.fn();
    const onTheme = jest.fn();
    const stop = observeGraphPane(element, onLayout, onTheme);
    expect(onLayout).toHaveBeenCalled();
    expect(onTheme).toHaveBeenCalledTimes(1);
    stop();
  });
});
