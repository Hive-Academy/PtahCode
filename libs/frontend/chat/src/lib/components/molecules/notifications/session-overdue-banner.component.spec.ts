import { TestBed } from '@angular/core/testing';
import type { SessionActivityOverduePayload } from '@ptah-extension/shared';
import {
  SESSION_OVERDUE_ADVICE,
  SessionOverdueBannerComponent,
} from './session-overdue-banner.component';

const NOTICE: SessionActivityOverduePayload = {
  sessionId: 'session-1',
  tabId: 'tab-1',
  overdue: true,
  operations: ['Bash'],
  text: 'Ptah: this session has shown no activity for 10 minutes (Bash).',
};

describe('SessionOverdueBannerComponent', () => {
  function render(notice: SessionActivityOverduePayload | null): HTMLElement {
    TestBed.configureTestingModule({ imports: [SessionOverdueBannerComponent] });
    const fixture = TestBed.createComponent(SessionOverdueBannerComponent);
    fixture.componentRef.setInput('notice', notice);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('renders nothing without a notice', () => {
    const host = render(null);
    expect(host.querySelector('[data-testid="session-overdue-banner"]')).toBeNull();
  });

  it('shows the host text and the advice in a polite status region', () => {
    const host = render(NOTICE);
    const banner = host.querySelector<HTMLElement>('[data-testid="session-overdue-banner"]');
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.getAttribute('aria-live')).toBe('polite');
    expect(host.querySelector('[data-testid="session-overdue-text"]')?.textContent).toBe(
      NOTICE.text,
    );
    expect(
      host.querySelector('[data-testid="session-overdue-advice"]')?.textContent?.trim(),
    ).toBe(SESSION_OVERDUE_ADVICE);
  });

  it('hides the icon from assistive tech and gives screen readers text instead', () => {
    const host = render(NOTICE);
    expect(host.querySelector('lucide-angular')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.sr-only')?.textContent).toContain('Warning');
  });

  it('offers no action: Ptah does not stop the session', () => {
    const host = render(NOTICE);
    expect(host.querySelectorAll('button, a, [role="button"]').length).toBe(0);
    expect(SESSION_OVERDUE_ADVICE).toBe(
      'Wait, check the running task, or stop the session yourself. Ptah does not stop it.',
    );
  });
});
