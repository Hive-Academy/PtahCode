import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AppStateManager } from '@ptah-extension/core';
import type {
  MemoryGraphNodeWire,
  MemoryGraphResult,
  MemoryWire,
} from '@ptah-extension/shared';
import {
  MemoryGraphStateService,
  DEFAULT_GRAPH_FILTERS,
  DEFAULT_GRAPH_VIEW,
} from '../../services/memory-graph-state.service';
import { MemoryRpcService } from '../../services/memory-rpc.service';
import { MemoryStateService } from '../../services/memory-state.service';
import { FakeGraphRenderer } from './renderer/fake-graph-renderer';
import { GRAPH_RENDERER_FACTORY } from './renderer/graph-renderer.token';
import { MemoryGraphViewComponent } from './memory-graph-view.component';
import { MemoryGraphCanvasComponent } from './memory-graph-canvas.component';

const node = (id: string, pinned = false): MemoryGraphNodeWire => ({
  id,
  subject: id,
  preview: `Preview ${id}`,
  tier: 'core',
  kind: 'fact',
  salience: 0.7,
  hits: 2,
  pinned,
  sessionId: 's1',
  workspaceRoot: '/ws',
  createdAt: 1,
  lastUsedAt: 1,
});
const result: MemoryGraphResult = {
  nodes: [node('a'), node('b')],
  edges: [{ source: 'a', target: 'b', kind: 'subject', weight: 1 }],
  totalMatching: 2,
  capped: false,
  semanticAvailable: true,
  edgeCap: 900,
};
class MockGraphState {
  public readonly filters = signal(DEFAULT_GRAPH_FILTERS);
  public readonly result = signal<MemoryGraphResult | null>(result);
  public readonly loading = signal(false);
  public readonly error = signal<string | null>(null);
  public readonly selectedIds = signal<readonly string[]>([]);
  public readonly searchQuery = signal('');
  public readonly view = signal(DEFAULT_GRAPH_VIEW);
  public readonly nodes = computed(() => this.result()?.nodes ?? []);
  public readonly edges = computed(() => this.result()?.edges ?? []);
  public readonly capped = computed(() => this.result()?.capped ?? false);
  public readonly totalMatching = computed(
    () => this.result()?.totalMatching ?? 0,
  );
  public readonly semanticAvailable = computed(
    () => this.result()?.semanticAvailable ?? true,
  );
  // prettier-ignore
  public readonly selectedNodes = computed(() => this.selectedIds().flatMap(id => this.nodes().filter(item => item.id === id)));
  // prettier-ignore
  public readonly matchIds = computed(() => new Set(this.nodes().filter(item => item.subject?.includes(this.searchQuery())).map(item => item.id)));
  public readonly sessions = computed(() => ['s1']);
  public readonly edgeCounts = computed(() => ({
    semantic: 0,
    subject: this.edges().length,
    session: 0,
  }));
  public readonly isDefaultFilters = computed(
    () => this.filters().tiers.length === 0,
  );
  public readonly refresh = jest.fn().mockResolvedValue(undefined);
  public readonly showUpToMax = jest.fn().mockResolvedValue(undefined);
  public readonly patchFilters = jest.fn(
    (patch: Partial<typeof DEFAULT_GRAPH_FILTERS>) =>
      this.filters.update((old) => ({ ...old, ...patch })),
  );
  public readonly resetFilters = jest.fn(() =>
    this.filters.set(DEFAULT_GRAPH_FILTERS),
  );
  public readonly patchView = jest.fn(
    (patch: Partial<typeof DEFAULT_GRAPH_VIEW>) =>
      this.view.update((old) => ({ ...old, ...patch })),
  );
  public readonly setSearchQuery = jest.fn((value: string) =>
    this.searchQuery.set(value),
  );
  public readonly select = jest.fn((id: string, additive = false) =>
    this.selectedIds.set(additive ? [...this.selectedIds(), id] : [id]),
  );
  public readonly clearSelection = jest.fn(() => this.selectedIds.set([]));
  public readonly patchNode = jest.fn(
    (id: string, patch: Partial<MemoryGraphNodeWire>) =>
      this.result.update((old) =>
        old
          ? {
              ...old,
              nodes: old.nodes.map((item) =>
                item.id === id ? { ...item, ...patch } : item,
              ),
            }
          : old,
      ),
  );
  public readonly removeNodes = jest.fn((ids: readonly string[]) => {
    this.result.update((old) =>
      old
        ? { ...old, nodes: old.nodes.filter((item) => !ids.includes(item.id)) }
        : old,
    );
    this.selectedIds.set(this.selectedIds().filter((id) => !ids.includes(id)));
  });
}
describe('MemoryGraphViewComponent', () => {
  let state: MockGraphState;
  let memory: {
    error: ReturnType<typeof signal<string | null>>;
    pin: jest.Mock;
    unpin: jest.Mock;
    forget: jest.Mock;
  };
  let rpc: { get: jest.Mock };
  let renderer: FakeGraphRenderer;
  let fixture: ReturnType<
    typeof TestBed.createComponent<MemoryGraphViewComponent>
  >;
  let root: HTMLElement;
  const find = (id: string): HTMLElement | null =>
    root.querySelector(`[data-testid="${id}"]`);
  const button = (label: string): HTMLButtonElement | undefined =>
    [...root.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === label,
    );
  const flush = async (): Promise<void> => {
    await Promise.resolve();
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
  };
  beforeEach(() => {
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    });
    state = new MockGraphState();
    memory = {
      error: signal<string | null>(null),
      pin: jest.fn().mockResolvedValue(true),
      unpin: jest.fn().mockResolvedValue(true),
      forget: jest.fn().mockResolvedValue(true),
    };
    rpc = { get: jest.fn().mockResolvedValue({ memory: null, chunks: [] }) };
    renderer = new FakeGraphRenderer();
    TestBed.configureTestingModule({
      providers: [
        { provide: MemoryGraphStateService, useValue: state },
        { provide: MemoryStateService, useValue: memory },
        { provide: MemoryRpcService, useValue: rpc },
        {
          provide: AppStateManager,
          useValue: { workspaceInfo: signal({ path: '/ws' }) },
        },
        { provide: GRAPH_RENDERER_FACTORY, useValue: async () => renderer },
      ],
    });
    fixture = TestBed.createComponent(MemoryGraphViewComponent);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());

  it('renders the root and graph count', () => {
    expect(find('memory-graph-view')).toBeTruthy();
    expect(find('memory-graph-count')?.textContent).toContain(
      '2 memories · 1 links',
    );
  });
  it('refreshes after render', async () => {
    await flush();
    expect(state.refresh).toHaveBeenCalled();
  });
  it('shows loading', () => {
    state.result.set(null);
    state.loading.set(true);
    fixture.detectChanges();
    expect(find('memory-graph-loading')?.textContent).toContain(
      'Loading memory graph',
    );
  });
  it('shows empty', () => {
    state.result.set({ ...result, nodes: [], edges: [] });
    fixture.detectChanges();
    expect(find('memory-graph-empty')).toBeTruthy();
  });
  it('resets filtered empty', () => {
    state.result.set({ ...result, nodes: [] });
    state.filters.set({ ...DEFAULT_GRAPH_FILTERS, tiers: ['core'] });
    fixture.detectChanges();
    expect(find('memory-graph-filtered-empty')?.textContent).toContain(
      'No memories match these filters.',
    );
    button('Reset filters')?.click();
    expect(state.resetFilters).toHaveBeenCalled();
  });
  it('raises cap', () => {
    state.result.set({ ...result, capped: true });
    fixture.detectChanges();
    expect(find('memory-graph-capped')?.textContent).toContain('Showing 2 of');
    button('Show up to 1,500')?.click();
    expect(state.showUpToMax).toHaveBeenCalled();
  });
  it('emits openHealth', () => {
    const emit = jest.fn();
    fixture.componentInstance.openHealth.subscribe(emit);
    state.result.set({ ...result, semanticAvailable: false });
    fixture.detectChanges();
    expect(find('memory-graph-vec-off')?.textContent).toContain(
      'Semantic links are unavailable.',
    );
    button('Open Health')?.click();
    expect(emit).toHaveBeenCalled();
  });
  it('retries RPC error', () => {
    state.error.set('Error');
    fixture.detectChanges();
    expect(find('memory-graph-error')).toBeTruthy();
    expect(find('memory-graph-canvas')).toBeTruthy();
    button('Retry')?.click();
    expect(state.refresh).toHaveBeenCalled();
  });
  it('shows renderer error', () => {
    fixture.debugElement
      .query(By.directive(MemoryGraphCanvasComponent))
      .componentInstance.rendererError.emit('Renderer unavailable');
    fixture.detectChanges();
    expect(find('memory-graph-renderer-error')?.textContent).toContain(
      'Renderer unavailable',
    );
  });
  it('sends search input to state', () => {
    const input = find('memory-graph-search') as HTMLInputElement;
    input.value = 'a';
    input.dispatchEvent(new Event('input'));
    expect(state.setSearchQuery).toHaveBeenCalledWith('a');
  });
  it('highlights search matches', async () => {
    state.searchQuery.set('a');
    await flush();
    expect(
      renderer.calls.some(
        (call) =>
          call.method === 'setHighlight' &&
          (call.args[0] as Set<string>)?.has('a'),
      ),
    ).toBe(true);
  });
  it('selects a node from the canvas', async () => {
    await flush();
    renderer.emit('nodeClick', { id: 'a', additive: false });
    expect(state.select).toHaveBeenCalledWith('a', false);
  });
  it('clears selection from canvas', () => {
    state.select('a');
    fixture.detectChanges();
    fixture.debugElement
      .query(By.directive(MemoryGraphCanvasComponent))
      .componentInstance.selectionClear.emit();
    expect(state.clearSelection).toHaveBeenCalled();
  });
  it('loads selected detail', async () => {
    const detail = { id: 'a', content: 'Full content' } as MemoryWire;
    rpc.get.mockResolvedValue({ memory: detail, chunks: [] });
    state.selectedIds.set(['a']);
    await flush();
    expect(find('memory-inspector')?.textContent).toContain('Full content');
  });
  it('keeps selected detail when the node is patched', async () => {
    rpc.get.mockResolvedValue({
      memory: { id: 'a', content: 'Full content' } as MemoryWire,
      chunks: [],
    });
    state.selectedIds.set(['a']);
    await flush();
    const calls = rpc.get.mock.calls.length;
    state.patchNode('a', { pinned: true });
    await flush();
    expect(rpc.get).toHaveBeenCalledTimes(calls);
    expect(find('memory-inspector')?.textContent).toContain('Full content');
  });
  it('drops a late detail response', async () => {
    let resolve!: (value: { memory: MemoryWire | null; chunks: [] }) => void;
    rpc.get.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolve = res;
        }),
    );
    state.selectedIds.set(['a']);
    fixture.detectChanges();
    state.selectedIds.set(['b']);
    await flush();
    resolve({
      memory: { id: 'a', content: 'Stale' } as MemoryWire,
      chunks: [],
    });
    await flush();
    expect(find('memory-inspector')?.textContent).not.toContain('Stale');
  });
  it('keeps preview when detail fails', async () => {
    rpc.get.mockRejectedValue(new Error('private'));
    state.selectedIds.set(['a']);
    await flush();
    expect(find('memory-inspector')?.textContent).toContain('Preview a');
    expect(root.textContent).not.toContain('private');
  });
  it.each(['pin', 'unpin', 'forget'] as const)(
    'runs single %s',
    async (action) => {
      state.selectedIds.set(['a']);
      fixture.detectChanges();
      await fixture.componentInstance['runAction'](action, ['a']);
      expect(memory[action]).toHaveBeenCalledWith('a');
      expect(
        action === 'forget' ? state.removeNodes : state.patchNode,
      ).toHaveBeenCalled();
    },
  );
  it.each(['pin', 'unpin', 'forget'] as const)(
    'runs bulk %s in order',
    async (action) => {
      await fixture.componentInstance['runAction'](action, ['a', 'b']);
      expect(memory[action].mock.calls.map((call) => call[0])).toEqual([
        'a',
        'b',
      ]);
    },
  );
  it('stops bulk actions on exposed error', async () => {
    memory.pin.mockImplementationOnce(() => {
      memory.error.set('Pin failed');
      return Promise.resolve(false);
    });
    await fixture.componentInstance['runAction']('pin', ['a', 'b']);
    fixture.detectChanges();
    expect(memory.pin).toHaveBeenCalledTimes(1);
    expect(find('memory-graph-action-error')?.textContent).toContain(
      'Pin failed',
    );
  });
  it.each(['pin', 'unpin', 'forget'] as const)(
    'does not patch nodes after failed %s',
    async (action) => {
      memory[action].mockResolvedValueOnce(false);
      await fixture.componentInstance['runAction'](action, ['a', 'b']);
      fixture.detectChanges();
      expect(memory[action]).toHaveBeenCalledTimes(1);
      expect(state.patchNode).not.toHaveBeenCalled();
      expect(state.removeNodes).not.toHaveBeenCalled();
      expect(find('memory-graph-action-error')?.textContent).toContain(
        'Memory action failed.',
      );
    },
  );
  it('shows narrow layout flags', () => {
    fixture.componentInstance['layout'].set('narrow');
    fixture.detectChanges();
    expect(find('memory-graph-filters')).toBeTruthy();
    expect(find('memory-graph-rail')).toBeNull();
  });
});
