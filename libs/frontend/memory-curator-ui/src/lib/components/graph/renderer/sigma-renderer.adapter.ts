import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import Sigma from 'sigma';
import type { GraphModel, RenderEdge, RenderNode } from '../model/graph.types';
import type {
  GraphRendererEvents,
  GraphRendererPort,
} from './graph-renderer.port';

export const SIGMA_ADAPTER_MARKER = 'ptah-sigma-adapter';

type Point = { x: number; y: number };
type NodeBase = { label: string; size: number; color: string };
type EdgeBase = { size: number; color: string; source: string; target: string };

function startPosition(id: string): Point {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const angle = ((hash >>> 0) / 4294967296) * Math.PI * 2;
  const radius = 0.4 + ((hash >>> 8) % 1000) / 2500;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function edgeColor(edge: RenderEdge): string {
  const rgb =
    edge.kind === 'semantic'
      ? '105, 179, 236'
      : edge.kind === 'subject'
        ? '244, 178, 85'
        : '147, 171, 192';
  return `rgba(${rgb}, ${Math.max(0, Math.min(1, edge.opacity))})`;
}

class SigmaRenderer implements GraphRendererPort {
  private readonly graph = new Graph({ multi: true });
  private sigma: Sigma | null = null;
  private layout: FA2Layout | null = null;
  private observer: ResizeObserver | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Map<
    keyof GraphRendererEvents,
    Set<(payload: never) => void>
  >();
  private readonly nodeBase = new Map<string, NodeBase>();
  private readonly edgeBase = new Map<string, EdgeBase>();
  private readonly sigmaCleanup: Array<() => void> = [];
  private selected = new Set<string>();
  private highlighted: ReadonlySet<string> | null = null;
  private labelsVisible = false;
  private frozen = false;
  private reducedMotion = false;
  private destroyed = false;
  private hasModel = false;

  public mount(
    container: HTMLElement,
    options: { reducedMotion: boolean },
  ): void {
    if (this.destroyed || this.sigma) return;
    this.reducedMotion = options.reducedMotion;
    container.dataset['renderer'] = SIGMA_ADAPTER_MARKER;
    const sigma = new Sigma(this.graph, container, {
      settings: { allowInvalidContainer: true },
    });
    this.sigma = sigma;
    const clickNode = ({
      node,
      event,
    }: {
      node: string;
      event: { original: MouseEvent | TouchEvent };
    }) => {
      const original = event.original;
      this.emit('nodeClick', {
        id: node,
        additive:
          original instanceof MouseEvent &&
          (original.shiftKey || original.ctrlKey || original.metaKey),
      });
    };
    const enterNode = ({ node }: { node: string }) =>
      this.emit('nodeHover', { id: node });
    const leaveNode = () => this.emit('nodeHover', { id: null });
    const clickStage = () => this.emit('stageClick', undefined);
    const viewportChange = () => this.emit('viewportChange', undefined);
    sigma.on('clickNode', clickNode);
    sigma.on('enterNode', enterNode);
    sigma.on('leaveNode', leaveNode);
    sigma.on('clickStage', clickStage);
    sigma.getCamera().on('updated', viewportChange);
    this.sigmaCleanup.push(
      () => sigma.off('clickNode', clickNode),
      () => sigma.off('enterNode', enterNode),
      () => sigma.off('leaveNode', leaveNode),
      () => sigma.off('clickStage', clickStage),
      () => sigma.getCamera().off('updated', viewportChange),
    );
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    sigma.setSettings({ renderLabels: false });
  }

  public setModel(model: GraphModel): void {
    if (this.destroyed) return;
    this.stopLayout();
    const incomingNodes = new Set(model.nodes.map((node) => node.id));
    const incomingEdges = new Set(model.edges.map((edge) => edge.id));
    for (const id of this.graph.edges())
      if (!incomingEdges.has(id)) this.graph.dropEdge(id);
    for (const id of this.graph.nodes())
      if (!incomingNodes.has(id)) this.graph.dropNode(id);
    for (const id of this.nodeBase.keys())
      if (!incomingNodes.has(id)) this.nodeBase.delete(id);
    for (const id of this.edgeBase.keys())
      if (!incomingEdges.has(id)) this.edgeBase.delete(id);
    for (const node of model.nodes) this.upsertNode(node);
    for (const edge of model.edges) {
      if (!incomingNodes.has(edge.source) || !incomingNodes.has(edge.target))
        continue;
      this.upsertEdge(edge);
    }
    this.hasModel = true;
    this.applyAppearance();
    if (!this.frozen && this.graph.order > 0) this.startLayout();
    this.sigma?.scheduleRender();
    this.emit('viewportChange', undefined);
  }

  private upsertNode(node: RenderNode): void {
    const point = this.graph.hasNode(node.id)
      ? {
          x: this.graph.getNodeAttribute(node.id, 'x') as number,
          y: this.graph.getNodeAttribute(node.id, 'y') as number,
        }
      : startPosition(node.id);
    this.nodeBase.set(node.id, {
      label: node.label,
      size: node.size,
      color: node.color,
    });
    const attributes = {
      ...point,
      size: node.size,
      color: node.color,
      label: node.label,
    };
    if (this.graph.hasNode(node.id))
      this.graph.replaceNodeAttributes(node.id, attributes);
    else this.graph.addNode(node.id, attributes);
  }

  private upsertEdge(edge: RenderEdge): void {
    const base = {
      source: edge.source,
      target: edge.target,
      size: Math.max(0.5, edge.weight * 2),
      color: edgeColor(edge),
    };
    this.edgeBase.set(edge.id, base);
    if (
      this.graph.hasEdge(edge.id) &&
      (this.graph.source(edge.id) !== edge.source ||
        this.graph.target(edge.id) !== edge.target)
    )
      this.graph.dropEdge(edge.id);
    if (this.graph.hasEdge(edge.id))
      this.graph.replaceEdgeAttributes(edge.id, {
        size: base.size,
        color: base.color,
      });
    else
      this.graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
        size: base.size,
        color: base.color,
      });
  }

  public setSelection(ids: readonly string[]): void {
    this.selected = new Set(ids);
    this.applyAppearance();
  }
  public setHighlight(ids: ReadonlySet<string> | null): void {
    this.highlighted = ids;
    this.applyAppearance();
  }
  public setLabelsVisible(on: boolean): void {
    this.labelsVisible = on;
    this.applyAppearance();
  }

  private applyAppearance(): void {
    for (const [id, base] of this.nodeBase) {
      if (!this.graph.hasNode(id)) continue;
      const selected = this.selected.has(id);
      const dimmed =
        this.highlighted !== null && !this.highlighted.has(id) && !selected;
      const color = dimmed ? '#56616d' : base.color;
      this.graph.mergeNodeAttributes(id, {
        color,
        size: selected ? base.size * 1.35 : base.size,
        label: this.labelsVisible || selected ? base.label : '',
      });
    }
    for (const [id, base] of this.edgeBase) {
      if (!this.graph.hasEdge(id)) continue;
      const dimmed =
        this.highlighted !== null &&
        !this.highlighted.has(base.source) &&
        !this.highlighted.has(base.target);
      this.graph.mergeEdgeAttributes(id, {
        color: dimmed ? 'rgba(86, 97, 109, 0.12)' : base.color,
        size: base.size,
      });
    }
    this.sigma?.setSettings({
      renderLabels: this.labelsVisible || this.selected.size > 0,
    });
    this.sigma?.scheduleRender();
  }

  public setFrozen(on: boolean): void {
    this.frozen = on;
    if (on) this.stopLayout();
  }

  public relayout(): void {
    if (!this.frozen && this.hasModel && this.graph.order > 0)
      this.startLayout();
  }

  private startLayout(): void {
    this.stopLayout();
    if (this.reducedMotion) {
      this.emit('layoutState', { running: true });
      forceAtlas2.assign(this.graph, {
        iterations: 80,
        settings: forceAtlas2.inferSettings(this.graph),
      });
      this.sigma?.scheduleRender();
      this.emit('layoutState', { running: false });
      this.emit('viewportChange', undefined);
      return;
    }
    this.layout ??= new FA2Layout(this.graph, {
      settings: forceAtlas2.inferSettings(this.graph),
    });
    this.layout.start();
    this.emit('layoutState', { running: true });
    this.stopTimer = setTimeout(() => this.stopLayout(), 4000);
  }

  private stopLayout(): void {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    if (this.layout?.isRunning()) {
      this.layout.stop();
      this.emit('layoutState', { running: false });
      this.emit('viewportChange', undefined);
    }
  }

  public fit(): void {
    if (!this.sigma || !this.graph.order) return;
    const points = [...this.positions().values()].map(
      (point) => this.sigma?.graphToFramedGraph(point) ?? point,
    );
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    const y = (Math.min(...ys) + Math.max(...ys)) / 2;
    const ratio =
      Math.max(
        0.15,
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      ) * 1.25;
    this.moveCamera({ x, y, ratio });
  }

  public zoom(delta: 1 | -1): void {
    if (!this.sigma) return;
    const ratio =
      this.sigma.getCamera().getState().ratio * (delta === 1 ? 0.8 : 1.25);
    this.moveCamera({ ratio });
  }

  public focus(id: string): void {
    if (!this.sigma || !this.graph.hasNode(id)) return;
    const point = this.sigma.graphToFramedGraph({
      x: this.graph.getNodeAttribute(id, 'x') as number,
      y: this.graph.getNodeAttribute(id, 'y') as number,
    });
    this.moveCamera(point);
  }

  private moveCamera(
    state: Partial<{ x: number; y: number; ratio: number }>,
  ): void {
    const camera = this.sigma?.getCamera();
    if (!camera) return;
    if (this.reducedMotion) camera.setState(state);
    else void camera.animate(state, { duration: 300 });
  }

  public positions(): ReadonlyMap<string, Point> {
    const points = new Map<string, Point>();
    this.graph.forEachNode((id, attributes) =>
      points.set(id, {
        x: attributes['x'] as number,
        y: attributes['y'] as number,
      }),
    );
    return points;
  }

  public viewport(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null {
    if (!this.sigma) return null;
    const { width, height } = this.sigma.getDimensions();
    if (width <= 0 || height <= 0) return null;
    const corners = [
      this.sigma.viewportToGraph({ x: 0, y: 0 }),
      this.sigma.viewportToGraph({ x: width, y: 0 }),
      this.sigma.viewportToGraph({ x: 0, y: height }),
      this.sigma.viewportToGraph({ x: width, y: height }),
    ];
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }

  public on<K extends keyof GraphRendererEvents>(
    event: K,
    callback: (payload: GraphRendererEvents[K]) => void,
  ): () => void {
    const set =
      this.listeners.get(event) ?? new Set<(payload: never) => void>();
    this.listeners.set(event, set);
    const listener = callback as (payload: never) => void;
    set.add(listener);
    return () => set.delete(listener);
  }

  private emit<K extends keyof GraphRendererEvents>(
    event: K,
    payload: GraphRendererEvents[K],
  ): void {
    for (const callback of this.listeners.get(event) ?? [])
      callback(payload as never);
  }

  public resize(): void {
    this.sigma?.resize();
    this.emit('viewportChange', undefined);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopLayout();
    this.layout?.kill();
    this.layout = null;
    this.observer?.disconnect();
    this.observer = null;
    for (const cleanup of this.sigmaCleanup) cleanup();
    this.sigmaCleanup.length = 0;
    this.sigma?.kill();
    this.sigma = null;
    this.listeners.clear();
  }
}

export function createSigmaRenderer(): GraphRendererPort {
  return new SigmaRenderer();
}
