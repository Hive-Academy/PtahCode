import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, NgZone, Signal, computed, effect, inject, signal, untracked } from '@angular/core';

export type ClockGranularity = 'second' | 'coarse';
export const CLOCK_COARSE_MS = 30_000;

/** One shared wall clock for time displays in the renderer. */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly current = signal(Date.now());
  private secondHolders = 0;
  private coarseHolders = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private intervalDelay: number | null = null;
  readonly now: Signal<number> = this.current.asReadonly();

  private readonly visibilityChanged = (): void => {
    if (this.document.hidden) this.stop();
    else {
      this.current.set(Date.now());
      this.syncInterval();
    }
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      if (this.secondHolders + this.coarseHolders > 0) this.document.removeEventListener('visibilitychange', this.visibilityChanged);
      this.secondHolders = 0;
      this.coarseHolders = 0;
    });
  }

  acquire(granularity: ClockGranularity = 'second'): () => void {
    if (this.secondHolders + this.coarseHolders === 0) this.document.addEventListener('visibilitychange', this.visibilityChanged);
    if (granularity === 'second') this.secondHolders++;
    else this.coarseHolders++;
    this.current.set(Date.now());
    this.syncInterval();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (granularity === 'second') {
        if (this.secondHolders === 0) return;
        this.secondHolders--;
      } else {
        if (this.coarseHolders === 0) return;
        this.coarseHolders--;
      }
      if (this.secondHolders + this.coarseHolders === 0) {
        this.document.removeEventListener('visibilitychange', this.visibilityChanged);
      }
      this.syncInterval();
    };
  }

  private syncInterval(): void {
    const delay = this.document.hidden ? null : this.secondHolders > 0 ? 1_000 : this.coarseHolders > 0 ? CLOCK_COARSE_MS : null;
    if (delay === this.intervalDelay) return;
    this.stop();
    if (delay === null) return;
    this.zone.runOutsideAngular(() => {
      this.interval = setInterval(() => this.current.set(Date.now()), delay);
    });
    this.intervalDelay = delay;
  }

  private stop(): void {
    if (this.interval === null) return;
    clearInterval(this.interval);
    this.interval = null;
    this.intervalDelay = null;
  }
}

/** Holds the clock for the injection context lifetime, or while active. Mirrors ui's injectPtahClock. */
export function injectClock(active?: () => boolean, granularity: ClockGranularity = 'second'): Signal<number> {
  const clock = inject(ClockService);
  const destroyRef = inject(DestroyRef);
  if (active) {
    const isActive = computed(active);
    effect((onCleanup) => {
      if (isActive()) onCleanup(untracked(() => clock.acquire(granularity)));
    });
  } else {
    destroyRef.onDestroy(clock.acquire(granularity));
  }
  return clock.now;
}
