import { RAIL_HAND_MOTION, carriedFrames, displacedFrames, freshFrames, shadowFrames } from './canvas-rail-motion';

/**
 * Paint-only rail motion (FLIP). Keys survive Angular moving a card between
 * group views, so a card recreated in another group still slides from where
 * it was. Positions are viewport positions: capture and measure run in one
 * task, so a user scroll cannot fall between them, and a clamped or anchored
 * scroll moves a card on screen exactly as much as the slide shows.
 */
export interface RailFlipSnapshot {
  readonly top: number;
  /** Below 1 while a fade-in was in flight; the new animation resumes it. */
  readonly opacity: number;
  /** Visual scale at capture time, before an interrupted animation is cancelled. */
  readonly scale: number;
}

export interface RailFlipMove {
  readonly element: HTMLElement;
  readonly delta: number;
  readonly fresh: boolean;
  readonly opacity: number;
  readonly scale?: number;
}

export class CanvasRailFlip {
  private readonly running = new Map<HTMLElement, Animation>();
  private readonly shadows = new Map<HTMLElement, Animation>();
  private readonly lifted = new Set<HTMLElement>();

  constructor(private readonly container: HTMLElement) {}

  /** First: the visual position (and fade) of every rendered card and header. */
  capture(): Map<string, RailFlipSnapshot> {
    const snapshots = new Map<string, RailFlipSnapshot>();
    // All reads first, then the cancels, so one layout serves every read.
    for (const [key, element] of this.elements()) {
      const opacity = this.running.has(element) ? visualOpacity(element) : 1;
      const scale = this.running.has(element) ? visualScale(element) : 1;
      snapshots.set(key, { top: element.getBoundingClientRect().top, opacity, scale });
    }
    this.cancel();
    return snapshots;
  }

  /** Last + Invert: how far each element moved since `first`. */
  measure(first: ReadonlyMap<string, RailFlipSnapshot>): RailFlipMove[] {
    const moves: RailFlipMove[] = [];
    for (const [key, element] of this.elements()) {
      const previous = first.get(key);
      const lastRect = element.getBoundingClientRect();
      const scale = previous?.scale ?? 1;
      moves.push({
        element,
        // A centered scale shifts the visual top by half the change in height.
        delta: previous ? previous.top - lastRect.top - lastRect.height * (1 - scale) / 2 : 0,
        fresh: !previous,
        opacity: previous ? previous.opacity : 0,
        scale,
      });
    }
    return moves;
  }

  play(moves: readonly RailFlipMove[]): void {
    if (typeof Element.prototype.animate !== 'function') return;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const carried = reduced ? undefined : moves.filter((move) => !move.fresh && Math.abs(move.delta) >= 1 && move.element.matches('[data-rail-card]'))
      .reduce<RailFlipMove | undefined>((largest, move) => !largest || Math.abs(move.delta) > Math.abs(largest.delta) ? move : largest, undefined);
    for (const { element, delta, fresh, opacity, scale = 1 } of moves) {
      const moved = Math.abs(delta) >= 1;
      if (reduced && !fresh) continue;
      if (!fresh && !moved && opacity >= 1) continue;
      this.running.get(element)?.cancel();
      this.clearLift(element);
      const isCarried = element === carried?.element;
      const duration = motionDuration(delta, fresh, reduced, isCarried);
      if (isCarried) {
        element.classList.add('rail-card-carried');
        element.style.zIndex = '1';
        this.lifted.add(element);
      }
      if (!reduced) element.style.willChange = 'transform';
      const frames = motionFrames(delta, opacity, scale, fresh, reduced, isCarried);
      const animation = element.animate(frames, {
        duration,
        delay: !fresh && !isCarried ? RAIL_HAND_MOTION.displacedDelayMs : 0,
        fill: !fresh && !isCarried ? 'backwards' : 'none',
        easing: isCarried ? 'linear' : RAIL_HAND_MOTION.travelEasing,
      });
      this.running.set(element, animation);
      if (isCarried) {
        this.shadows.set(element, element.animate(shadowFrames(), {
          duration, pseudoElement: '::after', easing: 'linear', fill: 'both',
        }));
      }
      const cleanup = () => {
        if (this.running.get(element) !== animation) return;
        this.running.delete(element);
        element.style.removeProperty('will-change');
        this.clearLift(element);
      };
      animation.onfinish = cleanup;
      animation.oncancel = cleanup;
    }
  }

  cancel(): void {
    for (const [element, animation] of this.running) {
      animation.cancel();
      element.style.removeProperty('will-change');
      this.clearLift(element);
    }
    this.running.clear();
    this.shadows.clear();
    for (const element of this.lifted) this.clearLift(element);
  }

  private clearLift(element: HTMLElement): void {
    this.shadows.get(element)?.cancel();
    this.shadows.delete(element);
    element.classList.remove('rail-card-carried');
    element.style.removeProperty('z-index');
    element.style.removeProperty('will-change');
    this.lifted.delete(element);
  }

  private elements(): Array<[string, HTMLElement]> {
    const result: Array<[string, HTMLElement]> = [];
    for (const card of this.container.querySelectorAll<HTMLElement>('[data-rail-card][data-tab-id]')) {
      const id = card.getAttribute('data-tab-id');
      if (id && isRendered(card)) result.push([`card:${id}`, card]);
    }
    for (const group of this.container.querySelectorAll<HTMLElement>('[data-rail-group]')) {
      const key = group.getAttribute('data-rail-group');
      // Only the section's own header; a collapsed rail has none, and a
      // nested card button must never get a second transform.
      const header = group.querySelector<HTMLElement>(':scope > h2, :scope > button');
      if (key && header && isRendered(header)) result.push([`group:${key}`, header]);
    }
    return result;
  }
}

/**
 * A card in the folded "finished" list (display: none) has a zero rect.
 * Skip it, so it fades in when the list opens instead of sliding from the top.
 */
function isRendered(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

/** The in-flight opacity; 0 (a fade that just started) is a real value. */
export function visualOpacity(element: HTMLElement): number {
  const value = Number.parseFloat(getComputedStyle(element).opacity);
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 1;
}

/** The first matrix component is scaleX for the rail's translateY + uniform scale. */
export function visualScale(element: HTMLElement): number {
  const transform = getComputedStyle(element).transform;
  const match = /^matrix(?:3d)?\(([^,]+),/.exec(transform);
  const value = match ? Number.parseFloat(match[1]) : 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function motionDuration(delta: number, fresh: boolean, reduced: boolean, carried: boolean): number {
  const m = RAIL_HAND_MOTION;
  if (carried) return Math.min(m.carriedMaxMs, Math.max(m.carriedMinMs, m.carriedBaseMs + Math.abs(delta) * m.carriedMsPerPx));
  if (fresh) return reduced ? m.reducedFreshMs : m.freshMs;
  return m.displacedMs;
}

function motionFrames(delta: number, opacity: number, scale: number, fresh: boolean, reduced: boolean, carried: boolean): Keyframe[] {
  if (reduced) return [{ opacity }, { opacity: 1 }];
  if (fresh) return freshFrames(opacity);
  if (carried) return carriedFrames(delta, opacity, scale);
  return displacedFrames(delta, opacity, scale);
}
