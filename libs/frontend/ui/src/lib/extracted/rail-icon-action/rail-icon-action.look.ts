import { InjectionToken, type Provider } from '@angular/core';

export interface CanvasRailActionLook {
  readonly classes: string;
}

export const DEFAULT_CANVAS_RAIL_ACTION_LOOK: CanvasRailActionLook = {
  classes: 'btn btn-ghost btn-xs',
};

export const CANVAS_RAIL_ACTION_LOOK = new InjectionToken<CanvasRailActionLook>(
  'Canvas rail icon action look',
  { providedIn: 'root', factory: () => DEFAULT_CANVAS_RAIL_ACTION_LOOK },
);

export function provideCanvasRailActionLook(
  look: CanvasRailActionLook = DEFAULT_CANVAS_RAIL_ACTION_LOOK,
): Provider {
  return { provide: CANVAS_RAIL_ACTION_LOOK, useValue: look };
}
