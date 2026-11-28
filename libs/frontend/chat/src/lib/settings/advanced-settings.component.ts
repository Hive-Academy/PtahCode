import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  AuthStateService,
  ClaudeRpcService,
  VSCodeService,
} from '@ptah-extension/core';
import {
  ADVANCED_SETTINGS,
  ADVANCED_SETTING_GROUPS,
  type AdvancedSettingGroupId,
} from '@ptah-extension/shared';
import { AdvancedSettingsGroupComponent } from './advanced/advanced-settings-group.component';
import { AdvancedOverviewStore } from './advanced/advanced-overview.store';
import { VscodeLmConfigComponent } from './pro-features/vscode-lm-config.component';
import { McpPortConfigComponent } from './pro-features/mcp-port-config.component';
import { ClaudeBuiltinsConfigComponent } from './pro-features/claude-builtins-config.component';
import { AgentBehaviourSectionComponent } from './pro-features/agent-behaviour-section.component';
import { OutputStyleConfigComponent } from './output-style/output-style-config.component';
import { SettingsSaveFeedbackService } from './feedback/settings-save-feedback.service';
import {
  DatabaseBackup,
  Download,
  LucideAngularModule,
  SlidersHorizontal,
  Upload,
} from 'lucide-angular';
import {
  PtahButtonDirective,
  PtahDisclosureComponent,
  PtahFormSectionComponent,
  PtahInlineConfirmComponent,
  PtahInstrumentBandComponent,
  PtahSettingRowComponent,
} from '@ptah-extension/ui';

/** The upkeep groups of the Fine-tuning section, in page order. */
const FINE_TUNING_GROUPS: readonly AdvancedSettingGroupId[] = [
  'memory-upkeep',
  'scheduled-jobs',
  'workspace-harness',
];

/**
 * A per-key import failure is reported as `<key>: <reason>`, the key being a `ptah.*` secret
 * (`settings-import.service.ts` importSecret) or a `config:*` value (`settings-rpc.handlers.ts` registerImport).
 * A file the host rejects as a whole (empty, malformed JSON, not an export) carries no key. Only the prefix is
 * read; the host text itself is never shown (D15).
 */
const KEYED_IMPORT_ERROR = /^(ptah\.|config:)/;

/**
 * Advanced tab shell (TASK_2026_555 Advanced / Search & Voice, Batches 39-42).
 *
 * Hosts the existing child components unchanged and owns the Data Portability
 * (Export/Import) actions (rows A8/A9) in its own "Import & export" section
 * card, whose "Settings backup" row holds the buttons and the import confirm.
 *
 * The closed-by-default "Fine-tuning" disclosure at the end holds the advanced
 * upkeep groups (TASK_2026_658), deferred into their own chunk.
 *
 * Import is S-confirm: an inline confirm (P8) precedes the write, and the
 * outcome is surfaced only from the write's own result (D15). On Electron the
 * RPC reports the import summary, so success and errors are shown in the page toast; on
 * VS Code the host command shows its own dialogs and a cancel is
 * indistinguishable from success at the RPC layer, so only an execution
 * failure is reported here.
 */
