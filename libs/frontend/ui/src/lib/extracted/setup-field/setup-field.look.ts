import { InjectionToken, type Provider } from '@angular/core';

/** The two select frames observed in setup. */
export type SetupFieldLook = 'model' | 'workspace';

export const SETUP_FIELD_LOOK = new InjectionToken<SetupFieldLook>('SETUP_FIELD_LOOK', {
  providedIn: 'root',
  factory: () => 'model',
});

export function provideSetupFieldLook(look: SetupFieldLook = 'model'): Provider {
  return { provide: SETUP_FIELD_LOOK, useValue: look };
}
