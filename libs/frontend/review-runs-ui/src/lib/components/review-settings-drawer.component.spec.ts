import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { OperatorSettings, RepositorySettings, ReviewLaneSettings } from '@ptah-extension/review-contracts';
import { ReviewRunsStore } from '../review-runs.store';
import { ReviewSettingsDrawerComponent } from './review-settings-drawer.component';

const repo = (patch: Partial<RepositorySettings> = {}): RepositorySettings => ({
  owner: 'Hive-Academy',
  name: 'PtahCode',
  enabled: false,
  dryRun: true,
  publicationPaused: false,
  ...patch,
});

const settings = (patch: Partial<OperatorSettings> = {}): OperatorSettings => ({
  repositories: [repo()],
  maintainerLogins: [],
  pollMinutes: 10,
  globalPublicationPaused: false,
  laneCapPerPr: 6,
  confidenceFloor: 0.8,
  maxNewInline: 10,
  fallbackFamilies: [],
  ...patch,
});

const emptyLanes: ReviewLaneSettings = { pool: [], pins: {} };

function storeMock(patch: Record<string, unknown> = {}) {
  return {
    botIdentity: signal<{ login: string; scopes: string[]; connectedAt: string; verifiedAt: string | null } | null>(null),
    botIdentityError: signal<string | null>(null),
    tokenStorage: signal<'encrypted' | 'plaintext'>('encrypted'),
    attestorLogin: signal(''),
    liveAttested: signal(false),
    credentialState: signal<'idle' | 'saving' | 'error'>('idle'),
    loadBotIdentity: jest.fn(),
    setBotToken: jest.fn().mockResolvedValue(true),
    clearBotToken: jest.fn(),
    setPublicationPause: jest.fn(),
    ...patch,
  };
}

type StoreMock = ReturnType<typeof storeMock>;

function setup(
  options: {
    draft?: OperatorSettings;
    store?: StoreMock;
    inputs?: Record<string, unknown>;
  } = {},
): { fixture: ComponentFixture<ReviewSettingsDrawerComponent>; store: StoreMock; root: HTMLElement } {
  const store = options.store ?? storeMock();
  TestBed.configureTestingModule({
    imports: [ReviewSettingsDrawerComponent],
    providers: [{ provide: ReviewRunsStore, useValue: store }],
  });
  const fixture = TestBed.createComponent(ReviewSettingsDrawerComponent);
  fixture.componentRef.setInput('draft', options.draft ?? settings());
  fixture.componentRef.setInput('lanes', emptyLanes);
  for (const [key, value] of Object.entries(options.inputs ?? {})) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  return { fixture, store, root: fixture.nativeElement as HTMLElement };
}

