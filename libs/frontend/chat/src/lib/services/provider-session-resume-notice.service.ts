import { Injectable, computed, inject, signal } from '@angular/core';
import { TabManagerService } from '@ptah-extension/chat-state';

/** One tab whose stored provider session could not be reopened. */
export interface ProviderSessionResumeNotice {
  readonly tabId: string;
  /** The session that failed; the notice ends once the tab shows another one. */
  readonly sessionId: string;
}

/** The backend code for a provider-session conversation that cannot be reopened. */
export const PROVIDER_SESSION_RESUME_FAILED = 'PROVIDER_SESSION_RESUME_FAILED';

/**
 * Tracks the "could not reopen this conversation" notice of provider-session
 * tabs (`PROVIDER_SESSION_RESUME_FAILED`). The user chooses to start over; a
 * new session is never started automatically.
 */
@Injectable({ providedIn: 'root' })
export class ProviderSessionResumeNoticeService {
  private readonly tabManager = inject(TabManagerService);
  private readonly _notices = signal<readonly ProviderSessionResumeNotice[]>(
    [],
  );

  /** Notices whose tab still shows the session that failed. */
  readonly notices = computed(() =>
    this._notices().filter(
      (notice) =>
        this.tabManager.findTabByIdAcrossWorkspaces(notice.tabId)?.tab
          .claudeSessionId === notice.sessionId,
    ),
  );

  /** Record a failure when `code` is the resume-failed code; returns whether it was. */
  flagIfResumeFailed(
    code: string | undefined,
    tabId: string,
    sessionId: string | null | undefined,
  ): boolean {
    if (code !== PROVIDER_SESSION_RESUME_FAILED || !sessionId) return false;
    this._notices.update((notices) => [
      ...notices.filter((notice) => notice.tabId !== tabId),
      { tabId, sessionId },
    ]);
    return true;
  }

  noticeFor(tabId: string | null): ProviderSessionResumeNotice | null {
    if (!tabId) return null;
    return this.notices().find((notice) => notice.tabId === tabId) ?? null;
  }

  /** "Start a new session in this tab": the tab's fresh-start flow, as `/clear` uses it. */
  startNewSession(tabId: string): void {
    this.dismiss(tabId);
    this.tabManager.resetTabToFresh(tabId);
  }

  dismiss(tabId: string): void {
    this._notices.update((notices) =>
      notices.filter((notice) => notice.tabId !== tabId),
    );
  }
}
