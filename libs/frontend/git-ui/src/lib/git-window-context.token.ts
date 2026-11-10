import { InjectionToken } from '@angular/core';
import type { GitWindowMode, GitWindowScope } from '@ptah-extension/shared';

/** Host actions for the same Git surface in the main and child renderers. */
export type GitWindowContext =
  | { readonly role: 'main'; readonly detach?: () => void }
  | {
      readonly role: 'child';
      /** Update the child GIT_SESSION_SCOPE_SOURCE adapter synchronously. */
      readonly applyCandidates: (scope: GitWindowScope) => void;
      /** The main renderer owns pin state and republishes the accepted scope. */
      readonly setMode: (mode: GitWindowMode, tabId: string | null) => Promise<boolean>;
    };

export const GIT_WINDOW_CONTEXT = new InjectionToken<GitWindowContext>('GIT_WINDOW_CONTEXT');
