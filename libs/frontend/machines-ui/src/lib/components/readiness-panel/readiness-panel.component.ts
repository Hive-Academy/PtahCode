import { Clipboard } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type {
  MachineReadinessCheck,
  MachinesReadinessResult,
} from '@ptah-extension/shared';
import {
  MachinesStore,
  type MachinesError,
  type RemoteMachine,
} from '../../services/machines-store';
import { displayText } from '../../utils/display-text';
import { READINESS_COMMAND } from '../../utils/machine-copy';
import { CopyCommandComponent } from '../copy-command/copy-command.component';

const STATUS_TEXT: Readonly<Record<MachineReadinessCheck['status'], string>> = {
  pass: 'Pass',
  fail: 'Fail',
  warn: 'Warning',
};
const STATUS_MARK: Readonly<Record<MachineReadinessCheck['status'], string>> = {
  pass: '✓',
  fail: '✗',
  warn: '!',
};
const STATUS_INK: Readonly<Record<MachineReadinessCheck['status'], string>> = {
  pass: 'text-state-done',
  fail: 'text-state-err',
  warn: 'text-state-need',
};

/** Longer cap for worker detail and fix text than for names. */
const DETAIL_MAX = 200;
const COPIED_FEEDBACK_MS = 2000;

interface CheckRow {
  readonly key: string;
  readonly status: MachineReadinessCheck['status'];
  readonly statusText: string;
  readonly mark: string;
  readonly ink: string;
  readonly label: string;
  readonly detail: string;
  readonly fix: string;
}

/**
 * Readiness check results for one machine (design 4.4): a summary banner,
 * then the worker's checks (seven in Phase 1: OS, Node and SQLite, versions,
 * listener, workspaces, provider, driver lock) and Electron main's own
 * checks, in one ordered list. A failing or warning row shows its fix as a
 * copyable command. Every worker string goes through {@link displayText}.
 *
 * Nothing is cached: each mount and each "Check again" runs one
 * `machines:readiness` call; an older answer is ignored.
 */
