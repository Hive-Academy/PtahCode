import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component, input, output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { PtahTableComponent } from '@ptah-extension/ui';
import { CliModelEffortPopoverComponent } from './cli-model-effort-popover.component';
import type { CliMatrixCellField, CliMatrixRow } from './cli-matrix-rows';
import {
  LanesTableComponent,
  type LaneTableRow,
} from './lanes-table.component';

@Component({
  selector: 'ptah-cli-model-effort-popover',
  standalone: true,
  template: '',
})
class StubModelEffortPopoverComponent {
  readonly row = input.required<CliMatrixRow>();
  readonly field = input.required<CliMatrixCellField>();
  readonly closed = output<void>();
}

const instance = (
  id: string,
  patch: Partial<Extract<LaneTableRow, { kind: 'instance' }>> = {},
): LaneTableRow => ({
  kind: 'instance',
  id,
  name: `Lane ${id}`,
  status: { kind: 'ready', label: 'Ready', tone: 'success' },
  enabled: true,
  interactive: true,
  permission: { label: 'Ask', detail: 'Ask before edits' },
  runtimeStatus: null,
  providerId: 'local',
  provider: 'Local',
  keyStatus: { kind: 'keyless', label: 'No key needed' },
  tiers: [],
  selectedModel: null,
  effort: '',
  lastTest: null,
  ...patch,
});

const system = (
  id: 'codex' | 'copilot',
  patch: Partial<Extract<LaneTableRow, { kind: 'system' }>> = {},
): LaneTableRow => ({
  kind: 'system',
  id,
  name: id === 'codex' ? 'Codex' : 'Copilot',
  status: { kind: 'ready', label: 'Ready', tone: 'success' },
  enabled: true,
  interactive: true,
  permission: { label: 'Ask', detail: 'Ask before edits' },
  cli: id,
  installed: true,
  version: '1.2.3',
  versionLabel: 'v1.2.3',
  codexStatusLine: null,
  provider: null,
  model: { key: 'codexModel', value: '' },
  effort: null,
  credentialAction: false,
  ...patch,
});

const uninstalled = (id: 'codex' | 'copilot'): LaneTableRow =>
  system(id, {
    installed: false,
    enabled: false,
    interactive: false,
    version: null,
    versionLabel: null,
    status: { kind: 'not-installed', label: 'Not installed', tone: 'neutral' },
  });

