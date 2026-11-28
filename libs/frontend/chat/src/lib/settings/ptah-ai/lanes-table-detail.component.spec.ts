import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  NativePopoverComponent,
  PtahButtonDirective,
} from '@ptah-extension/ui';
import { ProvidersSettingsStateService } from '@ptah-extension/core';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import type { SystemCliMatrixRow } from './cli-matrix-rows';
import { LanesTableDetailComponent } from './lanes-table-detail.component';
import type { LaneTableRow } from './lanes-table.component';

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

const instanceRow = () => ({
  ...row(),
  kind: 'instance' as const,
  providerId: 'local',
  provider: 'Local provider',
  effort: '' as const,
  keyStatus: { kind: 'missing' as const, label: 'No key' },
  tiers: [],
  selectedModel: null,
  lastTest: null,
  runtimeStatus: null,
});

const LONG_NATIVE =
  'Asks before each edit and each shell command; a parent session in Plan Mode caps spawned lanes to Plan.';

@Component({
  imports: [LanesTableDetailComponent, PtahButtonDirective],
  template: `<ptah-lanes-table-detail [row]="instance">
    <span footer-actions>
      <button type="button" ptahButton variant="ghost" size="sm">Edit</button>
      <button type="button" ptahButton variant="ghost" size="sm" tone="danger">
        Delete
      </button>
    </span>
  </ptah-lanes-table-detail>`,
})
class InstanceDetailHost {
  readonly instance = instanceRow();
}