@Component({
  selector: 'ptah-advanced-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Page-scoped: each section reports its loaded summary for the instrument band.
  providers: [AdvancedOverviewStore],
  imports: [
    AgentBehaviourSectionComponent,
    OutputStyleConfigComponent,
    McpPortConfigComponent,
    ClaudeBuiltinsConfigComponent,
    VscodeLmConfigComponent,
    AdvancedSettingsGroupComponent,
    PtahButtonDirective,
    PtahInlineConfirmComponent,
    PtahDisclosureComponent,
    PtahFormSectionComponent,
    PtahInstrumentBandComponent,
    PtahSettingRowComponent,
    LucideAngularModule,
  ],
  template: `
    <!-- Each glass section is its own stacking context. The section with focus (an open select
         panel) is raised, so the next section cannot cover the panel.
         F8: one section gap, with and without glass. The list has no bottom padding: the parent owns the gap to Setup. F38: at 1400px or more of the settings layout (the nearest
         size container) the wide fields column of each section stops at 56rem. -->
    <div
      class="flex flex-col gap-[var(--ptah-gap-section)] [&>*]:relative [&>*:focus-within]:z-[var(--ptah-z-raised)] [@container(min-width:1400px)]:[--ptah-settings-content-max-w:56rem]"
      data-advanced-sections
    >
      <ptah-instrument-band
        class="mb-[var(--ptah-gap-heading)]"
        [segments]="overview.segments()"
        ariaLabel="Advanced overview"
        data-testid="advanced-overview"
      />
      <!-- Import & export (A8/A9): the import confirm takes the place of Export / Import inside the
           "Settings backup" row. -->
      <section data-glass-surface="content" data-testid="data-section">
        <ptah-form-section
          id="advanced-data"
          heading="Import &amp; export"
          description="A copy of your settings, API keys and preferences."
          [divider]="true"
          [wide]="true"
          [icon]="DataIcon"
          flushInGlass
        >
          <div class="flex flex-col">
            <ptah-setting-row
              label="Settings backup"
              hint="Export a copy of your settings, or import one."
              controlAlign="end"
              edgePadding="trim"
              data-testid="data-backup-row"
            >
              <div class="flex flex-wrap items-center gap-[var(--ptah-gap-controls)]" data-testid="data-actions">
                @if (confirmingImport()) {
                  <ptah-inline-confirm
                    message="Replace your settings from a file?"
                    ariaLabel="Confirm import settings"
                    confirmLabel="Import settings"
                    tone="danger"
                    confirmTestId="import-confirm-button"
                    aria-describedby="import-confirm-detail"
                    [busy]="isImporting()"
                    (confirm)="importSettings()"
                    (cancelled)="cancelImport()"
                    data-testid="import-confirm"
                  />
                  <span id="import-confirm-detail" class="sr-only">
                    Import replaces your current settings, API keys and preferences
                    with the contents of a settings export file you choose next.
                  </span>
                } @else {
                  <button
                    type="button"
                    ptahButton
                    variant="secondary"
                    [busy]="isExporting()"
                    [disabled]="isExporting()"
                    (click)="exportSettings()"
                    aria-label="Export settings"
                  >
                    <lucide-angular [img]="DownloadIcon" class="size-[var(--ptah-icon-sm)]" aria-hidden="true" />
                    Export settings
                  </button>
                  <button
                    #importButton
                    type="button"
                    ptahButton
                    variant="secondary"
                    [busy]="isImporting()"
                    [disabled]="isImporting()"
                    (click)="requestImport()"
                    aria-label="Import settings"
                  >
                    <lucide-angular [img]="UploadIcon" class="size-[var(--ptah-icon-sm)]" aria-hidden="true" />
                    Import settings
                  </button>
                }
              </div>
            </ptah-setting-row>
          </div>
        </ptah-form-section>
      </section>

      <ptah-agent-behaviour-section />
      <ptah-output-style-config />
      <ptah-mcp-port-config />
      <ptah-claude-builtins-config />
      <ptah-vscode-lm-config (modelChanged)="modelChanged.emit()" />

      <!-- Fine-tuning (TASK_2026_658): one closed row per upkeep group. A group loads in its own chunk only when
           its row is opened (the closed body is hidden, so its viewport trigger cannot fire before). -->
      <section data-glass-surface="content" data-testid="fine-tuning-section">
        <ptah-form-section
          id="advanced-fine-tuning"
          heading="Fine-tuning"
          [divider]="true"
          description="Upkeep jobs for memory, scheduled jobs and the workspace harness."
          [wide]="true"
          [icon]="SlidersIcon"
          flushInGlass
        >
          <div
            class="flex flex-col divide-y divide-base-content/10 border-y border-base-content/10"
            data-testid="fine-tuning-details"
          >
            <span data-testid="fine-tuning-summary" class="sr-only">Fine-tuning</span>
            @for (group of fineTuningGroups; track group.id) {
              <ptah-disclosure
                class="py-[var(--ptah-gap-controls)]"
                [label]="group.title"
                [attr.data-testid]="'fine-tuning-row-' + group.id"
              >
                <span
                  ptahDisclosureMeta
                  class="[margin-inline-start:auto] shrink-0 text-xs text-base-content-muted"
                  >{{ group.count }} settings</span
                >
                <div class="pt-[var(--ptah-gap-controls)]">
                  @defer (on viewport) {
                    <ptah-advanced-settings-group
                      [groupId]="group.id"
                      [contentSurface]="false"
                      headingStyle="hidden"
                      rowLayout="aligned"
                    />
                  } @placeholder {
                    <div
                      class="min-h-[2.75rem]"
                      data-testid="fine-tuning-placeholder"
                    ></div>
                  }
                </div>
              </ptah-disclosure>
            }
          </div>
        </ptah-form-section>
      </section>
    </div>
  `,
})
export class AdvancedSettingsComponent {
  private readonly rpcService = inject(ClaudeRpcService);
  private readonly vscodeService = inject(VSCodeService);
  private readonly injector = inject(Injector);
  /** The page toast: the import's own result is said there (D15). */
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly importButton =
    viewChild<ElementRef<HTMLButtonElement>>('importButton');