async function mount(
  rows: readonly LaneTableRow[],
  orderMode = false,
): Promise<{
  fixture: ComponentFixture<LanesTableComponent>;
  host: HTMLElement;
}> {
  await TestBed.configureTestingModule({
    imports: [LanesTableComponent],
  })
    .overrideComponent(LanesTableComponent, {
      remove: { imports: [CliModelEffortPopoverComponent] },
      add: { imports: [StubModelEffortPopoverComponent] },
    })
    .compileComponents();
  const fixture = TestBed.createComponent(LanesTableComponent);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('orderMode', orderMode);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

const q = (host: HTMLElement, sel: string): HTMLElement | null =>
  host.querySelector<HTMLElement>(sel);

function narrow(fixture: ComponentFixture<LanesTableComponent>): void {
  const table = fixture.debugElement.query(By.directive(PtahTableComponent))
    .componentInstance as PtahTableComponent;
  // Exercise the real container-width computed signal and projected colgroup.
  table['width'].set(358);
  fixture.detectChanges();
}

describe('LanesTableComponent visual presentation', () => {
  it('uses sans defaults without default effort suffixes in cells and details', async () => {
    const { fixture, host } = await mount([
      system('codex', {
        effort: { key: 'codexReasoningEffort', value: 'default' },
      }),
      instance('a', { selectedModel: '', effort: 'n/a' }),
    ]);
    const check = () => {
      for (const name of ['Codex', 'Lane a']) {
        const trigger = q(
          host,
          '[aria-label="Model default for ' + name + '"]',
        );
        expect(trigger?.classList.contains('font-mono')).toBe(false);
        expect(
          q(host, '[aria-label="Effort default for ' + name + '"]'),
        ).toBeNull();
      }
    };
    check();
    narrow(fixture);
    q(
      host,
      '[data-testid="cli-provider-card-codex"] ptah-table-row-expander button',
    )?.click();
    fixture.detectChanges();
    check();
    expect(
      q(
        host,
        '#lane-detail-codex [data-popover-kind="model"]',
      )?.textContent?.trim(),
    ).toBe('CLI default');
  });

  it('does not show a config hint without a source', async () => {
    const { host } = await mount([instance('a')]);
    expect(q(host, '[role="img"]')).toBeNull();
  });

  it('shows the empty state in a message cell', async () => {
    const { host } = await mount([]);
    const cell = q(host, 'td.ptah-table-message-cell');
    expect(cell?.textContent).toContain('No lanes available.');
    expect(cell?.getAttribute('colspan')).toBe('9');
  });

  it('distinguishes loading and error from an empty result and retries', async () => {
    const { fixture, host } = await mount([]);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(host.textContent).toContain('Loading lanes');
    expect(host.textContent).not.toContain('No lanes available');
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('error', 'Could not load lanes');
    fixture.detectChanges();
    const retry = jest.fn();
    fixture.componentInstance.retry.subscribe(retry);
    expect(host.textContent).toContain('Could not load lanes');
    Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Retry')
      ?.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows a refresh error and Retry while rows remain', async () => {
    const { fixture, host } = await mount([instance('a')]);
    const retry = jest.fn();
    fixture.componentInstance.retry.subscribe(retry);
    fixture.componentRef.setInput('error', 'Could not refresh lanes');
    fixture.detectChanges();

    const message = q(host, 'td.ptah-table-message-cell');
    expect(message?.textContent).toContain('Could not refresh lanes');
    const button = Array.from(message?.querySelectorAll('button') ?? []).find(
      (candidate) => candidate.textContent?.trim() === 'Retry',
    );
    expect(button).toBeDefined();
    button?.click();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it('clears the editor when its row is removed and reinserted', async () => {
    const row = system('codex');
    const { fixture, host } = await mount([row]);
    (
      q(host, '[aria-label="Model default for Codex"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(
      fixture.debugElement.queryAll(
        By.directive(StubModelEffortPopoverComponent),
      ),
    ).toHaveLength(1);
    fixture.componentRef.setInput('rows', []);
    fixture.detectChanges();
    fixture.componentRef.setInput('rows', [row]);
    fixture.detectChanges();
    expect(
      fixture.debugElement.queryAll(
        By.directive(StubModelEffortPopoverComponent),
      ),
    ).toHaveLength(0);
  });

  it('guards writes and announces test progress once', async () => {
    const row = instance('a');
    const { fixture, host } = await mount([row]);
    fixture.componentRef.setInput('canWrite', false);
    fixture.componentRef.setInput('testingRows', { a: true });
    fixture.detectChanges();
    const toggle = q(
      host,
      '[data-testid="cli-matrix-toggle-a"]',
    ) as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(toggle.checked).toBe(true);
    q(host, '[aria-label="More actions for Lane a"]')?.click();
    fixture.detectChanges();
    expect(
      (q(host, '[data-testid="cli-matrix-test-a"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(host.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    await Promise.resolve();
    fixture.detectChanges();
    expect(q(host, '[aria-live="polite"]')?.textContent).toContain(
      'Running test for Lane a',
    );
  });

  it('refuses an uninstalled system toggle and restores its unchecked state', async () => {
    const row = system('codex', { installed: false, enabled: true });
    const { fixture, host } = await mount([row]);
    const toggled = jest.fn();
    fixture.componentInstance.toggled.subscribe(toggled);
    const toggle = q(host, '[aria-label="Codex enabled"]') as HTMLInputElement;

    expect(toggle.disabled).toBe(true);
    expect(toggle.checked).toBe(false);
    toggle.click();
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(toggled).not.toHaveBeenCalled();
    expect(toggle.checked).toBe(false);
  });

  it('disables Test for uninstalled and busy rows and displays a result', async () => {
    const { fixture, host } = await mount([
      uninstalled('copilot'),
      instance('a'),
    ]);
    fixture.componentRef.setInput('busyRows', { a: true });
    fixture.componentRef.setInput('testResults', { a: 'Answered in 1.4 s' });
    fixture.detectChanges();
    for (const name of ['Copilot', 'Lane a']) {
      q(host, `[aria-label="More actions for ${name}"]`)?.click();
      fixture.detectChanges();
      const row = q(
        host,
        name === 'Copilot'
          ? '[data-testid="cli-provider-card-copilot"]'
          : '[data-testid="cli-matrix-row-a"]',
      );
      expect(
        (
          Array.from(
            row?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
          ).find(
            (button) => button.textContent?.trim() === 'Test',
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    }
    expect(host.textContent).toContain('Answered in 1.4 s');
  });

  it('toggles the detail row through the expander', async () => {
    const { fixture, host } = await mount([instance('a')]);
    const detail = q(host, '#lane-detail-a') as HTMLElement;
    expect(detail).not.toBeNull();
    expect(detail.hidden).toBe(true);
    const button = q(
      host,
      'ptah-table-row-expander button',
    ) as HTMLButtonElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe('lane-detail-a');
  });
  it('reserves a secondary identity line when a version is absent', async () => {
    const { host } = await mount([system('copilot', { versionLabel: null })]);
    const secondary = q(host, '.ptah-table-row-title-secondary');
    expect(secondary).not.toBeNull();
    expect(secondary?.textContent).toBe('\u00a0');
  });

  it('shows row defaults in details only when collapsed', async () => {
    const { fixture, host } = await mount([system('codex')]);
    q(host, 'ptah-table-row-expander button')?.click();
    fixture.detectChanges();
    const facts = q(host, '#lane-detail-codex [ptahDetailFacts]');
    const terms = () =>
      Array.from(facts?.querySelectorAll('dt') ?? []).map(
        (dt) => dt.textContent,
      );
    expect(terms()).not.toContain('Permission');
    expect(terms()).not.toContain('Network');
    expect(terms()).not.toContain('Model');
    narrow(fixture);
    expect(terms()).toEqual(
      expect.arrayContaining(['Permission', 'Network', 'Model']),
    );
  });

  it('keeps recovery actions and tier counts outside the status cell', async () => {
    const { fixture, host } = await mount([
      uninstalled('codex'),
      instance('a'),
    ]);
    const lane = q(host, '[data-testid="cli-provider-card-codex"]');
    expect(
      lane?.querySelector('ptah-lanes-table-status')?.textContent,
    ).not.toContain('Install guide');
    const install = Array.from(lane?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent?.trim() === 'Install guide',
    );
    expect(install?.closest('.lane-row-actions')).not.toBeNull();
    narrow(fixture);
    const guide = lane?.querySelector<HTMLButtonElement>(
      'ptah-lane-row-identity .lane-install-guide',
    );
    expect(guide?.closest('th[scope="row"]')).not.toBeNull();
    expect(guide?.previousElementSibling?.tagName).toBe('PTAH-TABLE-ROW-TITLE');
    expect(
      guide?.closest('ptah-lane-row-identity')?.getAttribute('data-collapsed'),
    ).toBe('true');
    expect(q(host, '[data-testid="lanes-colgroup-collapsed"]')).not.toBeNull();
    expect(
      lane?.querySelector('ptah-lanes-table-status')?.textContent,
    ).not.toContain('Install guide');
    const recovered = jest.fn();
    fixture.componentInstance.installGuide.subscribe(recovered);
    guide?.click();
    expect(recovered).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'codex' }),
    );
    expect(q(host, '[data-testid="cli-matrix-tier-summary"]')).toBeNull();
    q(
      host,
      '[data-testid="cli-matrix-row-a"] ptah-table-row-expander button',
    )?.click();
    fixture.detectChanges();
    expect(
      q(host, '[ptahDetailFacts] [data-testid="cli-matrix-tier-summary"]')
        ?.textContent,
    ).toContain('0 of 3 set');
    expect(q(host, '[ptahDetailChips] [ptahBadge]')).not.toBeNull();
  });
});