describe('LanesTableDetailComponent', () => {
  afterEach(() => {
    document
      .querySelectorAll('.cdk-overlay-container')
      .forEach((node) => node.replaceChildren());
  });

  function mount(value: LaneTableRow = row()) {
    const fixture = TestBed.createComponent(LanesTableDetailComponent);
    fixture.componentRef.setInput('row', value);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('shows provider, executable and the native behavior inline (decision 13)', () => {
    const { host } = mount();
    const facts = host.querySelector(
      'ptah-description-list[data-testid="cli-provider-facts"]',
    );
    expect(facts?.getAttribute('aria-label')).toBe('Codex details');
    expect(facts?.textContent).toContain('Executable found');
    expect(facts?.textContent).toContain('Provider');
    expect(facts?.textContent).toContain('CLI');
    expect(facts?.textContent).toContain('Native behavior');
    expect(
      host.querySelector('[data-testid="lane-detail-native"]')?.textContent,
    ).toBe('Ask before edits');
    // Info-only facts are text, not buttons; no info popover trigger is left.
    expect(host.querySelector('[data-popover-kind="permission"]')).toBeNull();
    expect(host.querySelector('[data-popover-kind="info"]')).toBeNull();
    expect(host.querySelector('[data-popover-kind="capabilities"]')).toBeNull();
    expect(
      host.querySelector('[data-testid="lane-detail-native-more"]'),
    ).toBeNull();
  });

  it('never clamps a short native behavior that has no More (P-43: it wraps instead)', () => {
    const { host } = mount({
      ...row(),
      permission: {
        badge: 'Auto',
        detail: 'Runs commands and edits files with full access',
        tone: 'info',
      },
    });
    const text = host.querySelector('[data-testid="lane-detail-native"]')!;
    expect(text.classList.contains('lane-detail-clamp')).toBe(false);
    expect(
      host.querySelector('[data-testid="lane-detail-native-more"]'),
    ).toBeNull();
  });

  it('repeats none of the row values: version, model, permission, network, enabled', () => {
    const { host } = mount();
    const facts = host.querySelector('[data-testid="cli-provider-facts"]');
    const terms = Array.from(facts?.querySelectorAll('dt') ?? []).map((dt) =>
      dt.textContent?.trim(),
    );
    expect(terms).toEqual(['Provider', 'Executable', 'Native behavior']);
    expect(facts?.textContent).not.toContain('v1.2.3');
    expect(host.textContent).not.toContain('Enabled');
  });

  it('clamps a long native behavior to one line with More / Less', () => {
    const { fixture, host } = mount({
      ...row(),
      permission: { badge: 'Ask', detail: LONG_NATIVE, tone: 'info' },
    });
    const text = host.querySelector('[data-testid="lane-detail-native"]')!;
    const more = host.querySelector<HTMLButtonElement>(
      '[data-testid="lane-detail-native-more"]',
    )!;
    expect(text.classList.contains('lane-detail-clamp')).toBe(true);
    expect(more.textContent?.trim()).toBe('More');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(more.getAttribute('aria-controls')).toBe(text.id);
    more.click();
    fixture.detectChanges();
    expect(text.classList.contains('lane-detail-clamp')).toBe(false);
    expect(more.textContent?.trim()).toBe('Less');
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });

  it('groups Test and its result on the left of the footer, the actions on the right', () => {
    const { fixture, host } = mount();
    fixture.componentRef.setInput('testResult', 'Detected v1.2.3');
    fixture.detectChanges();
    const actions = host.querySelector('[ptahDetailActions]');
    expect(actions?.getAttribute('data-testid')).toBe('lane-detail-footer');
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
    expect(
      host.querySelectorAll('ptah-description-list[ptahDetailFacts]'),
    ).toHaveLength(1);
  });

  it('shows Running… while a test runs', () => {
    const { fixture, host } = mount();
    fixture.componentRef.setInput('testing', true);
    fixture.detectChanges();
    expect(
      host.querySelector('[data-testid="cli-matrix-test-result"]')?.textContent,
    ).toBe('Running…');
  });

  it('uses wide slots and keeps only real actions in the footer', () => {
    const { host } = mount();
    expect(
      host.querySelector('ptah-table-detail-layout')?.getAttribute('data-mode'),
    ).toBe('wide');
    expect(host.querySelectorAll('ptah-description-list')).toHaveLength(1);
    const layout = host.querySelector('ptah-table-detail-layout');
    for (const slot of [
      '[ptahDetailFacts]',
      '[ptahDetailChips]',
      '[ptahDetailActions]',
    ]) {
      expect(host.querySelector(slot)?.parentElement?.parentElement).toBe(
        layout,
      );
    }
    const actions = Array.from(
      host.querySelectorAll('[ptahDetailActions] button'),
    );
    expect(actions.map((button) => button.textContent?.trim())).toEqual([
      'Test',
      'Codex settings',
    ]);
    expect(
      actions.every((button) => button.getAttribute('size') === 'sm'),
    ).toBe(true);
    const status = host.querySelector('[role="status"]');
    expect(status?.textContent).toContain('Not run yet');
    expect(status?.previousElementSibling?.textContent?.trim()).toBe('Test');
  });

  it('shows the capability facts inline with icon, label and value (no chip popover)', () => {
    const { host } = mount();
    const facts = host.querySelector('[data-testid="cli-capability-summary"]')!;
    const terms = Array.from(facts.querySelectorAll('dt'));
    expect(terms.map((dt) => dt.textContent?.trim())).toEqual([
      'Messaging',
      'Permission modes',
      'Network',
      'MCP',
      'Limit',
    ]);
    expect(
      terms.every((dt) =>
        dt.querySelector('lucide-angular[aria-hidden="true"]'),
      ),
    ).toBe(true);
    expect(
      Array.from(facts.querySelectorAll('dd')).map((dd) =>
        dd.textContent?.trim(),
      ),
    ).toEqual([
      'Unverified',
      'Unverified',
      'Unverified',
      'Unverified',
      'Unverified',
    ]);
    expect(facts.querySelector('button')).toBeNull();
    expect(host.querySelector('.capability-value')).toBeNull();
  });

  it('renders All capabilities as an inline disclosure, not a popover (decision 20)', () => {
    const { fixture, host } = mount();
    const disclosure = host.querySelector(
      'ptah-disclosure[data-lane-capabilities]',
    )!;
    const toggle = disclosure.querySelector<HTMLButtonElement>('button')!;
    expect(toggle.textContent).toContain('All capabilities');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const detail = disclosure.querySelector(
      '[data-testid="cli-capability-detail"]',
    );
    expect(detail?.textContent).toContain('Messaging');
    expect(detail?.closest('ptah-native-popover')).toBeNull();
    expect(
      host.querySelector('[data-testid="cli-provider-popover-content"]'),
    ).toBeNull();
  });

  it('lays each capability group out as one full-width column, overriding the shared dl style', () => {
    const { fixture, host } = mount();
    host
      .querySelector<HTMLButtonElement>(
        'ptah-disclosure[data-lane-capabilities] button',
      )!
      .click();
    fixture.detectChanges();
    expect(host.querySelector('ptah-cli-capability-detail dl')).not.toBeNull();
    // Jest removes component styles, so the rule is read from the source file.
    const css = readFileSync(
      join(__dirname, 'cli-capability-detail.component.ts'),
      'utf8',
    );
    expect(css).toMatch(
      /:host\s+dl\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
  });

  it('places destructive Delete last after the instance actions', () => {
    const fixture = TestBed.createComponent(InstanceDetailHost);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(
      host.querySelectorAll('[ptahDetailActions] button'),
    );
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Test',
      'Edit tiers',
      'Edit',
      'Delete',
    ]);
    expect(
      buttons.every((button) => button.getAttribute('size') === 'sm'),
    ).toBe(true);
    expect(buttons.at(-1)?.getAttribute('tone')).toBe('danger');
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
    expect(
      document.querySelector('[data-testid="cursor-credential-key"]'),
    ).toBe(document.activeElement);
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

  it('emits Re-detect from the install guide', async () => {
    const { fixture } = mount(row('cursor', false));
    const emit = jest.fn();
    fixture.componentInstance.redetect.subscribe(emit);
    fixture.componentRef.setInput('openKind', 'install');
    fixture.detectChanges();
    await fixture.whenStable();
    Array.from(
      document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-pane button'),
    )
      .find((button) => button.textContent?.trim() === 'Re-detect')
      ?.click();
    expect(emit).toHaveBeenCalledWith('cursor');
  });

  it('emits Edit tiers for an instance and shows no Provider fact (decision 13)', () => {
    const instance = instanceRow();
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
    const facts = host.querySelector('[data-testid="cli-provider-facts"]');
    expect(facts?.textContent).not.toContain('Provider');
    expect(facts?.textContent).not.toContain('Local provider');
    expect(facts?.textContent).toContain('Tier models');
  });

  it('shows the key status and one line per tier for an instance', () => {
    const { host } = mount({
      ...instanceRow(),
      keyStatus: { kind: 'key-set', label: 'Saved' },
      tiers: [
        { tier: 'opus', label: 'Opus', model: 'glm-4.6' },
        { tier: 'haiku', label: 'Haiku', model: 'glm-4.5-air' },
      ],
    });
    expect(
      host.querySelector('[data-testid="cli-matrix-key-status"]')?.textContent,
    ).toBe('Saved');
    expect(
      host
        .querySelector('[data-testid="cli-matrix-tier-summary"]')
        ?.textContent?.trim(),
    ).toBe('2 of 3 set');
    expect(host.querySelector('[data-tier="opus"]')?.textContent).toBe(
      'Opus: glm-4.6',
    );
    expect(host.querySelectorAll('[data-tier]')).toHaveLength(2);
  });

  it('shows the instance capabilities in the inline disclosure', () => {
    const { fixture, host } = mount(instanceRow());
    const emit = jest.fn();
    fixture.componentInstance.kindToggled.subscribe(emit);
    host
      .querySelector<HTMLButtonElement>('[data-lane-capabilities] button')
      ?.click();
    fixture.detectChanges();
    expect(emit).not.toHaveBeenCalled();
    const content = host.querySelector(
      '[data-lane-capabilities] [data-testid="cli-capability-detail"]',
    );
    expect(content?.textContent).toContain('Messaging');
    expect(content?.textContent).toContain('Permissions');
    expect(content?.textContent).toContain('Unverified');
    expect(host.querySelector('[data-popover-kind="capabilities"]')).toBeNull();
  });

  it('has at most one open popover: the install guide', async () => {
    const { fixture } = mount(row('cursor', false));
    fixture.componentRef.setInput('openKind', 'install');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      document.querySelectorAll('[data-testid="cli-provider-popover-content"]'),
    ).toHaveLength(1);
    fixture.componentRef.setInput('openKind', null);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      document.querySelectorAll('[data-testid="cli-provider-popover-content"]'),
    ).toHaveLength(0);
  });

  it('shows the Copilot auto-approve switch row; a flip writes copilotAutoApprove (P-66)', async () => {
    const saveSettings = jest.fn(async () => true);
    const orchestration = signal({
      status: 'ready',
      data: { copilotAutoApprove: false },
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProvidersSettingsStateService,
          useValue: {
            orchestration,
            commit: signal({
              status: 'saved',
              saved: [],
              unsaved: [],
              unconfirmed: [],
              refreshFailed: false,
              message: null,
            }),
            reviewContext: () => ({ scopeKey: 'workspace', activePath: '/ws' }),
            saveSettings,
            refreshOrchestration: jest.fn(async () => undefined),
          },
        },
        SettingsSaveFeedbackService,
      ],
    });
    const copilot = {
      ...row(),
      id: 'copilot',
      cli: 'copilot' as const,
      name: 'Copilot',
      codexStatusLine: null,
    };
    const { fixture, host } = mount(copilot);
    const terms = Array.from(
      host.querySelectorAll('[data-testid="cli-provider-facts"] dt'),
    ).map((dt) => dt.textContent?.trim());
    expect(terms).toContain('Auto-approve');
    const toggle = host.querySelector<HTMLInputElement>(
      '[data-testid="lane-detail-auto-approve"] [data-testid="copilot-auto-approve"]',
    )!;
    expect(toggle.getAttribute('aria-label')).toBe(
      'Auto-approve Copilot tool calls',
    );
    toggle.click();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    fixture.detectChanges();
    expect(saveSettings).toHaveBeenCalledWith(
      { orchestration: { copilotAutoApprove: true } },
      { scopeKey: 'workspace', activePath: '/ws' },
    );
    // The toast, Undo and read-back rules of this write: copilot-auto-approve-toggle.component.spec.ts.
    TestBed.inject(SettingsSaveFeedbackService).dismiss();
  });

  it('shows no auto-approve row for other CLIs', () => {
    expect(
      mount().host.querySelector('[data-testid="lane-detail-auto-approve"]'),
    ).toBeNull();
  });
});
