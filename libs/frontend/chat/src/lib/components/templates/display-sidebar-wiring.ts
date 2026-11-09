import {
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import { ElectronLayoutService } from '@ptah-extension/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import { ArtifactStore } from '../../services/artifact.store';
import type { DisplayDockState } from '../../services/display-dock/display-dock.state';
import { DisplayWindowSync } from '../../services/display-window/display-window-sync.service';
import type { PanelResizeService } from '../../services/panel-resize.service';

/**
 * The Display sidebar's wiring for one chat view (TASK_2026_853_3401, B and D1).
 * Kept out of `ChatViewComponent` so the view only binds the result.
 */
export interface DisplaySidebarOptions {
  /** This view's dock store (its own, or the host's). */
  readonly dock: DisplayDockState;
  /** The tab this view shows. */
  readonly tabId: Signal<string | null>;
  /**
   * The main chat view (no session context) that renders its own sidebar:
   * auto-open for any known tab and the persisted width. Otherwise (a canvas
   * tile or host-dock embed), auto-open applies to this view's tab only.
   */
  readonly main: boolean;
  /** This view renders a Display sheet that can be detached. */
  readonly windowEnabled: boolean;
  /** This view's width store; seeded from the persisted width when `main`. */
  readonly resize: PanelResizeService;
}

export interface DisplaySidebarConnection {
  /**
   * Commits the sidebar width (drag end, key step, reset; `null` resets). A
   * no-op outside the main view. Never call it per drag frame: it persists.
   */
  commitWidth(width: number | null): void;
  /** The separate-window sync; `null` without a local Display sheet. */
  readonly window: DisplayWindowSync | null;
  readonly bound: Signal<boolean>;
  /**
   * Selects this view as the window source. `false` means the window must
   * not open: an embed without a tab would show another view's tab.
   */
  activateWindow(): boolean;
}

/** Must run in an injection context (a component constructor or field). */
export function connectDisplaySidebar(
  options: DisplaySidebarOptions,
): DisplaySidebarConnection {
  wireArtifactAutoOpen(options);
  if (!options.windowEnabled)
    return {
      commitWidth: () => undefined,
      window: null,
      bound: signal(false).asReadonly(),
      activateWindow: () => false,
    };

  const layout = options.main ? inject(ElectronLayoutService) : null;
  const { resize } = options;
  // Seed, and follow a later restore. The raw width is kept (an unbounded
  // container only applies the 300 px floor); ChatView's `dockWidth` clamps
  // it against the measured host on every read.
  if (layout !== null)
    effect(() => {
      const stored = layout.displaySidebarWidth();
      untracked(() => {
        if (resize.dragging()) return;
        if (stored === null) resize.resetWidth();
        else resize.setCustomWidth(stored, Number.POSITIVE_INFINITY);
      });
    });

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

  return {
    commitWidth: (width) => layout?.setDisplaySidebarWidth(width),
    window: displayWindow,
    bound: computed(() => displayWindow.isBoundSource(source)),
    activateWindow: () => displayWindow.selectSource(source) || options.main,
  };
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
}: DisplaySidebarOptions): void {
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
