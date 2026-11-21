import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliLaneDefaultCellComponent } from './cli-lane-default-cell.component';
import {
  PTAH_CLI_PERMISSION_CAPABILITIES,
  type CliAdapterManifest,
} from '@ptah-extension/shared';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ChangeDetectorRef, Component, input, output, signal } from '@angular/core';
import { ProvidersSettingsStateService } from '@ptah-extension/core';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { By } from '@angular/platform-browser';
import { PtahTableComponent } from '@ptah-extension/ui';
import { CliModelEffortPopoverComponent } from './cli-model-effort-popover.component';
import type { CliMatrixCellField, CliMatrixRow } from './cli-matrix-rows';
import { LaneModelEffortCellComponent } from './lane-model-effort-cell.component';
import { LanesRedetectButtonComponent } from './lanes-redetect-button.component';
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

/** The CLI group header's Re-detect needs the settings state; its own spec covers it. */
@Component({
  selector: 'ptah-lanes-redetect-button',
  standalone: true,
  template: '<button type="button" [attr.data-testid]="testId()">Re-detect CLIs</button>',
})
class StubRedetectButtonComponent {
  readonly testId = input('policy-redetect');
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

const keylessCursor = (): LaneTableRow =>
  ({
    ...system('codex'),
    id: 'cursor',
    cli: 'cursor',
    name: 'Cursor',
    installed: false,
    enabled: false,
    interactive: false,
    version: null,
    versionLabel: null,
    credentialAction: true,
    model: { key: 'cursorModel', value: '' },
    status: { kind: 'needs-key', label: 'Needs API key', tone: 'warning' },
  }) as LaneTableRow;

const expand = (
  fixture: ComponentFixture<LanesTableComponent>,
  host: HTMLElement,
  testId: string,
): void => {
  q(host, `[data-testid="${testId}"] ptah-table-row-expander button`)?.click();
  fixture.detectChanges();
};

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
    .overrideComponent(LaneModelEffortCellComponent, {
      remove: { imports: [CliModelEffortPopoverComponent] },
      add: { imports: [StubModelEffortPopoverComponent] },
    })
    .overrideComponent(LanesTableComponent, {
      remove: { imports: [LanesRedetectButtonComponent] },
      add: { imports: [StubRedetectButtonComponent] },
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
  Object.defineProperty(table, 'collapsed', { value: () => true });
  // The stub is not a signal, so mark the OnPush view to read the collapsed state again.
  fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
  fixture.detectChanges();
}

const defaultManifest: CliAdapterManifest = {
  ...PTAH_CLI_PERMISSION_CAPABILITIES,
  messaging: {
    steer: { state: 'supported' },
    interrupt: { state: 'supported' },
    continuation: { state: 'supported' },
    resume: { state: 'supported' },
  },
  roleChannel: 'task-prompt',
  mcp: { state: 'supported' },
  limitReader: { state: 'no-reliable-source' },
};

describe('LanesTableComponent', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each(['Confirm', 'Cancel'] as const)(
    'requires confirmation for a yolo built-in detail reset: %s',
    async (action) => {
      HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute('open', '');
      };
      HTMLDialogElement.prototype.close = function () {
        this.removeAttribute('open');
      };
      // Current resolver only supplies plan defaults. Model a yolo built-in
      // result to verify this alternate entry point obeys the cell's guard.
      const row = system('codex', { manifest: defaultManifest });
      const { fixture, host } = await mount([row]);
      const reset = jest.fn();
      fixture.componentInstance.defaultResetRequested.subscribe(reset);
      fixture.componentRef.setInput('defaults', {
        codex: { permission: 'plan', network: 'deny' },
      });
      q(host, 'ptah-table-row-expander button')?.click();
      fixture.detectChanges();
      const trigger = q(host, '[data-testid="lanes-detail-reset-default"]')!;
      expect(trigger).not.toBeNull();
      const cell = fixture.debugElement
        .queryAll(By.directive(CliLaneDefaultCellComponent))
        .find((element) => element.nativeElement.contains(trigger))!
        .componentInstance as CliLaneDefaultCellComponent;
      jest.spyOn(cell, 'defaultPermission').mockReturnValue('yolo');
      trigger.click();
      fixture.detectChanges();
      expect(reset).not.toHaveBeenCalled();
      const dialog = trigger
        .closest('ptah-cli-lane-default-cell')!
        .querySelector('dialog')!;
      expect(dialog.open).toBe(true);
      expect(dialog.textContent).toContain('Confirm full access');
      const button = Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === action,
      )!;
      button.click();
      fixture.detectChanges();
      expect(dialog.open).toBe(false);
      if (action === 'Confirm') expect(reset).toHaveBeenCalledWith(row);
      else expect(reset).not.toHaveBeenCalled();
    },
  );

  it('resets a non-yolo built-in default immediately from details', async () => {
    const row = system('codex', { manifest: defaultManifest });
    const { fixture, host } = await mount([row]);
    const reset = jest.fn();
    fixture.componentInstance.defaultResetRequested.subscribe(reset);
    fixture.componentRef.setInput('defaults', {
      codex: { permission: 'yolo', network: 'allow' },
    });
    q(host, 'ptah-table-row-expander button')?.click();
    fixture.detectChanges();
    const trigger = q(host, '[data-testid="lanes-detail-reset-default"]')!;
    trigger.click();
    expect(reset).toHaveBeenCalledWith(row);
    expect(
      trigger.closest('ptah-cli-lane-default-cell')!.querySelector('dialog')!
        .open,
    ).toBe(false);
  });

