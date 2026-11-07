import { DestroyRef, Injectable, inject, signal } from '@angular/core';

const TICK_MS = 1000;

/**
 * One clock for every countdown in the Machines surface (remote approval
 * deadlines, decision 27). However many requests are pending, at most one
 * interval runs, and only while at least one countdown holds the clock.
 *
 * A countdown calls {@link acquire} when it starts and the returned release
 * when it stops or is destroyed; the last release stops the interval. Each
 * acquire also refreshes {@link now}, so a new countdown never starts from a
 * stale second.
 */
@Injectable({ providedIn: 'root' })
export class CountdownClock {
  private readonly current = signal(Date.now());
  private holders = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  /** Epoch milliseconds, updated once per second while held. */
  public readonly now = this.current.asReadonly();

  public constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Hold the clock; call the result once to let go (later calls do nothing). */
  public acquire(): () => void {
    this.current.set(Date.now());
    this.holders += 1;
    if (this.timer === undefined) {
      this.timer = setInterval(() => this.current.set(Date.now()), TICK_MS);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holders -= 1;
      if (this.holders === 0) this.stop();
    };
  }

  private stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.holders = 0;
  }
}
