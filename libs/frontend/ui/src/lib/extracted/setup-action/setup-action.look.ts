import { InjectionToken, type Provider } from '@angular/core';

/** Each look preserves one class list from the setup source pages. */
export type SetupActionLook = 'primaryCompact' | 'primaryFull' | 'ghost' | 'glass';

export const SETUP_ACTION_LOOK = new InjectionToken<SetupActionLook>('SETUP_ACTION_LOOK', {
  providedIn: 'root',
  factory: () => 'primaryCompact',
});

export function provideSetupActionLook(look: SetupActionLook = 'primaryCompact'): Provider {
  return { provide: SETUP_ACTION_LOOK, useValue: look };
}
