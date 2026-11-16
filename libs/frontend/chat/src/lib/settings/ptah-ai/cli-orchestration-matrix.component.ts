import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideAngularModule, Terminal } from 'lucide-angular';
import { ProvidersSettingsStateService } from '@ptah-extension/core';
import type { CliLaneDefaults, SystemCliType } from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import {
  CLI_TEST_NOT_RUN,
  CLI_TEST_NOT_STARTED,
  cliMatrixRows,
  cliTestFailedText,
  type CliMatrixRow,
  type InstanceCliMatrixRow,
  type SystemCliMatrixRow,
} from './cli-matrix-rows';
import {
  AddCliInstanceModalComponent,
  type CliInstanceEditTarget,
} from '../providers/add-cli-instance-modal.component';
import {
  CliTierMappingModalComponent,
  type CliTierMappingTarget,
} from '../providers/cli-tier-mapping-modal.component';
import { AgentOrchestrationConfigComponent } from './agent-orchestration-config.component';
import { PtahCliInstancesComponent } from './ptah-cli-instances.component';
import { CliLaneDefaultsStore } from './cli-lane-defaults.store';
import { CliProviderGridComponent } from './cli-provider-grid.component';
import type { LaneTableRow } from './lanes-table.component';
import { CliSharedDefaultsComponent } from './cli-shared-defaults.component';
import { savePreferredAgentOrder } from './preferred-agent-order-save';
import {
  PtahButtonDirective,
} from '@ptah-extension/ui';


/**
 * #77: install copy per system CLI. Codex and Copilot keep the old "No CLI agents found" commands; the other four are
 * NEW copy (Batch 30, for user review at Gate V 36), from each adapter's own package or binary name. Grok's is NEW copy
 * (TASK_2026_617) with no install command: the binary name and `grok login` are the only facts Ptah relies on.
 */
export const CLI_INSTALL_GUIDES: Readonly<
  Record<
    SystemCliType,
    { readonly command: string | null; readonly note: string }
  >
> = {
  codex: {
    command: 'npm install -g @openai/codex',
    note: 'Install the Codex CLI, sign in with codex login, then Re-detect.',
  },
  copilot: {
    command: 'npm install -g @github/copilot',
    note: 'Install the Copilot CLI, sign in to GitHub Copilot, then Re-detect.',
  },
  cursor: {
    command: null,
    note:
      'Cursor needs no install: Ptah runs it through the bundled Cursor SDK. It is detected once a Cursor API key is set ' +
      '(the CURSOR_API_KEY environment variable, or the stored Cursor key), then Re-detect.',
  },
  antigravity: {
    command: null,
    note: "Install Google's Antigravity CLI so the agy command is on your PATH, then Re-detect.",
  },
  opencode: {
    command: 'npm install -g opencode-ai',
    note: 'Install opencode so the opencode command is on your PATH, then Re-detect.',
  },
  pi: {
    command: 'npm install -g @earendil-works/pi-coding-agent',
    note: 'Install the Pi Coding Agent so the pi command is on your PATH, then Re-detect.',
  },
  grok: {
    command: null,
    note: 'Put the Grok CLI on your PATH as grok, sign in with grok login, then Re-detect.',
  },
  // NEW copy (TASK_2026_712 Batch 26d): `ClaudeCliAdapter.detect()` installs nothing of its own; it reports the
  // lane once the Claude Agent SDK that Ptah chat uses can be loaded, so there is no install command.
  claude: {
    command: null,
    note:
      'Claude needs no separate install: Ptah runs it through the Claude Agent SDK that Ptah chat uses, ' +
      'with your existing Claude sign-in. Once that SDK is available, Re-detect.',
  },
};

const SAVE_SCOPE = 'global';

