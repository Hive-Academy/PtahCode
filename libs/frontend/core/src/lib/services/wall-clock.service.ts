import { DestroyRef, Injectable, Signal, effect, inject, linkedSignal, untracked } from '@angular/core';
import { CLOCK_COARSE_MS, ClockService } from './clock.service';

export type WallClockCadence = 'second' | 'coarse';
export const WALL_CLOCK_COARSE_MS = CLOCK_COARSE_MS;

/**
 * The coarse reading can remain up to 30 seconds stale after returning from a hidden window.
 * Acquiring the coarse cadence always refreshes it immediately.
 * @deprecated Use ClockService.
 */
@Injectable({ providedIn: 'root' })
export class WallClockService {
  private readonly clock = inject(ClockService);
  private readonly coarse = linkedSignal<number, number>({
    source: this.clock.now,
    computation: (now, previous) =>
      previous && now >= previous.value && now - previous.value < WALL_CLOCK_COARSE_MS
        ? previous.value
        : now,
  });
  private readonly readonlyCoarse = this.coarse.asReadonly();

  now(cadence: WallClockCadence): Signal<number> {
    return cadence === 'second' ? this.clock.now : this.readonlyCoarse;
  }

  acquire(cadence: WallClockCadence): () => void {
    const release = this.clock.acquire(cadence);
    if (cadence === 'coarse') this.coarse.set(this.clock.now());
    return release;
  }
}

/** @deprecated Use injectClock. */
export function injectWallClock(cadence: WallClockCadence, active?: () => boolean): Signal<number> {
  const clock = inject(WallClockService);
  const destroyRef = inject(DestroyRef);
  if (active) {
    effect((onCleanup) => {
      if (active()) onCleanup(untracked(() => clock.acquire(cadence)));
    });
  } else {
    destroyRef.onDestroy(clock.acquire(cadence));
  }
  return clock.now(cadence);
}
