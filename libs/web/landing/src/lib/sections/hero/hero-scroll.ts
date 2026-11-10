import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/** The layer fade spans 0.9 viewports of scroll, as on main. */
export const PIN_VIEWPORTS = 0.9;

export interface HeroScrollHooks {
  /** Progress (0 to 1) of the pinned fade of the background, symbols and footnote. */
  readonly onLayers: (progress: number) => void;
  /** Progress (0 to 1) of the centred copy's fade at the bottom of the hero. */
  readonly onCopy: (progress: number) => void;
}

/**
 * Desktop scroll choreography of the hero.
 *
 * - One pin holds the stage for the whole hero: from the top of the page until
 *   the bottom of the hero section reaches the top of the viewport. The copy
 *   (eyebrow, title, lead, CTAs) therefore never moves: the browser keeps it
 *   in place, and no scrubbed counter-move runs behind the scroll (that
 *   counter-move lagged the compositor by a frame and made the title shake).
 * - The pin adds no spacing. The section's bottom padding gives the first
 *   `PIN_VIEWPORTS` of scroll; after it the next section slides over the
 *   pinned stage.
 * - During that first distance the still, grain, symbols (with their
 *   lightning canvas), footnote and the frame's vignette fade and lift.
 * - The copy fades only as the bottom of the hero (where the next section
 *   begins) passes over it: from the copy's bottom edge to its top edge.
 *
 * Returns the cleanup that kills every tween and trigger it made; the
 * gsap.matchMedia context that runs it reverts their inline styles.
 */
export function createHeroScroll(view: Window, stage: HTMLElement, hooks: HeroScrollHooks): () => void {
  const frame = stage.querySelector<HTMLElement>('[data-title-frame]');
  const copy = stage.querySelector<HTMLElement>('[data-title-content]');
  const section = stage.closest<HTMLElement>('section') ?? stage;
  const layers = frame
    ? Array.from(frame.children).filter((child) => child !== copy)
    : [];
  const pinDistance = (): number => Math.round(view.innerHeight * PIN_VIEWPORTS);

  // The scroll room of the layer fade; the stage's own height is the copy's hold.
  if (section !== stage) section.style.paddingBottom = `${PIN_VIEWPORTS * 100}vh`;

  const pin = ScrollTrigger.create({
    trigger: stage,
    start: 'top top',
    endTrigger: section,
    end: 'bottom top',
    pin: true,
    pinSpacing: false,
    anticipatePin: 1,
    invalidateOnRefresh: true,
  });

  const fadeLayers = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => '+=' + pinDistance(),
      scrub: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => hooks.onLayers(self.progress),
    },
  });
  if (frame) {
    // The same lift the whole frame had (8% of its height), now without the copy.
    fadeLayers.to(layers, { opacity: 0, y: () => -0.08 * frame.offsetHeight, duration: 1 }, 0);
    fadeLayers.to(frame, { '--frame-fade': 0, duration: 1 }, 0);
  }

  // offsetTop ignores transforms: the copy's resting place in the pinned stage.
  const fade = copy
    ? gsap.to(copy, {
        opacity: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: () => `bottom ${copy.offsetTop + copy.offsetHeight}px`,
          end: () => `bottom ${copy.offsetTop}px`,
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self) => hooks.onCopy(self.progress),
        },
      })
    : undefined;

  return () => {
    fadeLayers.scrollTrigger?.kill();
    fadeLayers.kill();
    fade?.scrollTrigger?.kill();
    fade?.kill();
    pin.kill();
    if (section !== stage) section.style.removeProperty('padding-bottom');
  };
}
