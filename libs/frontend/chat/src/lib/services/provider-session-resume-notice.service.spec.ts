import { TestBed } from '@angular/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  PROVIDER_SESSION_RESUME_FAILED,
  ProviderSessionResumeNoticeService,
} from './provider-session-resume-notice.service';

describe('ProviderSessionResumeNoticeService', () => {
  const sessions = new Map<string, string | null>();
  const resetTabToFresh = jest.fn((tabId: string) => sessions.set(tabId, null));
  let service: ProviderSessionResumeNoticeService;

  beforeEach(() => {
    sessions.clear();
    resetTabToFresh.mockClear();
    sessions.set('tab-1', 'sess-1');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TabManagerService,
          useValue: {
            findTabByIdAcrossWorkspaces: (tabId: string) =>
              sessions.has(tabId)
                ? { tab: { id: tabId, claudeSessionId: sessions.get(tabId) } }
                : null,
            resetTabToFresh,
          },
        },
      ],
    });
    service = TestBed.inject(ProviderSessionResumeNoticeService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('records only the resume-failed code', () => {
    expect(service.flagIfResumeFailed('PROVIDER_SESSION_BUSY', 'tab-1', 'sess-1')).toBe(false);
    expect(service.flagIfResumeFailed(PROVIDER_SESSION_RESUME_FAILED, 'tab-1', null)).toBe(false);
    expect(service.noticeFor('tab-1')).toBeNull();

    expect(service.flagIfResumeFailed(PROVIDER_SESSION_RESUME_FAILED, 'tab-1', 'sess-1')).toBe(true);
    expect(service.noticeFor('tab-1')).toEqual({ tabId: 'tab-1', sessionId: 'sess-1' });
    expect(service.noticeFor(null)).toBeNull();
  });

  it('ends the notice once the tab shows another session', () => {
    service.flagIfResumeFailed(PROVIDER_SESSION_RESUME_FAILED, 'tab-1', 'sess-1');
    sessions.set('tab-1', 'sess-2');
    expect(service.noticeFor('tab-1')).toBeNull();
  });

  it('starts a new session in the tab only when asked', () => {
    service.flagIfResumeFailed(PROVIDER_SESSION_RESUME_FAILED, 'tab-1', 'sess-1');
    expect(resetTabToFresh).not.toHaveBeenCalled();

    service.startNewSession('tab-1');

    expect(resetTabToFresh).toHaveBeenCalledWith('tab-1');
    expect(service.notices()).toEqual([]);
  });

  it('dismisses without touching the tab', () => {
    service.flagIfResumeFailed(PROVIDER_SESSION_RESUME_FAILED, 'tab-1', 'sess-1');
    service.dismiss('tab-1');
    expect(service.noticeFor('tab-1')).toBeNull();
    expect(resetTabToFresh).not.toHaveBeenCalled();
  });
});
