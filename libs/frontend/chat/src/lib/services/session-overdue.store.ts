import { Injectable, signal } from '@angular/core';
import type { SessionActivityOverduePayload } from '@ptah-extension/shared';

/** Most sessions kept at once; the oldest is dropped past this. */
export const MAX_OVERDUE_SESSIONS = 50;

/**
 * Sessions the host reports as overdue (`session:activity-overdue`).
 *
 * The host sends `overdue: true` again while a session stays overdue and
 * `overdue: false` to clear it. Keyed by session id. Display only: nothing
 * here stops or aborts a session.
 */
@Injectable({ providedIn: 'root' })
export class SessionOverdueStore {
  private readonly _bySession = signal<
    ReadonlyMap<string, SessionActivityOverduePayload>
  >(new Map());

  /** Apply one parsed host payload. */
  apply(payload: SessionActivityOverduePayload): void {
    this._bySession.update((current) => {
      if (!payload.overdue) {
        // A show and its clear can name the session by different ids (a tab id before the SDK
        // id binds), so a clear also removes every entry of the same tab.
        const stale = [...current].filter(
          ([id, entry]) =>
            id === payload.sessionId ||
            (payload.tabId !== undefined && entry.tabId === payload.tabId),
        );
        if (stale.length === 0) return current;
        const next = new Map(current);
        for (const [id] of stale) next.delete(id);
        return next;
      }
      const next = new Map(current);
      // Re-insert so the latest report counts as the newest entry.
      next.delete(payload.sessionId);
      next.set(payload.sessionId, payload);
      while (next.size > MAX_OVERDUE_SESSIONS) {
        const oldest = next.keys().next().value;
        if (oldest === undefined) break;
        next.delete(oldest);
      }
      return next;
    });
  }

  /**
   * The overdue notice for a view, matched by its session id or, when the
   * host names one, its tab id. `null` when the session is not overdue.
   */
  noticeFor(
    sessionId: string | null,
    tabId: string | null,
  ): SessionActivityOverduePayload | null {
    const map = this._bySession();
    if (sessionId) {
      const bySession = map.get(sessionId);
      if (bySession) return bySession;
    }
    if (tabId) {
      for (const entry of map.values()) {
        if (entry.tabId === tabId) return entry;
      }
    }
    return null;
  }
}
