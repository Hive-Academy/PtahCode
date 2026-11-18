import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SessionTurnActivityStore {
  /** Sessions seen streaming in this page lifetime; never cleared when a turn ends. */
  private readonly sessions = signal<ReadonlySet<string>>(new Set());

  hasTurnActivity(sessionId: string): boolean {
    return this.sessions().has(sessionId);
  }

  recordTurnActivity(sessionId: string): void {
    this.sessions.update((sessions) => sessions.has(sessionId)
      ? sessions
      : new Set([...sessions, sessionId]));
  }
}
