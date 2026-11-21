import { buildProviderLimitCard } from './provider-limit-card.view-model';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProviderLimitCardComponent } from './provider-limit-card.component';
import { ProviderLimitChipComponent } from './provider-limit-chip.component';
import type {
  ProviderLimitCardVm,
  ProviderLimitChipVm,
} from './provider-limit-card.view-model';

function card(overrides: Partial<ProviderLimitCardVm> = {}): ProviderLimitCardVm {
  return {
    key: 'claude-cli#account:1',
    providerId: 'claude-cli',
    label: 'Claude Code CLI login · a6b0',
    titleText: 'Claude',
    accountLine: 'login · a6b0',
    selected: false,
    state: 'available',
    statusText: 'Available',
    statusTone: 'ok',
    statusGlyph: '✓',
    windowLabel: '5-hour',
    ring: { value: 40, tone: 'accent', centerText: '40%', label: 'Claude 5-hour used', fadeArc: false },
    primaryValueText: null,
    resetLine: null,
    notice: null,
    miniRows: [
      { key: 'w1', label: 'Weekly', percent: 20, valueText: '20%', tone: 'accent' },
      { key: 'w2', label: 'Opus', percent: null, valueText: '12 requests', tone: 'neutral' },
    ],
    hiddenRowCount: 1,
    sourceLine: 'Provider API · observed 1m ago',
    aged: false,
    details: [{ key: 'source', term: 'Source', value: 'provider API' }],
    action: { kind: 'open-session', label: 'Open chat', providerId: 'claude-cli' },
    ...overrides,
  };
}

function q(fixture: ComponentFixture<unknown>, id: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
}

describe('ProviderLimitCardComponent', () => {
  function render(vm: ProviderLimitCardVm): ComponentFixture<ProviderLimitCardComponent> {
    const fixture = TestBed.createComponent(ProviderLimitCardComponent);
    fixture.componentRef.setInput('card', vm);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the ring, mini rows, hidden count and source line', () => {
    const fixture = render(card());
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('ptah-ring')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="provider-limit-mini-row"]').length).toBe(2);
    expect(el.querySelectorAll('ptah-meter').length).toBe(1);
    expect(el.textContent).toContain('+1 more in Details');
    expect(q(fixture, 'provider-limit-source')?.textContent).toContain('observed 1m ago');
    expect(q(fixture, 'provider-limit-selected')).toBeNull();
  });

  it('shows the short title with the full label as its tooltip, and the account line', () => {
    const fixture = render(card());
    const title = q(fixture, 'provider-limit-title');
    expect(title?.textContent?.trim()).toBe('Claude');
    expect(title?.getAttribute('title')).toBe('Claude Code CLI login · a6b0');
    expect(q(fixture, 'provider-limit-account')?.textContent?.trim()).toBe('login · a6b0');
  });

  it('omits the account line when there is none', () => {
    const fixture = render(card({ accountLine: null }));
    expect(q(fixture, 'provider-limit-account')).toBeNull();
  });

  it('shows the status badge with its glyph, so colour is not the only cue', () => {
    const fixture = render(card({ state: 'limit-reached', statusText: 'Limit reached', statusTone: 'err', statusGlyph: '⚠' }));
    const status = q(fixture, 'provider-limit-status');
    expect(status?.textContent).toContain('⚠');
    expect(status?.textContent).toContain('Limit reached');
    expect(status?.querySelector('[aria-hidden="true"]')?.textContent).toBe('⚠');
  });

  it('renders no glyph for a neutral status', () => {
    const fixture = render(card({ statusTone: 'neutral', statusGlyph: null }));
    expect(q(fixture, 'provider-limit-status')?.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('puts the window name on the ring role', () => {
    const fixture = render(card());
    const ring = (fixture.nativeElement as HTMLElement).querySelector('ptah-ring');
    expect(ring?.querySelector('[aria-label="Claude 5-hour used"]')).not.toBeNull();
  });

  it('marks the selected card', () => {
    const fixture = render(card({ selected: true }));
    expect(q(fixture, 'provider-limit-selected')?.textContent).toContain('Selected for chat');
  });

  it('shows the amount text and reset line when there is no ring', () => {
    const fixture = render(
      card({ ring: null, primaryValueText: '1,200 requests used', resetLine: 'Resets in 3h' }),
    );
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('ptah-ring')).toBeNull();
    expect(el.textContent).toContain('1,200 requests used');
    expect(q(fixture, 'provider-limit-reset')?.textContent).toContain('Resets in 3h');
  });

  it('emits openChat for an open-session action', () => {
    const fixture = render(card());
    const spy = jest.fn();
    fixture.componentInstance.openChat.subscribe(spy);
    q(fixture, 'provider-limit-action')?.click();
    expect(spy).toHaveBeenCalledWith('claude-cli');
  });

  it('emits openSettings for an add-key action', () => {
    const fixture = render(
      card({ action: { kind: 'add-key', label: 'Add key', providerId: 'openrouter' } }),
    );
    const spy = jest.fn();
    fixture.componentInstance.openSettings.subscribe(spy);
    q(fixture, 'provider-limit-action')?.click();
    expect(spy).toHaveBeenCalledWith('openrouter');
  });

  it('renders all windows, accounting, models and evidence in the actual Details popover', () => {
    const now = Date.UTC(2026, 9, 3, 12);
    const vm = buildProviderLimitCard({
      owner: { key: 'claude-cli#account:test', providerId: 'claude-cli', identityKind: 'account', label: 'Claude' },
      status: 'available', windowSetEstablished: true,
      windows: [0, 1, 2, 3].map((i) => ({ key: `other:${i}`, kind: 'other', label: `Window ${i}`, observedAt: now, lastResetAt: now - 1000, resetsAt: now + 1000, used: { kind: 'percent', percent: 40 } })),
      localUsage: { kind: 'local-usage', label: 'Local usage', tokens: 1234, estimatedCostUsd: 5, source: 'local-cli', observedAt: now, models: [{ model: 'model-a', requests: 3 }, { model: 'model-b', requests: 4 }] },
      ownerEvidence: [0, 1, 2, 3].map((i) => ({ source: 'stream-event', observedAt: now, modelScope: `scope-${i}` })),
    }, false, now, { timeZone: 'UTC', zoneNameLocale: 'en-GB' });
    const fixture = render(vm);
    q(fixture, 'provider-limit-details')?.click();
    fixture.detectChanges();
    const popover = (fixture.nativeElement as HTMLElement).querySelector('ptah-description-list');
    expect(popover).not.toBeNull();
    const text = popover?.textContent ?? '';
    for (const expected of ['Window 0', 'Window 1', 'Window 2', 'Window 3', '1,234 tokens', '$5.00 USD', 'model-a', 'model-b', 'scope-0', 'scope-1', 'scope-2', 'scope-3']) expect(text).toContain(expected);
  });

  it('toggles the Details popover', () => {
    const fixture = render(card());
    const trigger = q(fixture, 'provider-limit-details');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    trigger?.click();
    fixture.detectChanges();
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('ProviderLimitChipComponent', () => {
  it('renders the provider name and reason', () => {
    const chip: ProviderLimitChipVm = {
      key: 'cursor#account:1',
      providerId: 'cursor',
      label: 'Cursor',
      reason: 'no usage source',
    };
    const fixture = TestBed.createComponent(ProviderLimitChipComponent);
    fixture.componentRef.setInput('chip', chip);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Cursor');
    expect(text).toContain('no usage source');
    expect(text).not.toContain('·');
    expect(fixture.nativeElement.querySelector('[data-testid="provider-limit-chip"]')).not.toBeNull();
  });
});
