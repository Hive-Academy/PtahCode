import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CodexSignInService } from '@ptah-extension/core';
import { OnboardingAnnouncerService } from '../shell/onboarding-announcer.service';
import { signal } from '@angular/core';
import { CONNECTION_OPTIONS, connectionOption } from './connection-options';
import { ProviderPanelComponent } from './provider-panel.component';
import type { ProviderKind, ProviderReadinessView } from './provider-readiness.derive';

const base: ProviderReadinessView = { provider: 'openai-codex', state: 'signed-out', errorCause: null,
  failedFact: null, path: '/usr/bin/codex', version: '1.0', source: 'installed' };
const missing = (provider: ProviderKind): ProviderReadinessView =>
  ({ ...base, provider, state: 'missing', path: null, version: null, source: null });

function create(view: ProviderReadinessView, role: 'main' | 'information' | 'neutral' = 'main'): ComponentFixture<ProviderPanelComponent> {
  const fixture = TestBed.configureTestingModule({ imports: [ProviderPanelComponent], providers: [
    provideRouter([]),
    { provide: CodexSignInService, useValue: { state: signal(null), nothingSeen: signal(false) } },
    { provide: OnboardingAnnouncerService, useValue: { announce: jest.fn() } },
  ] }).createComponent(ProviderPanelComponent);
  fixture.componentRef.setInput('option', connectionOption(view.provider));
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('role', role);
  fixture.componentRef.setInput('platform', 'linux');
  fixture.detectChanges();
  return fixture;
}
const overlay = (): HTMLElement =>
  TestBed.inject(OverlayContainer).getContainerElement();
const dialog = (_element: HTMLElement) =>
  overlay().querySelector<HTMLElement>('cdk-dialog-container');
const openInstall = (fixture: ComponentFixture<ProviderPanelComponent>) => {
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="ready-install-open"]')?.click();
  fixture.detectChanges();
};