  it('offers reset only for a saved system default in the detail quiet actions at both widths', async () => {
    const codex = system('codex');
    const { fixture, host } = await mount([codex]);
    const resetRequested = jest.fn();
    fixture.componentInstance.defaultResetRequested.subscribe(resetRequested);
    q(host, 'ptah-table-row-expander button')?.click();
    fixture.detectChanges();
    expect(q(host, '[data-testid="lanes-detail-reset-default"]')).toBeNull();
    fixture.componentRef.setInput('defaults', {
      codex: { permission: 'ask', network: 'deny' },
    });
    fixture.detectChanges();
    const reset = q(host, '[data-testid="lanes-detail-reset-default"]');
    // Icon-only RotateCcw in the detail footer; the value is in the label and tooltip.
    expect(reset?.getAttribute('aria-label')).toBe('Reset to default');
    expect(reset?.textContent?.trim()).toBe('');
    expect(reset?.closest('.quiet-actions')).not.toBeNull();
    expect(reset?.closest('[data-testid="lane-detail-footer"]')).not.toBeNull();
    reset?.click();
    expect(resetRequested).toHaveBeenLastCalledWith(codex);
    narrow(fixture);
    q(host, '[data-testid="lanes-detail-reset-default"]')?.click();
    expect(resetRequested).toHaveBeenCalledTimes(2);
    fixture.componentRef.setInput('canWrite', false);
    fixture.detectChanges();
    expect(
      q(host, '[data-testid="lanes-detail-reset-default"]')?.hasAttribute(
        'disabled',
      ),
    ).toBe(true);
  });

  it('collapses below 950px and sizes the columns with a colgroup', async () => {
    const { fixture, host } = await mount([system('codex')]);
    const table = fixture.debugElement.query(By.directive(PtahTableComponent))
      .componentInstance as PtahTableComponent;
    expect(table.collapseBelow()).toBe(950);
    expect(table.wideDetail()).toBe(true);
    const widths = (sel: string): string[] =>
      Array.from(host.querySelectorAll(`${sel} col`)).map(
        (col) => col.className,
      );
    expect(widths('table [data-testid="lanes-colgroup"]')).toEqual([
      'w-[6%]',
      'lane-identity',
      'lane-status',
      'w-[14%]',
      'w-[10%]',
      'w-[14%]',
      'w-[6%]',
      'lane-expander',
    ]);
    expect(q(host, '[data-testid="lanes-colgroup-collapsed"]')).toBeNull();
    narrow(fixture);
    expect(q(host, '[data-testid="lanes-colgroup"]')).toBeNull();
    expect(widths('table [data-testid="lanes-colgroup-collapsed"]')).toEqual([
      'lane-order',
      '',
      'lane-status',
      'lane-enabled',
      'lane-expander',
    ]);
  });

