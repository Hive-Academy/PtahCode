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
  type CliMatrixCellField,
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
import { CliProviderGridComponent, type CliProviderOpenCell } from './cli-provider-grid.component';
import type { CliProviderOpenKind } from './cli-provider-card.component';
import { CliSharedDefaultsComponent } from './cli-shared-defaults.component';

/** Which popover of which row is open; one at a time. */
type OpenCell = {
  readonly rowId: string;
  readonly kind: CliMatrixCellField | CliProviderOpenKind | 'more';
};
const PROVIDER_OPEN_KINDS: ReadonlySet<OpenCell['kind']> = new Set<CliProviderOpenKind>([
  'info', 'capabilities', 'model', 'effort', 'permission', 'credentials', 'install',
]);
function isProviderOpenCell(cell: OpenCell): cell is CliProviderOpenCell {
  return PROVIDER_OPEN_KINDS.has(cell.kind);
}
interface MatrixGroup {
  readonly id: 'installed' | 'uninstalled';
  readonly rows: readonly SystemCliMatrixRow[];
}

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
    <section
      class="flex flex-col gap-4"
      aria-labelledby="cli-matrix-heading"
      data-testid="settings-cli-matrix"
      data-glass-surface="content"
    >
      <div section-header class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2
          id="cli-matrix-heading"
          class="flex items-center gap-1.5 text-sm font-semibold normal-case text-base-content"
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

      <div data-testid="cli-matrix" tabindex="-1" [attr.aria-busy]="loading()">
        <ptah-cli-provider-grid [rows]="groups()[0].rows"
          [sharedOpenCell]="providerOpenCell()"
          [defaults]="state.orchestration().data?.cliLaneDefaults"
          [busy]="busy()" [canWrite]="canWrite()" [testing]="testing()" [testingId]="testingId()"
          [testTexts]="systemTestTexts()" [guides]="CLI_INSTALL_GUIDES"
          (toggled)="toggle($event.row, $event.event)"
          (defaultSelected)="saveLaneDefault($event.row, $event.choice)"
          (defaultResetRequested)="resetLaneDefault($event)"
          (testRequested)="test($event)" (redetectRequested)="redetectFromGuide($event)"
          (popoverToggled)="toggleProviderPopover($event)" (popoverDismissed)="closeProviderPopover()"
          (codexSettingsRequested)="codexSettingsRequested.emit()" />
        @if (groups().length > 1) {
          <button type="button" class="btn btn-ghost btn-sm before:inline-block before:w-3 before:transition-transform before:content-['›'] aria-expanded:before:rotate-90"
            data-testid="cli-matrix-uninstalled-toggle" [attr.aria-expanded]="uninstalledShown()"
            (click)="toggleUninstalled()">Uninstalled CLI agents ({{ groups()[1].rows.length }})</button>
          @if (uninstalledShown()) {
            <div data-testid="cli-matrix-uninstalled">
              <ptah-cli-provider-grid [rows]="groups()[1].rows"
                [sharedOpenCell]="providerOpenCell()"
                [defaults]="state.orchestration().data?.cliLaneDefaults"
                [busy]="busy()" [canWrite]="canWrite()" [testing]="testing()" [testingId]="testingId()"
                [testTexts]="systemTestTexts()" [guides]="CLI_INSTALL_GUIDES"
                (toggled)="toggle($event.row, $event.event)"
                (defaultSelected)="saveLaneDefault($event.row, $event.choice)"
                (defaultResetRequested)="resetLaneDefault($event)"
                (testRequested)="test($event)" (redetectRequested)="redetectFromGuide($event)"
                (popoverToggled)="toggleProviderPopover($event)" (popoverDismissed)="closeProviderPopover()"
                (codexSettingsRequested)="codexSettingsRequested.emit()" />
            </div>
          }
        }
        @if (!loading() && groups()[0].rows.length === 0) {
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
        [rows]="instances()"
        [empty]="noInstances()"
        [busy]="busy()"
        [canWrite]="canWrite()"
        [testing]="testing()"
        [testingId]="testingId()"
        [confirmDeleteId]="confirmDelete()"
        [openCell]="openCell()"
        (addRequested)="openAdd($event)"
        (toggled)="toggle($event.row, $event.event)"
        (cellToggled)="toggleCell($event.rowId, $event.kind)"
        (cellOpened)="focusOpened()"
        (moreOpened)="focusFirstIn('cli-matrix-more-menu')"
        (closed)="close()"
        (tiersRequested)="openTiers($event)"
        (testRequested)="test($event)"
        (editRequested)="openEdit($event)"
        (deleteAsked)="askDelete($event)"
        (deleteCancelled)="cancelDelete($event)"
        (deleteConfirmed)="remove($event)"
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
  protected readonly ptahManifest = computed(() =>
    this.state.orchestration().data?.detectedClis.find(cli => cli.ptahCliId)?.manifest,
  );
  /** The installed system CLIs (always, for its empty state), then the Uninstalled group when it has rows (#71). */
  protected readonly groups = computed((): readonly MatrixGroup[] => {
    const { installed, uninstalled } = this.rows();
    const system = installed.filter(
      (row): row is SystemCliMatrixRow => row.kind === 'system',
    );
    const groups: MatrixGroup[] = [{ id: 'installed', rows: system }];
    if (uninstalled.length)
      groups.push({ id: 'uninstalled', rows: uninstalled });
    return groups;
  });
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

  private readonly openState = signal<OpenCell | null>(null);
  protected readonly providerOpenCell = computed((): CliProviderOpenCell | null => {
    const open = this.openState();
    return open && isProviderOpenCell(open) ? open : null;
  });
  /** The open popover, for the instance cards. */
  protected readonly openCell = this.openState.asReadonly();
  /** Decision 1: the Uninstalled group starts collapsed. */
  private readonly uninstalledOpen = signal(false);
  /** Expanded by the user, or holding the open popover (a Cursor key removal moves its row into this group). */
  protected readonly uninstalledShown = computed(() => {
    const open = this.openState();
    return (
      this.uninstalledOpen() ||
      (!!open && this.rows().uninstalled.some((row) => row.id === open.rowId))
    );
  });
  protected readonly confirmDelete = signal<string | null>(null);
  protected readonly testingId = signal<string | null>(null);
  /** Batch 32 modals: the add/edit form (with the instance it edits, or `null` to create) and the tier mapping. */
  protected readonly addOpen = signal(false);
  protected readonly editTarget = signal<CliInstanceEditTarget | null>(null);
  protected readonly tierTarget = signal<CliTierMappingTarget | null>(null);
  protected readonly noInstances = computed(
    () =>
      this.state.cliAgents().status === 'ready' &&
      !this.state.cliAgents().data?.length,
  );
  /** Which Add button opened the form: the empty-state one disappears once an instance exists (Minor 2). */
  private addOrigin: 'header' | 'empty' = 'header';

  protected toggleUninstalled(): void {
    this.uninstalledOpen.set(!this.uninstalledShown());
  }

  protected openAdd(origin: 'header' | 'empty'): void {
    this.close();
    this.addOrigin = origin;
    this.editTarget.set(null);
    this.addOpen.set(true);
  }

  protected openEdit(row: InstanceCliMatrixRow): void {
    this.close();
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
        `[data-testid="cli-matrix-tiers-${created.id}"]`,
        `[data-testid="cli-matrix-more-${created.id}"]`,
      );
    void this.test(created.id);
  }

  protected openTiers(row: InstanceCliMatrixRow): void {
    this.close();
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
    if (id)
      this.focusAfterRender(
        `[data-testid="cli-matrix-tiers-${id}"]`,
        `[data-testid="cli-matrix-more-${id}"]`,
      );
  }
  /** The instance whose Test ran last, for a test that failed before it produced a result. */
  private readonly lastTestedId = signal<string | null>(null);
  protected readonly testing = computed(
    () =>
      this.testingId() !== null || this.state.cliTest().status === 'loading',
  );

  protected isOpen(rowId: string, kind: OpenCell['kind']): boolean {
    const open = this.openState();
    return open?.rowId === rowId && open.kind === kind;
  }

  protected toggleCell(rowId: string, kind: OpenCell['kind']): void {
    this.openState.set(this.isOpen(rowId, kind) ? null : { rowId, kind });
  }

  protected close(): void {
    this.openState.set(null);
  }

  protected toggleProviderPopover(cell: CliProviderOpenCell): void {
    if (this.isOpen(cell.rowId, cell.kind)) this.closeProviderPopover();
    else this.openState.set(cell);
  }

  protected closeProviderPopover(): void {
    const open = this.providerOpenCell();
    if (!open) return;
    const movedIntoCollapsedGroup = !this.uninstalledOpen() && this.rows().uninstalled.some(row => row.id === open.rowId);
    this.close();
    this.focusAfterRender(movedIntoCollapsedGroup
      ? '[data-testid="cli-matrix-uninstalled-toggle"]'
      : `[data-testid="cli-provider-card-${open.rowId}"] [data-popover-kind="${open.kind}"]`);
  }

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
    this.close();
    this.focusAfterRender(`[data-testid="cli-provider-card-${rowId}"] input[type="checkbox"]`);
  }

  /**
   * M3: a saved or removed Cursor key moves its row between groups, which re-creates the popover with focus on `body`;
   * closing returns focus to the row's Credentials trigger wherever the row now is. A removed key moves the row into
   * the Uninstalled group, which collapses again on close unless the user expanded it: focus then goes to that group's
   * disclosure button, never `body` (re-check N-2).
   */
  /** The "More actions" Delete: the inline confirm replaces the actions, so focus moves to its Cancel. */
  protected askDelete(rowId: string): void {
    this.close();
    this.confirmDelete.set(rowId);
    this.focusAfterRender(
      `[data-testid="cli-matrix-delete-confirm-${rowId}"] [data-cancel-delete]`,
    );
  }

  protected cancelDelete(rowId: string): void {
    this.confirmDelete.set(null);
    this.focusAfterRender(`[data-testid="cli-matrix-more-${rowId}"]`);
  }

  /** The panel takes focus when positioned; then its first control does (the model search opens its list). */
  protected focusOpened(): void {
    this.element.nativeElement
      .querySelector<HTMLElement>(
        '[data-testid="cli-matrix-popover"] input:not([disabled]), [data-testid="cli-matrix-popover"] button[aria-pressed="true"]',
      )
      ?.focus();
  }

  protected focusFirstIn(testid: string): void {
    const buttons = this.element.nativeElement.querySelectorAll<HTMLElement>(
      `[data-testid="${testid}"] button:not([disabled])`,
    );
    for (const button of buttons) {
      if (getComputedStyle(button).display !== 'none') {
        button.focus();
        return;
      }
    }
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
    const result = await this.feedback.save({
      label: `removal of ${row.name}`,
      scope: SAVE_SCOPE,
      write: () =>
        this.state.saveSettings(
          { cli: [{ action: 'delete', params: { id: row.id } }] },
          context,
        ),
      undo: null,
    });
    // M2: this save's own result, never an earlier commit.
    if (result === 'saved') this.confirmDelete.set(null);
  }

  /** Focuses the first selector present and shown after the next render; later ones are fallbacks. */
  private focusAfterRender(...selectors: readonly string[]): void {
    afterNextRender(
      () => {
        const root = this.element.nativeElement;
        for (const selector of selectors) {
          const target = root.querySelector<HTMLElement>(selector);
          // The narrow layout hides inline Tiers and Test (they move into More).
          if (target && getComputedStyle(target).display !== 'none') {
            target.focus();
            return;
          }
        }
      },
      { injector: this.injector },
    );
  }
}
