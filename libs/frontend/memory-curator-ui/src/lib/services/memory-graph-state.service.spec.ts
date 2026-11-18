import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppStateManager } from '@ptah-extension/core';
import type { MemoryGraphResult } from '@ptah-extension/shared';
import { MemoryGraphStateService } from './memory-graph-state.service';
import { MemoryRpcService } from './memory-rpc.service';

const node = (id: string) => ({
  id,
  subject: id,
  preview: '',
  tier: 'core' as const,
  kind: 'fact' as const,
  salience: 0.5,
  hits: 0,
  pinned: false,
  sessionId: null,
  workspaceRoot: '/ws',
  createdAt: 1,
  lastUsedAt: 1,
});
const result: MemoryGraphResult = {
  nodes: [node('a'), node('b')],
  edges: [
    { source: 'a', target: 'b', kind: 'semantic', weight: 0.6 },
    { source: 'a', target: 'b', kind: 'subject', weight: 1 },
  ],
  totalMatching: 3,
  capped: true,
  semanticAvailable: false,
  edgeCap: 900,
};

describe('MemoryGraphStateService', () => {
  const workspaceInfo = signal<{ path: string } | null>({ path: '/ws' });
  let service: MemoryGraphStateService;
  let graph: jest.Mock;
  beforeEach(() => {
    workspaceInfo.set({ path: '/ws' });
    jest.useFakeTimers();
    graph = jest.fn().mockResolvedValue(result);
    TestBed.configureTestingModule({
      providers: [
        MemoryGraphStateService,
        { provide: MemoryRpcService, useValue: { graph } },
        { provide: AppStateManager, useValue: { workspaceInfo } },
      ],
    });
    service = TestBed.inject(MemoryGraphStateService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    jest.useRealTimers();
  });
  it('keeps the latest response and the last good result on failure', async () => {
    let resolveFirst: (value: MemoryGraphResult) => void = () => {
      throw new Error('unassigned');
    };
    graph
      .mockImplementationOnce(
        () =>
          new Promise<MemoryGraphResult>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(result)
      .mockRejectedValueOnce(new Error('secret'));
    const first = service.refresh();
    await service.refresh();
    resolveFirst({ ...result, nodes: [] });
    await first;
    expect(service.nodes()).toHaveLength(2);
    await service.refresh();
    expect(service.nodes()).toHaveLength(2);
    expect(service.error()).toBeTruthy();
    expect(service.error()).not.toContain('secret');
  });
  it.each([
    ['hide semantic', { edgeKinds: ['subject'] as const }, ['subject']],
    ['raise threshold', { minSimilarity: 0.75 }, ['subject']],
    ['restore both', { minSimilarity: 0.5 }, ['semantic', 'subject']],
    ['hide all', { edgeKinds: [] as const }, []],
  ])('%s without RPC', async (_name, patch, kinds) => {
    await service.refresh();
    service.patchFilters(patch);
    expect(service.edges().map((edge) => edge.kind)).toEqual(kinds);
    expect(service.edgeCounts()).toEqual({
      semantic: 1,
      subject: 1,
      session: 0,
    });
    expect(graph).toHaveBeenCalledTimes(1);
  });
  it('keeps the session choices after a session filter is applied', async () => {
    const inSession = (id: string, sessionId: string) => ({
      ...node(id),
      sessionId,
    });
    graph
      .mockResolvedValueOnce({
        ...result,
        nodes: [inSession('a', 's1'), inSession('b', 's2'), node('c')],
      })
      .mockResolvedValueOnce({ ...result, nodes: [inSession('a', 's1')] })
      .mockResolvedValueOnce({ ...result, nodes: [inSession('b', 's2')] });
    await service.refresh();
    expect(service.sessions()).toEqual(['s1', 's2']);
    service.patchFilters({ sessionId: 's1' });
    await service.refresh();
    expect(service.nodes()).toHaveLength(1);
    expect(service.sessions()).toEqual(['s1', 's2']);
    service.patchFilters({ sessionId: null });
    await service.refresh();
    expect(service.sessions()).toEqual(['s2']);
  });
  it('refreshes the session choices when other filters change', async () => {
    const inSession = (id: string, sessionId: string) => ({
      ...node(id),
      sessionId,
    });
    graph
      .mockResolvedValueOnce({
        ...result,
        nodes: [inSession('a', 's1'), inSession('b', 's2')],
      })
      .mockResolvedValueOnce({ ...result, nodes: [inSession('a', 's1')] })
      .mockResolvedValueOnce({ ...result, nodes: [inSession('a', 's1')] })
      .mockResolvedValueOnce({
        ...result,
        nodes: [inSession('a', 's1'), inSession('d', 's3')],
      });
    await service.refresh();
    service.patchFilters({ sessionId: 's1' });
    await service.refresh();
    expect(graph).toHaveBeenCalledTimes(2);
    service.patchFilters({ pinnedOnly: true });
    await service.refresh();
    expect(graph).toHaveBeenCalledTimes(4);
    expect(graph.mock.calls[2][0]).toMatchObject({ sessionId: 's1' });
    expect(graph.mock.calls[3][0]).toMatchObject({ pinnedOnly: true });
    expect(graph.mock.calls[3][0]).not.toHaveProperty('sessionId');
    expect(service.nodes()).toHaveLength(1);
    expect(service.sessions()).toEqual(['s1', 's3']);
  });
  it('keeps the selected session when the choices request fails', async () => {
    graph
      .mockResolvedValueOnce({ ...result, nodes: [] })
      .mockRejectedValueOnce(new Error('secret'));
    service.patchFilters({ sessionId: 's1' });
    await service.refresh();
    expect(service.sessions()).toEqual(['s1']);
    expect(service.error()).toBeNull();
  });
  it('removes a session choice when its last node is removed', async () => {
    graph.mockResolvedValueOnce({
      ...result,
      nodes: [
        { ...node('a'), sessionId: 's1' },
        { ...node('b'), sessionId: 's2' },
        { ...node('c'), sessionId: 's2' },
      ],
    });
    await service.refresh();
    service.removeNodes(['b']);
    expect(service.sessions()).toEqual(['s1', 's2']);
    service.removeNodes(['a']);
    expect(service.sessions()).toEqual(['s2']);
  });
  it('clears the old graph when a refresh with new filters fails', async () => {
    graph
      .mockResolvedValueOnce(result)
      .mockRejectedValueOnce(new Error('secret'))
      .mockRejectedValueOnce(new Error('secret'));
    await service.refresh();
    service.select('a');
    await service.refresh();
    expect(service.nodes()).toHaveLength(2);
    expect(service.selectedIds()).toEqual(['a']);
    service.patchFilters({ pinnedOnly: true });
    await service.refresh();
    expect(service.nodes()).toHaveLength(0);
    expect(service.selectedIds()).toEqual([]);
    expect(service.error()).toBeTruthy();
  });
  it('drops the session choices when a refresh with new filters fails', async () => {
    const inSession = (id: string, sessionId: string) => ({
      ...node(id),
      sessionId,
    });
    graph
      .mockResolvedValueOnce({
        ...result,
        nodes: [inSession('a', 's1'), inSession('b', 's2')],
      })
      .mockRejectedValueOnce(new Error('secret'))
      .mockRejectedValueOnce(new Error('secret'));
    await service.refresh();
    service.patchFilters({ sessionId: 's1' });
    await service.refresh();
    expect(service.nodes()).toHaveLength(0);
    expect(service.sessions()).toEqual(['s1', 's2']);
    service.patchFilters({ pinnedOnly: true });
    await service.refresh();
    expect(service.sessions()).toEqual(['s1']);
  });
  it('debounces server filters and sends explicit scope', async () => {
    service.patchFilters({ scope: 'all' });
    service.patchFilters({ pinnedOnly: true });
    jest.advanceTimersByTime(249);
    expect(graph).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(graph).toHaveBeenCalledTimes(1);
    expect(graph.mock.calls[0][0]).toMatchObject({
      scope: 'all',
      pinnedOnly: true,
      minSimilarity: 0.5,
    });
    expect(graph.mock.calls[0][0]).not.toHaveProperty('workspaceRoot');
  });
  it('selects in order, removes and patches nodes', async () => {
    await service.refresh();
    service.select('b');
    service.select('a', true);
    service.select('b', true);
    expect(service.selectedIds()).toEqual(['b', 'a']);
    service.patchNode('a', { pinned: true });
    expect(service.selectedNodes()[1].pinned).toBe(true);
    service.removeNodes(['b']);
    expect(service.selectedIds()).toEqual(['a']);
    expect(service.nodes().map((item) => item.id)).toEqual(['a']);
  });
  it('deselects one id and clears selection when the workspace changes', async () => {
    await service.refresh();
    service.select('a');
    service.select('b', true);
    service.deselect('a');
    expect(service.selectedIds()).toEqual(['b']);
    workspaceInfo.set({ path: '/other' });
    TestBed.flushEffects();
    expect(service.selectedIds()).toEqual([]);
  });
  it('clears old result and selection when no workspace is open', async () => {
    await service.refresh();
    service.select('a');
    workspaceInfo.set(null);
    await service.refresh();
    expect(service.result()).toBeNull();
    expect(service.selectedIds()).toEqual([]);
    expect(service.error()).toBe('No workspace is open.');
  });
  it('exposes cap and semantic availability and resets filters', async () => {
    await service.refresh();
    expect(service.capped()).toBe(true);
    expect(service.totalMatching()).toBe(3);
    expect(service.semanticAvailable()).toBe(false);
    service.patchFilters({ minSimilarity: 0.9 });
    expect(service.isDefaultFilters()).toBe(false);
    service.resetFilters();
    expect(service.isDefaultFilters()).toBe(true);
  });
});
