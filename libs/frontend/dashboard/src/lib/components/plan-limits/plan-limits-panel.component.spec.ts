import { signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  AppStateManager,
  AuthStateService,
  PlanLimitsStore,
} from '@ptah-extension/core';
import type { PlanLimitOwnerSnapshot, PlanLimitsSnapshot } from '@ptah-extension/shared';
import { windowFixture } from '../provider-account-card/provider-account-test.fixtures';
import { PlanLimitsPanelComponent } from './plan-limits-panel.component';
import { refreshFailedNotice } from './refresh-failed-notice';

const NOW = Date.UTC(2026, 10, 18, 12);

function owner(
  providerId: string,
  label: string,
  overrides: Partial<PlanLimitOwnerSnapshot> = {},
  fingerprint = '0123456789abcdef',
): PlanLimitOwnerSnapshot {
  return {
    owner: { key: `${providerId}#account:${fingerprint}`, providerId, identityKind: 'account', label },
    status: 'available',
    windowSetEstablished: true,
    windows: [],
    ownerEvidence: [],
    ...overrides,
  };
}

const snapshotOf = (...owners: PlanLimitOwnerSnapshot[]): PlanLimitsSnapshot => ({
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

describe('PlanLimitsPanelComponent', () => {
  let store: FakeStore;
  let providerId: WritableSignal<string>;
  let appState: { setCurrentView: jest.Mock; openSettingsTab: jest.Mock };
  let fixture: ComponentFixture<PlanLimitsPanelComponent>;

  function render(snapshot: PlanLimitsSnapshot | null): HTMLElement {
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
      imports: [PlanLimitsPanelComponent],
      providers: [
        { provide: PlanLimitsStore, useValue: store },
        { provide: AuthStateService, useValue: { activeProviderId: providerId } },
        { provide: AppStateManager, useValue: appState },
      ],
    });
    fixture = TestBed.createComponent(PlanLimitsPanelComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const textOf = (el: Element | null | undefined) =>
    el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const cards = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLElement>('[data-testid="provider-limit-card"]'));

  it('puts the selected provider first, then others, and chips for no readings', () => {
    const el = render(
      snapshotOf(
        owner('openai-codex', 'Codex', { windows: [windowFixture({ key: 'other:c' })] }),
        owner('anthropic', 'Claude', { windows: [windowFixture()] }),
        owner('cursor', 'Cursor'),
      ),
    );
    const list = cards(el);
    expect(list.map((card) => card.dataset['provider'])).toEqual(['anthropic', 'openai-codex']);
    expect(textOf(list[0])).toContain('Selected for chat');
    expect(textOf(list[1])).not.toContain('Selected for chat');
    expect(el.querySelectorAll('[data-testid="provider-limit-chip"]')).toHaveLength(1);
  });

  it('follows the persisted provider selection and loads for it', () => {
    const el = render(
      snapshotOf(
        owner('anthropic', 'Claude', { windows: [windowFixture()] }),
        owner('openai-codex', 'Codex', { windows: [windowFixture({ key: 'other:c' })] }),
      ),
    );
    providerId.set('openai-codex');
    fixture.detectChanges();
    expect(cards(el)[0]?.dataset['provider']).toBe('openai-codex');
    expect(store.load).toHaveBeenLastCalledWith({ providerId: 'openai-codex' });
  });

  it('reports a missing selected reading and incomplete discovery', () => {
    const el = render({
      ...snapshotOf(owner('other', 'Other', { windows: [windowFixture()] })),
      discoveryIncomplete: true,
    });
    expect(textOf(el)).toContain('No usage reading returned for the selected provider');
    expect(textOf(el)).toContain('Provider discovery is incomplete');
  });

  it('shows the amount of an accounting-only owner', () => {
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
    expect(textOf(el)).toContain('185 requests');
  });

  it('summarizes reached and near limits in the header', () => {
    const el = render(
      snapshotOf(
        owner('anthropic', 'Claude', { windows: [windowFixture({ used: { kind: 'percent', percent: 100 } })] }),
        owner('openai-codex', 'Codex', { windows: [windowFixture({ key: 'other:c' })] }),
      ),
    );
    const summary = textOf(el.querySelector('[data-testid="plan-limits-summary"]'));
    expect(summary).toContain('1 limit reached');
    expect(summary).toContain('1 near limit');
  });

  it('keeps readings and shows a relative refresh failure', () => {
    const el = render(snapshotOf(owner('anthropic', 'Claude', { windows: [windowFixture()] })));
    expect(el.querySelector('[data-testid="plan-limits-refresh"]')).toBeNull();
    store.loadError.set(true);
    fixture.detectChanges();
    const notice = textOf(el.querySelector('[data-testid="refresh-failed"]'));
    expect(notice).toContain('Refresh failed');
    expect(notice).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(cards(el)).toHaveLength(1);
  });

  it('uses state panels for loading, first failure and empty responses', () => {
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

  it('routes the card actions through app state', () => {
    const el = render(
      snapshotOf(
        owner('anthropic', 'Selected', {
          status: 'service-unavailable',
          unavailableReason: 'no-open-session',
        }),
      ),
    );
    el.querySelector<HTMLButtonElement>('[data-testid="provider-limit-action"]')?.click();
    expect(appState.setCurrentView).toHaveBeenCalledWith('chat');
  });
});

describe('refreshFailedNotice', () => {
  it('returns null without owners and a relative age with readings', () => {
    expect(refreshFailedNotice(snapshotOf(), NOW)).toBeNull();
    const notice = refreshFailedNotice(
      snapshotOf(owner('a', 'A', { windows: [windowFixture({ observedAt: NOW - 4 * 60_000 })] })),
      NOW,
    );
    expect(notice).toContain('observed 4m ago');
  });
});
