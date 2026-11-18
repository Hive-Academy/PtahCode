import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MemoryGraphStateService, DEFAULT_GRAPH_FILTERS, DEFAULT_GRAPH_VIEW } from '../../services/memory-graph-state.service';
import { GraphFilterRailComponent } from './graph-filter-rail.component';

class MockGraphState {
  public readonly filters = signal(DEFAULT_GRAPH_FILTERS);
  public readonly view = signal(DEFAULT_GRAPH_VIEW);
  public readonly semanticAvailable = signal(false);
  public readonly edgeCounts = signal({ semantic: 3, subject: 4, session: 5 });
  public readonly sessions = signal(['s1']);
  public readonly patchFilters = jest.fn((patch: Partial<typeof DEFAULT_GRAPH_FILTERS>) => this.filters.update(value => ({ ...value, ...patch })));
  public readonly patchView = jest.fn((patch: Partial<typeof DEFAULT_GRAPH_VIEW>) => this.view.update(value => ({ ...value, ...patch })));
  public readonly resetFilters = jest.fn(() => this.filters.set(DEFAULT_GRAPH_FILTERS));
}

describe('GraphFilterRailComponent', () => {
  it('shows counts, disables semantic links, patches filters and view, and resets', () => {
    const state = new MockGraphState();
    TestBed.configureTestingModule({ providers: [{ provide: MemoryGraphStateService, useValue: state }] });
    const fixture = TestBed.createComponent(GraphFilterRailComponent); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Similar meaning 3');
    expect((root.querySelector('[data-testid="memory-graph-edge-semantic"]') as HTMLInputElement).disabled).toBe(true);
    (root.querySelector('[data-testid="memory-graph-edge-subject"]') as HTMLInputElement).click();
    expect(state.patchFilters).toHaveBeenCalled();
    (root.querySelector('input[ptahToggle]') as HTMLInputElement).click();
    expect(state.filters().pinnedOnly).toBe(true);
    [...root.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Reset filters')?.click();
    expect(state.resetFilters).toHaveBeenCalled();
    const labels = [...root.querySelectorAll('label')].find(item => item.textContent?.includes('Show labels'));
    (labels?.querySelector('input') as HTMLInputElement).click();
    expect(state.patchView).toHaveBeenCalledWith({ showLabels: true });
  });
  it('keeps the final tier selected', () => {
    const state = new MockGraphState();
    state.filters.set({ ...DEFAULT_GRAPH_FILTERS, tiers: ['core'] });
    TestBed.configureTestingModule({ providers: [{ provide: MemoryGraphStateService, useValue: state }] });
    const fixture = TestBed.createComponent(GraphFilterRailComponent); fixture.detectChanges();
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(item => item.textContent?.trim() === 'core');
    button?.click();
    expect(state.filters().tiers).toEqual(['core']);
  });
});
