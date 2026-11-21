import type { LaneOrderMove } from './lane-order-drag';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  booleanAttribute,
  computed,
  inject,
  input,
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
import { CliLaneDefaultsStore } from './cli-lane-defaults.store';
import { CliProviderGridComponent } from './cli-provider-grid.component';
import type { LaneTableRow } from './lanes-table.component';
import { LanesAddMoreStripComponent } from './lanes-add-more-strip.component';
import {
  savePreferredAgentOrder,
  verifiedPreferredAgentOrder,
} from './preferred-agent-order-save';
import { LanesSectionHeaderComponent } from './lanes-section-header.component';
import { LanesMaxConcurrentComponent } from './lanes-max-concurrent.component';

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
 * One Lanes table with two groups: CLI agents (installed system CLIs in the preferred order, then recovery rows such
 * as a keyless Cursor) and Ptah CLI instances (with the group defaults and the one Add). System CLIs that are not
 * installed are cards in the "Add more CLI agents" strip, with install guides (#71, #77; decision 8).
 * Rows come from `cliMatrixRows` (Batch 29); this component owns every write, modal and focus return.
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
    CliProviderGridComponent,
    LanesAddMoreStripComponent,
    LanesSectionHeaderComponent,
    LanesMaxConcurrentComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col gap-[var(--ptah-gap-field)] [&>*:focus-within]:z-[var(--ptah-z-raised)]"
    >
      <section
        class="flex flex-col gap-[var(--ptah-gap-field)]"
        aria-labelledby="cli-matrix-heading"
        data-testid="settings-cli-matrix"
        data-glass-surface="content"
      >
        <ptah-lanes-section-header
          [total]="laneCounts().total"
          [enabled]="laneCounts().enabled"
          [editing]="orderMode()"
          [disabled]="busy() || !canReorder()"
          (editRequested)="orderMode.set(!orderMode())"
        >
          <ptah-lanes-max-concurrent controls />
        </ptah-lanes-section-header>
        @if (!orderMode()) {
          <ptah-agent-orchestration-config />
        }

        <div
          class="flex min-w-0 flex-col gap-[var(--ptah-gap-field)]"
          data-testid="cli-matrix"
          tabindex="-1"
          [attr.aria-busy]="loading()"
        >
          <ptah-cli-provider-grid
            [rows]="tableRows()"
            [defaults]="state.orchestration().data?.cliLaneDefaults"
            [ptahDefaults]="ptahDefaults()"
            [busy]="busy()"
            [canWrite]="canWrite()"
            [canReorder]="canReorder()"
            [loading]="loading()"
            [testingRows]="testingRows()"
            [testResults]="tableTestResults()"
            [orderMode]="orderMode()"
            [detecting]="guideDetecting()"
            [guides]="CLI_INSTALL_GUIDES"
            [error]="laneReadError()"
            (toggled)="toggle($event.row, $event.event)"
            (reordered)="reorderLanes($event)"
            (test)="test($event.id)"
            (edit)="editLane($event)"
            (delete)="deleteLane($event)"
            (signIn)="signInLane($event)"
            (retry)="retryLanes()"
            (redetect)="redetectFromGuide($event)"
            (codexSettings)="codexSettingsRequested.emit()"
            (tiers)="editTiers($event)"
            (defaultSelected)="selectTableDefault($event.row, $event.choice)"
            (defaultResetRequested)="resetTableDefault($event)"
            (addRequested)="openAdd($event)"
            (ptahDefaultSelected)="savePtahDefault($event)"
            (ptahDefaultResetRequested)="resetPtahDefault()"
          />
          @if (confirmedEmpty()) {
            <p data-testid="cli-matrix-empty">
              No CLI agent installed yet. Use Add more below.
            </p>
          }
          @if (!orderMode()) {
            <ptah-lanes-add-more-strip
              [rows]="stripRows()"
              [guides]="CLI_INSTALL_GUIDES"
              [busy]="guideDetecting()"
              (redetect)="redetectFromGuide($event)"
            />
          }
          @if (loading() && !hostReadStates()) {
            <p data-testid="cli-matrix-empty">Loading CLI agents…</p>
          }
        </div>
        <!-- The host's read states (loading and retry per source) show inside this card, outside the
           aria-busy region, so a failed read is announced (TASK_2026_2256). -->
        <ng-content select="[read-states]" />
      </section>
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
  styles: `
    :host {
      display: block;
      min-width: 0;
      max-width: 100%;
      container-type: inline-size;
    }
    /* Card inset: 0.75rem on a narrow card (design-spec "Card", 800px with nav). */
    @container (max-width: 639px) {
      [data-testid='settings-cli-matrix'] {
        padding: 0.75rem;
      }
    }
  `,
})
export class CliOrchestrationMatrixComponent {
  private readonly providerGrid = viewChild(CliProviderGridComponent);
  private readonly addMoreStrip = viewChild(LanesAddMoreStripComponent);
  readonly codexSettingsRequested = output<void>();
  /** The host projects its own read states into `[read-states]`, so the matrix's loading line would repeat them. */
  readonly hostReadStates = input(false, { transform: booleanAttribute });
  protected readonly TerminalIcon = Terminal;
  protected readonly CLI_INSTALL_GUIDES = CLI_INSTALL_GUIDES;
  /** An install-guide Re-detect stays pending through its read-backs, not only its detection call. */
  private readonly guidePending = signal(false);
  protected readonly guideDetecting = computed(
    () =>
      this.guidePending() ||
      this.state.cliRedetecting() ||
      this.state.cliDetection().status === 'loading',
  );

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
  protected readonly systemTestTexts = computed(
    (): Readonly<Record<string, string>> => {
      const test = this.state.cliTest().data;
      if (!test || !test.id) return {};
      return {
        [test.id]: test.success
          ? test.latencyMs === null
            ? 'Passed.'
            : `Passed in ${test.latencyMs}ms.`
          : (test.reason ?? 'Failed.'),
      };
    },
  );
  /** The Ptah CLI instances, in the preferred order, for their own sub-section. */
  protected readonly instances = computed(() =>
    this.rows().installed.filter(
      (row): row is InstanceCliMatrixRow => row.kind === 'instance',
    ),
  );
  /** Not installed, but a key makes them work (keyless Cursor): they stay in the CLI agents group, unnumbered. */
  protected readonly recoveryRows = computed(() =>
    this.rows().uninstalled.filter((row) => row.status.kind === 'needs-key'),
  );
  /** Not installed: the Add more strip lists them (decision 8). */
  protected readonly stripRows = computed(() =>
    this.rows().uninstalled.filter(
      (row) => row.status.kind === 'not-installed',
    ),
  );
  protected readonly tableRows = computed((): readonly LaneTableRow[] => [
    ...this.rows().installed.map((row, index) => ({
      ...row,
      order: index + 1,
    })),
    ...this.recoveryRows().map((row) => ({ ...row, order: undefined })),
  ]);
  protected readonly laneCounts = computed(() => ({
    enabled: this.rows().installed.filter((row) => row.enabled).length,
    total: this.tableRows().length,
  }));
  protected readonly laneReadError = computed(() =>
    this.state.orchestration().status === 'error' ||
    this.state.cliAgents().status === 'error'
      ? 'Could not load lanes.'
      : this.rows().missing.length
        ? 'Some lane data could not be loaded. Showing the lanes that could be read.'
        : null,
  );
  protected async retryLanes(): Promise<void> {
    await Promise.all([
      this.state.refreshOrchestration(),
      this.state.refreshCliAgents(),
    ]);
  }
  protected readonly orderMode = signal(false);
  protected readonly testingRows = computed(
    (): Readonly<Record<string, boolean>> => {
      const id = this.testingId();
      return id ? { [id]: true } : {};
    },
  );
  protected readonly tableTestResults = computed(
    (): Readonly<Record<string, string>> => {
      const result: Record<string, string> = { ...this.systemTestTexts() };
      for (const row of this.instances()) {
        if (row.lastTest)
          result[row.id] = row.lastTest.success
            ? row.lastTest.latencyMs === null
              ? 'Passed.'
              : `Passed in ${row.lastTest.latencyMs}ms.`
            : 'Failed.';
      }
      return result;
    },
  );
  /** The saved order from a ready, complete read; `null` blocks Reorder (a move would drop saved ids). */
  private readonly verifiedOrder = computed(() =>
    verifiedPreferredAgentOrder(this.state),
  );
  /**
   * Reorder starts, and moves are requested, only with a verified saved order and at least two numbered lanes.
   * Done stays operable: the header disables only the Reorder entry, never Done.
   */
  protected readonly canReorder = computed(
    () =>
      this.canWrite() &&
      this.verifiedOrder() !== null &&
      this.rows().installed.length >= 2,
  );
  /**
   * One Reorder move (drag or up / down) = one write of the whole saved order, with Undo. `move.order` holds only
   * the displayed numbered ids; `savePreferredAgentOrder` keeps every other saved id in its slot and refuses an
   * unverified base. The grid settles with the outcome and the confirmed numbered order from the read-back.
   */
  protected async reorderLanes(move: LaneOrderMove): Promise<void> {
    if (this.busy() || !this.canReorder()) {
      this.settleOrder(move, false);
      return;
    }
    const result = await savePreferredAgentOrder(
      this.state,
      this.feedback,
      move.order,
    );
    this.settleOrder(move, result === 'saved');
  }
  /**
   * The announced position comes only from a verified refresh: the rows rank by the refreshed saved order. When the
   * refresh after the write is incomplete (it dropped `preferredAgentOrder`, so the rows fall back to discovery
   * order), no position is announced. When no move control of the row is usable then, focus goes to Done.
   */
  private settleOrder(move: LaneOrderMove, saved: boolean): void {
    const verified = this.verifiedOrder() !== null;
    this.providerGrid()?.orderSettled({
      id: move.movedId,
      direction: move.direction,
      saved: saved && verified,
      order: verified ? this.rows().installed.map((row) => row.id) : [],
    });
    // Runs after the table's own focus return (registered first), so it only fills the gap it leaves.
    afterNextRender(
      () => {
        if (this.canReorder()) return;
        this.element.nativeElement
          .querySelector<HTMLElement>('[data-testid="lanes-order-edit"]')
          ?.focus();
      },
      { injector: this.injector },
    );
  }
  protected editLane(row: LaneTableRow): void {
    if (row.kind === 'instance') this.openEdit(row);
    else if (row.cli === 'codex') this.codexSettingsRequested.emit();
  }
  protected async deleteLane(row: LaneTableRow): Promise<void> {
    if (row.kind === 'instance') await this.remove(row);
  }
  protected signInLane(row: LaneTableRow): void {
    this.focusAfterRender(
      `#lane-detail-${row.id} [data-popover-kind="credentials"]`,
    );
  }
  protected editTiers(row: LaneTableRow): void {
    if (row.kind === 'instance') this.openTiers(row);
  }
  protected async selectTableDefault(
    row: LaneTableRow,
    choice: NonNullable<CliLaneDefaults[SystemCliType]>,
  ): Promise<void> {
    if (row.kind === 'system') await this.saveLaneDefault(row, choice);
  }
  protected async resetTableDefault(row: LaneTableRow): Promise<void> {
    if (row.kind === 'system') await this.resetLaneDefault(row);
  }
  protected readonly ptahManifest = computed(() => {
    const detected = this.state.orchestration().data?.detectedClis;
    return Array.isArray(detected)
      ? detected.find((cli) => cli.ptahCliId)?.manifest
      : undefined;
  });
  /** The Ptah CLI group defaults in the table's group header (merged control 9, P-58, P-59). */
  protected readonly ptahDefaults = computed(() => {
    const manifest = this.ptahManifest();
    return manifest
      ? {
          manifest,
          saved: this.state.orchestration().data?.cliLaneDefaults?.['ptah-cli'],
        }
      : null;
  });
  /**
   * From the source statuses: no row is readable yet and a source read is still pending. Two failed reads are
   * not loading: the table shows its terminal error and Retry.
   */
  protected readonly loading = computed(() => {
    const pending = (status: string) =>
      status === 'unloaded' || status === 'loading';
    return (
      this.tableRows().length === 0 &&
      (pending(this.state.orchestration().status) ||
        pending(this.state.cliAgents().status))
    );
  });
  /** The empty copy needs a confirmed read: both sources ready and complete, with no row. */
  protected readonly confirmedEmpty = computed(
    () =>
      this.tableRows().length === 0 &&
      this.state.orchestration().status === 'ready' &&
      this.state.cliAgents().status === 'ready' &&
      this.laneReadError() === null,
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
    this.tiersOpener = this.element.nativeElement.ownerDocument
      .activeElement as HTMLElement | null;
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
   * The install guide's Re-detect: the same re-read as the policy bar's Re-detect CLIs. It stays pending until
   * the detection and its read-backs end. Only a lane that the read-back shows as installed closes the guide and
   * takes focus (its toggle, or the matrix region when the toggle is disabled or absent). An incomplete read-back
   * is not "still missing": the page toast says which one it is.
   */
  protected async redetectFromGuide(rowId: string): Promise<void> {
    if (this.guideDetecting()) return;
    this.guidePending.set(true);
    let detected: boolean;
    try {
      detected = await this.state.redetectClis();
    } finally {
      this.guidePending.set(false);
    }
    if (!detected) {
      this.feedback.announce('Detection failed. Try again.', 'alert');
      this.keepFocusAfterFailedRead();
      return;
    }
    const installed = this.rows().installed.some(
      (row) => row.kind === 'system' && row.id === rowId && row.installed,
    );
    if (installed) {
      this.providerGrid()?.closeGuide(rowId);
      this.addMoreStrip()?.closeGuide(rowId);
      this.focusAfterRender(
        `[data-testid="cli-provider-card-${rowId}"] input[type="checkbox"]`,
        '[data-testid="cli-matrix"]',
      );
      return;
    }
    const complete =
      this.state.orchestration().status === 'ready' &&
      this.state.cliAgents().status === 'ready' &&
      this.rows().missing.length === 0;
    if (complete && this.rows().uninstalled.some((row) => row.id === rowId)) {
      this.feedback.announce(
        'Still not found. Check the step above, then try again.',
        'status',
      );
      return;
    }
    this.feedback.announce(
      'Detection ran, but the lane list could not be read. Try again.',
      'alert',
    );
    this.keepFocusAfterFailedRead();
  }

  /**
   * A failed read can destroy the guide (its strip card or detail row goes with the cleared data). When that took
   * the focus with it, focus goes to the table's Retry, else to the stable matrix region. Focus that the user moved
   * to another control stays where it is.
   */
  private keepFocusAfterFailedRead(): void {
    afterNextRender(
      () => {
        const active = this.element.nativeElement.ownerDocument.activeElement;
        if (active && active !== active.ownerDocument.body && active.isConnected)
          return;
        const root = this.element.nativeElement;
        (
          root.querySelector<HTMLElement>('[data-testid="lanes-retry"]') ??
          root.querySelector<HTMLElement>('[data-testid="cli-matrix"]')
        )?.focus();
      },
      { injector: this.injector },
    );
  }

  /**
   * RUX-11: this instance's last Test, announced through the page toast with the instance name when the run ends (the
   * row's status badge keeps the latency of a passed test). Only this run's result counts (S1: the state drops the
   * previous one when a run starts and on any failure), and a failure is a fixed sentence (M1) followed by the state's
   * own fixed reason when it has one.
   */
  private testResult(
    row: CliMatrixRow,
  ): { readonly ok: boolean; readonly text: string } | null {
    const current = this.state.cliTest().data;
    const lastTest =
      row.kind === 'instance'
        ? row.lastTest
        : current?.id === row.id
          ? current
          : null;
    if (lastTest) {
      if (lastTest.success) {
        return {
          ok: true,
          text:
            lastTest.latencyMs === null
              ? 'Test passed.'
              : `Test passed in ${lastTest.latencyMs}ms.`,
        };
      }
      return {
        ok: false,
        text: cliTestFailedText(lastTest.reason),
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
    const { installed, uninstalled } = this.rows();
    const row = [...installed, ...uninstalled].find(
      (candidate) => candidate.id === id,
    );
    if (!row) return;
    this.testingId.set(id);
    this.lastTestedId.set(id);
    try {
      if (row.kind === 'system') await this.state.testSystemLane(row.cli);
      else await this.state.testCliConnection(id);
    } finally {
      this.testingId.set(null);
    }
    const latest = [...this.rows().installed, ...this.rows().uninstalled].find(
      (candidate) => candidate.id === id,
    );
    const result = latest ? this.testResult(latest) : null;
    // Named: a later Test of another instance replaces this toast, so each one says whose result it is.
    if (row && result)
      this.feedback.announce(
        `${row.name}: ${result.text}`,
        result.ok ? 'status' : 'alert',
      );
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
        const disabled = this.state.orchestration().data?.disabledClis;
        const others = (Array.isArray(disabled) ? disabled : []).filter(
          (cli) => cli !== row.cli,
        );
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

  protected async saveLaneDefault(
    row: SystemCliMatrixRow,
    choice: NonNullable<CliLaneDefaults[SystemCliType]>,
  ): Promise<void> {
    await this.laneDefaults.save(row.cli, row.name, choice);
  }
  protected async savePtahDefault(
    choice: NonNullable<CliLaneDefaults['ptah-cli']>,
  ): Promise<void> {
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
          if (
            target &&
            !target.matches(':disabled') &&
            !target.closest('[hidden], [aria-hidden="true"]') &&
            getComputedStyle(target).display !== 'none' &&
            getComputedStyle(target).visibility !== 'hidden'
          ) {
            target.focus();
            return;
          }
        }
      },
      { injector: this.injector },
    );
  }
}
