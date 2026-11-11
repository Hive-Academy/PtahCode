import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { EffortSelectorComponent } from './effort-selector.component';
import { EffortStateService } from '@ptah-extension/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import { KeyboardNavigationService } from '@ptah-extension/ui';
import { SESSION_CONTEXT } from '../../../tokens/session-context.token';

interface TabStub {
  id: string;
  overrideEffort?: unknown;
  agentOrigin?: { effort?: string };
}

describe('EffortSelectorComponent per-session effort', () => {
  const mockEffortState = {
    currentEffort: signal<string | undefined>('medium'),
    isLoaded: signal(true),
    setEffort: jest.fn().mockResolvedValue(undefined),
  };

  const tabs = signal<TabStub[]>([]);
  const activeTabId = signal<string | null>(null);
  const mockTabManager = {
    tabs,
    activeTab: () => tabs().find((t) => t.id === activeTabId()) ?? null,
    setOverrideEffort: jest.fn(),
  };

  const mockKeyboardNav = {
    activeIndex: signal(0),
    setActiveIndex: jest.fn(),
  };

  function createComponent(sessionContext: unknown): EffortSelectorComponent {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: EffortStateService, useValue: mockEffortState },
        { provide: TabManagerService, useValue: mockTabManager },
        { provide: KeyboardNavigationService, useValue: mockKeyboardNav },
        { provide: SESSION_CONTEXT, useValue: sessionContext },
      ],
    });
    return TestBed.runInInjectionContext(() => new EffortSelectorComponent());
  }

  beforeEach(() => {
    jest.clearAllMocks();
    tabs.set([]);
    activeTabId.set(null);
    mockEffortState.currentEffort.set('medium');
  });

  describe('main panel (SESSION_CONTEXT absent)', () => {
    it('pins the effort on the active tab and never writes the global effort', () => {
      tabs.set([{ id: 'tab-1' }]);
      activeTabId.set('tab-1');
      const component = createComponent(null);

      component.selectEffort({ value: 'high' });

      expect(mockTabManager.setOverrideEffort).toHaveBeenCalledWith(
        'tab-1',
        'high',
      );
      expect(mockEffortState.setEffort).not.toHaveBeenCalled();
    });

    it("stores a null override for the 'Default' option", () => {
      tabs.set([{ id: 'tab-1', overrideEffort: 'high' }]);
      activeTabId.set('tab-1');
      const component = createComponent(null);

      component.selectEffort({ value: '' });

      expect(mockTabManager.setOverrideEffort).toHaveBeenCalledWith(
        'tab-1',
        null,
      );
    });
  });

  describe('tile context (SESSION_CONTEXT provides a tabId)', () => {
    it('pins the override on the tile tab only and never writes the global effort', () => {
      tabs.set([{ id: 'tab-1' }, { id: 'tab-2' }]);
      activeTabId.set('tab-2');
      const component = createComponent(signal('tab-1'));

      component.selectEffort({ value: 'xhigh' });

      expect(mockTabManager.setOverrideEffort).toHaveBeenCalledTimes(1);
      expect(mockTabManager.setOverrideEffort).toHaveBeenCalledWith(
        'tab-1',
        'xhigh',
      );
      expect(mockEffortState.setEffort).not.toHaveBeenCalled();
    });
  });

  describe('effectiveEffort', () => {
    it('shows the effort a parent pinned for a child from the first render', () => {
      tabs.set([{ id: 'child', agentOrigin: { effort: 'high' } }]);
      const component = createComponent(signal('child'));

      expect(component.effectiveEffort()).toBe('high');
      expect(component.selectedOption().value).toBe('high');
    });

    it('lets a tab override win over the pin of the parent and over the global effort', () => {
      tabs.set([
        {
          id: 'child',
          overrideEffort: 'low',
          agentOrigin: { effort: 'high' },
        },
      ]);
      const component = createComponent(signal('child'));

      expect(component.effectiveEffort()).toBe('low');
    });

    it('keeps tabs apart: a tab without an effort follows the global effort', () => {
      tabs.set([{ id: 'a', overrideEffort: 'high' }, { id: 'b' }]);
      const a = createComponent(signal('a'));
      expect(a.effectiveEffort()).toBe('high');
      const b = createComponent(signal('b'));
      expect(b.effectiveEffort()).toBe('medium');
    });
  });
});

describe('EffortSelectorComponent — level bar transitions', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EffortSelectorComponent],
      providers: [
        {
          provide: EffortStateService,
          useValue: {
            currentEffort: signal('medium'),
            isLoaded: signal(true),
            setEffort: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TabManagerService,
          useValue: {
            tabs: signal([]),
            activeTab: () => null,
            setOverrideEffort: jest.fn(),
          },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('animates only the fill color on the toolbar bars (no transition-all)', () => {
    const fixture = TestBed.createComponent(EffortSelectorComponent);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector(
      'button[trigger]',
    ) as HTMLButtonElement;
    const bars = Array.from(
      trigger.querySelectorAll<HTMLElement>('div'),
    ).filter((div) => div.className.includes('rounded-[1px]'));

    // Only the fill color changes between efforts (each bar's height is fixed
    // by its slot), so `transition-all` must not come back: it also animated
    // inherited animatable properties like scrollbar-color and started
    // non-composited transitions on every scroll recalculation.
    expect(bars).toHaveLength(5);
    for (const bar of bars) {
      expect(bar.className).toContain('transition-colors');
      expect(bar.className).not.toContain('transition-all');
    }
  });
});
