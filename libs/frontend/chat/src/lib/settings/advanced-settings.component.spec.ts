import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import {
  DeferBlockState,
  TestBed,
  type ComponentFixture,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  AuthStateService,
  ClaudeRpcService,
  VSCodeService,
} from '@ptah-extension/core';
import {
  createMockRpcService,
  rpcError,
  rpcSuccess,
  type MockRpcService,
} from '@ptah-extension/core/testing';
import { AdvancedSettingsComponent } from './advanced-settings.component';
import { SettingsSaveFeedbackService } from './feedback/settings-save-feedback.service';
import { VscodeLmConfigComponent } from './pro-features/vscode-lm-config.component';
import { McpPortConfigComponent } from './pro-features/mcp-port-config.component';
import { ClaudeBuiltinsConfigComponent } from './pro-features/claude-builtins-config.component';
import { AgentBehaviourSectionComponent } from './pro-features/agent-behaviour-section.component';
import { OutputStyleConfigComponent } from './output-style/output-style-config.component';
import { AdvancedSettingsGroupComponent } from './advanced/advanced-settings-group.component';

@Component({
  selector: 'ptah-output-style-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p>Output style</p>',
})
class OutputStyleStub {}

@Component({
  selector: 'ptah-agent-behaviour-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p>Agent behaviour</p>',
})
class AgentBehaviourStub {}

@Component({
  selector: 'ptah-mcp-port-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p>MCP port</p>',
})
class McpPortStub {}

@Component({
  selector: 'ptah-claude-builtins-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p>Claude Code tools</p>',
})
class ClaudeBuiltinsStub {}

@Component({
  selector: 'ptah-vscode-lm-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p>VS Code LM</p>',
})
class VsCodeLmStub {
  readonly modelChanged = output<void>();
}