@Component({
  selector: 'ptah-readiness-panel',
  standalone: true,
  imports: [CopyCommandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="flex max-w-[720px] flex-col gap-3 p-5"
      [attr.aria-busy]="loading() ? 'true' : null"
      aria-labelledby="ptah-readiness-heading"
    >
      <h2
        id="ptah-readiness-heading"
        class="text-base font-semibold text-base-content"
      >
        {{ name() }}: readiness check
      </h2>

      @if (loading() && result() === null) {
        <p
          class="flex items-center gap-2 text-sm text-base-content-muted"
          role="status"
          data-testid="readiness-loading"
        >
          <span
            class="loading loading-spinner loading-xs motion-reduce:animate-none"
            aria-hidden="true"
          ></span>
          Checking {{ name() }}…
        </p>
      } @else if (error(); as failure) {
        <div
          class="flex flex-col gap-1 rounded-box border border-state-err px-4 py-3 text-sm"
          role="alert"
          data-testid="readiness-error"
        >
          <span class="font-bold text-base-content">Check failed</span>
          <span class="text-base-content"
            >{{ errorText(failure) }} Check again when {{ name() }} is
            reachable.</span
          >
        </div>
      } @else if (summary(); as s) {
        <div
          class="flex flex-col gap-1 rounded-box border px-4 py-3 text-sm"
          [class.border-state-done]="s.ready"
          [class.border-state-need]="!s.ready"
          role="status"
          data-testid="readiness-summary"
        >
          <span class="font-bold text-base-content">{{ s.label }}</span>
          <span class="text-base-content">{{ s.text }}</span>
        </div>
      }

      @if (rows().length > 0) {
        <ol
          class="flex flex-col divide-y divide-surface-border rounded-box border border-surface-border bg-base-200 px-5"
          data-testid="readiness-checks"
        >
          @for (row of rows(); track row.key) {
            <li
              class="flex gap-3 py-3"
              [attr.data-status]="row.status"
              data-testid="readiness-check"
            >
              <span
                class="w-4 shrink-0 text-center font-bold"
                [class]="row.ink"
                aria-hidden="true"
                >{{ row.mark }}</span
              >
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="text-sm text-base-content"
                  ><b>{{ row.statusText }}</b> · {{ row.label }}</span
                >
                @if (row.detail) {
                  <span class="text-xs text-base-content-muted">{{
                    row.detail
                  }}</span>
                }
                @if (row.fix && row.status !== 'pass') {
                  <ptah-copy-command
                    [command]="row.fix"
                    [label]="'Copy fix for ' + row.label"
                  />
                }
              </div>
            </li>
          }
        </ol>
      }

      <div class="flex gap-2">
        <button
          type="button"
          class="btn btn-primary btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
          [disabled]="loading()"
          data-testid="readiness-check-again"
          (click)="checkAgain()"
        >
          {{ loading() ? 'Checking…' : 'Check again' }}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
          [disabled]="rows().length === 0"
          data-testid="readiness-copy-report"
          (click)="copyReport()"
        >
          {{ reportCopied() ? 'Copied' : 'Copy report' }}
        </button>
      </div>

      <p class="text-xs text-base-content-muted" data-testid="readiness-footer">
        The same list is printed by
        <code class="font-mono">{{ readinessCommand }}</code> on the machine.
      </p>
    </section>
  `,
})
export class ReadinessPanelComponent {
  private readonly store = inject(MachinesStore);
  private readonly clipboard = inject(Clipboard);

  public readonly machine = input.required<RemoteMachine>();

  protected readonly readinessCommand = READINESS_COMMAND;
  protected readonly loading = signal(false);
  protected readonly error = signal<MachinesError | null>(null);
  protected readonly result = signal<MachinesReadinessResult | null>(null);
  protected readonly reportCopied = signal(false);

  private request = 0;
  private destroyed = false;
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly name = computed(() => {
    const machine = this.machine();
    return displayText(machine.displayName) || displayText(machine.alias);
  });

  protected readonly rows = computed<readonly CheckRow[]>(() => {
    const result = this.result();
    if (result === null) return [];
    const remote = (result.remote?.checks ?? []).map((check, i) =>
      toRow(check, `remote-${i}`),
    );
    const local = result.local.checks.map((check, i) =>
      toRow(check, `local-${i}`),
    );
    return [...remote, ...local];
  });

  protected readonly summary = computed(() => {
    const result = this.result();
    if (result === null) return null;
    const name = this.name();
    if (result.remote === null) {
      return {
        ready: false,
        label: 'Not connected',
        text: `${name} is not connected, so its own checks cannot run. Sessions cannot start on ${name} until it connects and its checks pass.`,
      };
    }
    const rows = this.rows();
    const attention = rows.filter((row) => row.status !== 'pass').length;
    const warnings = rows.filter((row) => row.status === 'warn').length;
    if (result.remote.ready && result.local.ready) {
      return {
        ready: true,
        label: 'Ready',
        text:
          `Sessions can start on ${name}.` +
          (warnings > 0
            ? ` ${warnings} of ${rows.length} checks warn about what is unavailable.`
            : ` All ${rows.length} checks pass.`),
      };
    }
    return {
      ready: false,
      label: 'Not ready',
      text: `${attention} of ${rows.length} checks need your attention. Sessions cannot start on ${name} until they pass.`,
    };
  });

  /**
   * The id alone: each state push replaces the machine object, and only a
   * new machine needs a new check.
   */
  private readonly machineId = computed(() => this.machine().machineId);

  public constructor() {
    effect(() => {
      const machineId = this.machineId();
      untracked(() => void this.run(machineId));
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.copiedTimer);
    });
  }

  protected checkAgain(): void {
    void this.run(this.machineId());
  }

  protected errorText(error: MachinesError): string {
    const text = displayText(error.message, DETAIL_MAX);
    if (text === '') return 'The check did not answer.';
    return /[.!?]$/.test(text) ? text : `${text}.`;
  }

  protected copyReport(): void {
    const lines = [`${this.name()}: readiness check`];
    const summary = this.summary();
    if (summary !== null) lines.push(`${summary.label}: ${summary.text}`);
    for (const row of this.rows()) {
      lines.push(`${row.statusText} · ${row.label}`);
      if (row.detail) lines.push(`  ${row.detail}`);
      if (row.fix && row.status !== 'pass') lines.push(`  Fix: ${row.fix}`);
    }
    if (!this.clipboard.copy(lines.join('\n'))) return;
    this.reportCopied.set(true);
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(
      () => this.reportCopied.set(false),
      COPIED_FEEDBACK_MS,
    );
  }

  private async run(machineId: string): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    const outcome = await this.store.readiness(machineId);
    if (this.destroyed || request !== this.request) return;
    this.loading.set(false);
    if (outcome.ok) {
      this.error.set(null);
      this.result.set(outcome.value);
      return;
    }
    this.result.set(null);
    this.error.set(
      'error' in outcome
        ? outcome.error
        : { message: 'The check was refused.' },
    );
  }
}

function toRow(check: MachineReadinessCheck, key: string): CheckRow {
  // An unknown status from a newer worker is never shown as a pass.
  const status = Object.hasOwn(STATUS_TEXT, check.status)
    ? check.status
    : 'warn';
  return {
    key,
    status,
    statusText: STATUS_TEXT[status],
    mark: STATUS_MARK[status],
    ink: STATUS_INK[status],
    label: displayText(check.label),
    detail: displayText(check.detail, DETAIL_MAX),
    fix: displayText(check.fix, DETAIL_MAX),
  };
}
