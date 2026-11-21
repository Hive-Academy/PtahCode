import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ClaudeRpcService } from '@ptah-extension/core';
import {
  createMockRpcService,
  rpcError,
  rpcSuccess,
  type MockRpcService,
} from '@ptah-extension/core/testing';
import { NativePopoverComponent } from '@ptah-extension/ui';
import type { LicenseGetStatusResponse } from '@ptah-extension/shared';
import { ChatStore } from '../../services/chat.store';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { AdvancedOverviewStore } from '../advanced/advanced-overview.store';
import { LicenseStatusCardComponent } from './license-status-card.component';

/**
 * Popover stub matching `NativePopoverComponent`'s public surface (same shape
 * as the web-search config spec) — jsdom has no real positioning.
 */
@Component({
  selector: 'ptah-native-popover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-content select="[trigger]" />
    @if (isOpen()) {
      <ng-content select="[content]" />
    }
  `,
})
class NativePopoverStub {
  readonly isOpen = input.required<boolean>();
  readonly placement = input<string>('bottom');
  readonly hasBackdrop = input<boolean>(false);
  readonly keepInViewport = input<boolean>(false);
  readonly backdropClass = input<string>('');
  readonly opened = output<void>();
  readonly closed = output<void>();
  readonly backdropClicked = output<void>();
}

/** A valid membership key: "ptah_lic_" + 64 hex characters (A5 format check). */
const VALID_KEY = `ptah_lic_${'a'.repeat(64)}`;

/** Base license status fixture; per-test fields are overridden. */
function status(
  overrides: Partial<LicenseGetStatusResponse> = {},
): LicenseGetStatusResponse {
  return {
    valid: true,
    tier: 'community',
    isPremium: false,
    isCommunity: true,
    daysRemaining: null,
    ...overrides,
  };
}

/** Builders-tier fixture with a signed-in user. */
const premiumStatus = status({
  tier: 'builders',
  isPremium: true,
  isCommunity: false,
  plan: { name: 'Builders', description: 'Ptah Builders membership.', features: [] },
  user: { email: 'ada@ptah.dev', firstName: 'Ada', lastName: 'Byron' },
});

describe('LicenseStatusCardComponent', () => {
  let fixture: ComponentFixture<LicenseStatusCardComponent>;
  let component: LicenseStatusCardComponent;
  let element: HTMLElement;
  let rpc: MockRpcService;
  /** Activation and log-out outcomes go to the page toast. */
  let announce: jest.Mock;
  let licenseStatusState: ReturnType<typeof signal<LicenseGetStatusResponse | null>>;

  beforeEach(() => { rpc = createMockRpcService(); announce = jest.fn(); });
  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); });

  /** Renders the card with the given ChatStore license status. */
  async function render(
    licenseStatusValue: LicenseGetStatusResponse | null,
  ): Promise<void> {
    licenseStatusState = signal(licenseStatusValue);
    TestBed.configureTestingModule({
      imports: [LicenseStatusCardComponent, NativePopoverStub],
      providers: [
        AdvancedOverviewStore,
        { provide: ClaudeRpcService, useValue: rpc },
        { provide: ChatStore, useValue: { licenseStatus: licenseStatusState } },
        { provide: SettingsSaveFeedbackService, useValue: { announce } },
      ],
    }).overrideComponent(LicenseStatusCardComponent, {
      remove: { imports: [NativePopoverComponent] },
      add: { imports: [NativePopoverStub] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(LicenseStatusCardComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Opens the key popover via its header trigger and returns the input element. */
  async function openKeyPopover(): Promise<HTMLInputElement> {
    element.querySelector<HTMLButtonElement>('[data-testid="membership-key-trigger"]')?.click();
    fixture.detectChanges();
    const input = element.querySelector<HTMLInputElement>('[data-testid="membership-key-input"]');
    expect(input).not.toBeNull();
    return input as HTMLInputElement;
  }

  it('F3: the empty membership key entry uses the floating label', async () => {
    await render(status());
    await openKeyPopover();
    const field = element.querySelector('[data-testid="membership-key-popover"] [data-ptah-field]');
    expect(field?.getAttribute('data-appearance')).toBe('floating');
  });

  /** Types the given key into the popover and clicks Activate. */
  async function activate(key: string): Promise<void> {
    component.licenseKeyInput.set(key);
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="membership-key-activate"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('renders nothing while the license status is loading', async () => {
    await render(null);
    expect(element.textContent?.trim()).toBe('');
  });

  it('shows the community card with Community and Active badges and one primary action', async () => {
    await render(status());
    expect(element.textContent).toContain('Membership & data');
    const section = element.querySelector('ptah-form-section');
    expect(section?.getAttribute('data-glass-surface')).toBe('content');
    expect(element.querySelector('.card')).toBeNull();
    // M-8: plan and state are the two badges of the aside, the one status display.
    const badges = Array.from(
      element.querySelectorAll(
        '[data-testid="form-section-aside"] [data-testid="membership-badges"] [data-ptah-badge]',
      ),
    ).map((badge) => badge.textContent?.trim());
    expect(badges).toEqual(['Community', 'Active']);
    expect(element.querySelectorAll('[data-testid="membership-badges"] lucide-angular').length).toBe(2);
    expect(Array.from(element.querySelectorAll('dt'), (term) => term.textContent?.trim())).toEqual([]);
    expect(element.querySelector('ptah-form-section [data-testid="form-section-icon"]')).not.toBeNull();
    // A6: exactly one primary action — Create account.
    const primary = element.querySelectorAll('.btn-primary');
    expect(primary.length).toBe(1);
    expect(primary[0].textContent?.trim()).toBe('Create account');
    // The three rows of the community state, in order, with the controls at the right edge.
    const rows = Array.from(element.querySelectorAll('[data-testid="membership-rows"] > ptah-setting-row'));
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'membership-key-row',
      'membership-backup-row',
      'membership-builders-row',
    ]);
    expect(
      rows.every((row) => row.querySelector('[data-ptah-setting-control]')?.classList.contains('justify-end')),
    ).toBe(true);
    expect(rows[0].textContent).toContain('Enter membership key');
    expect(rows[2].textContent).toContain('Explore Ptah Builders');
    // No key issue: the row has its normal hint.
    expect(element.querySelector('#membership-key-hint')?.textContent).not.toContain('could not be verified');
  });

  it('shows the Inactive state badge when the key is not valid and has no reason', async () => {
    await render(status({ valid: false }));
    expect(
      element.querySelector('[data-testid="membership-state-badge"]')?.textContent?.trim(),
    ).toBe('Inactive');
  });

  it('A-6: Manage Membership opens the membership page through ptah.openPricing', async () => {
    await render(premiumStatus);
    const manage = element.querySelector<HTMLButtonElement>('[data-testid="membership-manage"]');
    expect(manage?.textContent?.trim()).toBe('Manage Membership');
    manage?.click();
    await fixture.whenStable();
    expect(rpc.call).toHaveBeenCalledTimes(1);
    expect(rpc.call).toHaveBeenCalledWith('command:execute', { command: 'ptah.openPricing' });
    // The member state has no key row and no Ptah Builders row.
    expect(
      Array.from(
        element.querySelectorAll('[data-testid="membership-rows"] > ptah-setting-row'),
        (row) => row.getAttribute('data-testid'),
      ),
    ).toEqual(['membership-manage-row', 'membership-backup-row', 'membership-logout-row']);
    expect(element.querySelector('[data-testid="membership-key-trigger"]')).toBeNull();
  });

  it('A-8: Explore Ptah Builders and Create account each run their command; Create account is the only primary', async () => {
    await render(status());
    const explore = element.querySelector<HTMLButtonElement>('[data-testid="membership-explore"]');
    const create = element.querySelector<HTMLButtonElement>('[data-testid="membership-create-account"]');
    expect(explore?.classList.contains('btn-primary')).toBe(false);
    expect(create?.classList.contains('btn-primary')).toBe(true);
    explore?.click();
    await fixture.whenStable();
    expect(rpc.call).toHaveBeenLastCalledWith('command:execute', { command: 'ptah.openPricing' });
    create?.click();
    await fixture.whenStable();
    expect(rpc.call).toHaveBeenLastCalledWith('command:execute', { command: 'ptah.openSignup' });
    expect(rpc.call).toHaveBeenCalledTimes(2);
  });

  it('shows the member card with the Builder badge, account facts and one primary action', async () => {
    await render(premiumStatus);
    expect(element.textContent).toContain('Builder');
    expect(element.textContent).not.toContain('Community');
    // A6: the member's single primary action is Manage Membership.
    expect(element.querySelectorAll('.btn-primary').length).toBe(1);
    expect(element.textContent).toContain('Manage Membership');
    // A3: profile row with identity and A7: plan text.
    const profile = element.querySelector('[aria-label="User profile"]');
    expect(profile?.textContent).toContain('Ada Byron');
    expect(profile?.textContent).toContain('ada@ptah.dev');
    expect(profile?.closest('ptah-description-list')).not.toBeNull();
    expect(element.textContent).toContain('Ptah Builders membership.');
    const logout = element.querySelector<HTMLButtonElement>('[data-testid="logout-button"]');
    expect(logout?.getAttribute('aria-label')).toBe('Remove membership key and log out');
  });

  it('shows the Needs Attention badge when a member key has a reason', async () => {
    await render(status({ ...premiumStatus, reason: 'expired' }));
    expect(
      element.querySelector('[data-testid="membership-state-badge"]')?.textContent?.trim(),
    ).toBe('Needs attention');
    expect(element.textContent).not.toContain('Active');
    // The A2 key-not-active copy is community-only.
    expect(element.querySelector('[data-testid="membership-key-row"]')).toBeNull();
    expect(element.textContent).not.toContain('could not be verified');
  });

  it('A-10: announces the key warning and the recovery instruction when the license status changes', async () => {
    const WARNING =
      "Membership key not active. Your membership key could not be verified. Re-enter your key to restore your Ptah Builders membership. Ptah's local features remain available either way.";
    await render(status());
    // The live region is in the card before the change, and it is empty.
    const region = element.querySelector('[data-testid="membership-key-announcement"]') as HTMLElement;
    expect(region.getAttribute('role')).toBe('alert');
    expect(region.getAttribute('aria-live')).toBe('assertive');
    expect(region.classList.contains('sr-only')).toBe(true);
    expect(region.textContent).toBe('');
    for (const reason of ['expired', 'no_license'] as const) {
      licenseStatusState.set(status({ valid: false, reason }));
      fixture.detectChanges();
      // The same element gets the text (a live region announces a change of its content).
      expect(element.querySelector('[data-testid="membership-key-announcement"]')).toBe(region);
      expect(region.textContent).toBe(WARNING);
      licenseStatusState.set(status());
      fixture.detectChanges();
      expect(region.textContent).toBe('');
    }
    // One visible key action: the region holds no control.
    expect(region.querySelector('button')).toBeNull();
  });

  it('A-10: a member key with a reason gets no community key warning', async () => {
    await render(status({ ...premiumStatus, reason: 'expired' }));
    expect(element.querySelector('[data-testid="membership-key-announcement"]')?.textContent).toBe('');
  });

  it('M-9: shows the key-not-active copy verbatim as the row hint, with one key action that opens the popover', async () => {
    await render(status({ valid: false, reason: 'no_license' }));
    // The former alert is gone: its copy is the hint of the "Membership key" row.
    expect(element.querySelector('[data-testid="membership-key-alert"]')).toBeNull();
    expect(element.querySelectorAll('[role="alert"]').length).toBe(1);
    const hint = element.querySelector('[data-testid="membership-key-row"] #membership-key-hint');
    expect(hint?.textContent?.trim()).toBe(
      "Your membership key could not be verified. Re-enter your key to restore your Ptah Builders membership. Ptah's local features remain available either way.",
    );
    // Exactly one "Enter membership key" control, described by the hint.
    const keyControls = Array.from(element.querySelectorAll('button')).filter((button) =>
      /enter membership key/i.test(button.textContent ?? ''),
    );
    expect(keyControls.length).toBe(1);
    expect(keyControls[0].getAttribute('data-testid')).toBe('membership-key-trigger');
    expect(keyControls[0].getAttribute('aria-describedby')).toBe('membership-key-hint');
    expect(
      element.querySelector('[data-testid="membership-state-badge"]')?.textContent?.trim(),
    ).toBe('Needs attention');
    keyControls[0].click();
    fixture.detectChanges();
    const popover = element.querySelector('[data-testid="membership-key-popover"]');
    expect(popover?.getAttribute('role')).toBe('dialog');
  });

  it('confirms before logging out and cancels without an RPC call', async () => {
    await render(premiumStatus);
    element.querySelector<HTMLButtonElement>('[data-testid="logout-button"]')?.click();
    fixture.detectChanges();
    const confirm = element.querySelector('[data-testid="logout-confirm"]');
    expect(confirm?.getAttribute('role')).toBe('group');
    expect(rpc.call).not.toHaveBeenCalled();
    const cancel = Array.from(element.querySelectorAll<HTMLButtonElement>('[data-testid="logout-confirm"] button'))
      .find((button) => button.textContent?.trim() === 'Cancel');
    cancel?.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="logout-confirm"]')).toBeNull();
    expect(rpc.call).not.toHaveBeenCalled();
  });

  it('opens the log-out confirm with Cancel focused; Esc closes it, returns focus to Log Out and stops there (FM-2)', async () => {
    await render(premiumStatus);
    document.body.appendChild(element);
    const outer = jest.fn();
    document.body.addEventListener('keydown', outer);
    try {
      const logout = element.querySelector<HTMLButtonElement>('[data-testid="logout-button"]');
      logout?.click();
      fixture.detectChanges();
      fixture.detectChanges();
      expect(document.activeElement).toBe(element.querySelector('[data-testid="logout-cancel-button"]'));

      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(element.querySelector('[data-testid="logout-confirm"]')).toBeNull();
      expect(document.activeElement).toBe(logout);
      expect(outer).not.toHaveBeenCalled();
      expect(rpc.call).not.toHaveBeenCalled();
    } finally {
      document.body.removeEventListener('keydown', outer);
      element.remove();
    }
  });

  it('returns focus to Log Out when Cancel is clicked (FM-2)', async () => {
    await render(premiumStatus);
    document.body.appendChild(element);
    try {
      const logout = element.querySelector<HTMLButtonElement>('[data-testid="logout-button"]');
      logout?.click();
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="logout-cancel-button"]')?.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(logout);
    } finally {
      element.remove();
    }
  });

  it('keeps the confirm open on Esc while the log-out write is in flight (FM-2)', async () => {
    rpc.call.mockReturnValue(new Promise(() => undefined));
    await render(premiumStatus);
    document.body.appendChild(element);
    const outer = jest.fn();
    document.body.addEventListener('keydown', outer);
    try {
      element.querySelector<HTMLButtonElement>('[data-testid="logout-button"]')?.click();
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="logout-confirm-button"]')?.click();
      fixture.detectChanges();
      element
        .querySelector('[data-testid="logout-confirm"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="logout-confirm"]')).not.toBeNull();
      // The shared inline confirm always stops Esc at its own group.
      expect(outer).not.toHaveBeenCalled();
    } finally {
      document.body.removeEventListener('keydown', outer);
      element.remove();
    }
  });

  it('shows account facts without an avatar row', async () => {
    await render(premiumStatus);
    const account = element.querySelector('[aria-label="User profile"]');
    expect(account?.textContent).toContain('Ada Byron');
    expect(account?.textContent).toContain('ada@ptah.dev');
    expect(account?.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(account?.closest('ptah-setting-row')).toBeNull();
    expect(element.querySelector('img, [data-testid*="avatar"]')).toBeNull();
  });

  it('projects the [membership-actions] content into the "Settings backup" row', async () => {
    @Component({
      standalone: true,
      imports: [LicenseStatusCardComponent],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<ptah-license-status-card><div membership-actions><button type="button">Export settings</button></div></ptah-license-status-card>`,
    })
    class HostComponent {}
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        { provide: ClaudeRpcService, useValue: rpc },
        { provide: ChatStore, useValue: { licenseStatus: signal(status()) } },
        { provide: SettingsSaveFeedbackService, useValue: { announce } },
      ],
    }).overrideComponent(LicenseStatusCardComponent, {
      remove: { imports: [NativePopoverComponent] },
      add: { imports: [NativePopoverStub] },
    });
    await TestBed.compileComponents();
    const host = TestBed.createComponent(HostComponent);
    host.detectChanges();
    const row = (host.nativeElement as HTMLElement).querySelector('[data-testid="membership-backup-row"]');
    expect(row?.textContent).toContain('Settings backup');
    expect(row?.querySelector('[data-ptah-setting-control] [membership-actions] button')?.textContent).toBe(
      'Export settings',
    );
    host.destroy();
  });

  it('reports membership without personal data and clears it while loading', async () => {
    await render(premiumStatus);
    const overview = TestBed.inject(AdvancedOverviewStore);
    expect(overview.segments()[0]).toMatchObject({
      value: 'Builder, active', meta: 'Key active', tone: 'ok',
    });
    licenseStatusState.set(null);
    fixture.detectChanges();
    expect(overview.segments()[0]).toMatchObject({ value: 'Not loaded', tone: 'idle' });
  });

  it('reports membership attention when a key has a reason', async () => {
    await render(status({ ...premiumStatus, reason: 'expired' }));
    expect(TestBed.inject(AdvancedOverviewStore).segments()[0]).toMatchObject({
      value: 'Builder, attention', tone: 'warn',
    });
  });

  it('calls license:clearKey on confirmed log out and closes the confirm on success', async () => {
    rpc.call.mockResolvedValue(rpcSuccess({ success: true }));
    await render(premiumStatus);
    element.querySelector<HTMLButtonElement>('[data-testid="logout-button"]')?.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="logout-confirm-button"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rpc.call).toHaveBeenCalledWith('license:clearKey', {});
    // Success reloads the window host-side; the confirm simply closes.
    expect(element.querySelector('[data-testid="logout-confirm"]')).toBeNull();
  });

  /** F1: an RPC failure, `{ success:false, error }` and a thrown Error never show host text. */
  const HOST_FAILURES: ReadonlyArray<[string, (mock: MockRpcService['call']) => void]> = [
    ['an RPC failure', (call) => call.mockResolvedValue(rpcError('host detail'))],
    ['a { success:false, error } answer', (call) => call.mockResolvedValue(rpcSuccess({ success: false, error: 'host detail' }))],
    ['a thrown Error', (call) => call.mockRejectedValue(new Error('host detail'))],
  ];

  it.each(HOST_FAILURES)('keeps the log-out confirm open with a fixed sentence on %s', async (_case, arrange) => {
    arrange(rpc.call);
    await render(premiumStatus);
    element.querySelector<HTMLButtonElement>('[data-testid="logout-button"]')?.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="logout-confirm-button"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="logout-confirm"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="logout-error"]')).toBeNull();
    expect(announce).toHaveBeenCalledWith('Could not log out.', 'alert');
    expect(element.textContent).not.toContain('host detail');
  });

  it('rejects a malformed key locally without an RPC call', async () => {
    await render(status());
    await openKeyPopover();
    await activate('not-a-key');
    expect(rpc.call).not.toHaveBeenCalled();
    const error = element.querySelector('[data-testid="membership-key-error"]');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('Invalid format');
    expect(announce).not.toHaveBeenCalled();
  });

  it('verifies a well-formed key via license:setKey and announces success only from the result', async () => {
    rpc.call.mockResolvedValue(rpcSuccess({ success: true, tier: 'builders', plan: { name: 'Builders' } }));
    await render(status());
    await openKeyPopover();
    await activate(VALID_KEY);
    expect(rpc.call).toHaveBeenCalledWith('license:setKey', { licenseKey: VALID_KEY });
    expect(announce).toHaveBeenCalledWith('Membership activated! Plan: Builders. Reloading...', 'status');
    expect(element.querySelector('[data-testid="membership-key-success"]')).toBeNull();
    expect(element.querySelector('[data-testid="membership-key-error"]')).toBeNull();
  });

  it.each(HOST_FAILURES)('announces a fixed sentence when key activation fails with %s', async (_case, arrange) => {
    arrange(rpc.call);
    await render(status());
    await openKeyPopover();
    await activate(VALID_KEY);
    expect(announce).toHaveBeenCalledWith('Could not activate the membership key.', 'alert');
    expect(announce).toHaveBeenCalledTimes(1);
    expect(element.querySelector('[data-testid="membership-key-error"]')).toBeNull();
    expect(element.textContent).not.toContain('host detail');
  });

  it('never persists a typed key after the popover closes', async () => {
    await render(status());
    const inputEl = await openKeyPopover();
    component.licenseKeyInput.set(VALID_KEY);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(inputEl.value).toBe(VALID_KEY);
    // Close via the popover's X button.
    element.querySelector<HTMLButtonElement>('[data-testid="membership-key-popover"] button[aria-label="Close"]')?.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="membership-key-popover"]')).toBeNull();
    expect(component.licenseKeyInput()).toBe('');
    // Reopen: the draft never survived the close.
    const reopened = await openKeyPopover();
    expect(reopened.value).toBe('');
    expect(reopened.getAttribute('type')).toBe('password');
  });

  it('toggles key visibility with the show/hide control', async () => {
    await render(status());
    const inputEl = await openKeyPopover();
    const visibility = element.querySelector<HTMLButtonElement>('[data-testid="membership-key-visibility"]');
    expect(visibility?.getAttribute('aria-label')).toBe('Show membership key');
    visibility?.click();
    fixture.detectChanges();
    expect(inputEl.getAttribute('type')).toBe('text');
    expect(element.querySelector('[data-testid="membership-key-visibility"]')?.getAttribute('aria-label'))
      .toBe('Hide membership key');
  });

  it('uses no text size below 12 px anywhere in the component source (Batch 50b)', () => {
    const source = readFileSync(join(__dirname, 'license-status-card.component.ts'), 'utf8');
    expect(source.match(/text-\[(?:\d|1[01])(?:\.\d+)?px\]/g)).toBeNull();
  });
});
