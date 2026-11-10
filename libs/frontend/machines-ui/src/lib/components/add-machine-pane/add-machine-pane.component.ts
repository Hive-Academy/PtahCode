import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChildren,
  type ElementRef,
  type OnInit,
} from '@angular/core';
import { MACHINE_SSH_ALIAS_PATTERN } from '@ptah-extension/shared';
import { SetupActionDirective } from '@ptah-extension/ui';
import {
  PAIRING_CODE_LENGTH,
  PAIRING_TTL_DEFAULT_SEC,
  normalizePairingCode,
} from '@ptah-extension/worker-protocol';
import {
  MachinesStore,
  type MachinesOutcome,
  type RemoteMachine,
} from '../../services/machines-store';
import { displayText } from '../../utils/display-text';
import {
  MACHINE_REASON_COPY,
  PAIRING_COMMAND,
  noWorkerModeCopy,
} from '../../utils/machine-copy';
import { CopyCommandComponent } from '../copy-command/copy-command.component';

type PairVia = 'code' | 'ssh';

/** A failed add or pair, as the 4.3 banner shows it. */
interface PairFailure {
  readonly label: string;
  /** Display-safe sentence(s). */
  readonly text: string;
  /** "Nothing was stored" applies: the worker refused, no token exists. */
  readonly nothingStored: boolean;
}

const ASCII_ALPHANUMERIC = /[0-9A-Za-z]/g;
const PAIRING_TTL_MINUTES = Math.round(PAIRING_TTL_DEFAULT_SEC / 60);

let nextId = 0;

/**
 * Add a machine by SSH alias and pair it (design 4.2, 4.3), or re-pair a
 * registered one when `machine` is set (alias fixed; rebind after
 * `worker-identity-changed` or `re-pair-required`).
 *
 * Pairing is either the 8-cell code the user reads from the machine's
 * pairing window, or "Pair automatically via SSH" (Electron main reads the
 * code over the user's SSH login). A rejected code never says which cause
 * (wrong, expired, used) because the worker does not tell.
 */
