import { TestBed } from '@angular/core/testing';
import { FakeGraphRenderer } from './renderer/fake-graph-renderer';
import { GRAPH_RENDERER_FACTORY } from './renderer/graph-renderer.token';
import { MemoryGraphCanvasComponent } from './memory-graph-canvas.component';
import type { GraphModel } from './model/graph.types';

const model: GraphModel = {
  nodes: [
    {
      id: 'a',
      label: 'A',
      color: '#fff',
      size: 5,
      cluster: '',
      pinned: false,
      core: false,
      wire: {
        id: 'a',
        subject: 'Alpha',
        preview: '',
        tier: 'core',
        kind: 'fact',
        salience: 1,
        hits: 0,
        pinned: false,
        sessionId: null,
        workspaceRoot: null,
        createdAt: 0,
        lastUsedAt: 0,
      },
    },
    {
      id: 'b',
      label: 'B',
      color: '#fff',
      size: 5,
      cluster: '',
      pinned: false,
      core: false,
      wire: {
        id: 'b',
        subject: null,
        preview: '',
        tier: 'recall',
        kind: 'event',
        salience: 1,
        hits: 0,
        pinned: false,
        sessionId: null,
        workspaceRoot: null,
        createdAt: 0,
        lastUsedAt: 0,
      },
    },
  ],
  edges: [],
  clusters: [],
};

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('MemoryGraphCanvasComponent', () => {
  let fake: FakeGraphRenderer;
  beforeEach(() => {
    fake = new FakeGraphRenderer();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: true }),
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: GRAPH_RENDERER_FACTORY,
          useValue: () => Promise.resolve(fake),
        },
      ],
    });
  });
  async function create() {
    const fixture = TestBed.createComponent(MemoryGraphCanvasComponent);
    fixture.componentRef.setInput('model', model);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    return fixture;
  }
  it('mounts with reduced motion, propagates inputs and announces load', async () => {
    const fixture = await create();
    expect(fake.calls.find((call) => call.method === 'mount')?.args[1]).toEqual(
      { reducedMotion: true },
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Graph loaded, 2 memories',
    );
    fixture.componentRef.setInput('selectedIds', ['a']);
    fixture.componentRef.setInput('highlightIds', new Set(['b']));
    fixture.componentRef.setInput('frozen', true);
    fixture.componentRef.setInput('showLabels', true);
    fixture.componentRef.setInput('model', { ...model, edges: [] });
    fixture.detectChanges();
    for (const method of [
      'setModel',
      'setSelection',
      'setHighlight',
      'setFrozen',
      'setLabelsVisible',
    ])
      expect(fake.calls.some((call) => call.method === method)).toBe(true);
    expect(
      fake.calls.findLast((call) => call.method === 'setFrozen')?.args[0],
    ).toBe(true);
  });
  it('forwards renderer events and handles navigation without moving DOM focus', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    const selects: { id: string; additive: boolean }[] = [];
    let clears = 0;
    component.nodeSelect.subscribe((value) => selects.push(value));
    component.selectionClear.subscribe(() => clears++);
    fixture.componentRef.setInput('model', {
      ...model,
      edges: [
        {
          id: 'ab',
          source: 'a',
          target: 'b',
          kind: 'subject',
          weight: 1,
          dash: 'solid',
          opacity: 1,
        },
      ],
    });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.focus();
    fake.emit('nodeClick', { id: 'a', additive: false });
    fake.emit('stageClick', undefined);
    for (const key of [
      'ArrowRight',
      'ArrowLeft',
      'ArrowUp',
      'ArrowDown',
      ']',
      '[',
      'Enter',
      'Escape',
      '+',
      '-',
      '0',
    ])
      host.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    host.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(document.activeElement).toBe(host);
    expect(selects).toContainEqual({ id: 'a', additive: false });
    expect(selects.some((value) => value.additive)).toBe(true);
    expect(clears).toBe(2);
    expect(fake.calls.some((call) => call.method === 'focus')).toBe(true);
    expect(fake.calls.some((call) => call.method === 'zoom')).toBe(true);
    expect(fake.calls.some((call) => call.method === 'fit')).toBe(true);
    fixture.detectChanges();
    expect(
      host.querySelector('[data-testid="memory-graph-live"]')?.textContent,
    ).toContain('links');
  });
  it('leaves Enter on zoom buttons and modified shortcuts to their controls', async () => {
    const fixture = await create();
    const host = fixture.nativeElement as HTMLElement;
    const selects: string[] = [];
    fixture.componentInstance.nodeSelect.subscribe(({ id }) =>
      selects.push(id),
    );
    const button = host.querySelector(
      'button[aria-label="Zoom in"]',
    ) as HTMLButtonElement;
    const buttonEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(buttonEvent);
    expect(buttonEvent.defaultPrevented).toBe(false);
    const zoomBefore = fake.calls.filter(
      (call) => call.method === 'zoom',
    ).length;
    for (const modifier of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
    ]) {
      const event = new KeyboardEvent('keydown', {
        key: '+',
        bubbles: true,
        cancelable: true,
        ...modifier,
      });
      host.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(fake.calls.filter((call) => call.method === 'zoom')).toHaveLength(
      zoomBefore,
    );
    expect(selects).toEqual([]);
  });
  it('focuses and announces the first node on an arrow, but does not select on unfocused Enter', async () => {
    const fixture = await create();
    const host = fixture.nativeElement as HTMLElement;
    const selects: string[] = [];
    fixture.componentInstance.nodeSelect.subscribe(({ id }) =>
      selects.push(id),
    );
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(selects).toEqual([]);
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(
      fake.calls.findLast((call) => call.method === 'focus')?.args[0],
    ).toBe('a');
    fixture.detectChanges();
    expect(
      host.querySelector('[data-testid="memory-graph-live"]')?.textContent,
    ).toContain('Alpha');
    fixture.componentRef.setInput('model', {
      ...model,
      nodes: [model.nodes[1]],
      edges: [],
    });
    fixture.detectChanges();
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(selects).toEqual([]);
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(
      fake.calls.findLast((call) => call.method === 'focus')?.args[0],
    ).toBe('b');
  });
  it('uses model edges for link navigation and resets the link index when focus changes', async () => {
    const fixture = await create();
    const host = fixture.nativeElement as HTMLElement;
    const c = {
      ...model.nodes[1],
      id: 'c',
      wire: { ...model.nodes[1].wire, id: 'c', subject: 'Gamma' },
    };
    fixture.componentRef.setInput('model', {
      ...model,
      nodes: [...model.nodes, c],
      edges: [
        {
          id: 'ab',
          source: 'a',
          target: 'b',
          kind: 'subject',
          weight: 1,
          dash: 'solid',
          opacity: 1,
        },
        {
          id: 'ac',
          source: 'a',
          target: 'c',
          kind: 'subject',
          weight: 1,
          dash: 'solid',
          opacity: 1,
        },
      ],
    });
    fixture.componentRef.setInput('edges', [
      { source: 'a', target: 'missing', kind: 'subject', weight: 1 },
    ]);
    fixture.detectChanges();
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    fixture.detectChanges();
    expect(
      host.querySelector('[data-testid="memory-graph-live"]')?.textContent,
    ).toContain('2 links');
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: ']', bubbles: true }),
    );
    expect(
      fake.calls.findLast((call) => call.method === 'focus')?.args[0],
    ).toBe('b');
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: ']', bubbles: true }),
    );
    expect(
      fake.calls.findLast((call) => call.method === 'focus')?.args[0],
    ).toBe('b');
  });
  it('destroys the renderer', async () => {
    const fixture = await create();
    fixture.destroy();
    expect(fake.calls.some((call) => call.method === 'destroy')).toBe(true);
  });
  it('destroys a renderer resolved after component destruction', async () => {
    let resolve!: (value: FakeGraphRenderer) => void;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: GRAPH_RENDERER_FACTORY,
          useValue: () =>
            new Promise<FakeGraphRenderer>((done) => {
              resolve = done;
            }),
        },
      ],
    });
    const fixture = TestBed.createComponent(MemoryGraphCanvasComponent);
    fixture.componentRef.setInput('model', model);
    fixture.detectChanges();
    fixture.destroy();
    resolve(fake);
    await settle();
    expect(fake.calls.some((call) => call.method === 'destroy')).toBe(true);
  });
  it('shows and emits a safe error when the factory rejects', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: GRAPH_RENDERER_FACTORY,
          useValue: () => Promise.reject(new Error('secret')),
        },
      ],
    });
    const fixture = TestBed.createComponent(MemoryGraphCanvasComponent);
    const errors: string[] = [];
    fixture.componentInstance.rendererError.subscribe((value) =>
      errors.push(value),
    );
    fixture.componentRef.setInput('model', model);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    expect(errors).toEqual(['Memory graph could not be displayed. secret']);
    expect(
      fixture.nativeElement.querySelector('[role="alert"]'),
    ).not.toBeNull();
  });
  it('emits the original renderer mount error detail', async () => {
    fake.mount = () => {
      throw new Error('WebGL unavailable');
    };
    const fixture = TestBed.createComponent(MemoryGraphCanvasComponent);
    const errors: string[] = [];
    fixture.componentInstance.rendererError.subscribe((value) =>
      errors.push(value),
    );
    fixture.componentRef.setInput('model', model);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    expect(errors).toEqual([
      'Memory graph could not be displayed. WebGL unavailable',
    ]);
    expect(
      fixture.nativeElement.querySelector('[role="alert"]'),
    ).not.toBeNull();
  });
});
