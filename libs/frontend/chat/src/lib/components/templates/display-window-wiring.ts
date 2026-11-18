import {
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  untracked,
  type Signal,
} from '@angular/core';

import { TabManagerService } from '@ptah-extension/chat-state';
import { ArtifactStore } from '../../services/artifact.store';
import type { DisplayDockState } from '../../services/display-dock/display-dock.state';
import { DisplayWindowSync } from '../../services/display-window/display-window-sync.service';

export interface DisplayWindowOptions {
  /** This view's dock store (its own, or the host's). */
  readonly dock: DisplayDockState;
  /** The tab this view shows. */
  readonly tabId: Signal<string | null>;
  /** Main views may route publications from any workspace tab. */
  readonly main: boolean;
}

/** Must run in an injection context (a component constructor or field). */
export function connectDisplayWindowSource(
  options: DisplayWindowOptions,
): void {
  wireArtifactAutoOpen(options);
  const displayWindow = inject(DisplayWindowSync);
  const host = inject(ElementRef<HTMLElement>).nativeElement;
  const focusVersion = signal(0);
  const activate = () => focusVersion.update((value) => value + 1);
  if (options.main) {
    host.addEventListener('focusin', activate);
    host.addEventListener('pointerdown', activate);
  }
  const source = {
    tabId: options.tabId,
    dock: options.dock,
    focusVersion,
    passive: !options.main,
  };
  const unbind = displayWindow.bindSource(source);
  inject(DestroyRef).onDestroy(() => {
    host.removeEventListener('focusin', activate);
    host.removeEventListener('pointerdown', activate);
    unbind();
  });
}

/**
 * Applies each new `ArtifactStore.autoOpenRequest` once. A request made
 * before this view existed is not replayed. The main view opens the record's
 * tab when any workspace holds it; any other view only its own tab. An
 * unknown tab gets no open (the reply card still works).
 */
function wireArtifactAutoOpen({
  dock,
  tabId,
  main,
}: DisplayWindowOptions): void {
  const store = inject(ArtifactStore);
  const tabs = inject(TabManagerService);
  let lastSeq = untracked(store.autoOpenRequest)?.seq ?? 0;
  effect(() => {
    const request = store.autoOpenRequest();
    if (request === null || request.seq <= lastSeq) return;
    lastSeq = request.seq;
    const { record } = request;
    untracked(() => {
      const target = main
        ? (tabs.findTabByIdAcrossWorkspaces(record.sessionId)?.tab.id ?? null)
        : record.sessionId === tabId()
          ? record.sessionId
          : null;
      if (target !== null) dock.requestArtifactAutoOpen(target, record.id);
    });
  });
}