  it('opens Model for the selected row and closes from the popover', async () => {
    const row = system('codex');
    const { fixture, host } = await mount([row]);
    const trigger = q(
      host,
      '[aria-label="Model default for Codex"]',
    ) as HTMLButtonElement;
    expect(trigger.disabled).toBe(false);
    trigger.click();
    fixture.detectChanges();
    const popovers = fixture.debugElement.queryAll(
      By.directive(StubModelEffortPopoverComponent),
    );
    expect(popovers).toHaveLength(1);
    const popover = popovers[0]
      .componentInstance as StubModelEffortPopoverComponent;
    expect(popover.row()).toBe(row);
    expect(popover.field()).toBe('model');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    popover.closed.emit();
    fixture.detectChanges();
    expect(
      fixture.debugElement.queryAll(
        By.directive(StubModelEffortPopoverComponent),
      ),
    ).toHaveLength(0);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens exactly one Model editor from the detail row', async () => {
    const row = system('codex');
    const { fixture, host } = await mount([row]);
    narrow(fixture);
    (q(host, 'ptah-table-row-expander button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const detail = q(host, '#lane-detail-codex') as HTMLElement;
    const trigger = detail.querySelector<HTMLButtonElement>(
      '[aria-label="Model default for Codex"]',
    ) as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    trigger.click();
    fixture.detectChanges();
    const popovers = fixture.debugElement.queryAll(
      By.directive(StubModelEffortPopoverComponent),
    );
    expect(popovers).toHaveLength(1);
    expect(
      (
        popovers[0].componentInstance as StubModelEffortPopoverComponent
      ).field(),
    ).toBe('model');
    expect(
      (popovers[0].componentInstance as StubModelEffortPopoverComponent).row(),
    ).toBe(row);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(
      host.querySelectorAll('[data-testid="cli-matrix-model"]'),
    ).toHaveLength(1);
  });

  it('switches from the detail Model editor to the cell editor without duplication', async () => {
    const { fixture, host } = await mount([system('codex')]);
    narrow(fixture);
    (q(host, 'ptah-table-row-expander button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const detailTrigger = q(
      host,
      '#lane-detail-codex [aria-label="Model default for Codex"]',
    ) as HTMLButtonElement;
    const cellTrigger = q(
      host,
      '[data-testid="cli-provider-card-codex"] [aria-label="Model default for Codex"]',
    ) as HTMLButtonElement;
    detailTrigger.click();
    fixture.detectChanges();
    expect(detailTrigger.getAttribute('aria-expanded')).toBe('true');
    cellTrigger.click();
    fixture.detectChanges();
    expect(
      fixture.debugElement.queryAll(
        By.directive(StubModelEffortPopoverComponent),
      ),
    ).toHaveLength(1);
    expect(detailTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(cellTrigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens Effort for a supported system row and only one popover at a time', async () => {
    const codex = system('codex', {
      effort: { key: 'codexReasoningEffort', value: 'high' },
    });
    const copilot = system('copilot', {
      effort: { key: 'copilotReasoningEffort', value: '' },
    });
    const { fixture, host } = await mount([codex, copilot]);
    const codexEffort = q(
      host,
      '[aria-label="Effort default for Codex"]',
    ) as HTMLButtonElement;
    expect(codexEffort.textContent?.trim()).toBe('high');
    codexEffort.click();
    fixture.detectChanges();
    let popovers = fixture.debugElement.queryAll(
      By.directive(StubModelEffortPopoverComponent),
    );
    expect(popovers).toHaveLength(1);
    expect(
      (
        popovers[0].componentInstance as StubModelEffortPopoverComponent
      ).field(),
    ).toBe('effort');
    expect(
      (popovers[0].componentInstance as StubModelEffortPopoverComponent).row(),
    ).toBe(codex);
    (
      q(host, '[aria-label="Model default for Copilot"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    popovers = fixture.debugElement.queryAll(
      By.directive(StubModelEffortPopoverComponent),
    );
    expect(popovers).toHaveLength(1);
    expect(
      (popovers[0].componentInstance as StubModelEffortPopoverComponent).row(),
    ).toBe(copilot);
    expect(codexEffort.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps noninteractive Model and Effort disabled and omits unsupported Effort', async () => {
    const { host } = await mount([
      uninstalled('codex'),
      instance('off', {
        interactive: false,
        selectedModel: '',
        effort: 'high',
      }),
      system('copilot'),
    ]);
    expect(
      (q(host, '[aria-label="Model default for Codex"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        q(
          host,
          '[aria-label="Model default for Lane off"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        q(
          host,
          '[aria-label="Effort default for Lane off"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(q(host, '[aria-label="Effort default for Copilot"]')).toBeNull();
    // Default and unsupported efforts add no visible suffix.
    const na = q(
      host,
      '[data-testid="cli-provider-card-copilot"] [data-testid="lanes-effort-na"]',
    );
    expect(na?.textContent?.replace(/\s+/g, ' ').trim()).toBe('');
  });

  it('opens the instance Model and Effort editors', async () => {
    const row = instance('a', { selectedModel: 'local/model', effort: 'high' });
    const { fixture, host } = await mount([row]);
    for (const field of ['model', 'effort'] as const) {
      (
        q(
          host,
          `[aria-label="${field === 'model' ? 'Model' : 'Effort'} default for Lane a"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const popovers = fixture.debugElement.queryAll(
        By.directive(StubModelEffortPopoverComponent),
      );
      expect(popovers).toHaveLength(1);
      expect(
        (
          popovers[0].componentInstance as StubModelEffortPopoverComponent
        ).field(),
      ).toBe(field);
      expect(
        (
          popovers[0].componentInstance as StubModelEffortPopoverComponent
        ).row(),
      ).toBe(row);
    }
  });

  it('does not open an editor while busy or before an instance model loads', async () => {
    const { fixture, host } = await mount([
      system('codex'),
      instance('loading'),
    ]);
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const trigger = q(
      host,
      '[aria-label="Model default for Codex"]',
    ) as HTMLButtonElement;
    expect(trigger.getAttribute('aria-busy')).toBe('true');
    // Busy is aria-disabled, not disabled: the trigger keeps focus during a save.
    expect(trigger.disabled).toBe(false);
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    trigger.click();
    fixture.detectChanges();
    expect(
      fixture.debugElement.queryAll(
        By.directive(StubModelEffortPopoverComponent),
      ),
    ).toHaveLength(0);
    expect(q(host, '[aria-label="Model default for Lane loading"]')).toBeNull();
    expect(
      q(host, '[aria-label="Effort default for Lane loading"]'),
    ).toBeNull();
  });
  it('keeps instance row hooks and emits toggle and actions', async () => {
    const row = instance('local-one', { name: 'Local one' });
    const { fixture, host } = await mount([row]);
    const toggled = jest.fn();
    const tested = jest.fn();
    fixture.componentInstance.toggled.subscribe(toggled);
    fixture.componentInstance.test.subscribe(tested);

    expect(q(host, '[data-testid="cli-matrix-row-local-one"]')).not.toBeNull();
    q(host, '[aria-label="Local one enabled"]')?.click();
    expect(toggled).toHaveBeenCalledWith(expect.objectContaining({ row }));

    q(host, '[aria-label="More actions for Local one"]')?.click();
    fixture.detectChanges();
    q(host, '[data-testid="cli-matrix-test-local-one"]')?.click();
    expect(tested).toHaveBeenCalledWith(row);
  });

  it('keeps only Test in the instance kebab (decision 23); Edit and Delete are in the detail footer', async () => {
    const row = instance('a');
    const { fixture, host } = await mount([row]);
    const edit = jest.fn();
    const del = jest.fn();
    fixture.componentInstance.edit.subscribe(edit);
    fixture.componentInstance.delete.subscribe(del);
    const trigger = q(host, '[aria-label="More actions for Lane a"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    const items = Array.from(
      host.querySelectorAll('ptah-table-row-actions [role="menuitem"]'),
    ).map((item) => item.textContent?.trim());
    expect(items).toEqual(['Test']);
    expect(q(host, 'ptah-table-row-actions [data-testid="cli-matrix-edit-a"]')).toBeNull();
    trigger.click();
    fixture.detectChanges();
    expand(fixture, host, 'cli-matrix-row-a');
    const footer = q(host, '#lane-detail-a [data-testid="lane-detail-footer"]')!;
    expect(footer.querySelector('[data-testid="cli-matrix-tiers-a"]')).not.toBeNull();
    (footer.querySelector('[data-testid="cli-matrix-edit-a"]') as HTMLButtonElement).click();
    (footer.querySelector('[data-testid="cli-matrix-delete-a"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q(host, 'ptah-inline-confirm')).not.toBeNull();
    (q(host, 'ptah-inline-confirm button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(edit).toHaveBeenCalledWith(row);
    expect(del).toHaveBeenCalledWith(row);
  });

  it('keeps Test and Sign in in the kebab of a row that needs a key', async () => {
    const { fixture, host } = await mount([keylessCursor()]);
    (q(host, '[aria-label="More actions for Cursor"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(
      Array.from(
        host.querySelectorAll('ptah-table-row-actions [role="menuitem"]'),
      ).map((item) => item.textContent?.trim()),
    ).toEqual(['Test', 'Sign in']);
  });

  it('cancels Delete and returns focus to the footer Delete button', async () => {
    const row = instance('a');
    const { fixture, host } = await mount([row]);
    const deleted = jest.fn();
    fixture.componentInstance.delete.subscribe(deleted);
    expand(fixture, host, 'cli-matrix-row-a');
    const remove = q(host, '[data-testid="cli-matrix-delete-a"]') as HTMLButtonElement;
    remove.focus();
    remove.click();
    fixture.detectChanges();
    // One confirmation group only, next to the footer Delete; its own Cancel has focus.
    expect(host.querySelectorAll('ptah-inline-confirm')).toHaveLength(1);
    const footer = q(host, '#lane-detail-a [data-testid="lane-detail-footer"]')!;
    const cancel = footer.querySelector(
      '[data-testid="lanes-delete-cancel-a"]',
    ) as HTMLButtonElement;
    expect(cancel).not.toBeNull();
    expect(q(host, '[data-lane-status] ptah-inline-confirm')).toBeNull();
    expect(document.activeElement).toBe(cancel);
    cancel.click();
    fixture.detectChanges();
    await Promise.resolve();
    expect(q(host, 'ptah-inline-confirm')).toBeNull();
    expect(document.activeElement).toBe(remove);
    expect(deleted).not.toHaveBeenCalled();
  });

  it('returns focus to the footer Delete after Cancel when the click landed on its icon (PR review A)', async () => {
    const { fixture, host } = await mount([instance('a')]);
    expand(fixture, host, 'cli-matrix-row-a');
    const remove = q(host, '[data-testid="cli-matrix-delete-a"]') as HTMLButtonElement;
    // The event target is the SVG icon (not an HTMLElement); the handler is bound on the button.
    const icon =
      remove.querySelector('svg') ??
      remove.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    expect(icon).not.toBeInstanceOf(HTMLElement);
    icon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    const cancel = q(host, '[data-testid="lanes-delete-cancel-a"]') as HTMLButtonElement;
    expect(cancel).not.toBeNull();
    cancel.click();
    fixture.detectChanges();
    await Promise.resolve();
    expect(q(host, 'ptah-inline-confirm')).toBeNull();
    expect(document.activeElement).toBe(remove);
  });

  it('drops the pending Delete confirmation when its detail closes', async () => {
    const { fixture, host } = await mount([instance('a')]);
    expand(fixture, host, 'cli-matrix-row-a');
    (q(host, '[data-testid="cli-matrix-delete-a"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelectorAll('ptah-inline-confirm')).toHaveLength(1);
    expand(fixture, host, 'cli-matrix-row-a');
    expect(q(host, '#lane-detail-a ptah-lanes-table-detail')).toBeNull();
    expand(fixture, host, 'cli-matrix-row-a');
    expect(q(host, 'ptah-inline-confirm')).toBeNull();
  });

  it('keeps focus on the expander that opened another detail while Delete was pending (N1)', async () => {
    const { fixture, host } = await mount([instance('a'), instance('b')]);
    expand(fixture, host, 'cli-matrix-row-a');
    (q(host, '[data-testid="cli-matrix-delete-a"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const expanderB = q(
      host,
      '[data-testid="cli-matrix-row-b"] ptah-table-row-expander button',
    ) as HTMLButtonElement;
    expanderB.focus();
    expanderB.click();
    fixture.detectChanges();
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    await fixture.whenStable();
    expect(q(host, 'ptah-inline-confirm')).toBeNull();
    expect(q(host, '#lane-detail-b ptah-lanes-table-detail')).not.toBeNull();
    expect(document.activeElement).toBe(expanderB);
  });

  it('focuses the next row actions trigger when Confirm removes the deleted row', async () => {
    const rows = [instance('a'), instance('b')];
    const { fixture, host } = await mount(rows);
    let completeDelete: (() => void) | undefined;
    const deleted = jest.fn((row: LaneTableRow) => {
      completeDelete = () =>
        fixture.componentRef.setInput(
          'rows',
          rows.filter((item) => item !== row),
        );
    });
    fixture.componentInstance.delete.subscribe(deleted);
    const original = q(host, '[aria-label="More actions for Lane a"]') as HTMLButtonElement;
    expand(fixture, host, 'cli-matrix-row-a');
    (q(host, '[data-testid="cli-matrix-delete-a"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (q(host, 'ptah-inline-confirm button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(original);
    completeDelete?.();
    fixture.detectChanges();
    await Promise.resolve();
    expect(deleted).toHaveBeenCalledWith(rows[0]);
    expect(q(host, '[data-testid="cli-matrix-row-a"]')).toBeNull();
    expect(document.activeElement).toBe(
      q(host, '[aria-label="More actions for Lane b"]'),
    );
  });

  it('keeps the delete focus fallback while the row stays, then focuses it on removal', async () => {
    const rows = [instance('a'), instance('b')];
    const { fixture, host } = await mount(rows);
    expand(fixture, host, 'cli-matrix-row-a');
    (q(host, '[data-testid="cli-matrix-delete-a"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (q(host, 'ptah-inline-confirm button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentRef.setInput('rows', [...rows]);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.componentRef.setInput('rows', [rows[1]]);
    fixture.detectChanges();
    await Promise.resolve();
    expect(q(host, '[data-testid="cli-matrix-row-a"]')).toBeNull();
    expect(document.activeElement).toBe(
      q(host, '[aria-label="More actions for Lane b"]'),
    );
  });

  it('focuses the next row actions trigger when Confirm removes the row synchronously', async () => {
    const rows = [instance('a'), instance('b')];
    const { fixture, host } = await mount(rows);
    fixture.componentInstance.delete.subscribe((row) => {
      fixture.componentRef.setInput(
        'rows',
        rows.filter((item) => item !== row),
      );
    });
    expand(fixture, host, 'cli-matrix-row-a');
    (q(host, '[data-testid="cli-matrix-delete-a"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (q(host, 'ptah-inline-confirm button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await Promise.resolve();
    expect(document.activeElement).toBe(
      q(host, '[aria-label="More actions for Lane b"]'),
    );
  });

  describe('groups', () => {
    it('renders CLI agents and Ptah CLI instances groups with counts; numbers run across both', async () => {
      const { host } = await mount([
        { ...system('codex'), order: 1 },
        { ...instance('a'), order: 2 },
        { ...system('copilot'), order: 3 },
        { ...instance('b'), order: 4 },
        { ...keylessCursor(), order: undefined },
      ]);
      const ids = (group: string) =>
        Array.from(
          host.querySelectorAll(`tbody[data-lanes-group="${group}"] > tr[data-lane-kind]`),
        ).map((row) => row.getAttribute('data-testid'));
      expect(ids('cli')).toEqual([
        'cli-provider-card-codex',
        'cli-provider-card-copilot',
        'cli-provider-card-cursor',
      ]);
      expect(ids('ptah')).toEqual(['cli-matrix-row-a', 'cli-matrix-row-b']);
      expect(q(host, '[data-testid="lanes-group-cli-count"]')?.textContent).toBe('3');
      expect(q(host, '[data-testid="lanes-group-ptah-count"]')?.textContent).toBe('2');
      const number = (testId: string) =>
        q(host, `[data-testid="${testId}"] td`)?.textContent?.trim();
      expect(number('cli-matrix-row-a')).toBe('2');
      expect(number('cli-provider-card-copilot')).toBe('3');
      expect(number('cli-provider-card-cursor')).toBe('—');
      expect(q(host, '[data-testid="lanes-group-cli"] [data-testid="policy-redetect"]')).not.toBeNull();
    });

    it('separates the groups with padding on the second header, not a spacer row (decisions 17, 26)', async () => {
      const { host } = await mount([system('codex'), instance('a')]);
      const second = q(host, '[data-testid="lanes-group-ptah"]')!;
      expect(second.classList.contains('lanes-group-second')).toBe(true);
      expect(q(host, '[data-testid="lanes-group-gap"]')).toBeNull();
      const css = readFileSync(join(__dirname, 'lanes-table.component.css'), 'utf8');
      expect(css).toMatch(/\.lanes-group-second > th \{[^}]*padding-top: 1\.75rem/);
      const tbodies = Array.from(host.querySelectorAll('tbody[data-lanes-group]'));
      expect(tbodies.map((body) => body.getAttribute('data-lanes-group'))).toEqual(['cli', 'ptah']);
    });

    it('shows one flat list without group headers in Reorder mode', async () => {
      const { host } = await mount([system('codex'), instance('a'), system('copilot')], true);
      expect(q(host, '[data-testid="lanes-group-cli"]')).toBeNull();
      expect(q(host, '[data-testid="lanes-group-ptah"]')).toBeNull();
      expect(
        Array.from(host.querySelectorAll('tbody[data-lanes-group="flat"] > tr[data-lane-kind]')).map(
          (row) => row.getAttribute('data-testid'),
        ),
      ).toEqual(['cli-provider-card-codex', 'cli-matrix-row-a', 'cli-provider-card-copilot']);
    });

    it('has exactly one Add: the group header with instances, the empty group row without (P-60)', async () => {
      const { fixture, host } = await mount([system('codex'), instance('a')]);
      const add = jest.fn();
      fixture.componentInstance.addRequested.subscribe(add);
      expect(host.querySelectorAll('[data-testid="cli-matrix-add"]')).toHaveLength(1);
      (q(host, '[data-testid="lanes-group-ptah"] [data-testid="cli-matrix-add"]') as HTMLButtonElement).click();
      expect(add).toHaveBeenLastCalledWith('header');
      fixture.componentRef.setInput('rows', [system('codex')]);
      fixture.detectChanges();
      expect(host.querySelectorAll('[data-testid="cli-matrix-add"]')).toHaveLength(1);
      const empty = q(host, '[data-testid="cli-matrix-no-instances"]')!;
      expect(empty.textContent).toContain('No Ptah CLI instance yet.');
      (empty.querySelector('[data-testid="cli-matrix-add"]') as HTMLButtonElement).click();
      expect(add).toHaveBeenLastCalledWith('empty');
    });

    it('renders the Ptah defaults only with a manifest; select and reset emit (P-58, P-59)', async () => {
      const { fixture, host } = await mount([instance('a')]);
      expect(q(host, '[data-testid="lanes-ptah-defaults"]')).toBeNull();
      const selected = jest.fn();
      const reset = jest.fn();
      fixture.componentInstance.ptahDefaultSelected.subscribe(selected);
      fixture.componentInstance.ptahDefaultResetRequested.subscribe(reset);
      fixture.componentRef.setInput('ptahDefaults', {
        manifest: defaultManifest,
        saved: { permission: 'ask', network: 'deny' },
      });
      fixture.detectChanges();
      const defaults = q(host, '[data-testid="lanes-group-ptah"] [data-testid="lanes-ptah-defaults"]')!;
      const cell = fixture.debugElement
        .queryAll(By.directive(CliLaneDefaultCellComponent))
        .map((item) => item.componentInstance as CliLaneDefaultCellComponent)
        .find((item) => item.cli() === 'ptah-cli')!;
      expect(cell.resetVisibility()).toBe('always');
      cell.selected.emit({ permission: 'plan', network: 'deny' });
      expect(selected).toHaveBeenCalledWith({ permission: 'plan', network: 'deny' });
      const resetButton = defaults.querySelector<HTMLButtonElement>('button[aria-label^="Reset"]');
      expect(resetButton?.textContent?.trim()).toBe('');
      cell.resetRequested.emit();
      expect(reset).toHaveBeenCalledTimes(1);
    });

    it('shows the inherited Ptah default with "(default)" in Ptah rows (P20, P-35)', async () => {
      const { fixture, host } = await mount([instance('a')]);
      fixture.componentRef.setInput('ptahDefaults', {
        manifest: defaultManifest,
        saved: { permission: 'ask', network: 'allow' },
      });
      fixture.detectChanges();
      const permission = q(host, '[data-testid="cli-matrix-row-a"] [data-testid="lanes-inherited-permission"]');
      expect(permission?.textContent).toContain('Ask before edits');
      expect(permission?.textContent).toContain('(default)');
      expect(permission?.querySelector('lucide-angular')).not.toBeNull();
      expect(
        q(host, '[data-testid="cli-matrix-row-a"] [data-testid="lanes-inherited-network"]')?.textContent,
      ).toContain('Allowed');
    });
  });

  describe('order', () => {
    const btn = (host: HTMLElement, dir: 'up' | 'down', id: string) =>
      q(host, `[data-testid="policy-order-${dir}-${id}"]`) as HTMLButtonElement;
    const dragEvent = (type: string, target: Element, clientY = 0) => {
      const event = new Event(type, {
        bubbles: true,
        cancelable: true,
      }) as DragEvent;
      Object.defineProperty(event, 'clientY', { value: clientY });
      Object.defineProperty(event, 'dataTransfer', {
        value: { setData: jest.fn(), effectAllowed: '', dropEffect: '' },
      });
      target.dispatchEvent(event);
      return event;
    };

    it('suppresses a focus tooltip during the order button focus return', async () => {
      const { fixture, host } = await mount([instance('a'), instance('b')], true);
      const button = btn(host, 'down', 'a');
      const focused = jest.fn();
      button.addEventListener('focus', focused);
      fixture.componentInstance.orderSettled({
        id: 'a',
        direction: 'down',
        saved: true,
        order: ['a', 'b'],
      });
      fixture.detectChanges();
      await fixture.whenStable();
      button.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
      expect(focused).not.toHaveBeenCalled();
    });

    it('blocks moves while busy or without write permission', async () => {
      const a = instance('a');
      const b = instance('b');
      const { fixture, host } = await mount([a, b], true);
      const reordered = jest.fn();
      fixture.componentInstance.reordered.subscribe(reordered);
      for (const blocked of [
        { busy: true },
        { busyRows: { a: true } },
        { canWrite: false },
      ]) {
        fixture.componentRef.setInput('busy', false);
        fixture.componentRef.setInput('busyRows', {});
        fixture.componentRef.setInput('canWrite', true);
        for (const [key, value] of Object.entries(blocked))
          fixture.componentRef.setInput(key, value);
        fixture.detectChanges();
        const button = btn(host, 'down', 'a');
        expect(button.getAttribute('aria-disabled')).toBe('true');
        button.click();
        const start = dragEvent(
          'dragstart',
          q(host, '[data-testid="policy-order-grip-a"]')!,
        );
        expect(start.defaultPrevented).toBe(true);
        expect(reordered).not.toHaveBeenCalled();
      }
    });

    it('emits reordered up and down with the whole order and marks the ends aria-disabled', async () => {
      const { fixture, host } = await mount([instance('a'), instance('b')], true);
      const reordered = jest.fn();
      fixture.componentInstance.reordered.subscribe(reordered);
      expect(btn(host, 'up', 'a').getAttribute('aria-disabled')).toBe('true');
      expect(btn(host, 'down', 'a').getAttribute('aria-disabled')).toBeNull();
      expect(btn(host, 'up', 'b').getAttribute('aria-disabled')).toBeNull();
      expect(btn(host, 'down', 'b').getAttribute('aria-disabled')).toBe('true');
      expect(btn(host, 'up', 'a').getAttribute('aria-label')).toBe('Move Lane a up');
      expect(btn(host, 'down', 'b').getAttribute('aria-label')).toBe('Move Lane b down');
      btn(host, 'up', 'a').click();
      btn(host, 'down', 'b').click();
      expect(reordered).not.toHaveBeenCalled();
      btn(host, 'down', 'a').click();
      btn(host, 'up', 'b').click();
      expect(reordered).toHaveBeenNthCalledWith(1, {
        order: ['b', 'a'],
        movedId: 'a',
        direction: 'down',
      });
      expect(reordered).toHaveBeenNthCalledWith(2, {
        order: ['b', 'a'],
        movedId: 'b',
        direction: 'up',
      });
    });

    it('drags a row over two positions with a drop indicator and emits the whole order once', async () => {
      const { fixture, host } = await mount(
        [instance('a'), instance('b'), instance('c')],
        true,
      );
      const reordered = jest.fn();
      fixture.componentInstance.reordered.subscribe(reordered);
      const grip = q(host, '[data-testid="policy-order-grip-a"]')!;
      expect(grip.getAttribute('draggable')).toBe('true');
      expect(grip.getAttribute('aria-roledescription')).toBe('sortable');
      dragEvent('dragstart', grip);
      const rowC = q(host, '[data-testid="cli-matrix-row-c"]')!;
      dragEvent('dragover', rowC, 1);
      fixture.detectChanges();
      expect(
        host.querySelectorAll('[data-testid="policy-order-drop-indicator"]'),
      ).toHaveLength(1);
      expect(rowC.getAttribute('data-drop')).toBe('after');
      dragEvent('drop', rowC, 1);
      fixture.detectChanges();
      expect(reordered).toHaveBeenCalledTimes(1);
      expect(reordered).toHaveBeenCalledWith({
        order: ['b', 'c', 'a'],
        movedId: 'a',
        direction: 'down',
      });
      expect(
        q(host, '[data-testid="policy-order-drop-indicator"]'),
      ).toBeNull();
    });

    it('keeps focus on the same button of the moved row and announces its position', async () => {
      const { fixture, host } = await mount([instance('a'), instance('b')], true);
      fixture.componentInstance.reordered.subscribe(() => {
        // The host settles before the new rows render (finding 5): focus waits for the render.
        fixture.componentInstance.orderSettled({
          id: 'a',
          direction: 'down',
          saved: true,
          order: ['b', 'a'],
        });
        fixture.componentRef.setInput('rows', [instance('b'), instance('a')]);
      });
      btn(host, 'down', 'a').click();
      fixture.detectChanges();
      await fixture.whenStable();
      // 'a' is last now: its Down is aria-disabled, so focus takes its Up.
      expect(document.activeElement).toBe(btn(host, 'up', 'a'));
      expect(
        q(host, '[data-testid="policy-order-live"]')?.textContent?.trim(),
      ).toBe('Lane a moved to position 2 of 2');
    });

    it('restores focus with no move announcement when the save fails', async () => {
      const { fixture, host } = await mount([instance('a'), instance('b')], true);
      fixture.componentInstance.reordered.subscribe(() =>
        fixture.componentInstance.orderSettled({
          id: 'a',
          direction: 'down',
          saved: false,
          order: ['a', 'b'],
        }),
      );
      btn(host, 'down', 'a').click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(btn(host, 'down', 'a'));
      expect(
        q(host, '[data-testid="policy-order-live"]')?.textContent?.trim(),
      ).toBe('');
    });

    it('requests no move while the saved order is not verified', async () => {
      const { fixture, host } = await mount([instance('a'), instance('b')], true);
      fixture.componentRef.setInput('canReorder', false);
      fixture.detectChanges();
      const reordered = jest.fn();
      fixture.componentInstance.reordered.subscribe(reordered);
      expect(btn(host, 'down', 'a').getAttribute('aria-disabled')).toBe('true');
      btn(host, 'down', 'a').click();
      expect(reordered).not.toHaveBeenCalled();
    });

    it('keeps an unpositioned row after the numbered rows with a dash and no controls', async () => {
      const { host } = await mount(
        [instance('a'), instance('b'), uninstalled('copilot')],
        true,
      );
      expect(btn(host, 'down', 'b').getAttribute('aria-disabled')).toBe('true');
      expect(btn(host, 'down', 'a').getAttribute('aria-disabled')).toBeNull();
      const copilot = q(host, '[data-testid="cli-provider-card-copilot"]')!;
      expect(copilot.querySelector('td')?.textContent?.trim()).toBe('—');
      expect(copilot.querySelector('[data-order-up], [data-order-down]')).toBeNull();
      expect(copilot.querySelector('[draggable]')).toBeNull();
    });

    it('skips an unpositioned row in the middle when indexing', async () => {
      const { fixture, host } = await mount(
        [instance('a'), uninstalled('copilot'), instance('b')],
        true,
      );
      const reordered = jest.fn();
      fixture.componentInstance.reordered.subscribe(reordered);
      expect(btn(host, 'up', 'b').getAttribute('aria-disabled')).toBeNull();
      expect(btn(host, 'down', 'b').getAttribute('aria-disabled')).toBe('true');
      btn(host, 'down', 'a').click();
      expect(reordered).toHaveBeenCalledWith({
        order: ['b', 'a'],
        movedId: 'a',
        direction: 'down',
      });
    });

    it('keeps a lane that is not enabled in the flat list at its position, still movable', async () => {
      const { fixture, host } = await mount(
        [instance('a'), instance('b', { enabled: false }), instance('c')],
        true,
      );
      const reordered = jest.fn();
      fixture.componentInstance.reordered.subscribe(reordered);
      expect(btn(host, 'up', 'b').getAttribute('aria-disabled')).toBeNull();
      btn(host, 'up', 'b').click();
      expect(reordered).toHaveBeenCalledWith({
        order: ['b', 'a', 'c'],
        movedId: 'b',
        direction: 'up',
      });
    });

    it('closes an expanded detail when Reorder mode turns on (decision 26)', async () => {
      const { fixture, host } = await mount([instance('a'), instance('b')]);
      q(host, 'ptah-table-row-expander button')?.click();
      fixture.detectChanges();
      expect(q(host, '#lane-detail-a ptah-lanes-table-detail')).not.toBeNull();
      fixture.componentRef.setInput('orderMode', true);
      fixture.detectChanges();
      expect(fixture.componentInstance['detailRowId']()).toBeNull();
      expect(q(host, '#lane-detail-a ptah-lanes-table-detail')).toBeNull();
    });

    it('shows the rank when order mode is off', async () => {
      const { host } = await mount([
        instance('a', {}),
        { ...instance('b'), order: 7 },
      ]);
      expect(host.querySelector('[data-order-up]')).toBeNull();
      expect(host.querySelector('[data-testid^="policy-order-grip-"]')).toBeNull();
      const cells = (id: string) =>
        q(host, `[data-testid="cli-matrix-row-${id}"] td`)?.textContent?.trim();
      expect(cells('a')).toBe('1');
      expect(cells('b')).toBe('7');
    });
  });

  describe('keyless Cursor recovery row', () => {
    it('is muted, has a dash, no order controls, a disabled switch; Sign in opens Credentials (P-26, P-51)', async () => {
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
      const cursor = keylessCursor();
      const { fixture, host } = await mount([{ ...system('codex'), order: 1 }, cursor], true);
      const row = q(host, '[data-testid="cli-provider-card-cursor"]');
      expect(row?.getAttribute('data-state')).toBe('muted');
      expect(row?.querySelector('td')?.textContent?.trim()).toBe('—');
      expect(row?.querySelector('[data-order-up]')).toBeNull();
      expect((q(host, '[aria-label="Cursor enabled"]') as HTMLInputElement).disabled).toBe(true);
      fixture.componentRef.setInput('orderMode', false);
      fixture.detectChanges();
      const signIn = jest.fn();
      fixture.componentInstance.signIn.subscribe(signIn);
      (q(host, '[data-testid="cli-provider-card-cursor"] [data-testid="lanes-sign-in"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(signIn).toHaveBeenCalledWith(cursor);
      const detail = q(host, '#lane-detail-cursor')!;
      expect(detail.querySelector('[data-popover-kind="credentials"]')?.getAttribute('aria-expanded')).toBe('true');
      expect(detail.querySelector('[data-popover-kind="install"]')).not.toBeNull();
      // No status-cell Install guide for any row.
      expect(Array.from(host.querySelectorAll('[data-lane-status] button')).some(
        (button) => button.textContent?.trim() === 'Install guide',
      )).toBe(false);
    });

    it('emits Re-detect from the keyless Cursor install guide in its detail (U-5, U-6)', async () => {
      const { fixture, host } = await mount([keylessCursor()]);
      const redetect = jest.fn();
      fixture.componentInstance.redetect.subscribe(redetect);
      expand(fixture, host, 'cli-provider-card-cursor');
      (q(host, '#lane-detail-cursor [data-popover-kind="install"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      Array.from(host.querySelectorAll<HTMLButtonElement>('#lane-detail-cursor button'))
        .find((button) => button.textContent?.trim() === 'Re-detect')
        ?.click();
      expect(redetect).toHaveBeenCalledWith('cursor');
    });
  });

  describe('system row', () => {
    it('keeps one version hook and wide defaults when details are expanded', async () => {
      const { fixture, host } = await mount([system('codex')]);
      q(
        host,
        '[data-testid="cli-provider-card-codex"] ptah-table-row-expander button',
      )?.click();
      fixture.detectChanges();
      expect(
        host.querySelectorAll('[data-testid="cli-matrix-version"]'),
      ).toHaveLength(1);
      expect(q(host, '#lane-detail-codex > td > dl')).toBeNull();
    });
    it('has card and version hooks and a clean model label', async () => {
      const { host } = await mount([
        system('codex', {
          model: { key: 'codexModel', value: 'gpt-5\tGPT 5' },
        }),
      ]);
      expect(q(host, '[data-testid="cli-provider-card-codex"]')).not.toBeNull();
      const version = q(host, '[data-testid="cli-matrix-version"]');
      expect(version?.textContent).toContain('v1.2.3');
      expect(version?.getAttribute('title')).toBe('Codex - 1.2.3');
      // The cell holds the model and the effort; the model button holds the label only.
      const model = q(host, '[data-testid="cli-matrix-model"]');
      expect(
        model
          ?.querySelector('[data-popover-kind="model"]')
          ?.textContent?.trim(),
      ).toBe('gpt-5');
      expect(model?.getAttribute('title')).toBe('gpt-5 (GPT 5)');
    });

    it('shows CLI default for an empty model', async () => {
      const { host } = await mount([system('codex')]);
      expect(
        q(
          host,
          '[data-testid="cli-matrix-model"] [data-popover-kind="model"]',
        )?.textContent?.trim(),
      ).toBe('CLI default');
    });
  });

  describe('instance status', () => {
    it('shows Sign in for needs-key and emits attention', async () => {
      const row = instance('a', {
        status: { kind: 'needs-key', label: 'Needs API key', tone: 'warning' },
      });
      const { fixture, host } = await mount([row]);
      const attention = jest.fn();
      fixture.componentInstance.signIn.subscribe(attention);
      const signIn = Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Sign in',
      );
      expect(signIn).toBeDefined();
      signIn?.click();
      expect(attention).toHaveBeenCalledWith(row);
      expect(
        q(host, '[data-testid="cli-matrix-status"]')?.getAttribute('data-ink'),
      ).toBe('need');
    });

    it('shows the runtime status and a missing key', async () => {
      const { host } = await mount([
        instance('a', {
          runtimeStatus: 'Error',
          keyStatus: { kind: 'missing', label: 'Key missing' },
        }),
      ]);
      expect(
        q(
          host,
          '[data-testid="cli-matrix-runtime-status"]',
        )?.textContent?.trim(),
      ).toBe('Error');
      expect(
        q(host, '[data-testid="cli-matrix-key-status"]')?.textContent?.trim(),
      ).toBe('Key missing');
    });

    it('hides the key badge when a key is set or not needed', async () => {
      const { host } = await mount([instance('a')]);
      expect(q(host, '[data-testid="cli-matrix-key-status"]')).toBeNull();
      expect(q(host, '[data-testid="cli-matrix-runtime-status"]')).toBeNull();
    });

    it('tells a loaded empty model from a model that is not loaded', async () => {
      const { host } = await mount([
        instance('a', { selectedModel: '' }),
        instance('b', { selectedModel: null }),
      ]);
      const model = (id: string) =>
        q(
          host,
          `[data-testid="cli-matrix-row-${id}"] [data-testid="cli-matrix-model"]`,
        )?.textContent?.trim();
      expect(model('a')).toContain('Provider default');
      expect(model('b')).toContain('—');
    });
  });
});