@Component({
  selector: 'ptah-advanced-settings-group',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section [attr.data-testid]="'group-' + groupId()" [attr.data-row-layout]="rowLayout()"></section>`,
})
class AdvancedGroupStub {
  readonly groupId = input.required<string>();
  readonly contentSurface = input(true);
  readonly headingStyle = input<'caps' | 'section' | 'hidden'>('caps');
  readonly rowLayout = input<'default' | 'aligned'>('default');
}

describe('AdvancedSettingsComponent', () => {
  let fixture: ComponentFixture<AdvancedSettingsComponent>;
  let element: HTMLElement;
  let rpc: MockRpcService;
  /** The page toast (`SettingsSaveFeedbackService.announce`): the import's result is said there, never inline. */
  let announce: jest.Mock<void, [string, 'status' | 'alert']>;
  const outcomeOf = (): { message: string; tone: string } | undefined => {
    const call = announce.mock.calls.at(-1);
    return call ? { message: call[0], tone: call[1] } : undefined;
  };

  /** Auth status the Setup band segment reads (not loaded by default). */
  const authLoaded = signal(false);
  const claudeFound = signal(false);

  beforeEach(() => {
    rpc = createMockRpcService();
    announce = jest.fn();
    authLoaded.set(false);
    claudeFound.set(false);
  });
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  /** Configures a fresh module for the given host and renders the shell. */
  async function render(isElectron: boolean): Promise<void> {
    TestBed.configureTestingModule({
      imports: [AdvancedSettingsComponent],
      providers: [
        { provide: ClaudeRpcService, useValue: rpc },
        { provide: VSCodeService, useValue: { isElectron } },
        { provide: SettingsSaveFeedbackService, useValue: { announce } },
        {
          provide: AuthStateService,
          useValue: {
            isLoaded: authLoaded.asReadonly(),
            claudeCliInstalled: claudeFound.asReadonly(),
          },
        },
      ],
    }).overrideComponent(AdvancedSettingsComponent, {
      remove: {
        imports: [
          AgentBehaviourSectionComponent,
          OutputStyleConfigComponent,
          McpPortConfigComponent,
          ClaudeBuiltinsConfigComponent,
          VscodeLmConfigComponent,
          AdvancedSettingsGroupComponent,
        ],
      },
      add: {
        imports: [
          AgentBehaviourStub,
          OutputStyleStub,
          McpPortStub,
          ClaudeBuiltinsStub,
          VsCodeLmStub,
          AdvancedGroupStub,
        ],
      },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(AdvancedSettingsComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const lm = () =>
    fixture.debugElement
      .query(By.directive(VsCodeLmStub))
      .injector.get(VsCodeLmStub);

  /** Clicks Import, then the inline confirm's "Import settings" button (S-confirm). */
  async function confirmImport(): Promise<void> {
    element
      .querySelector<HTMLButtonElement>('[aria-label="Import settings"]')
      ?.click();
    fixture.detectChanges();
    element
      .querySelector<HTMLButtonElement>('[data-testid="import-confirm-button"]')
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('mounts the section cards in order, with Agent behaviour replacing workflows-config, enhanced-prompts deleted (D14) and Claude Code tools directly below MCP (TASK_2026_853)', async () => {
    await render(false);
    expect(element.querySelector('ptah-workflows-config')).toBeNull();
    expect(element.querySelector('ptah-enhanced-prompts-config')).toBeNull();
    const selectors = [
      '[data-testid="data-section"]',
      'ptah-agent-behaviour-section',
      'ptah-output-style-config',
      'ptah-mcp-port-config',
      'ptah-claude-builtins-config',
      'ptah-vscode-lm-config',
      '[data-testid="fine-tuning-details"]',
    ];
    const nodes = selectors.map((selector) => element.querySelector(selector));
    expect(nodes.every(Boolean)).toBe(true);
    for (let i = 0; i < nodes.length - 1; i += 1) {
      expect(nodes[i]?.compareDocumentPosition(nodes[i + 1] as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
    expect(
      element.querySelector('ptah-mcp-port-config')?.nextElementSibling?.tagName.toLowerCase(),
    ).toBe('ptah-claude-builtins-config');
  });

  it('ends with a Fine-tuning section of closed rows whose deferred groups render the upkeep groups (TASK_2026_658)', async () => {
    await render(false);
    const details = element.querySelector<HTMLElement>(
      '[data-testid="fine-tuning-details"]',
    );
    expect(
      details?.closest('[data-testid="fine-tuning-section"]')?.getAttribute('data-glass-surface'),
    ).toBe('content');
    const rowButtons = Array.from(
      details?.querySelectorAll<HTMLButtonElement>('ptah-disclosure button[aria-expanded]') ?? [],
    );
    expect(rowButtons.map((button) => button.textContent?.trim())).toEqual([
      'Memory upkeep',
      'Scheduled jobs',
      'Workspace harness',
    ]);
    expect(rowButtons.every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(
      element.querySelector('[data-testid="fine-tuning-summary"]')?.textContent,
    ).toContain('Fine-tuning');
    const groupIds = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>('[data-testid^="group-"]'),
      ).map((node) => node.dataset['testid']);
    const blocks = await fixture.getDeferBlocks();
    expect(blocks).toHaveLength(3);
    for (const block of blocks) await block.render(DeferBlockState.Placeholder);
    expect(
      element.querySelector('[data-testid="fine-tuning-placeholder"]'),
    ).not.toBeNull();
    expect(groupIds()).toEqual([]);
    for (const block of blocks) await block.render(DeferBlockState.Complete);
    expect(groupIds()).toEqual([
      'group-memory-upkeep',
      'group-scheduled-jobs',
      'group-workspace-harness',
    ]);
    expect(
      details?.contains(
        element.querySelector('[data-testid="group-memory-upkeep"]'),
      ),
    ).toBe(true);
  });

  it('starts with the overview band: one idle segment per section until the section reports', async () => {
    await render(false);
    const band = element.querySelector('[data-testid="advanced-overview"]');
    expect(band?.compareDocumentPosition(element.querySelector('[data-testid="data-section"]') as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const segments = Array.from(band?.querySelectorAll('button') ?? []).map((button) =>
      button.getAttribute('aria-label'),
    );
    expect(segments).toEqual([
      'Agent behaviour Not loaded',
      'Output style Not loaded',
      'MCP server Not loaded',
      'Claude Code tools Not loaded',
      'Setup Not loaded',
    ]);
  });

  it('reports the Setup segment from the Claude Code install check once auth status loads', async () => {
    authLoaded.set(true);
    claudeFound.set(true);
    await render(false);
    const label = (): string | null | undefined =>
      Array.from(
        element.querySelectorAll('[data-testid="advanced-overview"] button'),
      )
        .map((button) => button.getAttribute('aria-label'))
        .find((text) => text?.startsWith('Setup'));
    expect(label()).toContain('Ready');
    claudeFound.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(label()).toContain('Check needed');
  });

  it('F8/F38: separates the sections by one gap with and without glass, and caps the wide fields at 1400px', async () => {
    await render(false);
    const sections = element.querySelector('[data-advanced-sections]');
    expect(sections?.classList.contains('gap-[var(--ptah-gap-section)]')).toBe(true);
    // The parent owns the gap from Fine-tuning to Setup: the list adds no block padding or margin of its own.
    expect(Array.from(sections?.classList ?? []).filter((name) => /^(pb|py|mb|my)-/.test(name))).toEqual([]);
    expect(sections?.lastElementChild?.getAttribute('data-testid')).toBe('fine-tuning-section');
    expect(
      sections?.classList.contains('[@container(min-width:1400px)]:[--ptah-settings-content-max-w:56rem]'),
    ).toBe(true);
  });

  it('F18: Export and Import are icon + label buttons whose aria-label equals the visible label', async () => {
    await render(false);
    for (const label of ['Export settings', 'Import settings']) {
      const button = element.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
      expect(button?.textContent?.trim()).toBe(label);
      expect(button?.querySelector('lucide-angular[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('gives the Fine-tuning section its icon and asks its groups for the aligned row layout', async () => {
    await render(false);
    const fineTuning = element.querySelector('[data-testid="fine-tuning-section"]');
    expect(fineTuning?.getAttribute('data-glass-surface')).toBe('content');
    expect(fineTuning?.querySelector('[data-testid="form-section-icon"]')).not.toBeNull();
    for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete);
    const groups = Array.from(element.querySelectorAll('[data-testid^="group-"]'));
    expect(groups).toHaveLength(3);
    expect(groups.every((group) => group.getAttribute('data-row-layout') === 'aligned')).toBe(true);
  });

  it('keeps the Export settings aria-label and calls ptah.exportSettings in VS Code', async () => {
    await render(false);
    const exportBtn = element.querySelector<HTMLButtonElement>(
      '[aria-label="Export settings"]',
    );
    expect(exportBtn).not.toBeNull();
    exportBtn?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rpc.call).toHaveBeenCalledWith('command:execute', {
      command: 'ptah.exportSettings',
    });
  });

  it('keeps the Import settings aria-label and confirms before calling ptah.importSettings in VS Code', async () => {
    await render(false);
    const importBtn = element.querySelector<HTMLButtonElement>(
      '[aria-label="Import settings"]',
    );
    expect(importBtn).not.toBeNull();
    importBtn?.click();
    fixture.detectChanges();
    // S-confirm: the inline confirm opens and nothing is written yet.
    expect(
      element.querySelector('[data-testid="import-confirm"]'),
    ).not.toBeNull();
    expect(rpc.call).not.toHaveBeenCalled();
    await confirmImport();
    expect(rpc.call).toHaveBeenCalledWith('command:execute', {
      command: 'ptah.importSettings',
    });
  });

  it('does not call the import RPC when the confirm is cancelled', async () => {
    await render(false);
    element
      .querySelector<HTMLButtonElement>('[aria-label="Import settings"]')
      ?.click();
    fixture.detectChanges();
    const cancel = Array.from(
      element.querySelectorAll<HTMLButtonElement>(
        '[data-testid="import-confirm"] button',
      ),
    ).find((button) => button.textContent?.trim() === 'Cancel');
    cancel?.click();
    fixture.detectChanges();
    expect(rpc.call).not.toHaveBeenCalled();
    expect(element.querySelector('[data-testid="import-confirm"]')).toBeNull();
  });

  it('opens the import confirm with Cancel focused; Esc cancels, returns focus to Import and stops there (Batch 49b)', async () => {
    await render(false);
    document.body.appendChild(element);
    const outer = jest.fn();
    document.body.addEventListener('keydown', outer);
    try {
      const importButton = element.querySelector<HTMLButtonElement>(
        '[aria-label="Import settings"]',
      );
      importButton?.click();
      fixture.detectChanges();
      fixture.detectChanges();
      expect(document.activeElement?.textContent?.trim()).toBe('Cancel');

      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      fixture.detectChanges();
      await fixture.whenStable();

      expect(
        element.querySelector('[data-testid="import-confirm"]'),
      ).toBeNull();
      // The confirm replaced the trigger while open (M5), so Import is a fresh element now.
      expect(document.activeElement).toBe(
        element.querySelector('[aria-label="Import settings"]'),
      );
      expect(outer).not.toHaveBeenCalled();
      expect(rpc.call).not.toHaveBeenCalled();
    } finally {
      document.body.removeEventListener('keydown', outer);
      element.remove();
    }
  });

  it('M5: renders the import confirm in the Settings backup row of the Import & export card', async () => {
    await render(false);
    element
      .querySelector<HTMLButtonElement>('[aria-label="Import settings"]')
      ?.click();
    fixture.detectChanges();

    const confirm = element.querySelector('[data-testid="import-confirm"]');
    expect(confirm?.closest('[data-testid="data-backup-row"]')).not.toBeNull();
    expect(
      confirm?.closest('[data-testid="data-section"]')?.getAttribute('data-glass-surface'),
    ).toBe('content');
    expect(
      element.querySelector('#advanced-data')?.textContent,
    ).toContain('Import & export');
    // The full warning stays available to assistive technology.
    const detail = element.querySelector(
      `#${confirm?.getAttribute('aria-describedby')}`,
    );
    expect(detail?.textContent).toContain(
      'Import replaces your current settings, API keys and preferences',
    );
  });

  it('returns focus to Import once the confirmed import finishes', async () => {
    rpc.call.mockResolvedValue(rpcSuccess({ cancelled: true }));
    await render(true);
    document.body.appendChild(element);
    try {
      await confirmImport();
      expect(document.activeElement).toBe(
        element.querySelector('[aria-label="Import settings"]'),
      );
    } finally {
      element.remove();
    }
  });

  it.each([
    ['an empty file', 'Selected file is empty'],
    [
      'malformed JSON',
      'Malformed JSON: Unexpected token } in JSON at position 3',
    ],
    [
      'a file that is not an export',
      'The selected file is not a valid Ptah settings export.',
    ],
  ])(
    'N4: %s reports that it is not a Ptah settings export',
    async (_label, hostError) => {
      rpc.call.mockResolvedValue(
        rpcSuccess({
          cancelled: false,
          result: { imported: [], skipped: [], errors: [hostError] },
        }),
      );
      await render(true);
      await confirmImport();
      expect(
        element.querySelector('[data-testid="import-outcome"]'),
      ).toBeNull();
      const outcome = outcomeOf();
      expect(outcome?.tone).toBe('alert');
      expect(outcome?.message).toBe('The file is not a Ptah settings export.');
      expect(outcome?.message).not.toContain(hostError);
    },
  );

  it('N4: a valid export whose every key failed reports a partial failure, never blames the file', async () => {
    rpc.call.mockResolvedValue(
      rpcSuccess({
        cancelled: false,
        result: {
          imported: [],
          skipped: [],
          errors: [
            'ptah.auth.anthropicApiKey: host detail EPERM',
            'config:llm.defaultProvider: host detail',
          ],
        },
      }),
    );
    await render(true);
    await confirmImport();
    expect(element.querySelector('[data-testid="import-outcome"]')).toBeNull();
    const outcome = outcomeOf();
    expect(outcome?.tone).toBe('alert');
    expect(outcome?.message).toBe('Some settings could not be imported.');
    expect(outcome?.message).not.toContain('host detail');
  });

  it('surfaces an Electron import result with errors as an alert toast without leaking host error text', async () => {
    rpc.call.mockResolvedValue(
      rpcSuccess({
        cancelled: false,
        result: {
          imported: ['config:a'],
          skipped: [],
          errors: ['secrets:boom: host detail'],
        },
      }),
    );
    await render(true);
    await confirmImport();
    expect(rpc.call).toHaveBeenCalledWith('settings:import', {});
    expect(element.querySelector('[data-testid="import-outcome"]')).toBeNull();
    const outcome = outcomeOf();
    expect(outcome?.tone).toBe('alert');
    expect(outcome?.message).toContain('Some settings could not be imported.');
    expect(outcome?.message).not.toContain('secrets:boom');
    expect(outcome?.message).not.toContain('host detail');
  });

  it('shows the import outcome only from the write result on Electron success', async () => {
    rpc.call.mockResolvedValue(
      rpcSuccess({
        cancelled: false,
        result: { imported: ['config:a'], skipped: [], errors: [] },
      }),
    );
    await render(true);
    await confirmImport();
    expect(element.querySelector('[data-testid="import-outcome"]')).toBeNull();
    const outcome = outcomeOf();
    expect(outcome?.tone).toBe('status');
    expect(outcome?.message).toContain('Settings imported.');
  });

  it('stays silent when the Electron file dialog is cancelled', async () => {
    rpc.call.mockResolvedValue(rpcSuccess({ cancelled: true }));
    await render(true);
    await confirmImport();
    expect(announce).not.toHaveBeenCalled();
  });

  it('surfaces an Electron import RPC error as an alert toast without leaking host error text', async () => {
    rpc.call.mockResolvedValue(
      rpcError('import handler missing: internal details'),
    );
    await render(true);
    await confirmImport();
    expect(element.querySelector('[data-testid="import-outcome"]')).toBeNull();
    const outcome = outcomeOf();
    expect(outcome?.tone).toBe('alert');
    expect(outcome?.message).toContain('Could not import the settings.');
    expect(outcome?.message).not.toContain('import handler missing');
  });

  it('surfaces a VS Code import execution error as an alert toast without leaking host error text', async () => {
    rpc.call.mockResolvedValue(
      rpcError('command execution failed: internal details'),
    );
    await render(false);
    await confirmImport();
    expect(element.querySelector('[data-testid="import-outcome"]')).toBeNull();
    const outcome = outcomeOf();
    expect(outcome?.tone).toBe('alert');
    expect(outcome?.message).toContain('Could not import the settings.');
    expect(outcome?.message).not.toContain('command execution failed');
  });

  it('surfaces a thrown import exception as an alert toast without leaking Error message', async () => {
    rpc.call.mockRejectedValue(new Error('connection reset: internal details'));
    await render(true);
    await confirmImport();
    expect(element.querySelector('[data-testid="import-outcome"]')).toBeNull();
    const outcome = outcomeOf();
    expect(outcome?.tone).toBe('alert');
    expect(outcome?.message).toContain('Could not import the settings.');
    expect(outcome?.message).not.toContain('connection reset');
  });

  it('uses settings:export/settings:import in Electron', async () => {
    rpc.call.mockResolvedValue(
      rpcSuccess({
        cancelled: false,
        result: { imported: [], skipped: [], errors: [] },
      }),
    );
    await render(true);
    element
      .querySelector<HTMLButtonElement>('[aria-label="Export settings"]')
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await confirmImport();
    expect(rpc.call).toHaveBeenCalledWith('settings:export', {});
    expect(rpc.call).toHaveBeenCalledWith('settings:import', {});
  });

  it('forwards the VS Code LM modelChanged event', async () => {
    await render(false);
    const emitted: void[] = [];
    fixture.componentInstance.modelChanged.subscribe(() =>
      emitted.push(undefined),
    );
    lm().modelChanged.emit();
    expect(emitted.length).toBe(1);
  });

  it('disables the export button while exporting', async () => {
    let finishExport: () => void = () => void 0;
    rpc.call.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishExport = () => resolve(rpcSuccess({ success: true }));
        }),
    );
    await render(false);
    const exportBtn = element.querySelector<HTMLButtonElement>(
      '[aria-label="Export settings"]',
    );
    exportBtn?.click();
    fixture.detectChanges();
    expect(exportBtn?.disabled).toBe(true);
    finishExport();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(exportBtn?.disabled).toBe(false);
  });
});