/**
 * CLI Agents & Custom Instances matrix (plan :710-742, design-spec §3.5).
 * System CLI cards follow the preferred order, then an "Uninstalled" group with
 * install guides (#71, #77), collapsed by default behind a disclosure row (Gate V 36 decision 1, the Electron fold).
 * Under a hairline, the Ptah CLI instances in their own sub-section (`PtahCliInstancesComponent`: one card each, with
 * the Add). Rows come from `cliMatrixRows` (Batch 29); this component owns every write, modal and focus return.
 * - On/off: system → `disabledClis`; instance → `ptahCli:update.enabled`. Model and Effort cells open
 *   `CliModelEffortPopoverComponent`. Every write is `state.saveSettings` through `SettingsSaveFeedbackService`
 *   (Undo except Delete; Batch 17 constraint), and each caller acts on that save's own result (M2).
 * - Status shows only what detection reports for system CLIs (D11); instance cards show their status, key status,
 *   tier models and their last Test: latency, or a fixed failure sentence (#43, #44, #54, #52, RUX-11; S1, M1).
 * - Permissions & Safety: badge + ℹ popover (#70). A disabled or not-installed row renders its cells as plain text.
 * - Instance actions (V36-7): Tiers and Test inline, Edit and Delete in a "More actions" popover.
 * Since Batch 31: Cursor's Credentials popover (#64, 551) on both its rows, and Copilot's auto-approve toggle inside its
 * permission popover. Since Batch 32: "Add Ptah CLI Instance" (instances sub-section, or its empty state) and each instance's
 * Tiers and Edit open their centered modals; a create runs the new instance's Test (M4).
 */
