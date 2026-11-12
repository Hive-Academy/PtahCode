import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, NgZone, Signal, computed, effect, inject, signal, untracked } from '@angular/core';

/** One shared wall clock for time displays in the renderer. */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly current = signal(Date.now());
  private holders = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  readonly now: Signal<number> = this.current.asReadonly();

  private readonly visibilityChanged = (): void => {
    if (this.document.hidden) this.stop();
    else {
      this.current.set(Date.now());
      this.start();
    }
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      if (this.holders > 0) this.document.removeEventListener('visibilitychange', this.visibilityChanged);
      this.holders = 0;
    });
  }

  acquire(): () => void {
    if (this.holders++ === 0) this.document.addEventListener('visibilitychange', this.visibilityChanged);
    this.current.set(Date.now());
    this.start();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.holders === 0) return;
      if (--this.holders === 0) {
        this.stop();
        this.document.removeEventListener('visibilitychange', this.visibilityChanged);
      }
    };
  }

  private start(): void {
    if (this.holders === 0 || this.document.hidden || this.interval !== null) return;
    this.zone.runOutsideAngular(() => {
      this.interval = setInterval(() => this.current.set(Date.now()), 1_000);
    });
  }

  private stop(): void {
    if (this.interval === null) return;
    clearInterval(this.interval);
    this.interval = null;
  }
}

/** Holds the clock for the injection context lifetime, or while active. Mirrors ui's injectPtahClock. */
export function injectClock(active?: () => boolean): Signal<number> {
  const clock = inject(ClockService);
  const destroyRef = inject(DestroyRef);
  if (active) {
    const isActive = computed(active);
    effect((onCleanup) => {
      if (isActive()) onCleanup(untracked(() => clock.acquire()));
    });
  } else {
    destroyRef.onDestroy(clock.acquire());
  }
  return clock.now;
}
