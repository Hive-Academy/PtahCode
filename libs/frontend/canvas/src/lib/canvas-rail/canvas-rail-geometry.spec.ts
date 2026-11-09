import { COMPACT_RAIL_CARD_HEIGHT } from '@ptah-extension/chat-ui';
import {
  checkRailGeometry,
  railAnchorScrollTop,
  railCardHeight,
} from './canvas-rail-geometry';

describe('rail geometry', () => {
  it('anchors a card above, below or inside the viewport', () => {
    expect(railAnchorScrollTop(0, 56, 200, 100)).toBe(0);
    expect(railAnchorScrollTop(3, 56, 200, 0)).toBe(48);
    expect(railAnchorScrollTop(1, 56, 200, 0)).toBe(0);
  });

  it('uses the shared heights and collapsed height', () => {
    expect(railCardHeight('comfortable', false)).toBe(
      COMPACT_RAIL_CARD_HEIGHT.comfortable,
    );
    expect(railCardHeight('dense', false)).toBe(COMPACT_RAIL_CARD_HEIGHT.dense);
    expect(railCardHeight('dense', true)).toBe(56);
  });

  it('resets on a new key and counts reordered or incorrectly sized cards', () => {
    const initial = {
      key: 'dense|false',
      order: ['a', 'b'],
      heights: [56, 56],
    };
    const first = checkRailGeometry(null, initial, 56);
    expect(first.shifts).toBe(0);
    expect(checkRailGeometry(first.baseline, initial, 56).shifts).toBe(0);
    expect(
      checkRailGeometry(
        first.baseline,
        { ...initial, order: ['b', 'a'], heights: [56, 55] },
        56,
      ).shifts,
    ).toBe(2);
    expect(
      checkRailGeometry(
        first.baseline,
        { ...initial, key: 'comfortable|false' },
        128,
      ).shifts,
    ).toBe(0);
  });
});
