import { CanvasRailFlip, visualOpacity } from './canvas-rail-flip';
import { RAIL_HAND_MOTION } from './canvas-rail-motion';

describe('visualOpacity', () => {
  it('keeps 0 from a fade that just started, and falls back to 1 only for no value', () => {
    // One element per case: jsdom caches an element's computed style.
    const withOpacity = (value: string): HTMLElement => {
      const element = document.createElement('div');
      element.style.opacity = value;
      return element;
    };
    expect(visualOpacity(withOpacity('0'))).toBe(0);
    expect(visualOpacity(withOpacity('0.4'))).toBeCloseTo(0.4);
    expect(visualOpacity(withOpacity(''))).toBe(1);
  });
});

/** jsdom lays nothing out: give an element one client rect, as a rendered box has. */
function rendered<T extends HTMLElement>(element: T, top = 0): T {
  Object.defineProperty(element, 'getClientRects', { value: () => ({ length: 1 }) });
  element.getBoundingClientRect = () => ({ top, height: 0 }) as DOMRect;
  return element;
}

function card(tabId: string, top = 0): HTMLLIElement {
  const element = rendered(document.createElement('li'), top);
  element.dataset['railCard'] = '';
  element.dataset['tabId'] = tabId;
  return element;
}

function animationMock(): Animation {
  const animation = {} as Animation;
  animation.cancel = () => queueMicrotask(() => animation.oncancel?.({} as AnimationPlaybackEvent));
  return animation;
}

