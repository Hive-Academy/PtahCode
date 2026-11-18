import type { GraphModel } from '../model/graph.types';

export interface GraphRendererEvents {
  nodeClick: { id: string; additive: boolean };
  stageClick: void;
  nodeHover: { id: string | null };
  layoutState: { running: boolean };
  viewportChange: void;
}

export interface GraphRendererPort {
  mount(container: HTMLElement, options: { reducedMotion: boolean }): void;
  setModel(model: GraphModel): void;
  setSelection(ids: readonly string[]): void;
  setHighlight(ids: ReadonlySet<string> | null): void;
  setFrozen(on: boolean): void;
  setLabelsVisible(on: boolean): void;
  relayout(): void;
  fit(): void;
  zoom(delta: 1 | -1): void;
  focus(id: string): void;
  positions(): ReadonlyMap<string, { x: number; y: number }>;
  viewport(): { x: number; y: number; width: number; height: number } | null;
  on<K extends keyof GraphRendererEvents>(event: K, callback: (payload: GraphRendererEvents[K]) => void): () => void;
  resize(): void;
  destroy(): void;
}
