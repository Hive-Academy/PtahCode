import { DEFAULT_GRAPH_FILTERS, DEFAULT_GRAPH_VIEW } from '../../../services/memory-graph-state.service';

describe('graph defaults', () => {
  it.each([
    ['scope', DEFAULT_GRAPH_FILTERS.scope, 'workspace'],
    ['node cap', DEFAULT_GRAPH_FILTERS.maxNodes, 150],
    ['color', DEFAULT_GRAPH_VIEW.colorBy, 'kind'],
    ['size', DEFAULT_GRAPH_VIEW.sizeBy, 'salience'],
    ['labels', DEFAULT_GRAPH_VIEW.showLabels, false],
  ])('%s defaults to %s', (_name, actual, expected) => expect(actual).toBe(expected));
});
