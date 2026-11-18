import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import type { MemoryWire } from '@ptah-extension/shared';
import { MemoryEntryListComponent } from './memory-entry-list.component';
import {
  MemoryGraphStateService,
  DEFAULT_GRAPH_FILTERS,
} from '../services/memory-graph-state.service';
import { MemoryStateService } from '../services/memory-state.service';

describe('MemoryEntryListComponent', () => {
  const entry = (
    id: string,
    kind: MemoryWire['kind'] = 'fact',
  ): MemoryWire => ({
    id,
    sessionId: null,
    workspaceRoot: null,
    tier: 'core',
    kind,
    subject: id,
    content: `Content ${id}`,
    sourceMessageIds: [],
    salience: 0.5,
    decayRate: 0,
    hits: 2,
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    lastUsedAt: 1,
    expiresAt: null,
  });
  const filters = signal(DEFAULT_GRAPH_FILTERS);
  const selectedIds = signal<readonly string[]>([]);
  const total = signal(205);
  const hasMore = signal(true);
  const loadingMore = signal(false);
  const isDefaultFilters = signal(true);
  const select = jest.fn();
  const deselect = jest.fn();
  const loadMore = jest.fn();

  beforeEach(async () => {
    filters.set(DEFAULT_GRAPH_FILTERS);
    selectedIds.set(['off-page']);
    hasMore.set(true);
    isDefaultFilters.set(true);
    select.mockClear();
    deselect.mockClear();
    loadMore.mockClear();
    await TestBed.configureTestingModule({
      imports: [MemoryEntryListComponent],
      providers: [
        {
          provide: MemoryGraphStateService,
          useValue: {
            filters,
            selectedIds,
            isDefaultFilters,
            select,
            deselect,
          },
        },
        {
          provide: MemoryStateService,
          useValue: { total, hasMore, loadingMore, loadMore },
        },
      ],
    }).compileComponents();
  });
  it('deselects a checked row when unchecked', () => {
    selectedIds.set(['a']);
    const fixture = TestBed.createComponent(MemoryEntryListComponent);
    fixture.componentRef.setInput('entries', [entry('a')]);
    fixture.detectChanges();
    const checkbox = fixture.nativeElement.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    checkbox.click();
    expect(deselect).toHaveBeenCalledWith('a');
    expect(select).not.toHaveBeenCalled();
  });

  it('filters loaded rows, shows the count and note, and keeps off-page selection', () => {
    filters.set({ ...DEFAULT_GRAPH_FILTERS, kinds: ['fact'] });
    isDefaultFilters.set(false);
    const fixture = TestBed.createComponent(MemoryEntryListComponent);
    fixture.componentRef.setInput('entries', [entry('a'), entry('b', 'event')]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Showing 1 of 205');
    expect(fixture.nativeElement.textContent).toContain(
      'Filters apply to the loaded entries. Load more to see all matches.',
    );
    expect(
      fixture.nativeElement.querySelectorAll(
        '[data-testid="memory-entry-row"]',
      ),
    ).toHaveLength(1);
    expect(selectedIds()).toEqual(['off-page']);
    const checkbox = fixture.nativeElement.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    checkbox.click();
    expect(select).toHaveBeenCalledWith('a', true);
    const button = fixture.nativeElement.querySelector(
      '[data-testid="memory-list-load-more"]',
    ) as HTMLButtonElement;
    button.click();
    expect(loadMore).toHaveBeenCalledTimes(1);
  });
});