  protected readonly DownloadIcon = Download;
  protected readonly UploadIcon = Upload;
  protected readonly SlidersIcon = SlidersHorizontal;
  protected readonly DataIcon = DatabaseBackup;

  /** VS Code LM model changes can change which CLIs are usable (#84). */
  readonly modelChanged = output<void>();

  /** The summary of each section for the instrument band. */
  protected readonly overview = inject(AdvancedOverviewStore);
  private readonly authState = inject(AuthStateService);
  /** One Fine-tuning row per upkeep group: its title and its number of settings. */
  protected readonly fineTuningGroups = FINE_TUNING_GROUPS.map((id) => ({
    id,
    title:
      ADVANCED_SETTING_GROUPS.find((group) => group.id === id)?.title ?? id,
    count: ADVANCED_SETTINGS.filter((setting) => setting.group === id).length,
  }));
  readonly isExporting = signal(false);
  readonly isImporting = signal(false);
  /** The inline import confirm is open (S-confirm, P8). */
  readonly confirmingImport = signal(false);

  constructor() {
    // Setup segment: the Setup block renders in the Settings shell, outside this store's
    // provider, so the page reports it from the auth status (Claude Code install check).
    effect(() => {
      const loaded = this.authState.isLoaded();
      const found = this.authState.claudeCliInstalled();
      untracked(() => {
        if (!loaded) {
          this.overview.clear('setup');
          return;
        }
        this.overview.report(
          'setup',
          found
            ? { value: 'Ready', meta: 'Claude Code found', tone: 'ok' }
            : { value: 'Check needed', meta: 'Claude Code not found', tone: 'warn' },
        );
      });
    });
  }

  /**
   * Export settings to a JSON file.
   * Uses platform-aware RPC: command:execute for VS Code, settings:export for Electron.
   */
  async exportSettings(): Promise<void> {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    try {
      if (this.vscodeService.isElectron) {
        await this.rpcService.call('settings:export', {});
      } else {
        await this.rpcService.call('command:execute', {
          command: 'ptah.exportSettings',
        });
      }
    } finally {
      this.isExporting.set(false);
    }
  }

  /** Opens the inline import confirm (A9, S-confirm). */
  requestImport(): void {
    this.confirmingImport.set(true);
  }

  /**
   * Cancel and Esc close the confirm and return focus to Import, once it is enabled again (P8). Esc stops
   * here, so an enclosing overlay does not also close.
   */
  cancelImport(event?: Event): void {
    if (!this.confirmingImport()) return;
    event?.stopPropagation();
    this.confirmingImport.set(false);
    afterNextRender(() => this.importButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /**
   * Import settings from a JSON file, after the inline confirm.
   * Uses platform-aware RPC: command:execute for VS Code, settings:import for
   * Electron. The outcome is the page toast, only from this write's own result (D15).
   */
  async importSettings(): Promise<void> {
    if (this.isImporting()) return;
    this.confirmingImport.set(false);
    this.isImporting.set(true);
    try {
      if (this.vscodeService.isElectron) {
        const result = await this.rpcService.call('settings:import', {});
        if (result.isSuccess()) {
          // A closed file dialog changed nothing; there is nothing to report.
          if (result.data.cancelled) return;
          const errors = result.data.result?.errors ?? [];
          const imported = result.data.result?.imported ?? [];
          if (
            errors.length > 0 &&
            imported.length === 0 &&
            !errors.some((entry) => KEYED_IMPORT_ERROR.test(entry))
          ) {
            // N4: only a file the host rejected as a whole (empty, malformed, not an export) blames the file.
            this.feedback.announce('The file is not a Ptah settings export.', 'alert');
          } else if (errors.length > 0) {
            this.feedback.announce('Some settings could not be imported.', 'alert');
          } else {
            this.feedback.announce('Settings imported.', 'status');
          }
        } else {
          this.feedback.announce('Could not import the settings.', 'alert');
        }
      } else {
        // The host command runs its own dialogs and result notifications; a
        // user cancel returns the same success as a completed import, so only
        // an execution failure is ours to report.
        const result = await this.rpcService.call('command:execute', {
          command: 'ptah.importSettings',
        });
        if (!result.isSuccess()) {
          this.feedback.announce('Could not import the settings.', 'alert');
        }
      }
    } catch {
      this.feedback.announce('Could not import the settings.', 'alert');
    } finally {
      this.isImporting.set(false);
      // The confirm that held focus is gone: focus returns to Import.
      afterNextRender(() => this.importButton()?.nativeElement.focus(), {
        injector: this.injector,
      });
    }
  }
}
