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
  it('matches projected Edit to the outline small Test button and keeps Delete destructive', async () => {
    const { fixture, host } = await mount([instance('a')]);
    q(host, 'ptah-table-row-expander button')?.click();
    fixture.detectChanges();
    const edit = Array.from(
      host.querySelectorAll<HTMLButtonElement>('#lane-detail-a button'),
    ).find((button) => button.textContent?.trim() === 'Edit');
    const remove = Array.from(
      host.querySelectorAll<HTMLButtonElement>('#lane-detail-a button'),
    ).find((button) => button.textContent?.trim() === 'Delete');
    expect(edit?.classList.contains('btn-outline')).toBe(true);
    expect(edit?.classList.contains('btn-sm')).toBe(true);
    expect(remove?.getAttribute('data-tone')).toBe('danger');
  });

  it('hides unset effort in rows and keeps its editor in expanded details at both tiers', async () => {
    const { fixture, host } = await mount([
      system('codex', { effort: { key: 'codexReasoningEffort', value: '' } }),
      system('copilot', { effort: null }),
      instance('a', { selectedModel: '', effort: '' }),
    ]);
    for (const [, name] of [
      ['codex', 'Codex'],
      ['a', 'Lane a'],
    ]) {
      expect(
        q(host, '[aria-label="Effort default for ' + name + '"]'),
      ).toBeNull();
      expect(
        q(
          host,
          '[aria-label="Model default for ' + name + '"]',
        )?.classList.contains('font-mono'),
      ).toBe(false);
    }
    const check = async () => {
      for (const [id, name] of [
        ['codex', 'Codex'],
        ['a', 'Lane a'],
      ]) {
        q(host, '[aria-controls="lane-detail-' + id + '"]')?.click();
        fixture.detectChanges();
        await fixture.whenStable();
        const effort = q(
          host,
          '#lane-detail-' +
            id +
            ' [aria-label="Effort default for ' +
            name +
            '"]',
        );
        expect(effort?.textContent?.trim()).toBe('default');
        effort?.click();
        fixture.detectChanges();
        expect(effort?.getAttribute('aria-expanded')).toBe('true');
        expect(
          fixture.debugElement
            .query(By.directive(StubModelEffortPopoverComponent))
            .componentInstance.field(),
        ).toBe('effort');
        effort?.click();
        fixture.detectChanges();
        q(host, '[aria-controls="lane-detail-' + id + '"]')?.click();
        fixture.detectChanges();
      }
      expect(q(host, '[aria-label="Effort default for Copilot"]')).toBeNull();
    };
    await check();
    narrow(fixture);
    await fixture.whenStable();
    await check();
  });

  it('hides compact row subtitles while keeping the complete name and detail version', async () => {
    const { fixture, host } = await mount([
      system('codex', { name: 'Antigravity' }),
    ]);
    narrow(fixture);
    const identity = q(host, 'ptah-lane-row-identity');
    expect(identity?.getAttribute('data-collapsed')).toBe('true');
    expect(q(host, '.ptah-table-row-title-name')?.textContent).toBe(
      'Antigravity',
    );
    expect(q(host, '.ptah-table-row-title-secondary')).toBeNull();
    q(host, 'ptah-table-row-expander button')?.click();
    fixture.detectChanges();
    expect(q(host, '#lane-detail-codex')?.textContent).toContain('v1.2.3');
  });

  it('does not show a config hint without a source', async () => {
    const { host } = await mount([instance('a')]);
    expect(q(host, '[role="img"]')).toBeNull();
  });

  it('shows the empty state in a message cell', async () => {
    const { host } = await mount([]);
    const cell = q(host, 'td.ptah-table-message-cell');
    expect(cell?.textContent).toContain('No lanes available.');
    expect(cell?.getAttribute('colspan')).toBe('8');
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
  it('omits an empty secondary identity line so the name can center', async () => {
    const { host } = await mount([system('copilot', { versionLabel: null })]);
    const secondary = q(host, '.ptah-table-row-title-secondary');
    expect(secondary).toBeNull();
  });

  it('shows Model / Effort at every tier and other row defaults when collapsed', async () => {
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
    expect(terms()).toContain('Model / Effort');
    narrow(fixture);
    expect(terms()).toEqual(
      expect.arrayContaining(['Permission', 'Network', 'Model / Effort']),
    );
  });

  it('keeps recovery actions beside status and tier counts in details', async () => {
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
    expect(install?.closest('[data-lane-status]')).not.toBeNull();
    expect(
      Array.from(host.querySelectorAll('thead th')).map((cell) =>
        cell.textContent?.trim(),
      ),
    ).not.toContain('Actions');
    expect(lane?.querySelectorAll(':scope > th, :scope > td')).toHaveLength(8);
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
  });
});
