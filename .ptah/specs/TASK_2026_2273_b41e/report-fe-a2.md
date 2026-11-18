# FE-A2 renderer seam

## Files

- `libs/frontend/memory-curator-ui/src/lib/components/graph/renderer/graph-renderer.port.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/graph/renderer/graph-renderer.token.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/graph/renderer/sigma-renderer.adapter.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/graph/renderer/fake-graph-renderer.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/graph/renderer/fake-graph-renderer.spec.ts`

## Final port (verbatim)

```typescript
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
```

## Sigma 4 API evidence

- Constructor: `sigma.d.ts:82`.
- Camera and graph coordinates: `sigma.d.ts:161, 227-230`; `core/camera.d.ts:37, 42, 44`.
- Click/hover/stage event payloads: `types.d.ts:163-209`; camera updated event: `core/camera.d.ts`.
- Settings, resize, render, kill: `sigma.d.ts:194-209, 245`; setting `renderLabels`: `settings.d.ts:5`; default size/color/label bindings: `types.d.ts:305-322, 349-357`.
- Worker start/stop/kill: `graphology-layout-forceatlas2/worker.d.ts:8-18`; synchronous assign/infer: `graphology-layout-forceatlas2/index.d.ts:50-63`.

## Checks

- Jest fake spec: 2 passed.
- `ngc --noEmit --project libs/frontend/memory-curator-ui/tsconfig.lib.json`: passed; one unrelated NG8107 warning in `components/diagnostics/db-health-panel.component.ts:178`.
- ESLint on five changed files: passed; Nx module-boundary rule skipped because no cached ProjectGraph.
- `ptah_get_diagnostics`: unavailable after 45 s, scoped TypeScript check still running; `ngc` is authoritative here.

## Decisions

- Deterministic id hash places only new nodes; existing graphology coordinates survive model updates. Reversible: yes.
- Edge kinds use the shared `semantic`, `subject`, `session` contract, with distinct color and opacity. WebGL edges have no dash in this stable subset. Reversible: yes.
- The worker stops after four seconds or on freeze; reduced motion runs 80 synchronous iterations. Reversible: yes.

## Electron visual review

Inspect lazy chunk loading and the runtime `data-renderer` marker, graph placement after layout, node selection/search dimming, label visibility, camera focus/fit/zoom, minimap viewport, freeze, reduced motion, and edge color distinction. Compare canvas, legend, minimap and motion with the Thoth graph design. The adapter has no browser or WebGL Jest coverage.