@Component({
  selector: 'ptah-cli-orchestration-matrix',
  standalone: true,
  providers: [CliLaneDefaultsStore],
  imports: [
    AgentOrchestrationConfigComponent,
    LucideAngularModule,
    AddCliInstanceModalComponent,
    CliTierMappingModalComponent,
    PtahCliInstancesComponent,
    CliProviderGridComponent,
    CliSharedDefaultsComponent,
    PtahButtonDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[var(--ptah-gap-field)]">
    <section
      class="flex flex-col gap-[var(--ptah-gap-field)]"
      aria-labelledby="cli-matrix-heading"
      data-testid="settings-cli-matrix"
      data-glass-surface="content"
    >
      <div section-header class="flex flex-wrap items-center gap-x-[var(--ptah-gap-inline)] gap-y-[var(--ptah-gap-label)]">
        <h2
          id="cli-matrix-heading"
          class="flex items-center gap-[var(--ptah-gap-inline)] text-sm font-semibold normal-case text-base-content"
        >
          <lucide-angular
            [img]="TerminalIcon"
            class="h-4 w-4 text-primary"
            aria-hidden="true"
          />
          CLI Agents &amp; Custom Instances Matrix
        </h2>
        <!-- Wide only: the narrow (Electron) box keeps the header to one line. -->
        <span class="cli-wide-only text-xs text-base-content-muted"
          >Click model or effort cells to reassign in place</span
        >
      </div>

      <p class="text-xs text-base-content-muted">These are CLI capabilities. Permission and network defaults are editable. A running lane may offer fewer actions.</p>

      <ptah-agent-orchestration-config />
      <button type="button" ptahButton variant="ghost" data-testid="lanes-order-edit"
        [attr.aria-pressed]="orderMode()" (click)="orderMode.set(!orderMode())">
        {{ orderMode() ? 'Done editing order' : 'Edit lane order' }}
      </button>

      <div class="flex min-w-0 flex-col gap-[var(--ptah-gap-field)]" data-testid="cli-matrix" tabindex="-1" [attr.aria-busy]="loading()">
        <ptah-cli-provider-grid
          [rows]="tableRows()" [defaults]="state.orchestration().data?.cliLaneDefaults"
          [busy]="busy()" [canWrite]="canWrite()" [loading]="loading()"
          [testingRows]="testingRows()" [testResults]="tableTestResults()"
          [orderMode]="orderMode()" [guides]="CLI_INSTALL_GUIDES"
          [error]="laneReadError()"
          (toggled)="toggle($event.row, $event.event)"
          (moved)="moveLane($event.row, $event.direction)"
          (test)="test($event.id)"
          (edit)="editLane($event)"
          (delete)="deleteLane($event)"
          (capabilities)="showCapabilities($event)"
          (installGuide)="showInstallGuide($event)"
          (signIn)="signInLane($event)"
          (retry)="retryLanes()" (redetect)="redetectFromGuide($event)"
          (codexSettings)="codexSettingsRequested.emit()"
          (tiers)="editTiers($event)"
          (defaultSelected)="selectTableDefault($event.row, $event.choice)"
          (defaultResetRequested)="resetTableDefault($event)" />
        @if (!loading() && tableRows().length === 0) {
          <p data-testid="cli-matrix-empty">No CLI agent is installed. Install one from the list below, then Re-detect.</p>
        }
        @if (loading()) {
          <p data-testid="cli-matrix-empty">Loading CLI agents…</p>
        }
      </div>

    </section>

      @if (ptahManifest(); as manifest) {
        <ptah-cli-shared-defaults [manifest]="manifest"
          [saved]="state.orchestration().data?.cliLaneDefaults?.['ptah-cli']"
          [disabled]="busy() || !canWrite()"
          (selected)="savePtahDefault($event)" (resetRequested)="resetPtahDefault()" />
      }

      <!-- The Ptah CLI instances: their own sub-section under a hairline, with Add and one card per instance. -->
      <ptah-cli-instances
        [rows]="[]"
        [empty]="!loading() && instances().length === 0"
        [busy]="busy()"
        [canWrite]="canWrite()"
        [testing]="testing()"
        [testingId]="testingId()"
        (addRequested)="openAdd($event)"
      />
    </div>

    <!-- Batch 32: centered modals on the shared native <dialog> (design-spec §6), in this lazy chunk. -->
    <ptah-add-cli-instance-modal
      [open]="addOpen()"
      [editing]="editTarget()"
      (created)="onCreated($event)"
      (closed)="closeAdd()"
    />
    <ptah-cli-tier-mapping-modal
      [open]="tierTarget() !== null"
      [target]="tierTarget()"
      (closed)="closeTiers()"
    />
  `,
  styles: `:host { display: block; min-width: 0; max-width: 100%; }
    :host-context([data-glass='on']) [data-testid='settings-cli-matrix'] { padding: 1.25rem; }`,
})
export class CliOrchestrationMatrixComponent {
  private readonly providerGrid = viewChild(CliProviderGridComponent);
  readonly codexSettingsRequested = output<void>();
  protected readonly TerminalIcon = Terminal;
  protected readonly CLI_INSTALL_GUIDES = CLI_INSTALL_GUIDES;
  protected readonly guideDetecting = computed(() => this.state.cliDetection().status === 'loading');

  protected readonly state = inject(ProvidersSettingsStateService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly laneDefaults = inject(CliLaneDefaultsStore);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly rows = computed(() =>
    cliMatrixRows({
      orchestration: this.state.orchestration().data,
      cliAgents: this.state.cliAgents().data,
      cliModels: this.state.cliModels().data,
      cliTest: this.state.cliTest().data,
    }),
  );
  protected readonly systemTestTexts = computed((): Readonly<Record<string, string>> => {
    const test = this.state.cliTest().data;
    if (!test || !test.id) return {};
    return { [test.id]: test.success
      ? (test.latencyMs === null ? 'Test passed.' : `Test passed in ${test.latencyMs}ms.`)
      : cliTestFailedText(test.reason) };
  });
  /** The Ptah CLI instances, in the preferred order, for their own sub-section. */
  protected readonly instances = computed(() =>
    this.rows().installed.filter(
      (row): row is InstanceCliMatrixRow => row.kind === 'instance',
    ),
  );
  protected readonly tableRows = computed((): readonly LaneTableRow[] =>
    [...this.rows().installed, ...this.rows().uninstalled].map((row, index) => ({
      ...row,
      order: row.kind === 'system' && !row.installed ? undefined : index + 1,
    })),
  );
  protected readonly laneReadError = computed(() =>
    this.state.orchestration().status === 'error' ||
    this.state.cliAgents().status === 'error'
      ? 'Could not load lanes.'
      : null,
  );
  protected async retryLanes(): Promise<void> {
    await Promise.all([this.state.refreshOrchestration(), this.state.refreshCliAgents()]);
  }
  protected readonly orderMode = signal(false);
  protected readonly testingRows = computed((): Readonly<Record<string, boolean>> => {
    const id = this.testingId();
    return id ? { [id]: true } : {};
  });
  protected readonly tableTestResults = computed((): Readonly<Record<string, string>> => {
    const result: Record<string, string> = { ...this.systemTestTexts() };
    for (const row of this.instances()) {
      if (row.lastTest) result[row.id] = row.lastTest.success
        ? (row.lastTest.latencyMs === null ? 'Test passed.' : `Test passed in ${row.lastTest.latencyMs}ms.`)
        : cliTestFailedText(row.lastTest.reason);
    }
    return result;
  });
  protected async moveLane(row: LaneTableRow, direction: -1 | 1): Promise<void> {
    if (!this.state.reviewContext() || this.busy()) return;
    const installed = this.rows().installed.map(item => item.id);
    const index = installed.indexOf(row.id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= installed.length) return;
    [installed[index], installed[next]] = [installed[next], installed[index]];
    await savePreferredAgentOrder(this.state, this.feedback, installed);
  }
  protected editLane(row: LaneTableRow): void {
    if (row.kind === 'instance') this.openEdit(row);
    else if (row.cli === 'codex') this.codexSettingsRequested.emit();
  }
  protected async deleteLane(row: LaneTableRow): Promise<void> {
    if (row.kind === 'instance') await this.remove(row);
  }
  protected showCapabilities(row: LaneTableRow): void {
    this.focusAfterRender(`#lane-detail-${row.id} [data-popover-kind="capabilities"]`);
  }
  protected showInstallGuide(row: LaneTableRow): void {
    this.focusAfterRender(`#lane-detail-${row.id} [data-popover-kind="install"]`);
  }
  protected signInLane(row: LaneTableRow): void {
    this.focusAfterRender(`#lane-detail-${row.id} [data-popover-kind="credentials"]`);
  }
  protected editTiers(row: LaneTableRow): void {
    if (row.kind === 'instance') this.openTiers(row);
  }
  protected async selectTableDefault(
    row: LaneTableRow, choice: NonNullable<CliLaneDefaults[SystemCliType]>,
  ): Promise<void> {
    if (row.kind === 'system') await this.saveLaneDefault(row, choice);
  }
  protected async resetTableDefault(row: LaneTableRow): Promise<void> {
    if (row.kind === 'system') await this.resetLaneDefault(row);
  }
  protected readonly ptahManifest = computed(() =>
    this.state.orchestration().data?.detectedClis.find(cli => cli.ptahCliId)?.manifest,
  );
  /** Neither source has data yet (the container shows each section's own loading or error line). */
  protected readonly loading = computed(
    () => !this.state.orchestration().data && !this.state.cliAgents().data,
  );
  /** Save triggers wait while any save runs (D3). */
  protected readonly busy = this.feedback.saving;
  protected readonly canWrite = computed(
    () =>
      this.state.scopes().status === 'ready' &&
      this.state.reviewContext() !== null,
  );

  protected readonly testingId = signal<string | null>(null);
  /** Batch 32 modals: the add/edit form (with the instance it edits, or `null` to create) and the tier mapping. */
  protected readonly addOpen = signal(false);
  protected readonly editTarget = signal<CliInstanceEditTarget | null>(null);
  protected readonly tierTarget = signal<CliTierMappingTarget | null>(null);
  private tiersOpener: HTMLElement | null = null;
  /** Which Add button opened the form: the empty-state one disappears once an instance exists (Minor 2). */
  private addOrigin: 'header' | 'empty' = 'header';

  protected openAdd(origin: 'header' | 'empty'): void {
    this.addOrigin = origin;
    this.editTarget.set(null);
    this.addOpen.set(true);
  }

  protected openEdit(row: InstanceCliMatrixRow): void {
    this.editTarget.set({
      id: row.id,
      name: row.name,
      providerId: row.providerId,
      providerName: row.provider,
    });
    this.addOpen.set(true);
  }

  protected closeAdd(): void {
    this.addOpen.set(false);
    this.editTarget.set(null);
  }

  /**
   * M4: a created instance's key is stored, not verified, so its Test runs at once and its result is announced. Minor 2: from the
   * empty-state button, focus moves to the new row's first action (that button is gone). When the refreshed list does
   * not hold the new instance yet, no Test runs and a fixed toast says so (re-check N-1).
   */
  protected onCreated(name: string): void {
    const created = this.state
      .cliAgents()
      .data?.find(
        (agent) => agent.name.trim().toLowerCase() === name.toLowerCase(),
      );
    if (!created) {
      this.feedback.announce(
        `Created ${name}. ${CLI_TEST_NOT_STARTED}`,
        'alert',
      );
      return;
    }
    if (this.addOrigin === 'empty')
      this.focusAfterRender(
        `[data-testid="cli-matrix-row-${created.id}"] ptah-table-row-expander button`,
        `[data-testid="cli-matrix-tiers-${created.id}"]`,
      );
    void this.test(created.id);
  }

  protected openTiers(row: InstanceCliMatrixRow): void {
    this.tiersOpener = this.element.nativeElement.ownerDocument.activeElement as HTMLElement | null;
    this.tierTarget.set({
      id: row.id,
      name: row.name,
      providerId: row.providerId,
      providerName: row.provider,
    });
  }

  /** Focus returns to the row's Tiers button, or to More when the narrow layout moved Tiers into it. */
  protected closeTiers(): void {
    const id = this.tierTarget()?.id;
    this.tierTarget.set(null);
    const opener = this.tiersOpener;
    this.tiersOpener = null;
    if (opener?.isConnected) {
      afterNextRender(() => opener.focus(), { injector: this.injector });
    } else if (id) {
      this.focusAfterRender(
        `[data-testid="cli-matrix-tiers-${id}"]`,
        `[data-testid="cli-matrix-row-${id}"] ptah-table-row-expander button`,
      );
    }
  }
  /** The instance whose Test ran last, for a test that failed before it produced a result. */
  private readonly lastTestedId = signal<string | null>(null);
  protected readonly testing = computed(
    () =>
      this.testingId() !== null || this.state.cliTest().status === 'loading',
  );

  /**
   * The install guide's Re-detect: the same re-read as the policy bar's Re-detect CLIs. A CLI that is found
   * leaves the Uninstalled group, so the guide closes and focus follows the row; otherwise the page toast says why.
   */
  protected async redetectFromGuide(rowId: string): Promise<void> {
    if (this.guideDetecting()) return;
    if (!(await this.state.redetectClis())) {
      this.feedback.announce('Detection failed. Try again.', 'alert');
      return;
    }
    if (this.rows().uninstalled.some((row) => row.id === rowId)) {
      this.feedback.announce(
        'Still not found. Check the step above, then try again.',
        'status',
      );
      return;
    }
    this.providerGrid()?.closeGuide(rowId);
    this.focusAfterRender(`[data-testid="cli-provider-card-${rowId}"] input[type="checkbox"]`);
  }

  /**
   * RUX-11: this instance's last Test, announced through the page toast with the instance name when the run ends (the
   * row's status badge keeps the latency of a passed test). Only this run's result counts (S1: the state drops the
   * previous one when a run starts and on any failure), and a failure is a fixed sentence (M1) followed by the state's
   * own fixed reason when it has one.
   */
  private testResult(
    row: InstanceCliMatrixRow,
  ): { readonly ok: boolean; readonly text: string } | null {
    if (row.lastTest) {
      if (row.lastTest.success) {
        return {
          ok: true,
          text:
            row.lastTest.latencyMs === null
              ? 'Test passed.'
              : `Test passed in ${row.lastTest.latencyMs}ms.`,
        };
      }
      return {
        ok: false,
        text: cliTestFailedText(row.lastTest.reason),
      };
    }
    if (
      this.lastTestedId() === row.id &&
      this.state.cliTest().status === 'error'
    )
      return { ok: false, text: CLI_TEST_NOT_RUN };
    return null;
  }

  protected async test(id: string): Promise<void> {
    if (this.testing()) return;
    this.testingId.set(id);
    this.lastTestedId.set(id);
    try {
      await this.state.testCliConnection(id);
    } finally {
      this.testingId.set(null);
    }
    const { installed, uninstalled } = this.rows();
    const row = [...installed, ...uninstalled].find(
      (candidate): candidate is InstanceCliMatrixRow =>
        candidate.kind === 'instance' && candidate.id === id,
    );
    const result = row ? this.testResult(row) : null;
    // Named: a later Test of another instance replaces this toast, so each one says whose result it is.
    if (row && result) this.feedback.announce(`${row.name}: ${result.text}`, result.ok ? 'status' : 'alert');
  }

  /**
   * On/off. The checkbox keeps showing the saved value; the read-back after the write moves it. System rows write
   * `disabledClis`, instances `ptahCli:update.enabled`. Undo restores only this CLI's entry, against the list as it is
   * when Undo runs (Minor 4), so it never overwrites another CLI's change made in between.
   */
  protected async toggle(row: CliMatrixRow, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const enabled = input.checked;
    input.checked = row.enabled;
    const context = this.state.reviewContext();
    if (!context || this.busy()) return;
    const label = `${row.name} ${enabled ? 'on' : 'off'}`;
    if (row.kind === 'system') {
      const set = (on: boolean) => () => {
        const others = (
          this.state.orchestration().data?.disabledClis ?? []
        ).filter((cli) => cli !== row.cli);
        return this.state.saveSettings(
          {
            orchestration: { disabledClis: on ? others : [...others, row.cli] },
          },
          context,
        );
      };
      await this.feedback.save({
        label,
        scope: SAVE_SCOPE,
        write: set(enabled),
        undo: set(row.enabled),
      });
      return;
    }
    const write = (value: boolean) => () =>
      this.state.saveSettings(
        { cli: [{ action: 'update', params: { id: row.id, enabled: value } }] },
        context,
      );
    await this.feedback.save({
      label,
      scope: SAVE_SCOPE,
      write: write(enabled),
      undo: write(row.enabled),
    });
  }

  protected async saveLaneDefault(row: SystemCliMatrixRow, choice: NonNullable<CliLaneDefaults[SystemCliType]>): Promise<void> {
    await this.laneDefaults.save(row.cli, row.name, choice);
  }
  protected async savePtahDefault(choice: NonNullable<CliLaneDefaults['ptah-cli']>): Promise<void> {
    await this.laneDefaults.save('ptah-cli', 'Ptah CLI', choice);
  }

  protected async resetLaneDefault(row: SystemCliMatrixRow): Promise<void> {
    await this.laneDefaults.reset(row.cli, row.name);
  }
  protected async resetPtahDefault(): Promise<void> {
    await this.laneDefaults.reset('ptah-cli', 'Ptah CLI');
  }

  /** Delete after the inline confirm (#55). No Undo: a deleted instance's stored key cannot be written back. */
  protected async remove(row: InstanceCliMatrixRow): Promise<void> {
    const context = this.state.reviewContext();
    if (!context || this.busy()) return;
    await this.feedback.save({
      label: `removal of ${row.name}`,
      scope: SAVE_SCOPE,
      write: () =>
        this.state.saveSettings(
          { cli: [{ action: 'delete', params: { id: row.id } }] },
          context,
        ),
      undo: null,
    });
  }

  /** Focuses the first selector present and shown after the next render; later ones are fallbacks. */
  private focusAfterRender(...selectors: readonly string[]): void {
    afterNextRender(
      () => {
        const root = this.element.nativeElement;
        for (const selector of selectors) {
          const target = root.querySelector<HTMLElement>(selector);
          // The narrow layout hides inline Tiers and Test (they move into More).
          if (target && !target.closest('[hidden], [aria-hidden="true"]') &&
              getComputedStyle(target).display !== 'none' &&
              getComputedStyle(target).visibility !== 'hidden') {
            target.focus();
            return;
          }
        }
      },
      { injector: this.injector },
    );
  }
}
