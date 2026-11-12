import { Provider, signal } from '@angular/core';
import { PTAH_CLOCK, PtahClock } from './clock.token';

/**
 * Test double of the shared clock for specs: a writable `now` and a count of
 * the current holders. Not exported from the barrel.
 */
export class FakePtahClock implements PtahClock {
  readonly time = signal(0);
  readonly now = this.time.asReadonly();
  holders = 0;
  acquires = 0;

  constructor(start: number) {
    this.time.set(start);
  }

  acquire(): () => void {
    this.holders++;
    this.acquires++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holders--;
    };
  }

  provide(): Provider {
    return { provide: PTAH_CLOCK, useValue: this };
  }
}
