/**
 * CDK connected overlays reposition for the viewport and for ancestors marked
 * `cdkScrollable`. Settings panes, the providers page, and the main-agent
 * editor body scroll without that registration, so an open panel stays put
 * while its trigger moves. Callers also lose track of a portaled panel because
 * it is no longer a descendant of the trigger's host.
 */

export interface OwnedOverlayRegistration {
  /** The panel element, once the portal has attached it. */
  attachPanel(panel: HTMLElement | null): void;
  unregister(): void;
}

interface OwnedOverlay {
  anchor: HTMLElement;
  panel: HTMLElement | null;
}

const ownedOverlays = new Set<OwnedOverlay>();
const ownedListeners = new Set<() => void>();

function notifyOwnedOverlays(): void {
  for (const listener of ownedListeners) listener();
}

/**
 * Track a portaled overlay by the trigger that still lives in the owning
 * subtree. `unregister` runs on close and on destroy. Panel focus can move
 * outside that subtree; `focusInOwnedOverlay` still treats it as inside.
 */
export function registerOwnedOverlay(anchor: HTMLElement): OwnedOverlayRegistration {
  const entry: OwnedOverlay = { anchor, panel: null };
  ownedOverlays.add(entry);
  notifyOwnedOverlays();
  let active = true;
  return {
    attachPanel(panel: HTMLElement | null): void {
      if (!active || entry.panel === panel) return;
      entry.panel = panel;
      notifyOwnedOverlays();
    },
    unregister(): void {
      if (!active) return;
      active = false;
      ownedOverlays.delete(entry);
      notifyOwnedOverlays();
    },
  };
}

/** True while any registered overlay's anchor is still inside `root`. */
export function ownedOverlayAnchoredIn(root: HTMLElement): boolean {
  for (const entry of ownedOverlays) {
    if (entry.anchor.isConnected && root.contains(entry.anchor)) return true;
  }
  return false;
}

/** True when focus is inside a panel whose anchor is inside `root`. */
export function focusInOwnedOverlay(root: HTMLElement, active: Element | null): boolean {
  if (!active) return false;
  for (const entry of ownedOverlays) {
    if (!entry.panel || !root.contains(entry.anchor)) continue;
    if (entry.panel.contains(active)) return true;
  }
  return false;
}

/** Subscribe to open, panel-attach, and close. The listener is not called immediately. */
export function watchOwnedOverlays(listener: () => void): () => void {
  ownedListeners.add(listener);
  return () => {
    ownedListeners.delete(listener);
  };
}

function scrollAffectsOrigin(origin: HTMLElement, target: EventTarget | null): boolean {
  const doc = origin.ownerDocument;
  if (
    target === doc ||
    target === doc.defaultView ||
    target === doc.scrollingElement ||
    target === doc.documentElement
  ) {
    return true;
  }
  return target instanceof Element && target !== origin && target.contains(origin);
}

/**
 * Reposition while `origin` is on screen. Listens in the capture phase on the
 * document (scroll does not bubble) and directly on the ancestors present at
 * registration, so an unregistered overflow container still moves the panel.
 * Scrolling the portaled panel does not: that target does not contain `origin`.
 * Bursts in one turn share one reposition. The returned function removes both
 * listeners and drops a queued reposition.
 */
export function watchAncestorScroll(origin: HTMLElement, reposition: () => void): () => void {
  const doc = origin.ownerDocument;
  const ancestors: EventTarget[] = [];
  for (let node = origin.parentElement; node; node = node.parentElement) ancestors.push(node);

  let pending = false;
  let stopped = false;
  const onScroll = (event: Event): void => {
    if (stopped || !scrollAffectsOrigin(origin, event.target)) return;
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (!stopped && origin.isConnected) reposition();
    });
  };

  doc.addEventListener('scroll', onScroll, true);
  for (const ancestor of ancestors) ancestor.addEventListener('scroll', onScroll);
  return () => {
    stopped = true;
    doc.removeEventListener('scroll', onScroll, true);
    for (const ancestor of ancestors) ancestor.removeEventListener('scroll', onScroll);
  };
}