describe('ProviderPanelComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it.each(CONNECTION_OPTIONS.map((option) => [option.name, option.id] as const))(
    '%s card shows the descriptor name, description and the Main connection badge',
    (_name, provider) => {
      const option = connectionOption(provider);
      const element: HTMLElement = create({ ...base, provider, state: 'ready' }).nativeElement;
      const name = element.querySelector('[data-testid="connection-option-name"]');
      expect(name?.textContent?.trim()).toBe(option.name);
      expect(name?.getAttribute('role')).toBe('heading');
      expect(name?.getAttribute('aria-level')).toBe('2');
      expect(element.querySelector('[data-testid="connection-option-description"]')?.textContent?.trim()).toBe(option.description);
      expect(element.querySelector('[data-testid="connection-option-role"]')?.textContent?.trim()).toBe('Main connection');
      expect(element.querySelector(`[data-testid="${option.panelTestId}"]`)).not.toBeNull();
    },
  );

  it('offers "How to install" next to the Not installed status, with the guide in a closed dialog', () => {
    const fixture = create(missing('claude-cli'));
    const element: HTMLElement = fixture.nativeElement;
    const header = element.querySelector('header');
    expect(header?.querySelector('[data-testid="ready-panel-status"]')?.textContent).toContain('Not installed');
    const trigger = header?.querySelector<HTMLButtonElement>('[data-testid="ready-install-open"]');
    expect(trigger?.textContent).toContain('How to install');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(dialog(element)).toBeNull();
  });

  it.each(['ready', 'signed-out'] as const)('offers no install dialog when the provider is %s', (state) => {
    const element: HTMLElement = create({ ...base, provider: 'claude-cli', state }).nativeElement;
    expect(element.querySelector('[data-testid="ready-install-open"]')).toBeNull();
    expect(element.querySelector('[data-testid="ready-install-block"]')).toBeNull();
  });

  it('offers no install dialog for a bundled Codex', () => {
    const element: HTMLElement = create({ ...missing('openai-codex'), source: 'bundled' }).nativeElement;
    expect(element.querySelector('[data-testid="ready-install-open"]')).toBeNull();
  });

  it.each(CONNECTION_OPTIONS.map((option) => [option.name, option.id] as const))(
    'opens the labelled %s install dialog with tabs, copy rows and the docs link',
    (_name, provider) => {
      const option = connectionOption(provider);
      const fixture = create(missing(provider));
      openInstall(fixture);
      const element: HTMLElement = fixture.nativeElement;
      const modal = dialog(element);
      expect(modal).not.toBeNull();
      const titleId = modal?.getAttribute('aria-labelledby');
      expect(titleId).toBe(`install-${provider}-title`);
      expect(modal?.querySelector(`#${titleId}`)?.textContent?.trim()).toBe(option.install.title);
      const tabs = modal?.querySelectorAll('[role="tab"]');
      expect([...(tabs ?? [])].map((tab) => tab.textContent?.trim())).toEqual(option.install.tabs.map((tab) => tab.label));
      const firstTab = option.install.tabs[0].id;
      expect(modal?.querySelectorAll('ptah-command-copy-row')).toHaveLength(
        option.install.commands.filter((row) => row.tab === firstTab).length);
      const docs = modal?.querySelector<HTMLAnchorElement>('[data-testid="ready-docs-link"]');
      expect(docs?.href).toBe(option.install.docsUrl);
      expect(docs?.rel).toContain('noopener');
      expect(modal?.textContent).toContain('restart Ptah');
    },
  );

  it.each(CONNECTION_OPTIONS.map((option) => [option.name, option.id] as const))(
    'renders only the selected %s install tab panel',
    (_name, provider) => {
      const option = connectionOption(provider);
      const fixture = create(missing(provider));
      openInstall(fixture);
      const modal = dialog(fixture.nativeElement as HTMLElement);
      const tabs = [...(modal?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
      for (const [index, tab] of option.install.tabs.entries()) {
        tabs[index].click();
        fixture.detectChanges();
        const panels = [...(modal?.querySelectorAll<HTMLElement>('[role="tabpanel"]') ?? [])];
        expect(panels.map((panel) => panel.dataset['testid'])).toEqual([`ready-os-panel-${tab.id}`]);
        expect(panels[0].getAttribute('aria-labelledby')).toBe(tabs[index].id);
        expect(tabs[index].getAttribute('aria-controls')).toBe(panels[0].id);
        expect([...panels[0].querySelectorAll('[data-testid="command-copy-code"]')].map((code) => code.textContent))
          .toEqual(option.install.commands.filter((row) => row.tab === tab.id).map((row) => row.command));
      }
    },
  );

  it('puts the status chip and How to install on their own row below the title', () => {
    const element: HTMLElement = create(missing('claude-cli')).nativeElement;
    const header = element.querySelector('header');
    const row = header?.querySelector('[data-testid="ready-panel-status-row"]');
    expect(header?.firstElementChild?.tagName.toLowerCase()).toBe('ptah-connection-option-heading');
    expect(row?.querySelector('[data-testid="ready-panel-status"]')).not.toBeNull();
    expect(row?.querySelector('[data-testid="ready-install-open"]')).not.toBeNull();
    expect(header?.querySelector('ptah-connection-option-heading [data-testid="ready-panel-status"]')).toBeNull();
  });

  it.each([
    ['Close', (el: HTMLElement) => dialog(el)?.querySelector<HTMLButtonElement>('[data-testid="install-guide-close"]')?.click()],
    ['Escape', (el: HTMLElement) => dialog(el)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))],
    ['the backdrop', (_el: HTMLElement) => overlay().querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click()],
  ] as const)('closes the install dialog through %s', (_how, act) => {
    const fixture = create(missing('claude-cli'));
    openInstall(fixture);
    const element: HTMLElement = fixture.nativeElement;
    expect(dialog(element)).not.toBeNull();
    act(element);
    fixture.detectChanges();
    expect(dialog(element)).toBeNull();
  });

  it('Re-check in the install dialog closes it and asks the page to re-read', () => {
    const fixture = create(missing('openai-codex'));
    const recheck = jest.fn();
    fixture.componentInstance.recheck.subscribe(recheck);
    openInstall(fixture);
    const element: HTMLElement = fixture.nativeElement;
    dialog(element)?.querySelector<HTMLButtonElement>('[data-testid="install-guide-recheck"]')?.click();
    fixture.detectChanges();
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(dialog(element)).toBeNull();
  });

  it.each(CONNECTION_OPTIONS.map((option) => [option.name, option.id] as const))(
    '(parity row 25) %s install tabs wrap in both directions and move focus',
    (_name, provider) => {
      const fixture = create(missing(provider));
      openInstall(fixture);
      const element: HTMLElement = fixture.nativeElement;
      const tablist = dialog(element)?.querySelector<HTMLElement>(`[role="tablist"][aria-label="${connectionOption(provider).install.tablistLabel}"]`);
      expect(tablist).not.toBeNull();
      const tabs = [...(tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
      expect(tabs.length).toBeGreaterThan(1);
      const first = tabs[0];
      const last = tabs[tabs.length - 1];

      last.focus();
      last.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      fixture.detectChanges();
      expect(first.getAttribute('aria-selected')).toBe('true');
      expect(first.tabIndex).toBe(0);
      expect(document.activeElement).toBe(first);

      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      fixture.detectChanges();
      expect(last.getAttribute('aria-selected')).toBe('true');
      expect(last.tabIndex).toBe(0);
      expect(document.activeElement).toBe(last);
    },
  );

  it('shows signed-out Codex help and keeps information help closed', () => {
    const element: HTMLElement = create(base, 'information').nativeElement;
    expect(element.querySelector('details')?.open).toBe(false);
    expect(element.textContent).toContain('Not signed in');
    expect(element.querySelector('[data-testid="connection-option-role"]')?.textContent?.trim()).toBe('Not your main connection');
  });
  it('hides Codex sign-in for unreadable home data', () => {
    const element: HTMLElement = create({ ...base, state: 'error', errorCause: 'home', failedFact: 'sign-in' }).nativeElement;
    expect(element.querySelector('ptah-codex-sign-in-block')).toBeNull();
  });
});
