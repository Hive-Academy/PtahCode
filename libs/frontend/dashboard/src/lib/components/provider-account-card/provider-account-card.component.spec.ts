import { windowFixture } from './provider-account-test.fixtures';
import { LOCALE_ID, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  AppStateManager,
  AuthStateService,
  PlanLimitsStore,
} from '@ptah-extension/core';
import {
  type PlanLimitOwnerSnapshot,
  type PlanLimitsSnapshot,
} from '@ptah-extension/shared';

import { ProviderAccountCardComponent } from './provider-account-card.component';

const NOW = Date.UTC(2026, 9, 3, 12, 0);
function owner(
  providerId: string,
  label: string,
  overrides: Partial<PlanLimitOwnerSnapshot> = {},
  fingerprint = '0123456789abcdef',
): PlanLimitOwnerSnapshot {
  return {
    owner: {
      key: `${providerId}#account:${fingerprint}`,
      providerId,
      identityKind: 'account',
      label,
    },
    status: 'available',
    windowSetEstablished: true,
    windows: [],
    ownerEvidence: [],
    ...overrides,
  };
}

const snapshotOf = (
  ...owners: PlanLimitOwnerSnapshot[]
): PlanLimitsSnapshot => ({
  generatedAt: NOW,
  owners,
  sessionOwners: {},
});

interface FakeStore {
  snapshot: WritableSignal<PlanLimitsSnapshot | null>;
  loading: WritableSignal<boolean>;
  loadError: WritableSignal<boolean>;
  now: WritableSignal<number>;
  load: jest.Mock;
}