describe('CanvasRailFlip', () => {
  it('carries the card with the largest delta and delays displaced cards and headers', () => {
    const container = document.createElement('div');
    const short = card('short');
    const long = card('long');
    const header = rendered(document.createElement('h2'));
    container.append(short, long, header);
    const calls: Array<{ element: Element; frames: Keyframe[]; options: KeyframeAnimationOptions }> = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      calls.push({ element: this, frames: frames as Keyframe[], options: options as KeyframeAnimationOptions });
      return animationMock();
    };
    try {
      const flip = new CanvasRailFlip(container);
      flip.play([
        { element: short, delta: 20, fresh: false, opacity: 1 },
        { element: long, delta: -80, fresh: false, opacity: 0.4 },
        { element: header, delta: 35, fresh: false, opacity: 1 },
      ]);
      expect(long.classList.contains('rail-card-carried')).toBe(true);
      expect(long.style.willChange).toBe('transform');
      expect(short.classList.contains('rail-card-carried')).toBe(false);
      expect(Number(calls[1].options.duration)).toBeGreaterThan(Number(calls[0].options.duration));
      expect(calls[0].options).toMatchObject({ delay: RAIL_HAND_MOTION.displacedDelayMs, fill: 'backwards' });
      expect(calls[3].options).toMatchObject({ delay: RAIL_HAND_MOTION.displacedDelayMs, fill: 'backwards' });
      expect(calls[1].frames.map((frame) => frame.offset)).toEqual([0, 0.15, 0.82, 0.9, 1]);
      expect(calls[1].frames[0]['opacity']).toBe(0.4);
      expect(calls[1].frames[0]['easing']).toBe(RAIL_HAND_MOTION.travelEasing);
      expect(calls[1].frames[2]['easing']).toBe(RAIL_HAND_MOTION.overshootEasing);
      expect(calls[1].frames[3]['easing']).toBe(RAIL_HAND_MOTION.settleEasing);
      expect(calls[2].options).toMatchObject({ pseudoElement: '::after', duration: calls[1].options.duration, fill: 'both' });
      expect(calls[2].frames.map((frame) => frame['opacity'])).toEqual([0, 1, 1, 0]);
      flip.cancel();
    } finally {
      Element.prototype.animate = original;
    }
  });

  it('drops fresh cards in and only fades them under reduced motion', () => {
    const element = card('fresh');
    const container = document.createElement('div');
    container.append(element);
    const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions }> = [];
    const originalAnimate = Element.prototype.animate;
    const originalMatchMedia = window.matchMedia;
    Element.prototype.animate = function (frames, options) {
      calls.push({ frames: frames as Keyframe[], options: options as KeyframeAnimationOptions });
      return animationMock();
    };
    try {
      const flip = new CanvasRailFlip(container);
      flip.play([{ element, delta: 0, fresh: true, opacity: 0.3 }]);
      expect(calls[0].frames[0]).toMatchObject({ transform: 'translateY(-12px) scale(0.97)', opacity: 0.3 });
      expect(calls[0].options.duration).toBe(RAIL_HAND_MOTION.freshMs);
      flip.cancel();
      Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: true }), configurable: true });
      flip.play([{ element, delta: 0, fresh: true, opacity: 0.3 }, { element, delta: 20, fresh: false, opacity: 1 }]);
      expect(calls).toHaveLength(2);
      expect(calls[1].frames).toEqual([{ opacity: 0.3 }, { opacity: 1 }]);
      expect(calls[1].options.duration).toBe(RAIL_HAND_MOTION.reducedFreshMs);
      flip.cancel();
    } finally {
      Element.prototype.animate = originalAnimate;
      Object.defineProperty(window, 'matchMedia', { value: originalMatchMedia, configurable: true });
    }
  });

  it.each(['finish', 'cancel'] as const)('cleans lifted state on %s', (event) => {
    const element = card('lift');
    const animation = animationMock();
    const original = Element.prototype.animate;
    const shadow = animationMock();
    Element.prototype.animate = (_frames, options) => (options as KeyframeAnimationOptions).pseudoElement ? shadow : animation;
    try {
      const flip = new CanvasRailFlip(document.createElement('div'));
      flip.play([{ element, delta: 40, fresh: false, opacity: 1 }]);
      expect(element.classList.contains('rail-card-carried')).toBe(true);
      if (event === 'finish') animation.onfinish?.({} as AnimationPlaybackEvent);
      else animation.oncancel?.({} as AnimationPlaybackEvent);
      expect(element.classList.contains('rail-card-carried')).toBe(false);
      expect(element.style.willChange).toBe('');
      expect(element.style.zIndex).toBe('');
    } finally {
      Element.prototype.animate = original;
    }
  });
  it('matches a recreated card by tab id and slides by its on-screen delta', () => {
    const container = document.createElement('div');
    const firstCard = card('session-1', 140);
    container.append(firstCard);
    const flip = new CanvasRailFlip(container);
    const first = flip.capture();

    // A clamped or anchored scroll between capture and measure is part of
    // the on-screen move, so the delta is in viewport space.
    const replacement = card('session-1', 180);
    firstCard.replaceWith(replacement);

    expect(first.get('card:session-1')).toEqual({ top: 140, opacity: 1, scale: 1 });
    expect(flip.measure(first)).toEqual([
      { element: replacement, delta: -40, fresh: false, opacity: 1, scale: 1 },
    ]);
  });

  it('cancels both running animations and ignores a late old cancel event', async () => {
    const container = document.createElement('div');
    const element = card('session-1', 0);
    container.append(element);
    const animations: Animation[] = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = () => {
      const animation = animationMock();
      animations.push(animation);
      return animation;
    };
    try {
      const flip = new CanvasRailFlip(container);
      flip.play([{ element, delta: 30, fresh: false, opacity: 1 }]);
      flip.play([{ element, delta: 10, fresh: false, opacity: 1 }]);
      expect(animations).toHaveLength(4);
      await Promise.resolve(); // old main oncancel arrives after the new lift starts
      expect(element.classList.contains('rail-card-carried')).toBe(true);
      expect(element.style.zIndex).toBe('1');
      flip.cancel();
      await Promise.resolve();
      expect(element.classList.contains('rail-card-carried')).toBe(false);
    } finally {
      Element.prototype.animate = original;
    }
  });

  it('resumes a scaled mid-lift card at the same visual top and size', () => {
    const container = document.createElement('div');
    const element = card('lifted');
    container.append(element);
    let top = 200;
    let scale = 1.03;
    element.getBoundingClientRect = () => ({ top, height: 100 }) as DOMRect;
    const originalStyle = window.getComputedStyle;
    const originalAnimate = Element.prototype.animate;
    const calls: Keyframe[][] = [];
    window.getComputedStyle = ((target: Element) => {
      const style = originalStyle(target);
      return { ...style, opacity: '1', transform: `matrix(${scale}, 0, 0, ${scale}, 0, 0)` } as CSSStyleDeclaration;
    }) as typeof getComputedStyle;
    Element.prototype.animate = (frames) => { calls.push(frames as Keyframe[]); return animationMock(); };
    try {
      const flip = new CanvasRailFlip(container);
      flip.play([{ element, delta: 40, fresh: false, opacity: 1 }]);
      const snapshot = flip.capture();
      expect(snapshot.get('card:lifted')).toEqual({ top: 200, opacity: 1, scale: 1.03 });
      scale = 1;
      top = 240;
      const [move] = flip.measure(snapshot);
      expect(move.delta).toBeCloseTo(-38.5); // -40 minus centered scale's -1.5px top shift
      flip.play([move]);
      expect(calls[2][0]['transform']).toBe('translateY(-38.5px) scale(1.03)');
      expect(calls[2][1]['transform']).toBe('translateY(-38.5px) scale(1.03)');
      flip.cancel();
    } finally {
      window.getComputedStyle = originalStyle;
      Element.prototype.animate = originalAnimate;
    }
  });

  it('marks new cards for entry and tolerates browsers without animate', () => {
    const container = document.createElement('div');
    container.append(card('new'));
    const flip = new CanvasRailFlip(container);
    const moves = flip.measure(new Map());
    expect(moves[0].fresh).toBe(true);
    expect(() => flip.play(moves)).not.toThrow();
  });

  it('skips cards that are not rendered, such as the folded finished list', () => {
    const container = document.createElement('div');
    const hidden = document.createElement('li');
    hidden.dataset['railCard'] = '';
    hidden.dataset['tabId'] = 'folded';
    // No mock: jsdom, like display: none, returns an empty rect list.
    container.append(hidden);
    const flip = new CanvasRailFlip(container);
    expect(flip.capture().has('card:folded')).toBe(false);
    expect(flip.measure(new Map())).toEqual([]);
  });

  it('animates only a section header, never a button nested in a card', () => {
    const container = document.createElement('div');
    const section = document.createElement('section');
    section.dataset['railGroup'] = 'running';
    const list = document.createElement('ul');
    const item = card('session-1');
    item.append(rendered(document.createElement('button')));
    list.append(item);
    section.append(list);
    container.append(section);
    const flip = new CanvasRailFlip(container);

    expect([...flip.capture().keys()]).toEqual(['card:session-1']);

    const header = rendered(document.createElement('h2'));
    section.prepend(header);
    const moves = flip.measure(new Map());
    expect(moves.map((move) => move.element)).toEqual([item, header]);
  });
});
