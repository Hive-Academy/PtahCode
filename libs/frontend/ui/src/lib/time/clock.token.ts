import {
  DestroyRef,
  InjectionToken,
  Signal,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';

/**
 * The shared clock contract of the timer owners (TASK_2026_975_b61e, D1).
 * `ui` cannot import `core`, so the contract lives here. `ClockService` in
 * core satisfies it structurally, and the app provides
 * `{ provide: PTAH_CLOCK, useExisting: ClockService }`.
 */
export interface PtahClock {
  /** Epoch ms. Updates once per second while at least one holder exists and the window is visible. */
  readonly now: Signal<number>;
  /** Hold the clock. Call the result once to release (later calls do nothing). */
  acquire(): () => void;
}

/** No default factory. The app provides it. Component specs provide a fake clock. */
export const PTAH_CLOCK = new InjectionToken<PtahClock>('PTAH_CLOCK');

/**
 * Holds the clock for the injection context lifetime, or only while
 * `active()` is true. `active` goes through a computed, so a tick that does not
 * change the boolean does not release and acquire the clock again.
 */
export function injectPtahClock(active?: () => boolean): Signal<number> {
  const clock = inject(PTAH_CLOCK);
  if (active) {
    const isActive = computed(active);
    effect((onCleanup) => {
      if (isActive()) {
        onCleanup(untracked(() => clock.acquire()));
      }
    });
  } else {
    inject(DestroyRef).onDestroy(clock.acquire());
  }
  return clock.now;
}
