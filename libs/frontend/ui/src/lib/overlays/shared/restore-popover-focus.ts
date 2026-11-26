/** Restore focus if it belongs to the closing panel or was lost during detach. */
export function restorePopoverFocus(previous: HTMLElement | null, panel?: HTMLElement): void {
  if (!previous?.isConnected) return;
  const document = previous.ownerDocument;
  const active = document.activeElement;
  if (!active || active === document.body || panel?.contains(active)) {
    previous.focus({ preventScroll: true });
  }
}
