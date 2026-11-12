import { Injectable, inject } from '@angular/core';
import { ClockService } from '@ptah-extension/core';

/** @deprecated Use ClockService. */
@Injectable({ providedIn: 'root' })
export class CountdownClock {
  private readonly clock = inject(ClockService);
  readonly now = this.clock.now;

  acquire(): () => void {
    return this.clock.acquire();
  }
}