@Component({
  selector: 'ptah-add-machine-pane',
  standalone: true,
  imports: [CopyCommandComponent, SetupActionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <form
      class="flex max-w-[640px] flex-col gap-4"
      novalidate
      [attr.aria-busy]="busy() !== null ? 'true' : null"
      data-testid="add-machine-form"
      (submit)="onSubmit($event)"
      (keydown.escape)="cancel()"
    >
      <h2 class="text-base font-semibold text-base-content">
        @if (repairName(); as name) {
          Re-pair {{ name }}
        } @else {
          Add machine
        }
      </h2>

      @if (repairReason(); as reason) {
        <p
          class="text-sm text-base-content-muted"
          data-testid="add-machine-reason"
        >
          {{ reason }}
        </p>
      }

      @if (failure(); as f) {
        <div
          class="flex flex-col gap-1 rounded-box border border-state-err bg-base-100 px-4 py-3 text-sm"
          role="alert"
          data-testid="add-machine-failure"
        >
          <span class="font-bold text-base-content">{{ f.label }}</span>
          <span class="text-base-content">{{ f.text }}</span>
        </div>
      }

      <div class="flex flex-col gap-1">
        <label
          class="text-sm font-medium text-base-content"
          [attr.for]="aliasId"
          >SSH alias</label
        >
        <input
          class="input input-bordered input-sm rounded-md font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
          type="text"
          autocomplete="off"
          spellcheck="false"
          maxlength="64"
          [id]="aliasId"
          [attr.list]="aliasListId"
          [attr.aria-describedby]="aliasId + '-hint'"
          [attr.aria-invalid]="aliasError() ? 'true' : null"
          [readOnly]="machine() !== null"
          [value]="alias()"
          data-testid="add-machine-alias"
          (input)="onAliasInput($event)"
        />
        <datalist [id]="aliasListId" data-testid="add-machine-aliases">
          @for (option of aliasOptions(); track option) {
            <option [value]="option"></option>
          }
        </datalist>
        @if (aliasError(); as message) {
          <span
            class="text-xs text-state-err"
            data-testid="add-machine-alias-error"
            >{{ message }}</span
          >
        }
        <span class="text-xs text-base-content-muted" [id]="aliasId + '-hint'"
          >Hosts from your <code class="font-mono">~/.ssh/config</code>. You can
          type any alias.</span
        >
      </div>

      <fieldset
        class="flex flex-col gap-3 rounded-box border border-surface-border bg-base-200 px-5 py-4"
      >
        <legend class="sr-only">Pairing code</legend>
        <p class="text-sm font-semibold text-base-content" aria-hidden="true">
          Pairing code
        </p>
        <p class="text-xs text-base-content-muted">
          On {{ targetName() }}, open the pairing window: run the command below
          there. The code is shown once and expires in {{ ttlMinutes }} minutes.
        </p>
        <ptah-copy-command
          [command]="pairingCommand"
          label="Copy pairing command"
        />
        <div class="flex flex-col gap-1">
          <span class="text-xs text-base-content" [id]="codeId + '-label'"
            >Enter the {{ codeLength }}-character code</span
          >
          <div
            class="flex flex-wrap gap-1.5"
            role="group"
            [attr.aria-label]="'Pairing code, ' + codeLength + ' characters'"
            [attr.aria-describedby]="codeError() ? codeId + '-error' : null"
          >
            @for (cell of cells(); track $index; let i = $index) {
              <input
                #codeCell
                class="input input-bordered input-sm h-9 w-8 rounded-md px-0 text-center font-mono uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                [class.border-state-err]="codeInvalid()"
                type="text"
                inputmode="text"
                autocapitalize="characters"
                autocomplete="off"
                spellcheck="false"
                maxlength="1"
                [value]="cell"
                [attr.aria-label]="'Character ' + (i + 1)"
                [attr.aria-invalid]="codeInvalid() ? 'true' : null"
                data-testid="add-machine-code-cell"
                (focus)="onCellFocus($event)"
                (input)="onCellInput(i, $event)"
                (keydown)="onCellKeydown(i, $event)"
                (paste)="onCellPaste(i, $event)"
              />
            }
          </div>
          @if (codeError(); as message) {
            <span
              class="text-xs text-state-err"
              [id]="codeId + '-error'"
              data-testid="add-machine-code-error"
              >{{ message }}</span
            >
          }
          @if (failure()?.nothingStored) {
            <span
              class="text-xs text-base-content-muted"
              data-testid="add-machine-nothing-stored"
              >Nothing was stored. No token exists for {{ targetName() }} on
              this machine.</span
            >
          }
        </div>
        <p
          class="flex flex-wrap items-center gap-2 text-xs text-base-content-muted"
        >
          Over SSH, Ptah can read the code for you:
          <button
            type="button"
            class="btn btn-ghost btn-xs border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
            [disabled]="busy() !== null"
            data-testid="add-machine-ssh"
            (click)="pair('ssh')"
          >
            {{
              busy() === 'ssh'
                ? 'Pairing via SSH…'
                : 'Pair automatically via SSH'
            }}
          </button>
        </p>
      </fieldset>

      <div class="flex gap-2">
        <button
          type="submit"
          [ptahSetupAction]="'primaryCompact'"
          class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
          [disabled]="busy() !== null"
          data-testid="add-machine-submit"
        >
          {{ busy() === 'code' ? 'Pairing...' : 'Pair and connect' }}
        </button>
        <button
          type="button"
          [ptahSetupAction]="'ghost'"
          class="btn-ghost focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
          data-testid="add-machine-cancel"
          (click)="cancel()"
        >
          Cancel
        </button>
      </div>
    </form>
  `,
})
export class AddMachinePaneComponent implements OnInit {
  private readonly store = inject(MachinesStore);

  /** Set to re-pair a registered machine; `null` adds a new one. */
  public readonly machine = input<RemoteMachine | null>(null);

  public readonly paired = output<RemoteMachine>();
  public readonly cancelled = output<void>();

  protected readonly codeLength = PAIRING_CODE_LENGTH;
  protected readonly ttlMinutes = PAIRING_TTL_MINUTES;
  protected readonly pairingCommand = PAIRING_COMMAND;
  private readonly instance = nextId++;
  protected readonly aliasId = `ptah-machine-alias-${this.instance}`;
  protected readonly aliasListId = `ptah-machine-aliases-${this.instance}`;
  protected readonly codeId = `ptah-machine-code-${this.instance}`;

  private readonly typedAlias = signal<string | null>(null);
  protected readonly cells = signal<readonly string[]>(
    Array.from({ length: PAIRING_CODE_LENGTH }, () => ''),
  );
  private readonly aliases = signal<readonly string[]>([]);
  protected readonly busy = signal<PairVia | null>(null);
  protected readonly failure = signal<PairFailure | null>(null);
  protected readonly aliasError = signal<string | null>(null);
  protected readonly codeError = signal<string | null>(null);
  protected readonly codeInvalid = signal(false);

  private readonly codeCells =
    viewChildren<ElementRef<HTMLInputElement>>('codeCell');
  private destroyed = false;

  protected readonly alias = computed(
    () => this.machine()?.alias ?? this.typedAlias() ?? '',
  );

  protected readonly aliasOptions = computed(() =>
    this.aliases()
      .filter((alias) => MACHINE_SSH_ALIAS_PATTERN.test(alias))
      .slice(0, 200),
  );

  protected readonly repairName = computed(() => {
    const machine = this.machine();
    if (machine === null) return null;
    return displayText(machine.displayName) || displayText(machine.alias);
  });

  protected readonly repairReason = computed(() => {
    const reason = this.machine()?.reason;
    return reason !== undefined ? MACHINE_REASON_COPY[reason] : null;
  });

  /** The machine named in instructions: its name, its alias, or a fallback. */
  protected readonly targetName = computed(
    () => this.repairName() ?? (displayText(this.alias()) || 'the machine'),
  );

  public constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  public ngOnInit(): void {
    void this.loadAliases();
  }

  protected onAliasInput(event: Event): void {
    this.typedAlias.set((event.target as HTMLInputElement).value.trim());
    this.aliasError.set(null);
  }

  /** Select the character so typing over a filled cell replaces it. */
  protected onCellFocus(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }

  protected onCellInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const chars = codeChars(target.value);
    if (chars.length > 1) {
      // Autofill or an IME can put several characters in one cell.
      this.fillFrom(index, chars);
      return;
    }
    const char = chars[0] ?? '';
    target.value = char;
    this.setCell(index, char);
    if (char !== '') this.focusCell(index + 1);
  }

  protected onCellKeydown(index: number, event: KeyboardEvent): void {
    switch (event.key) {
      case 'Backspace':
        if (this.cells()[index] === '' && index > 0) {
          event.preventDefault();
          this.setCell(index - 1, '');
          this.focusCell(index - 1);
        }
        return;
      case 'ArrowLeft':
        event.preventDefault();
        this.focusCell(index - 1);
        return;
      case 'ArrowRight':
        event.preventDefault();
        this.focusCell(index + 1);
        return;
      default:
        return;
    }
  }

  protected onCellPaste(index: number, event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    event.preventDefault();
    const chars = codeChars(text);
    if (chars.length === 0) return;
    // A whole code (with or without its hyphen) fills every cell.
    this.fillFrom(chars.length >= PAIRING_CODE_LENGTH ? 0 : index, chars);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.pair('code');
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  /** Add the alias if needed, then pair by code or over SSH. */
  protected async pair(via: PairVia): Promise<void> {
    if (this.busy() !== null) return;
    this.failure.set(null);
    this.codeError.set(null);
    this.codeInvalid.set(false);

    const alias = this.alias();
    if (!MACHINE_SSH_ALIAS_PATTERN.test(alias)) {
      this.aliasError.set(
        'Enter a Host alias from ~/.ssh/config: letters, digits, dot, dash or underscore.',
      );
      return;
    }
    let code: string | null = null;
    if (via === 'code') {
      code = normalizePairingCode(this.cells().join(''));
      if (code === null || code.length !== PAIRING_CODE_LENGTH) {
        this.codeError.set(
          `Enter all ${PAIRING_CODE_LENGTH} characters of the code shown on ${this.targetName()}.`,
        );
        this.codeInvalid.set(true);
        this.focusCell(this.firstEmptyCell());
        return;
      }
    }

    this.busy.set(via);
    try {
      const target = await this.ensureMachine(alias);
      if (target === null) return;
      const outcome =
        code !== null
          ? await this.store.pair(target.machineId, code)
          : await this.store.pairViaSsh(target.machineId);
      if (this.destroyed) return;
      if (outcome.ok) {
        this.paired.emit(outcome.value);
        return;
      }
      this.failure.set(this.pairFailure(outcome, via, alias));
      if (via === 'code' && this.failure()?.nothingStored) {
        this.codeInvalid.set(true);
        this.focusCell(0);
      }
    } finally {
      if (!this.destroyed) this.busy.set(null);
    }
  }

  /** The registered machine to pair: the re-pair target, a known alias, or a new entry. */
  private async ensureMachine(alias: string): Promise<RemoteMachine | null> {
    const fixed = this.machine();
    if (fixed !== null) return fixed;
    const known = this.store.machines().find((m) => m.alias === alias);
    if (known !== undefined) {
      if (known.state !== 'connected') return known;
      this.failure.set({
        label: 'Already connected',
        text: `${displayText(known.displayName) || displayText(alias)} is already added and connected.`,
        nothingStored: false,
      });
      return null;
    }
    const added = await this.store.add(alias);
    if (this.destroyed) return null;
    if (added.ok) return added.value;
    this.failure.set({
      label: 'Could not add machine',
      text: outcomeMessage(added),
      nothingStored: false,
    });
    return null;
  }

  private pairFailure(
    outcome: Exclude<MachinesOutcome<RemoteMachine>, { ok: true }>,
    via: PairVia,
    alias: string,
  ): PairFailure {
    const name = this.targetName();
    const code = 'error' in outcome ? outcome.error.code : undefined;
    const detail = outcomeMessage(outcome);
    switch (code) {
      case 'MACHINE_PAIRING_REJECTED':
        return via === 'code'
          ? {
              label: 'Pairing failed',
              text:
                'The code was not accepted. It may be wrong, expired or already used; Ptah cannot tell which. ' +
                `If the pairing window on ${name} is still open, check the code and try again. ` +
                `If it closed or expired, open a new one on ${name}.`,
              nothingStored: true,
            }
          : {
              // Over SSH the message comes from the user's own login and may
              // carry the attempts left (Q2); it is shown, never invented.
              label: 'Pairing failed',
              text: `Ptah could not pair over SSH: ${detail} Open a new pairing window on ${name}, then try again.`,
              nothingStored: true,
            };
      case 'MACHINE_UNREACHABLE':
        return {
          label: 'Cannot reach host',
          text: `SSH to ${displayText(alias)} failed: ${detail} Check the alias and that the machine is on.`,
          nothingStored: false,
        };
      case 'MACHINE_VERSION_MISMATCH':
        return {
          label: 'Version mismatch',
          // Main sends the Batch 20 "no worker mode" copy here; fall back to it.
          text:
            'error' in outcome && outcome.error.message.trim() !== ''
              ? detail
              : noWorkerModeCopy(name),
          nothingStored: false,
        };
      default:
        return {
          label: 'Pairing failed',
          text: `${detail} Nothing was changed; try again.`,
          nothingStored: false,
        };
    }
  }

  private async loadAliases(): Promise<void> {
    const result = await this.store.sshAliases();
    // No suggestions on failure: the field still takes any alias.
    if (result.ok && !this.destroyed) this.aliases.set(result.value);
  }

  private fillFrom(start: number, chars: readonly string[]): void {
    const next = [...this.cells()];
    let index = start;
    for (const char of chars) {
      if (index >= PAIRING_CODE_LENGTH) break;
      next[index++] = char;
    }
    this.cells.set(next);
    this.syncCellValues(next);
    this.focusCell(Math.min(index, PAIRING_CODE_LENGTH - 1));
  }

  private setCell(index: number, char: string): void {
    const next = [...this.cells()];
    next[index] = char;
    this.cells.set(next);
    this.codeInvalid.set(false);
  }

  /** `[value]` does not rewrite a cell whose model did not change; do it here. */
  private syncCellValues(values: readonly string[]): void {
    this.codeCells().forEach((cell, i) => {
      cell.nativeElement.value = values[i] ?? '';
    });
  }

  private firstEmptyCell(): number {
    const index = this.cells().findIndex((cell) => cell === '');
    return index === -1 ? 0 : index;
  }

  private focusCell(index: number): void {
    if (index < 0 || index >= PAIRING_CODE_LENGTH) return;
    this.codeCells()[index]?.nativeElement.focus();
  }
}

/** Upper-cased ASCII letters and digits; hyphens, spaces and the rest drop. */
function codeChars(text: string): string[] {
  return (text.slice(0, 64).match(ASCII_ALPHANUMERIC) ?? []).map((c) =>
    c.toUpperCase(),
  );
}

function outcomeMessage(
  outcome: Exclude<MachinesOutcome<unknown>, { ok: true }>,
): string {
  if ('refused' in outcome) return 'The request was refused.';
  const text = displayText(outcome.error.message, 200);
  if (text === '') return 'The request failed.';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
