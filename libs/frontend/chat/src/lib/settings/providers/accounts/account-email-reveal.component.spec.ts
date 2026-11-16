import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ClaudeRpcService } from '@ptah-extension/core';
import { AccountEmailRevealComponent } from './account-email-reveal.component';

describe('AccountEmailRevealComponent', () => {
  let fixture: ComponentFixture<AccountEmailRevealComponent>;
  let call: jest.Mock;
  const value = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="account-email-value"]')?.textContent;
  const button = () => {
    const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="account-email-toggle"]');
    if (!found) throw new Error('email toggle missing');
    return found;
  };
  const flush = async () => { await Promise.resolve(); fixture.detectChanges(); };

  beforeEach(async () => {
    call = jest.fn().mockResolvedValue({ isSuccess: () => true, data: { ok: true, email: 'person@example.test' } });
    await TestBed.configureTestingModule({ imports: [AccountEmailRevealComponent],
      providers: [{ provide: ClaudeRpcService, useValue: { call } }] }).compileComponents();
    fixture = TestBed.createComponent(AccountEmailRevealComponent);
    fixture.componentRef.setInput('profileId', 'profile-aaaa-0001');
    fixture.detectChanges();
  });

  it('masks by default, reveals once, and clears on hide', async () => {
    expect(value()).toBe('••••••••');
    expect(button().getAttribute('aria-label')).toBe('Show email');
    button().click();
    await flush();
    expect(call).toHaveBeenCalledTimes(1);
    expect(value()).toBe('person@example.test');
    expect(button().getAttribute('aria-pressed')).toBe('true');
    button().click(); fixture.detectChanges();
    expect(value()).toBe('••••••••');
    expect(button().getAttribute('aria-label')).toBe('Show email');
  });

  it('clears when the profile changes and ignores a late response', async () => {
    button().click();
    fixture.componentRef.setInput('profileId', 'profile-bbbb-0002');
    fixture.detectChanges();
    await flush();
    expect(value()).toBe('••••••••');
  });

  it('shows fixed error copy on failure', async () => {
    call.mockResolvedValueOnce({ isSuccess: () => true, data: { ok: false } });
    button().click(); await flush();
    expect(value()).toBe('••••••••');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent)
      .toContain('Email unavailable');
  });
});
