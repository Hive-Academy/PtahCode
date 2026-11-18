import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NativePopoverComponent } from '@ptah-extension/ui';
import { ProvidersSettingsStateService } from '@ptah-extension/core';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import type { SystemCliMatrixRow } from './cli-matrix-rows';
import { LanesTableDetailComponent } from './lanes-table-detail.component';

const row = (
  cli: 'codex' | 'cursor' = 'codex',
  installed = true,
): SystemCliMatrixRow => ({
  id: cli,
  cli,
  kind: 'system',
  name: cli === 'codex' ? 'Codex' : 'Cursor',
  status: {
    kind: installed ? 'ready' : 'not-installed',
    label: installed ? 'Ready' : 'Not installed',
    tone: installed ? 'success' : 'neutral',
  },
  enabled: true,
  interactive: installed,
  installed,
  manifest: undefined,
  permission: { badge: 'Ask', detail: 'Ask before edits', tone: 'info' },
  version: '1.2.3',
  versionLabel: 'v1.2.3',
  codexStatusLine: 'Executable found',
  provider: 'CLI',
  model: { key: cli === 'codex' ? 'codexModel' : 'cursorModel', value: '' },
  effort: null,
  credentialAction: cli === 'cursor',
});

describe('LanesTableDetailComponent', () => {
  function mount(value = row()) {
    const fixture = TestBed.createComponent(LanesTableDetailComponent);
    fixture.componentRef.setInput('row', value);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('shows version, executable, provider and native permission facts', () => {
    const { host } = mount();
    const facts = host.querySelector('dl[data-testid="cli-provider-facts"]');
    expect(facts?.getAttribute('aria-label')).toBe('Codex details');
    expect(facts?.textContent).toContain('v1.2.3');
    expect(facts?.textContent).toContain('Executable found');
    expect(facts?.textContent).toContain('CLI');
    expect(facts?.textContent).toContain('Native CLI behavior');
  });

  it('groups Test and its existing result in the single actions row', () => {
    const { fixture, host } = mount();
    fixture.componentRef.setInput('testResult', 'Detected v1.2.3');
    fixture.detectChanges();
    const actions = host.querySelector('[ptahDetailActions]');
    expect(actions?.children).toHaveLength(2);
    expect(actions?.firstElementChild?.classList.contains('test-action')).toBe(
      true,
    );
    expect(actions?.lastElementChild?.classList.contains('quiet-actions')).toBe(
      true,
    );
    expect(
      actions?.querySelector('[data-testid="cli-matrix-test-result"]')
        ?.textContent,
    ).toContain('Detected v1.2.3');
    const test = jest.fn();
    fixture.componentInstance.test.subscribe(test);
    Array.from(actions?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent?.trim() === 'Test')
      ?.click();
    expect(test).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('dl[ptahDetailFacts]')).toHaveLength(1);
  });

  it('emits Codex settings', () => {
    const { fixture, host } = mount();
    const emit = jest.fn();
    fixture.componentInstance.codexSettings.subscribe(emit);
    Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Codex settings')
      ?.click();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('shows Credentials only with a credential action', () => {
    expect(
      mount().host.querySelector('[data-popover-kind="credentials"]'),
    ).toBeNull();
    expect(
      mount(row('cursor')).host.querySelector(
        '[data-popover-kind="credentials"]',
      ),
    ).not.toBeNull();
  });

  it('focuses the Cursor key when Credentials opens', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProvidersSettingsStateService,
          useValue: {
            orchestration: signal({
              status: 'ready',
              data: { cursorApiKeyStored: false, cursorApiKeyEnvSet: false },
              error: null,
            }),
            commit: signal({ status: 'idle' }),
          },
        },
        SettingsSaveFeedbackService,
      ],
    });
    const { fixture, host } = mount(row('cursor'));
    fixture.componentRef.setInput('openKind', 'credentials');
    fixture.detectChanges();
    await fixture.whenStable();
    const trigger = host.querySelector<HTMLElement>(
      '[data-popover-kind="credentials"]',
    );
    trigger?.focus();
    const popover = fixture.debugElement
      .queryAll(By.directive(NativePopoverComponent))
      .find((element) =>
        element.nativeElement.querySelector(
          '[data-popover-kind="credentials"]',
        ),
      )?.componentInstance as NativePopoverComponent | undefined;
    popover?.opened.emit();
    expect(host.querySelector('[data-testid="cursor-credential-key"]')).toBe(
      document.activeElement,
    );
  });

  it('shows Install guide only when uninstalled', () => {
    expect(
      mount().host.querySelector('[data-popover-kind="install"]'),
    ).toBeNull();
    expect(
      mount(row('cursor', false)).host.querySelector(
        '[data-popover-kind="install"]',
      ),
    ).not.toBeNull();
  });

  it('emits Re-detect from the install guide', () => {
    const { fixture, host } = mount(row('cursor', false));
    const emit = jest.fn();
    fixture.componentInstance.redetect.subscribe(emit);
    fixture.componentRef.setInput('openKind', 'install');
    fixture.detectChanges();
    Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Re-detect')
      ?.click();
    expect(emit).toHaveBeenCalledWith('cursor');
  });

  it('emits Edit tiers for an instance', () => {
    const instance = {
      ...row(),
      kind: 'instance' as const,
      providerId: 'local',
      keyStatus: null,
      tiers: [],
      selectedModel: null,
      lastTest: null,
      runtimeStatus: null,
    };
    const { fixture, host } = mount(instance);
    const emit = jest.fn();
    fixture.componentInstance.tiers.subscribe(emit);
    Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Edit tiers')
      ?.click();
    expect(emit).toHaveBeenCalledWith(instance);
    const summary = host.querySelector(
      '[data-testid="cli-matrix-tier-summary"]',
    );
    expect(summary?.textContent?.trim()).toBe('0 of 3 set');
    expect(summary?.parentElement?.textContent).not.toContain('No tier models');
    expect(
      host
        .querySelector('.quiet-actions')
        ?.contains(host.querySelector('[data-popover-kind="capabilities"]')),
    ).toBe(true);
  });

  it('opens rich capabilities for an instance row', () => {
    const instance = {
      ...row(),
      kind: 'instance' as const,
      providerId: 'local',
      keyStatus: null,
      tiers: [],
      selectedModel: null,
      lastTest: null,
      runtimeStatus: null,
    };
    const { fixture, host } = mount(instance);
    const emit = jest.fn();
    fixture.componentInstance.kindToggled.subscribe(emit);
    host
      .querySelector<HTMLButtonElement>('[data-popover-kind="capabilities"]')
      ?.click();
    expect(emit).toHaveBeenCalledWith('capabilities');
    fixture.componentRef.setInput('openKind', 'capabilities');
    fixture.detectChanges();
    const content = host.querySelector('#instance-capabilities-codex');
    expect(content?.textContent).toContain('Messaging');
    expect(content?.textContent).toContain('Permission');
    expect(content?.textContent).toContain('Unverified');
  });

  it('has only one open popover at a time', () => {
    const { fixture, host } = mount();
    fixture.componentRef.setInput('openKind', 'info');
    fixture.detectChanges();
    expect(
      host.querySelectorAll('[data-testid="cli-provider-popover-content"]'),
    ).toHaveLength(1);
    fixture.componentRef.setInput('openKind', 'capabilities');
    fixture.detectChanges();
    expect(
      host.querySelectorAll('[data-testid="cli-provider-popover-content"]'),
    ).toHaveLength(1);
  });
});