describe('ProviderAccountCardComponent', () => {
  let store: FakeStore;
  let providerId: WritableSignal<string>;
  /** Tile inline actions navigate through app state. */
  let appState: { setCurrentView: jest.Mock; openSettingsTab: jest.Mock };
  let fixture: ComponentFixture<ProviderAccountCardComponent>;

  function render(
    snapshot: PlanLimitsSnapshot | null,
    locale?: string,
  ): HTMLElement {
    store = {
      snapshot: signal(snapshot),
      loading: signal(false),
      loadError: signal(false),
      now: signal(NOW),
      load: jest.fn().mockResolvedValue(undefined),
    };
    providerId = signal('anthropic');
    appState = { setCurrentView: jest.fn(), openSettingsTab: jest.fn() };
    TestBed.configureTestingModule({
      imports: [ProviderAccountCardComponent],
      providers: [
        { provide: PlanLimitsStore, useValue: store },
        {
          provide: AuthStateService,
          useValue: { activeProviderId: providerId },
        },
        { provide: AppStateManager, useValue: appState },
        ...(locale ? [{ provide: LOCALE_ID, useValue: locale }] : []),
      ],
    });
    fixture = TestBed.createComponent(ProviderAccountCardComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const textOf = (el: Element | null | undefined) =>
    el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('keeps multiple selected unavailable owners featured and others quiet', () => {
    const el = render(
      snapshotOf(
        owner('openai-codex', 'Codex'),
        owner('anthropic', 'Selected one'),
        owner('anthropic', 'Selected two', {}, 'different'),
      ),
    );
    expect(el.querySelectorAll('ptah-provider-account-feature')).toHaveLength(
      2,
    );
    expect(textOf(el)).toContain('Selected for chat');
    expect(textOf(el)).toContain('Without usage readings (1)');
    const quiet = el.querySelector<HTMLElement>('#provider-without-readings');
    expect(quiet?.hidden).toBe(true);
    el.querySelector<HTMLButtonElement>(
      '[aria-controls="provider-without-readings"]',
    )?.click();
    fixture.detectChanges();
    expect(quiet?.hidden).toBe(false);
  });
  it('uses the persisted provider selection without fixed vendor ordering', () => {
    const el = render(
      snapshotOf(owner('anthropic', 'Claude'), owner('openai-codex', 'Codex')),
    );
    providerId.set('openai-codex');
    fixture.detectChanges();
    expect(textOf(el.querySelector('ptah-provider-account-feature'))).toContain(
      'Codex',
    );
    expect(store.load).toHaveBeenLastCalledWith({ providerId: 'openai-codex' });
  });
  it('shows neutral context when selected owner is absent and reports incomplete discovery', () => {
    const el = render({
      ...snapshotOf(owner('other', 'Other')),
      discoveryIncomplete: true,
    });
    expect(el.querySelector('ptah-provider-account-feature')).toBeNull();
    expect(textOf(el)).toContain(
      'No usage reading returned for the selected provider',
    );
    expect(textOf(el)).toContain('Provider discovery is incomplete');
  });
  it('keeps accounting-only owners in other accounts', () => {
    const el = render(
      snapshotOf(
        owner('other', 'Accounting', {
          localUsage: {
            kind: 'local-usage',
            label: 'Activity',
            tokens: 0,
            estimatedCostUsd: 0,
            requests: 185,
            source: 'provider-api',
            observedAt: NOW,
          },
        }),
      ),
    );
    expect(textOf(el)).toContain('Other provider accounts');
    expect(textOf(el)).toContain('185 requests');
    expect(el.querySelector('ptah-meter')).toBeNull();
  });
  it('refreshes once, disables the section action and retains disclosure state and readings', () => {
    const el = render(snapshotOf(owner('other', 'Other')));
    el.querySelector<HTMLButtonElement>(
      '[aria-controls="provider-without-readings"]',
    )?.click();
    fixture.detectChanges();
    const refresh = el.querySelector<HTMLButtonElement>(
      'ptah-section-header button',
    );
    refresh?.click();
    expect(store.load).toHaveBeenLastCalledWith({
      providerId: 'anthropic',
      refresh: true,
    });
    store.loading.set(true);
    fixture.detectChanges();
    expect(refresh?.disabled).toBe(true);
    expect(textOf(refresh)).toBe('Refreshing');
    store.loadError.set(true);
    fixture.detectChanges();
    expect(
      textOf(el.querySelector('[data-testid="refresh-failed"]')),
    ).toContain('Refresh failed');
    expect(
      el.querySelector<HTMLElement>('#provider-without-readings')?.hidden,
    ).toBe(false);
  });
  it('uses state panels for loading, first failure and successful empty responses', () => {
    const el = render(null);
    store.loading.set(true);
    fixture.detectChanges();
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    store.loading.set(false);
    store.loadError.set(true);
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    store.loadError.set(false);
    store.snapshot.set(snapshotOf());
    fixture.detectChanges();
    expect(textOf(el)).toContain('Usage unavailable');
  });
  it('routes existing inline actions', () => {
    const el = render(
      snapshotOf(
        owner('anthropic', 'Selected', {
          status: 'service-unavailable',
          unavailableReason: 'no-open-session',
        }),
      ),
    );
    Array.from(el.querySelectorAll('button'))
      .find((button) => textOf(button) === 'Go to chat')
      ?.click();
    expect(appState.setCurrentView).toHaveBeenCalledWith('chat');
  });
  function details(el: HTMLElement): HTMLButtonElement | null {
    return el.querySelector<HTMLButtonElement>('ptah-provider-account-summary-row [aria-controls], ptah-provider-account-feature [aria-controls]');
  }
  it('keeps Details open when cooldown expires into the quiet group', () => {
    const account = owner('other', 'Cooldown', { cooldown: { observedAt: NOW, until: NOW + 1000 } });
    const el = render(snapshotOf(account));
    details(el)?.click();
    fixture.detectChanges();
    store.now.set(NOW + 2000);
    fixture.detectChanges();
    expect(el.querySelector('#provider-without-readings')).not.toBeNull();
    expect(details(el)?.getAttribute('aria-expanded')).toBe('true');
    el.querySelector<HTMLButtonElement>('[aria-controls="provider-without-readings"]')?.click();
    fixture.detectChanges();
    expect(el.querySelector<HTMLElement>('#provider-without-readings')?.hidden).toBe(false);
    expect(details(el)?.getAttribute('aria-expanded')).toBe('true');
  });
  it('keeps Details open on reading arrival and removal, and prunes departed owners', () => {
    const account = owner('other', 'Reading');
    const el = render(snapshotOf(account));
    details(el)?.click();
    fixture.detectChanges();
    const reading = { ...account, windows: [windowFixture({ observedAt: NOW, lastResetAt: NOW - 60000, resetsAt: NOW + 3600000 })] };
    store.snapshot.set(snapshotOf(reading));
    fixture.detectChanges();
    expect(el.querySelector('#provider-without-readings')).toBeNull();
    expect(details(el)?.getAttribute('aria-expanded')).toBe('true');
    store.snapshot.set(snapshotOf(account));
    fixture.detectChanges();
    expect(details(el)?.getAttribute('aria-expanded')).toBe('true');
    store.snapshot.set(snapshotOf());
    fixture.detectChanges();
    store.snapshot.set(snapshotOf(account));
    fixture.detectChanges();
    expect(details(el)?.getAttribute('aria-expanded')).toBe('false');
  });
  it('keeps expansion when selected provider changes between row and feature', () => {
    const account = owner('other', 'Selected', { windows: ['a', 'b', 'c', 'd'].map((key) => windowFixture({ key: `other:${key}`, observedAt: NOW, lastResetAt: NOW - 60000, resetsAt: NOW + 3600000 })) });
    const el = render(snapshotOf(account));
    details(el)?.click();
    fixture.detectChanges();
    providerId.set('other');
    fixture.detectChanges();
    expect(el.querySelector('ptah-provider-account-feature')).not.toBeNull();
    expect(details(el)?.getAttribute('aria-expanded')).toBe('true');
    providerId.set('anthropic');
    fixture.detectChanges();
    expect(el.querySelector('ptah-provider-account-summary-row')).not.toBeNull();
    expect(details(el)?.getAttribute('aria-expanded')).toBe('true');
  });

});
