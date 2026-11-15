import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  LaneOrderListComponent,
  type LaneOrderChip,
  type LaneOrderMove,
} from './lane-order-list.component';
import { isDisabledControl } from '../feedback/busy-disabled.testing';

const CHIPS: readonly LaneOrderChip[] = [
  { id: 'codex', name: 'Codex', enabled: true },
  { id: 'antigravity', name: 'Antigravity', enabled: true },
  { id: 'copilot', name: 'Copilot', enabled: false },
  { id: 'opencode', name: 'OpenCode', enabled: true },
];
const ROW_HEIGHT = 20;

describe('LaneOrderListComponent', () => {
  let fixture: ComponentFixture<LaneOrderListComponent>;
  let moves: LaneOrderMove[];
  const element = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    element().querySelector(selector) as T | null;
  const byTestId = <T extends HTMLElement = HTMLElement>(testid: string) =>
    q<T>(`[data-testid="${testid}"]`);
  const row = (id: string) => byTestId(`policy-order-row-${id}`);
  const rows = () =>
    Array.from(
      element().querySelectorAll('[data-testid^="policy-order-row-"]'),
    ).map((node) =>
      node.getAttribute('data-testid')?.replace('policy-order-row-', ''),
    );
  const indicators = () =>
    element().querySelectorAll('[data-testid="policy-order-drop-indicator"]');
  const live = () =>
    byTestId('policy-order-live')?.textContent?.trim() ?? '<none>';

  /** jsdom has no layout and no DragEvent: rows get a fixed box, events carry `clientY` and `dataTransfer`. */
  function layout() {
    rows().forEach((id, i) => {
      const node = row(id ?? '');
      if (node)
        node.getBoundingClientRect = () =>
          ({ top: i * ROW_HEIGHT, height: ROW_HEIGHT }) as DOMRect;
    });
  }
  function drag(type: string, target: HTMLElement | null, clientY = 0) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const data = new Map<string, string>();
    Object.defineProperties(event, {
      clientY: { value: clientY },
      dataTransfer: {
        value: {
          effectAllowed: 'none',
          dropEffect: 'none',
          setData: (format: string, value: string) => data.set(format, value),
        },
      },
    });
    target?.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }
  /** Row `i`'s upper half (`before`) or lower half (`after`). */
  const at = (i: number, half: 'before' | 'after') =>
    i * ROW_HEIGHT + (half === 'before' ? 2 : ROW_HEIGHT - 2);

  function setChips(chips: readonly LaneOrderChip[]) {
    fixture.componentRef.setInput('chips', chips);
    fixture.detectChanges();
    layout();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LaneOrderListComponent] });
    fixture = TestBed.createComponent(LaneOrderListComponent);
    fixture.componentRef.setInput('canReorder', true);
    moves = [];
    fixture.componentInstance.reorder.subscribe((move) => moves.push(move));
    setChips(CHIPS);
  });
  afterEach(() => TestBed.resetTestingModule());

  describe('rows', () => {
    it('lists the agents in order with a grip, Move up and Move down per row', () => {
      expect(rows()).toEqual(['codex', 'antigravity', 'copilot', 'opencode']);
      expect(row('copilot')?.textContent).toContain('3. Copilot');
      expect(row('copilot')?.textContent).toContain('off');
      expect(
        byTestId('policy-order-grip-codex')?.getAttribute('aria-hidden'),
      ).toBe('true');
      expect(
        byTestId('policy-order-up-antigravity')?.getAttribute('aria-label'),
      ).toBe('Move Antigravity up');
      expect(
        byTestId('policy-order-down-antigravity')?.getAttribute('aria-label'),
      ).toBe('Move Antigravity down');
      expect(row('codex')?.getAttribute('draggable')).toBe('true');
    });

    it('has one line that says what the order controls, linked to the list', () => {
      const hints = element().querySelectorAll(
        '[data-testid="policy-order-hint"]',
      );
      expect(hints).toHaveLength(1);
      expect(hints[0].textContent?.trim()).toBe(
        'The first available agent is used when no CLI is specified.',
      );
      expect(
        byTestId('policy-order-list')?.getAttribute('aria-describedby'),
      ).toBe(hints[0].id);
    });

    it('disables Move up on the first row and Move down on the last', () => {
      expect(isDisabledControl(byTestId('policy-order-up-codex'))).toBe(true);
      expect(isDisabledControl(byTestId('policy-order-down-codex'))).toBe(
        false,
      );
      expect(isDisabledControl(byTestId('policy-order-up-opencode'))).toBe(
        false,
      );
      expect(isDisabledControl(byTestId('policy-order-down-opencode'))).toBe(
        true,
      );
    });

    it('uses spacing tokens only (no raw numeric spacing utilities)', () => {
      const raw = /(^|\s)-?(p|px|py|pt|pb|m|mt|mb|gap|space-y)-\d/;
      for (const node of Array.from(element().querySelectorAll('[class]')))
        expect(node.getAttribute('class')).not.toMatch(raw);
    });
  });

  describe('buttons (the keyboard path)', () => {
    it('asks for a move down and a move up with the whole new order', () => {
      byTestId('policy-order-down-codex')?.click();
      byTestId('policy-order-up-opencode')?.click();
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

    it('asks for nothing while a move cannot run; the buttons are aria-disabled, not natively disabled', () => {
      fixture.componentRef.setInput('canReorder', false);
      fixture.detectChanges();
      const down = byTestId<HTMLButtonElement>('policy-order-down-codex');
      expect(down?.getAttribute('aria-disabled')).toBe('true');
      expect(down?.disabled).toBe(false);
      down?.click();
      expect(moves).toEqual([]);
    });
  });

  describe('drag and drop', () => {
    it('shows a drop indicator over a new place and asks for the move on drop', () => {
      drag('dragstart', row('codex'));
      drag('dragover', row('copilot'), at(2, 'after'));
      expect(indicators()).toHaveLength(1);
      expect(indicators()[0].parentElement).toBe(row('opencode'));
      drag('drop', row('copilot'), at(2, 'after'));
      expect(indicators()).toHaveLength(0);
      expect(moves).toEqual([
        {
          order: ['antigravity', 'copilot', 'codex', 'opencode'],
          movedId: 'codex',
          direction: 'down',
        },
      ]);
    });

    it('moves a row up and to the end of the list', () => {
      drag('dragstart', row('opencode'));
      drag('dragover', row('codex'), at(0, 'before'));
      drag('drop', row('codex'), at(0, 'before'));
      drag('dragstart', row('codex'));
      drag('dragover', row('opencode'), at(3, 'after'));
      expect(indicators()[0].className).toContain('bottom-0');
      drag('drop', row('opencode'), at(3, 'after'));
      expect(
        moves.map(({ order, direction }) => ({ order, direction })),
      ).toEqual([
        {
          order: ['opencode', 'codex', 'antigravity', 'copilot'],
          direction: 'up',
        },
        {
          order: ['antigravity', 'copilot', 'opencode', 'codex'],
          direction: 'down',
        },
      ]);
    });

    it('a drop next to the dragged row itself is no move and shows no indicator', () => {
      drag('dragstart', row('antigravity'));
      drag('dragover', row('codex'), at(0, 'after'));
      expect(indicators()).toHaveLength(0);
      drag('drop', row('codex'), at(0, 'after'));
      expect(moves).toEqual([]);
    });

    it('refuses a drag while a move cannot run', () => {
      fixture.componentRef.setInput('canReorder', false);
      fixture.detectChanges();
      expect(row('codex')?.getAttribute('draggable')).toBe('false');
      expect(drag('dragstart', row('codex')).defaultPrevented).toBe(true);
      drag('dragover', row('copilot'), at(2, 'after'));
      drag('drop', row('copilot'), at(2, 'after'));
      expect(indicators()).toHaveLength(0);
      expect(moves).toEqual([]);
    });

    it('a cancelled drag clears the indicator', () => {
      drag('dragstart', row('codex'));
      drag('dragover', row('opencode'), at(3, 'after'));
      expect(indicators()).toHaveLength(1);
      drag('dragend', row('codex'));
      expect(indicators()).toHaveLength(0);
    });
  });

  describe('settled(): focus return and announcement', () => {
    it('announces the new position politely and returns focus to the button used', () => {
      expect(byTestId('policy-order-live')?.getAttribute('aria-live')).toBe(
        'polite',
      );
      byTestId('policy-order-down-antigravity')?.click();
      setChips(
        moves[0].order.map(
          (id) => CHIPS.find((chip) => chip.id === id) as LaneOrderChip,
        ),
      );
      fixture.componentInstance.settled('antigravity', 'down');
      fixture.detectChanges();
      TestBed.tick();
      expect(live()).toBe('Antigravity moved to position 3 of 4');
      expect(document.activeElement).toBe(
        byTestId('policy-order-down-antigravity'),
      );
    });

    it("at an end, focus goes to the row's other button", () => {
      byTestId('policy-order-down-copilot')?.click();
      setChips(
        moves[0].order.map(
          (id) => CHIPS.find((chip) => chip.id === id) as LaneOrderChip,
        ),
      );
      fixture.componentInstance.settled('copilot', 'down');
      fixture.detectChanges();
      TestBed.tick();
      expect(live()).toBe('Copilot moved to position 4 of 4');
      expect(document.activeElement).toBe(byTestId('policy-order-up-copilot'));
    });

    it('announces nothing when the save did not change the order', () => {
      byTestId('policy-order-down-codex')?.click();
      fixture.componentInstance.settled('codex', 'down');
      fixture.detectChanges();
      TestBed.tick();
      expect(live()).toBe('');
    });
  });
});
