import { InjectionToken } from '@angular/core';
import type { GraphRendererPort } from './graph-renderer.port';

export const GRAPH_RENDERER_FACTORY = new InjectionToken<() => Promise<GraphRendererPort>>(
  'GRAPH_RENDERER_FACTORY',
  {
    providedIn: 'root',
    factory: () => () => import('./sigma-renderer.adapter').then((m) => m.createSigmaRenderer()),
  }
);
