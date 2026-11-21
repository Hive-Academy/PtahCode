import { Injectable, signal } from '@angular/core';

/** One settled write or Undo of the "Claude Code tools & skills" card. */
export interface ClaudeBuiltinsSettled {
  /** Counts up with each settled write. */
  readonly revision: number;
  /** The instance id of the card that wrote. That card already shows the result, if it is still mounted. */
  readonly sourceId: number;
}

/**
 * Tells each mounted "Claude Code tools & skills" card that a write or an Undo settled.
 *
 * A write and its Undo are owned by the Settings page toast, so they can end after the card that started them was
 * destroyed (the Advanced tab re-creates the card). The card that is mounted then reads the stored lists again. Root
 * scope: the signal must live longer than each card. It keeps a number, not a card: a destroyed card is not retained.
 */
@Injectable({ providedIn: 'root' })
export class ClaudeBuiltinsSyncService {
  private readonly state = signal<ClaudeBuiltinsSettled | null>(null);
  private lastInstanceId = 0;
  readonly settled = this.state.asReadonly();

  /** A new id for one card instance. */
  nextInstanceId(): number {
    this.lastInstanceId += 1;
    return this.lastInstanceId;
  }

  notifySettled(sourceId: number): void {
    this.state.update((last) => ({ revision: (last?.revision ?? 0) + 1, sourceId }));
  }
}
