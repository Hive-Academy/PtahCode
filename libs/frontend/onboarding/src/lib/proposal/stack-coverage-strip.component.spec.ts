import { TestBed } from '@angular/core/testing';
import { StackCoverageStripComponent } from './stack-coverage-strip.component';
import type { StackCoverageItem } from './stack-coverage';

function makeRect(
  top: number,
  left: number,
  width: number,
  height = 28,
): DOMRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

describe('StackCoverageStripComponent', () => {
  it('renders all coverage states with accessible filter buttons and evidence titles', () => {
    const fixture = TestBed.createComponent(StackCoverageStripComponent);
    const items: StackCoverageItem[] = (
      ['covered', 'available', 'none', 'failed'] as const
    ).map((state) => ({
      name: state,
      kind: 'framework',
      evidence: 'package.json',
      state,
      selectedCount: state === 'covered' ? 2 : 0,
      totalCount: 2,
    }));
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('activeItem', 'framework:covered');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const emitted = jest.fn();
    fixture.componentInstance.filterChanged.subscribe(emitted);
    const buttons = root.querySelectorAll('button');
    expect(buttons[1]?.getAttribute('aria-label')).toBe(
      'covered, covered by 2 selected skills',
    );
    expect(buttons[1]?.getAttribute('title')).toBe('framework: package.json');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
    const descriptionId = buttons[1]?.getAttribute('aria-describedby');
    expect(
      root.querySelector(`[id="${descriptionId}"]`)?.textContent,
    ).toContain('framework: package.json');
    expect(root.textContent).toContain('2 available');
    expect(root.textContent).toContain('no match');
    expect(root.textContent).toContain('search failed');
    expect(root.querySelector('[data-coverage-count]')?.textContent).toContain(
      '1 of 4 stack items covered',
    );
    buttons[1]?.click();
    expect(emitted).toHaveBeenLastCalledWith(null);
    buttons[2]?.click();
    expect(emitted).toHaveBeenLastCalledWith('framework:available');
    buttons[0]?.click();
    expect(emitted).toHaveBeenLastCalledWith(null);
  });

  it('shows six skeleton chips and announces loading (GAP 27)', () => {
    const fixture = TestBed.createComponent(StackCoverageStripComponent);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('ptah-skeleton')).toHaveLength(6);
    const status = root.querySelector('[role="status"][aria-live="polite"]');
    expect(status?.textContent).toContain('Finding recommended skills');
    expect(root.querySelector('button')).toBeNull();
    expect(root.querySelector('[data-coverage-count]')).toBeNull();
  });

  it('collapses more than twelve stack chips behind "Show N more" and focuses the first newly shown chip (GAP 28)', () => {
    const fixture = TestBed.createComponent(StackCoverageStripComponent);
    fixture.componentRef.setInput(
      'items',
      Array.from({ length: 14 }, (_, index): StackCoverageItem => ({
        name: `Framework ${index}`,
        kind: 'framework',
        evidence: 'package.json',
        state: 'none',
        selectedCount: 0,
        totalCount: 0,
      })),
    );
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('button[aria-label]')).toHaveLength(11);
    const more = [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Show 3 more'),
    );
    expect(more).toBeDefined();
    expect(more?.getAttribute('aria-expanded')).toBe('false');
    more?.click();
    fixture.detectChanges();
    expect(root.querySelectorAll('button[aria-label]')).toHaveLength(14);
    expect(root.textContent).not.toContain('Show 3 more');
    TestBed.tick();
    expect(document.activeElement?.getAttribute('aria-label')).toContain(
      'Framework 11',
    );
  });

  it('distinguishes filter keys and description IDs for equal names of different kinds (GAP 29)', () => {
    const fixture = TestBed.createComponent(StackCoverageStripComponent);
    fixture.componentRef.setInput('items', [
      {
        name: 'TypeScript',
        kind: 'language',
        state: 'none',
        selectedCount: 0,
        totalCount: 0,
        evidence: 'tsconfig.json',
      },
      {
        name: 'TypeScript',
        kind: 'library',
        state: 'none',
        selectedCount: 0,
        totalCount: 0,
        evidence: 'package.json',
      },
    ]);
    fixture.componentRef.setInput('activeItem', 'language:TypeScript');
    const changed = jest.fn();
    fixture.componentInstance.filterChanged.subscribe(changed);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const chips = root.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="TypeScript, no match"]',
    );
    expect(chips[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(chips[1]?.getAttribute('aria-pressed')).toBe('false');
    expect(chips[0]?.getAttribute('aria-describedby')).not.toBe(
      chips[1]?.getAttribute('aria-describedby'),
    );
    chips[1]?.click();
    expect(changed).toHaveBeenCalledWith('library:TypeScript');
  });

  it('renders judged coverage status words, R19 covered failed-search wording, and dual-fact aria-labels (design-spec 3.6)', () => {
    const fixture = TestBed.createComponent(StackCoverageStripComponent);
    const items: StackCoverageItem[] = [
      {
        itemId: 'framework:angular',
        name: 'Angular',
        kind: 'framework',
        evidence: 'package.json',
        state: 'covered',
        selectedCount: 1,
        totalCount: 2,
        registry: 'matched',
        verdict: 'install-and-build',
      },
      {
        itemId: 'test-tool:jest',
        name: 'Jest',
        kind: 'test-tool',
        evidence: 'jest.config.ts',
        state: 'covered',
        originalSearchFailed: true,
        selectedCount: 1,
        totalCount: 1,
        registry: 'search-failed',
        verdict: 'build',
      },
      {
        itemId: 'library:tailwind',
        name: 'Tailwind',
        kind: 'library',
        evidence: 'tailwind.config.js',
        state: 'none',
        selectedCount: 0,
        totalCount: 0,
        registry: 'no-match',
        verdict: 'no-skill',
      },
      {
        itemId: 'pattern:nx',
        name: 'Nx',
        kind: 'pattern',
        evidence: 'nx.json',
        state: 'failed',
        originalSearchFailed: true,
        selectedCount: 0,
        totalCount: 0,
        registry: 'search-failed',
        verdict: 'not-judged',
      },
      {
        itemId: 'library:rxjs',
        name: 'RxJS',
        kind: 'library',
        evidence: 'package.json',
        state: 'none',
        selectedCount: 0,
        totalCount: 0,
        registry: 'not-searched',
        verdict: 'install',
      },
    ];
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    // R19: covered failed-search item IS counted in coveredCount, uncovered failed item is NOT
    expect(root.querySelector('[data-coverage-count]')?.textContent).toContain(
      '2 of 5 stack items covered',
    );

    const chips = root.querySelectorAll<HTMLButtonElement>('[data-strip-chip]');
    expect(chips[0]?.getAttribute('aria-label')).toBe(
      'Angular, framework. Registry: covered by 1 selected skill. Verdict: Install + Build',
    );
    expect(chips[1]?.getAttribute('aria-label')).toBe(
      'Jest, test-tool. Registry: Covered - original search failed. Verdict: Build',
    );
    expect(chips[1]?.textContent).toContain('Covered - original search failed');
    expect(chips[1]?.textContent).toContain('Build');
    expect(chips[2]?.textContent).toContain('no match');
    expect(chips[2]?.textContent).toContain('No skill needed');
    expect(chips[3]?.textContent).toContain('search failed');
    expect(chips[3]?.textContent).toContain('Not judged');
    expect(chips[4]?.textContent).toContain('not searched');
    expect(chips[4]?.textContent).toContain('Install');
  });

  it('measures at most two lines via one strip-level ResizeObserver, focuses first newly shown chip, and disconnects on destroy (F23)', () => {
    let observerCallback: ResizeObserverCallback | null = null;
    const observe = jest.fn();
    const disconnect = jest.fn();
    const originalResizeObserver = globalThis.ResizeObserver;
    class MockResizeObserver implements ResizeObserver {
      public constructor(callback: ResizeObserverCallback) {
        observerCallback = callback;
      }
      public observe = observe;
      public unobserve = jest.fn();
      public disconnect = disconnect;
    }
    globalThis.ResizeObserver = MockResizeObserver;

    try {
      const fixture = TestBed.createComponent(StackCoverageStripComponent);
      const items: StackCoverageItem[] = Array.from(
        { length: 7 },
        (_, index): StackCoverageItem => ({
          itemId: `framework:item-${index}`,
          name: `Item ${index}`,
          kind: 'framework',
          evidence: 'package.json',
          state: 'available',
          selectedCount: 0,
          totalCount: 1,
        }),
      );
      fixture.componentRef.setInput('items', items);
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      const chipRow = root.querySelector<HTMLElement>('[role="group"]');
      expect(chipRow).not.toBeNull();
      if (!chipRow) return;
      expect(observe).toHaveBeenCalledTimes(1);
      expect(observe).toHaveBeenCalledWith(chipRow);

      // Simulate responsive flex-wrap geometry at the prototype level so newly rendered
      // chip nodes report exact row/column coordinates during afterNextRender measurement.
      let rowWidth = 340;
      let perLine = 3;
      const rectSpy = jest
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: HTMLElement): DOMRect {
          if (this === chipRow) {
            return makeRect(0, 0, rowWidth, 108);
          }
          if (this.hasAttribute('data-strip-all')) {
            return makeRect(0, 0, 80, 28);
          }
          if (this.hasAttribute('data-strip-chip')) {
            const chips = Array.from(
              chipRow.querySelectorAll<HTMLElement>('[data-strip-chip]'),
            );
            const index = chips.indexOf(this);
            if (index >= 0) {
              const line = Math.floor((index + 1) / perLine);
              const col = (index + 1) % perLine;
              return makeRect(line * 36, col * 100, 90, 28);
            }
          }
          return makeRect(0, 0, 0, 0);
        });

      const triggerResize = (width: number, cols: number): void => {
        rowWidth = width;
        perLine = cols;
        observerCallback?.(
          [
            {
              contentRect: makeRect(0, 0, rowWidth, 108),
              target: chipRow,
            } as unknown as ResizeObserverEntry,
          ],
          {} as ResizeObserver,
        );
        fixture.detectChanges();
        TestBed.tick();
        fixture.detectChanges();
      };

      try {
        triggerResize(340, 3);

        // Line 1: All + Item 0, Item 1; Line 2: Item 2, Item 3 (Item 4 ends at x=290 so
        // reserving room for "Show N more" (290 + 8 + 112 > 340) trims line 2 to 4 visible chips).
        expect(root.querySelectorAll('[data-strip-chip]')).toHaveLength(4);
        const showMore = root.querySelector<HTMLButtonElement>(
          '[data-strip-show-more]',
        );
        expect(showMore?.textContent).toContain('Show 3 more');

        // Resize wider: 5 per line -> all 7 chips fit on 2 lines
        triggerResize(900, 5);
        expect(root.querySelectorAll('[data-strip-chip]')).toHaveLength(7);
        expect(root.querySelector('[data-strip-show-more]')).toBeNull();

        // Resize narrow again -> back to 4 visible, click "Show 3 more" -> focuses Item 4 (first newly shown!)
        triggerResize(340, 3);
        expect(root.querySelectorAll('[data-strip-chip]')).toHaveLength(4);
        root.querySelector<HTMLButtonElement>('[data-strip-show-more]')?.click();
        fixture.detectChanges();
        TestBed.tick();

        expect(root.querySelectorAll('[data-strip-chip]')).toHaveLength(7);
        expect(document.activeElement?.getAttribute('aria-label')).toContain(
          'Item 4',
        );

        fixture.destroy();
        expect(disconnect).toHaveBeenCalledTimes(1);
      } finally {
        rectSpy.mockRestore();
      }
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });
});