/** Lets the native drawer's queued focus move (and its `opened` output) run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve));

const panel = (root: HTMLElement) => root.querySelector('[data-testid="native-drawer-panel"]') as HTMLElement;
const buttonByText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.trim() === text) as
    | HTMLButtonElement
    | undefined;
const typeInto = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
};

describe('ReviewSettingsDrawerComponent', () => {
  describe('shell', () => {
    it('is a native drawer dialog named "Review settings" that focuses its title once opened', async () => {
      const { root } = setup();
      const dialog = root.querySelector('ptah-native-drawer [role="dialog"]') as HTMLElement;
      expect(dialog.getAttribute('aria-label')).toBe('Review settings');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(root.querySelector('[data-testid="native-drawer-root"]')?.getAttribute('popover')).toBe('manual');
      expect(root.querySelector('[data-testid="native-drawer-close"]')).toBeNull();
      await flush();
      expect(document.activeElement).toBe(root.querySelector('#review-settings-title'));
    });

    it('closes from the X button and from Escape, never from the backdrop', () => {
      const { fixture, root } = setup();
      const close = jest.fn();
      fixture.componentInstance.closed.subscribe(close);
      (root.querySelector('[data-testid="native-drawer-backdrop"]') as HTMLElement).click();
      expect(close).not.toHaveBeenCalled();
      (root.querySelector('button[aria-label="Close review settings"]') as HTMLButtonElement).click();
      expect(close).toHaveBeenCalledTimes(1);
      panel(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(close).toHaveBeenCalledTimes(2);
    });

    it('wraps Tab from the last control to the first and Shift+Tab back (native trap)', async () => {
      const { root } = setup();
      await flush();
      const focusables = Array.from(
        panel(root).querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.tabIndex !== -1);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      expect(first.getAttribute('aria-label')).toBe('Close review settings');
      expect(last.textContent?.trim()).toBe('Save review settings');
      last.focus();
      panel(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(first);
      panel(root).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(last);
    });

    it('returns focus to the opener when the parent @if removes the drawer', async () => {
      @Component({
        standalone: true,
        imports: [ReviewSettingsDrawerComponent],
        template: `
          <button id="opener" type="button" (click)="open.set(true)">Review settings</button>
          @if (open()) {
            <ptah-review-settings-drawer [draft]="draft" [lanes]="lanes" (closed)="open.set(false)" />
          }
        `,
      })
      class HostComponent {
        readonly open = signal(false);
        readonly draft = settings();
        readonly lanes = emptyLanes;
      }
      TestBed.configureTestingModule({
        imports: [HostComponent],
        providers: [{ provide: ReviewRunsStore, useValue: storeMock() }],
      });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
      opener.focus();
      opener.click();
      fixture.detectChanges();
      await flush();
      expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#review-settings-title'));
      (fixture.nativeElement.querySelector('button[aria-label="Close review settings"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('ptah-review-settings-drawer')).toBeNull();
      expect(document.activeElement).toBe(opener);
    });
  });

  describe('load states', () => {
    it('shows the loading panel with Save disabled', () => {
      const { root } = setup({ inputs: { loadState: 'loading' } });
      const loading = root.querySelector('ptah-state-panel') as HTMLElement;
      expect(loading.textContent).toContain('Loading review settings');
      expect(loading.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(root.querySelector('#review-attestor')).toBeNull();
      expect(buttonByText(root, 'Save review settings')?.disabled).toBe(true);
    });

    it('shows the error panel whose Retry emits retry, and hides the footer', () => {
      const { fixture, root } = setup({ inputs: { loadState: 'error' } });
      const retry = jest.fn();
      fixture.componentInstance.retry.subscribe(retry);
      expect(root.textContent).toContain('Review settings are unavailable.');
      expect(buttonByText(root, 'Save review settings')).toBeUndefined();
      buttonByText(root, 'Retry')?.click();
      expect(retry).toHaveBeenCalledTimes(1);
    });
  });

  describe('sections and parity identifiers', () => {
    it('renders the six sections in order with the read-only severity note and no placeholder section', () => {
      const { root } = setup();
      const headings = Array.from(root.querySelectorAll('h3')).map((heading) => heading.textContent?.trim());
      expect(headings).toEqual([
        'Repositories',
        'Maintainers',
        'Review thresholds',
        'Review lanes',
        'GitHub bot identity',
        'Publication',
      ]);
      expect(root.textContent).toContain('Minimum severity');
      expect(root.textContent).toContain('Set in the repository review config.');
      expect(root.textContent).not.toContain('Minor');
      expect(root.textContent).not.toContain('Effective repository configuration');
      for (const id of ['review-settings-title', 'review-attestor', 'review-maintainers', 'review-add-repository', 'review-bot-token'])
        expect(root.querySelector(`#${id}`)).not.toBeNull();
      expect(root.querySelector('button[aria-label="Remove Hive-Academy/PtahCode"]')).not.toBeNull();
      expect(root.textContent).toContain('Settings apply to the next run.');
      expect(root.textContent).toContain('Fork PRs are always excluded. CodeRabbit remains enabled alongside Ptah review.');
      expect(root.textContent).toContain('Connect a bot token to enable live publication.');
      expect(root.querySelector('.surface-1, .surface-2')).toBeNull();
    });

    it('writes the attestor login to the store', () => {
      const { root, store } = setup();
      typeInto(root.querySelector('#review-attestor') as HTMLInputElement, 'octocat');
      expect(store.attestorLogin()).toBe('octocat');
    });

    it('emits changed for maintainer logins, the four number fields and the polling toggle', () => {
      const { fixture, root } = setup();
      const changed = jest.fn();
      fixture.componentInstance.changed.subscribe(changed);
      typeInto(root.querySelector('#review-maintainers') as HTMLInputElement, 'alice, bob ,');
      expect(changed).toHaveBeenLastCalledWith({ maintainerLogins: ['alice', 'bob'] });
      const numbers = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="number"]'));
      expect(numbers).toHaveLength(4);
      const expected = [
        ['pollMinutes', '30', 30],
        ['maxNewInline', '5', 5],
        ['confidenceFloor', '0.75', 0.75],
        ['laneCapPerPr', '3', 3],
      ] as const;
      expected.forEach(([field, raw, value], index) => {
        typeInto(numbers[index], raw);
        expect(changed).toHaveBeenLastCalledWith({ [field]: value });
      });
      const polling = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((input) =>
        input.parentElement?.textContent?.includes('Enable review polling'),
      ) as HTMLInputElement;
      polling.checked = true;
      polling.dispatchEvent(new Event('change'));
      expect(changed).toHaveBeenLastCalledWith({ repositories: [repo({ enabled: true })] });
    });

    it('wires the Review lanes section to lanes inputs and outputs', () => {
      const { fixture, root } = setup({
        inputs: { laneListState: 'error', lanesSaveError: 'Review lanes were not saved: the pool has a duplicate entry.' },
      });
      const lanesChanged = jest.fn();
      const retryLanes = jest.fn();
      fixture.componentInstance.lanesChanged.subscribe(lanesChanged);
      fixture.componentInstance.retryLanes.subscribe(retryLanes);
      const section = root.querySelector('ptah-review-lanes-section') as HTMLElement;
      expect(section).not.toBeNull();
      buttonByText(section, 'Retry')?.click();
      expect(retryLanes).toHaveBeenCalledTimes(1);
      expect(section.textContent).toContain('Review lanes were not saved: the pool has a duplicate entry.');
    });

    it('shows the footer save error only when there is one, as an assertive alert', () => {
      const { fixture, root } = setup();
      const footer = () => root.querySelector('[drawer-footer]') as HTMLElement;
      expect(footer().querySelector('ptah-alert')).toBeNull();
      fixture.componentRef.setInput('saveError', 'Settings were not saved.');
      fixture.componentRef.setInput('saving', true);
      fixture.detectChanges();
      expect(footer().querySelector('[role="alert"]')?.textContent).toContain('Settings were not saved.');
      expect(buttonByText(footer(), 'Saving…')?.disabled).toBe(true);
    });
  });

  describe('bot identity', () => {
    it('shows the no-token copy without Remove, and the Connect label', () => {
      const { root } = setup();
      expect(root.textContent).toContain('No bot connected. Live publication is unavailable.');
      expect(root.textContent).toContain('Connect bot token');
      expect(buttonByText(root, 'Remove connection')).toBeUndefined();
      expect(buttonByText(root, 'Verify connection')).toBeDefined();
    });

    it('shows the unverified copy, Replace label and Remove with a token; Remove asks for confirmation', () => {
      const store = storeMock();
      const { fixture, root } = setup({ store, inputs: { hasToken: true } });
      expect(root.textContent).toContain('Bot identity unavailable. Verify connection.');
      expect(root.textContent).toContain('Replace bot token');
      buttonByText(root, 'Verify connection')?.click();
      expect(store.loadBotIdentity).toHaveBeenCalledTimes(1);
      buttonByText(root, 'Remove connection')?.click();
      fixture.detectChanges();
      expect(root.querySelector('#review-remove-token-confirm')).not.toBeNull();
      const confirm = root.querySelector('ptah-review-confirm-dialog') as HTMLElement;
      buttonByText(confirm, 'Remove connection')?.click();
      expect(store.clearBotToken).toHaveBeenCalledTimes(1);
    });

    it('shows the connected identity, plaintext warning and errors, and disables Save token while saving', () => {
      const store = storeMock();
      store.botIdentity.set({ login: 'review-bot', scopes: ['repo'], connectedAt: '2026-11-01', verifiedAt: '2026-11-02' });
      store.tokenStorage.set('plaintext');
      store.botIdentityError.set('GitHub verification timed out. Try again.');
      store.credentialState.set('saving');
      const { fixture, root } = setup({ store, inputs: { hasToken: true } });
      expect(root.textContent).toContain('Connected as review-bot');
      expect(root.textContent).toContain('Reported scopes: repo');
      expect(root.textContent).toContain('Verified 2026-11-02');
      const alerts = Array.from(root.querySelectorAll('[role="alert"]')).map((alert) => alert.textContent?.trim());
      expect(alerts).toContain('This bot token is stored as plaintext because system encryption is unavailable.');
      expect(alerts).toContain('GitHub verification timed out. Try again.');
      expect(buttonByText(root, 'Save token')?.disabled).toBe(true);
      store.credentialState.set('error');
      fixture.detectChanges();
      expect(root.textContent).toContain('Credential update failed. Retry.');
    });
  });

  describe('confirm flows', () => {
    it('clears the password field after submitting and asks before resuming publication', async () => {
      const store = storeMock();
      const { fixture, root } = setup({
        store,
        draft: settings({ repositories: [repo({ enabled: true })], maintainerLogins: ['maintainer'], globalPublicationPaused: true }),
      });
      const input = root.querySelector('#review-bot-token') as HTMLInputElement;
      input.value = 'secret-token';
      await fixture.componentInstance.submitToken(input);
      expect(input.value).toBe('');
      expect(store.setBotToken).toHaveBeenCalledWith('secret-token');
      const toggle = Array.from(root.querySelectorAll('input')).find((item) => item.getAttribute('role') === 'switch') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(root.textContent).toContain('Resume live publication?');
      expect(root.querySelector('#review-resume-confirm-description')).not.toBeNull();
    });

    it('pauses all publication immediately when the switch turns on', () => {
      const store = storeMock();
      const { fixture, root } = setup({ store });
      const changed = jest.fn();
      fixture.componentInstance.changed.subscribe(changed);
      const toggle = Array.from(root.querySelectorAll('input')).find((item) => item.getAttribute('role') === 'switch') as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));
      expect(changed).toHaveBeenCalledWith({ globalPublicationPaused: true });
      expect(store.setPublicationPause).toHaveBeenCalledWith(true);
    });

    it('renders confirm dialogs outside the drawer panel, so Escape there does not close the drawer', () => {
      const { fixture, root } = setup({ inputs: { hasToken: true } });
      const close = jest.fn();
      fixture.componentInstance.closed.subscribe(close);
      fixture.componentInstance.confirmation.set('remove-token');
      fixture.detectChanges();
      const dialog = root.querySelector('#review-remove-token-confirm')?.closest('[role="dialog"]') as HTMLElement;
      expect(dialog).not.toBeNull();
      expect(panel(root).contains(dialog)).toBe(false);
      expect(dialog.closest('[popover="manual"]')).not.toBeNull();
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(close).not.toHaveBeenCalled();
      expect(fixture.componentInstance.confirmation()).toBeNull();
    });

    it('asks for fresh live permission attestation after replacing a token', async () => {
      const store = storeMock();
      const { fixture, root } = setup({
        store,
        draft: settings({ repositories: [repo({ enabled: true, dryRun: false })], maintainerLogins: ['maintainer'] }),
      });
      const input = root.querySelector('#review-bot-token') as HTMLInputElement;
      input.value = 'replacement';
      await fixture.componentInstance.submitToken(input);
      fixture.detectChanges();
      expect(input.value).toBe('');
      expect(root.textContent).toContain('Enable live publication?');
      expect(store.setBotToken).toHaveBeenCalledWith('replacement');
      store.botIdentity.set({ login: 'review-bot', scopes: [], connectedAt: 'now', verifiedAt: null });
      fixture.componentRef.setInput('hasToken', true);
      fixture.componentInstance.confirmLiveEnable();
      expect(store.liveAttested()).toBe(true);
    });

    it('confirms before replacing an existing token', () => {
      const store = storeMock();
      const { fixture, root } = setup({ store, inputs: { hasToken: true } });
      const input = root.querySelector('#review-bot-token') as HTMLInputElement;
      input.value = 'next';
      buttonByText(root, 'Save token')?.click();
      fixture.detectChanges();
      expect(store.setBotToken).not.toHaveBeenCalled();
      expect(root.querySelector('#review-replace-token-confirm')).not.toBeNull();
      fixture.componentInstance.confirmReplaceToken();
      expect(store.setBotToken).toHaveBeenCalledWith('next');
      expect(input.value).toBe('');
    });
  });
});

describe('repository settings controls', () => {
  it('starts empty, validates additions, and changes only the selected repository', () => {
    const draft = settings({ repositories: [] });
    const { fixture, root } = setup({ draft });
    const changed = jest.fn();
    fixture.componentInstance.changed.subscribe(changed);
    expect(root.textContent).toContain('No repositories added');
    fixture.componentInstance.newRepository.set('bad/repo/extra');
    fixture.componentInstance.addRepository();
    fixture.detectChanges();
    expect(fixture.componentInstance.repositoryError()).toBeTruthy();
    expect(root.querySelector('ptah-review-repositories-editor [role="alert"]')?.textContent).toContain(
      'Enter a valid GitHub owner/name.',
    );
    fixture.componentInstance.newRepository.set('Acme/Widget');
    buttonByText(root, 'Add repository')?.click();
    const widget = { owner: 'Acme', name: 'Widget', enabled: false, dryRun: true, publicationPaused: false };
    expect(changed).toHaveBeenCalledWith({ repositories: [widget] });
    fixture.componentRef.setInput('draft', { ...draft, repositories: [widget] });
    fixture.detectChanges();
    fixture.componentInstance.newRepository.set('acme/widget');
    fixture.componentInstance.addRepository();
    expect(fixture.componentInstance.repositoryError()).toContain('already');
    const dryRun = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((input) =>
      input.parentElement?.textContent?.includes('Keep this repository'),
    );
    expect(dryRun?.disabled).toBe(true);
    expect(fixture.componentInstance.confirmation()).toBeNull();
    (root.querySelector('button[aria-label="Remove Acme/Widget"]') as HTMLButtonElement).click();
    expect(changed).toHaveBeenLastCalledWith({ repositories: [] });
  });

  it('pauses publication for one repository immediately', () => {
    const store = storeMock();
    const { fixture, root } = setup({ store });
    const changed = jest.fn();
    fixture.componentInstance.changed.subscribe(changed);
    const pause = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((input) =>
      input.parentElement?.textContent?.includes('Pause publication for this repository'),
    ) as HTMLInputElement;
    pause.checked = true;
    pause.dispatchEvent(new Event('change'));
    expect(changed).toHaveBeenCalledWith({ repositories: [repo({ publicationPaused: true })] });
    expect(store.setPublicationPause).toHaveBeenCalledWith(true, true, repo());
  });
});
