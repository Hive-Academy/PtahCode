import type { GraphModel } from '../model/graph.types';
import type { GraphRendererEvents, GraphRendererPort } from './graph-renderer.port';

type Call = { method: string; args: readonly unknown[] };

export class FakeGraphRenderer implements GraphRendererPort {
  public readonly calls: Call[] = [];
  private readonly listeners = new Map<keyof GraphRendererEvents, Set<(payload: never) => void>>();
  private destroyed = false;
  private model: GraphModel | null = null;

  public mount(container: HTMLElement, options: { reducedMotion: boolean }): void { this.record('mount', container, options); }
  public setModel(model: GraphModel): void { this.model = model; this.record('setModel', model); }
  public setSelection(ids: readonly string[]): void { this.record('setSelection', ids); }
  public setHighlight(ids: ReadonlySet<string> | null): void { this.record('setHighlight', ids); }
  public setFrozen(on: boolean): void { this.record('setFrozen', on); }
  public setLabelsVisible(on: boolean): void { this.record('setLabelsVisible', on); }
  public relayout(): void { this.record('relayout'); }
  public fit(): void { this.record('fit'); }
  public zoom(delta: 1 | -1): void { this.record('zoom', delta); }
  public focus(id: string): void { this.record('focus', id); }
  public positions(): ReadonlyMap<string, { x: number; y: number }> {
    this.record('positions');
    return new Map(this.model?.nodes.map((node, index) => [node.id, { x: index, y: 0 }]) ?? []);
  }
  public viewport(): { x: number; y: number; width: number; height: number } | null { this.record('viewport'); return null; }
  public on<K extends keyof GraphRendererEvents>(event: K, callback: (payload: GraphRendererEvents[K]) => void): () => void {
    const set = this.listeners.get(event) ?? new Set<(payload: never) => void>();
    this.listeners.set(event, set);
    const listener = callback as (payload: never) => void;
    set.add(listener);
    return () => set.delete(listener);
  }
  public emit<K extends keyof GraphRendererEvents>(event: K, payload: GraphRendererEvents[K]): void {
    if (this.destroyed) return;
    for (const callback of this.listeners.get(event) ?? []) callback(payload as never);
  }
  public resize(): void { this.record('resize'); }
  public destroy(): void { if (this.destroyed) return; this.destroyed = true; this.listeners.clear(); this.record('destroy'); }
  private record(method: string, ...args: unknown[]): void { this.calls.push({ method, args }); }
}
