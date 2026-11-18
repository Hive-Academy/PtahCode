import { FakeGraphRenderer } from './fake-graph-renderer';

const emptyModel = { nodes: [], edges: [], clusters: [] };

describe('FakeGraphRenderer', () => {
  it('records port calls', () => {
    const renderer = new FakeGraphRenderer();
    renderer.setModel(emptyModel);
    renderer.setSelection(['a']);
    renderer.zoom(1);
    expect(renderer.calls.map((call) => call.method)).toEqual(['setModel', 'setSelection', 'zoom']);
    expect(renderer.calls[1].args).toEqual([['a']]);
  });

  it('unsubscribes and clears listeners on destroy', () => {
    const renderer = new FakeGraphRenderer();
    const callback = jest.fn();
    const unsubscribe = renderer.on('nodeHover', callback);
    renderer.emit('nodeHover', { id: 'a' });
    unsubscribe();
    renderer.emit('nodeHover', { id: 'b' });
    renderer.on('nodeHover', callback);
    renderer.destroy();
    renderer.destroy();
    renderer.emit('nodeHover', { id: 'c' });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(renderer.calls.filter((call) => call.method === 'destroy')).toHaveLength(1);
  });
});
