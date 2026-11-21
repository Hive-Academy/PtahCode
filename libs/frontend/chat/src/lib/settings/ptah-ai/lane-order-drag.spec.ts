import { LaneOrderDrag, type LaneOrderMove } from './lane-order-drag';

const NAMES: Readonly<Record<string, string>> = {
  codex: 'Codex',
  antigravity: 'Antigravity',
  copilot: 'Copilot',
  opencode: 'OpenCode',
};
const ROW_HEIGHT = 20;

describe('LaneOrderDrag', () => {
  let ids: string[];
  let canReorder: boolean;
  let moves: LaneOrderMove[];
  let drag: LaneOrderDrag;

  /** No DragEvent in jsdom: a plain object with the fields the class reads. Row `index` has a fixed box. */
  function event(index = 0, clientY = 0) {
    const data = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (format: string, value: string) => data.set(format, value),
    };
    const value = {
      clientY,
      dataTransfer,
      currentTarget: {
        getBoundingClientRect: () => ({
          top: index * ROW_HEIGHT,
          height: ROW_HEIGHT,
        }),
      },
      preventDefault: jest.fn(),
    };
    return { event: value as unknown as DragEvent, raw: value, data };
  }
  /** Row `i`'s upper half (`before`) or lower half (`after`). */
  const at = (i: number, half: 'before' | 'after') =>
    i * ROW_HEIGHT + (half === 'before' ? 2 : ROW_HEIGHT - 2);
  /** Drags row `from` over a half of row `over` and drops there. */
  function dragAndDrop(from: number, over: number, half: 'before' | 'after') {
    drag.startDrag(event(from).event, from);
    drag.dragOver(event(over, at(over, half)).event, over);
    const indicator = drag.dropIndex();
    drag.drop(event().event);
    return indicator;
  }

  beforeEach(() => {
    ids = ['codex', 'antigravity', 'copilot', 'opencode'];
    canReorder = true;
    moves = [];
    drag = new LaneOrderDrag({
      ids: () => ids,
      name: (id) => NAMES[id] ?? id,
      canReorder: () => canReorder,
      move: (move) => moves.push(move),
    });
  });

  describe('buttons (the keyboard path)', () => {
    it('asks for a move down and a move up with the whole new order', () => {
      drag.moveDown(0);
      drag.moveUp(3);
      expect(moves).toEqual([
        {
          order: ['antigravity', 'codex', 'copilot', 'opencode'],
          movedId: 'codex',
          direction: 'down',
        },
        {
          order: ['codex', 'antigravity', 'opencode', 'copilot'],
          movedId: 'opencode',
          direction: 'up',
        },
      ]);
    });

    it('asks for nothing at the ends', () => {
      drag.moveUp(0);
      drag.moveDown(3);
      expect(moves).toEqual([]);
    });

    it('asks for nothing while a move cannot run', () => {
      canReorder = false;
      drag.moveDown(0);
      drag.moveUp(2);
      expect(moves).toEqual([]);
    });

    it('does not change the list it reads', () => {
      const before = [...ids];
      drag.moveDown(0);
      expect(ids).toEqual(before);
    });
  });

  describe('drag and drop', () => {
    it('sets the drag data and shows a drop indicator over a new place', () => {
      const start = event(0);
      drag.startDrag(start.event, 0);
      expect(start.data.get('text/plain')).toBe('codex');
      expect(start.raw.dataTransfer.effectAllowed).toBe('move');
      const over = event(2, at(2, 'after'));
      drag.dragOver(over.event, 2);
      expect(over.raw.preventDefault).toHaveBeenCalled();
      expect(over.raw.dataTransfer.dropEffect).toBe('move');
      expect(drag.dropIndex()).toBe(3);
    });

    it('asks for the move on drop and clears the indicator', () => {
      expect(dragAndDrop(0, 2, 'after')).toBe(3);
      expect(drag.dropIndex()).toBeNull();
      expect(moves).toEqual([
        {
          order: ['antigravity', 'copilot', 'codex', 'opencode'],
          movedId: 'codex',
          direction: 'down',
        },
      ]);
    });

    it('moves a row up and to the end of the list', () => {
      dragAndDrop(3, 0, 'before');
      dragAndDrop(0, 3, 'after');
      expect(moves).toEqual([
        {
          order: ['opencode', 'codex', 'antigravity', 'copilot'],
          movedId: 'opencode',
          direction: 'up',
        },
        {
          order: ['antigravity', 'copilot', 'opencode', 'codex'],
          movedId: 'codex',
          direction: 'down',
        },
      ]);
    });

    it('a drop next to the dragged row itself is no move and shows no indicator', () => {
      expect(dragAndDrop(1, 1, 'before')).toBeNull();
      expect(dragAndDrop(1, 1, 'after')).toBeNull();
      expect(dragAndDrop(1, 0, 'after')).toBeNull();
      expect(dragAndDrop(1, 2, 'before')).toBeNull();
      expect(moves).toEqual([]);
    });

    it('refuses a drag while a move cannot run', () => {
      canReorder = false;
      const start = event(0);
      drag.startDrag(start.event, 0);
      expect(start.raw.preventDefault).toHaveBeenCalled();
      const over = event(2, at(2, 'after'));
      drag.dragOver(over.event, 2);
      expect(over.raw.preventDefault).not.toHaveBeenCalled();
      expect(drag.dropIndex()).toBeNull();
      drag.drop(event().event);
      expect(moves).toEqual([]);
    });

    it('a cancelled drag clears the indicator and a later drop is no move', () => {
      drag.startDrag(event(0).event, 0);
      drag.dragOver(event(2, at(2, 'after')).event, 2);
      drag.endDrag();
      expect(drag.dropIndex()).toBeNull();
      drag.drop(event().event);
      expect(moves).toEqual([]);
    });
  });

  describe('settled(): focus return and announcement', () => {
    const settle = (
      id: string,
      direction: 'up' | 'down',
      order: readonly string[],
      focus: jest.Mock = jest.fn(),
      saved = true,
    ) => drag.settled({ id, direction, saved, order }, focus);

    it('announces the new position and asks for focus on the moved row', () => {
      const focus = jest.fn();
      drag.moveDown(0);
      settle('codex', 'down', moves[0].order, focus);
      expect(drag.announcement()).toBe('Codex moved to position 2 of 4');
      expect(focus).toHaveBeenCalledWith('codex', 'down');
    });

    it('reads the confirmed order it is given, not a stale ids() binding (finding 5)', () => {
      drag.moveDown(0);
      // ids() still holds the old order: the child input has yet to render.
      settle('codex', 'down', moves[0].order);
      expect(ids[0]).toBe('codex');
      expect(drag.announcement()).toBe('Codex moved to position 2 of 4');
    });

    it('announces nothing when the save did not change the order', () => {
      const focus = jest.fn();
      drag.moveDown(0);
      settle('codex', 'down', ids, focus);
      expect(drag.announcement()).toBe('');
      expect(focus).toHaveBeenCalledWith('codex', 'down');
    });

    it('a failed save announces no move and still restores focus', () => {
      const focus = jest.fn();
      drag.moveDown(0);
      settle('codex', 'down', moves[0].order, focus, false);
      expect(drag.announcement()).toBe('');
      expect(focus).toHaveBeenCalledWith('codex', 'down');
    });

    it('announces nothing for a row that did not ask for a move', () => {
      drag.moveDown(0);
      settle('copilot', 'up', moves[0].order);
      expect(drag.announcement()).toBe('');
    });
  });

  describe('a list refresh during a drag (finding 4)', () => {
    it('cancels the drag when a lane is inserted before the drop', () => {
      drag.startDrag(event(1).event, 1);
      drag.dragOver(event(3, at(3, 'after')).event, 3);
      expect(drag.dropIndex()).toBe(4);
      ids = ['codex', 'grok', 'antigravity', 'copilot', 'opencode'];
      drag.drop(event().event);
      expect(moves).toEqual([]);
      expect(drag.dropIndex()).toBeNull();
    });

    it('stops showing a drop indicator once the sequence changed', () => {
      drag.startDrag(event(1).event, 1);
      ids = ['grok', ...ids];
      const over = event(3, at(3, 'after'));
      drag.dragOver(over.event, 3);
      expect(drag.dropIndex()).toBeNull();
      expect(over.raw.preventDefault).not.toHaveBeenCalled();
    });

    it('moves the dragged id when the sequence is unchanged', () => {
      dragAndDrop(1, 3, 'after');
      expect(moves[0].movedId).toBe('antigravity');
      expect(moves[0].order).toEqual(['codex', 'copilot', 'opencode', 'antigravity']);
    });
  });
});
