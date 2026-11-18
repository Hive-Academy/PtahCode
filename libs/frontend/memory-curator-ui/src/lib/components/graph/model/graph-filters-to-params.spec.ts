import { DEFAULT_GRAPH_FILTERS } from '../../../services/memory-graph-state.service';
import { graphFiltersToParams } from './graph-filters-to-params';

describe('graphFiltersToParams', () => {
  it.each([
    ['workspace', { scope: 'workspace' as const }, '/work', '/work'],
    ['all', { scope: 'all' as const }, '/work', undefined],
    ['missing root', { scope: 'workspace' as const }, null, undefined],
  ])('%s scope', (_name, patch, root, expectedRoot) => {
    const params = graphFiltersToParams({ ...DEFAULT_GRAPH_FILTERS, ...patch }, root);
    expect(params.scope).toBe(patch.scope);
    expect(params.workspaceRoot).toBe(expectedRoot);
    expect('workspaceRoot' in params).toBe(expectedRoot !== undefined);
  });
  it.each([
    ['empty', [], [], undefined, undefined],
    ['one each', ['core'] as const, ['fact'] as const, ['core'], ['fact']],
  ])('%s selections', (_name, tiers, kinds, expectedTiers, expectedKinds) => {
    const params = graphFiltersToParams({ ...DEFAULT_GRAPH_FILTERS, tiers, kinds }, '/work');
    expect(params.tiers).toEqual(expectedTiers);
    expect(params.kinds).toEqual(expectedKinds);
    expect(params.edgeKinds).toBeUndefined();
    expect(params.minSimilarity).toBe(0.5);
  });
});
