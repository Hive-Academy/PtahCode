/**
 * Shared Overlay Position Configurations
 *
 * Reusable ConnectedPosition configurations for dropdowns, popovers, and autocomplete.
 * These match existing CSS positioning patterns (absolute bottom-full, left-0, right-0).
 */

import type { CdkConnectedOverlayConfig, ConnectedPosition } from '@angular/cdk/overlay';
import type { Placement } from '@floating-ui/dom';

export const CONNECTED_OVERLAY_POLICY: CdkConnectedOverlayConfig = {
  viewportMargin: 8,
  flexibleDimensions: true,
  growAfterOpen: true,
  push: true,
  disableClose: true,
};

// CDK delivers outside clicks from the newest pane to the oldest, followed
// by the DOM backdrop click. A child can consume dismissal for this click.
const dismissedClicks = new WeakSet<MouseEvent>();

export function claimOverlayDismissal(event: MouseEvent): boolean {
  if (dismissedClicks.has(event)) return false;
  dismissedClicks.add(event);
  return true;
}

// Projection can outlive the panel that contains the anchor. Drain its
// connected children before detaching the parent or restoring parent focus.
const connectedChildren = new Set<{ anchor: HTMLElement; detach: () => void }>();

export function registerConnectedChild(anchor: HTMLElement, detach: () => void): () => void {
  const child = { anchor, detach };
  connectedChildren.add(child);
  return () => connectedChildren.delete(child);
}

export function detachConnectedChildren(panel: HTMLElement): void {
  for (const child of connectedChildren) {
    if (panel.contains(child.anchor)) child.detach();
  }
}

export function connectedPopoverPositions(
  placement: Placement,
  offset: number,
): ConnectedPosition[] {
  const [side, alignment] = placement.split('-');
  const direction = { top: 'above', bottom: 'below', left: 'before', right: 'after' }[side] ?? 'below';
  return POPOVER_POSITION_MAP[direction].map((position) => {
    const vertical = position.originY !== 'center';
    const x = alignment === 'start' || alignment === 'end' ? alignment : 'center';
    const y = alignment === 'start' ? 'top' : alignment === 'end' ? 'bottom' : 'center';
    return vertical
      ? { ...position, originX: x, overlayX: x, offsetY: Math.sign(position.offsetY ?? 0) * offset }
      : { ...position, originY: y, overlayY: y, offsetX: Math.sign(position.offsetX ?? 0) * offset };
  });
}

/**
 * Default dropdown positions: below first, above as fallback
 * Matches existing: class="absolute bottom-full left-0 right-0 mb-1"
 * Left-aligned (originX: 'start')
 */
export const DROPDOWN_POSITIONS: ConnectedPosition[] = [
  {
    originX: 'start',
    originY: 'bottom',
    overlayX: 'start',
    overlayY: 'top',
    offsetY: 8,
  },
  {
    originX: 'start',
    originY: 'top',
    overlayX: 'start',
    overlayY: 'bottom',
    offsetY: -8,
  },
];

/**
 * Right-aligned dropdown positions: below first, above as fallback
 * For sidebar contexts where dropdowns should align to the right to avoid cutoff
 * Right-aligned (originX: 'end')
 */
export const DROPDOWN_POSITIONS_END: ConnectedPosition[] = [
  {
    originX: 'end',
    originY: 'bottom',
    overlayX: 'end',
    overlayY: 'top',
    offsetY: 8,
  },
  {
    originX: 'end',
    originY: 'top',
    overlayX: 'end',
    overlayY: 'bottom',
    offsetY: -8,
  },
];

/**
 * Popover position configurations for 4 directions
 * Supports: above, below, before, after
 * Center-aligned
 */
export const POPOVER_POSITION_MAP: Record<string, ConnectedPosition[]> = {
  below: [
    {
      originX: 'center',
      originY: 'bottom',
      overlayX: 'center',
      overlayY: 'top',
      offsetY: 8,
    },
    {
      originX: 'center',
      originY: 'top',
      overlayX: 'center',
      overlayY: 'bottom',
      offsetY: -8,
    },
  ],
  above: [
    {
      originX: 'center',
      originY: 'top',
      overlayX: 'center',
      overlayY: 'bottom',
      offsetY: -8,
    },
    {
      originX: 'center',
      originY: 'bottom',
      overlayX: 'center',
      overlayY: 'top',
      offsetY: 8,
    },
  ],
  before: [
    {
      originX: 'start',
      originY: 'center',
      overlayX: 'end',
      overlayY: 'center',
      offsetX: -8,
    },
    {
      originX: 'end',
      originY: 'center',
      overlayX: 'start',
      overlayY: 'center',
      offsetX: 8,
    },
  ],
  after: [
    {
      originX: 'end',
      originY: 'center',
      overlayX: 'start',
      overlayY: 'center',
      offsetX: 8,
    },
    {
      originX: 'start',
      originY: 'center',
      overlayX: 'end',
      overlayY: 'center',
      offsetX: -8,
    },
  ],
};

/**
 * Right-aligned popover position configurations for 4 directions
 * For sidebar contexts where popovers should align to the right to avoid cutoff
 */
export const POPOVER_POSITION_END_MAP: Record<string, ConnectedPosition[]> = {
  below: [
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 8,
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -8,
    },
  ],
  above: [
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -8,
    },
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 8,
    },
  ],
  before: [
    {
      originX: 'start',
      originY: 'center',
      overlayX: 'end',
      overlayY: 'center',
      offsetX: -8,
    },
    {
      originX: 'end',
      originY: 'center',
      overlayX: 'start',
      overlayY: 'center',
      offsetX: 8,
    },
  ],
  after: [
    {
      originX: 'end',
      originY: 'center',
      overlayX: 'start',
      overlayY: 'center',
      offsetX: 8,
    },
    {
      originX: 'start',
      originY: 'center',
      overlayX: 'end',
      overlayY: 'center',
      offsetX: -8,
    },
  ],
};

/**
 * Autocomplete positions: below input, match width
 * Small offset to prevent overlap with input border
 */
export const AUTOCOMPLETE_POSITIONS: ConnectedPosition[] = [
  {
    originX: 'start',
    originY: 'bottom',
    overlayX: 'start',
    overlayY: 'top',
    offsetY: 4,
  },
  {
    originX: 'start',
    originY: 'top',
    overlayX: 'start',
    overlayY: 'bottom',
    offsetY: -4,
  },
];

/**
 * Autocomplete positions: ABOVE input first (fallback below)
 * Ideal for chat input at bottom of sidebar/viewport.
 * Shows suggestions above the input to maximize visible space.
 */
export const AUTOCOMPLETE_POSITIONS_ABOVE: ConnectedPosition[] = [
  {
    originX: 'start',
    originY: 'top',
    overlayX: 'start',
    overlayY: 'bottom',
    offsetY: -4,
  },
  {
    originX: 'start',
    originY: 'bottom',
    overlayX: 'start',
    overlayY: 'top',
    offsetY: 4,
  },
];
