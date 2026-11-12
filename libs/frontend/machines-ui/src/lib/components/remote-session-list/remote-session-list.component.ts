import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { RemoteMachineSessionSummary } from '@ptah-extension/shared';
import { LucideAngularModule, Lock, Plus, RefreshCw } from 'lucide-angular';
import {
  MachinesStore,
  type MachinesError,
  type RemoteMachine,
} from '../../services/machines-store';
import { DisplayTextPipe, displayText } from '../../utils/display-text';
import { durationText } from '../../utils/machine-copy';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahSelectDirective,
  PtahTextareaDirective,
} from '@ptah-extension/ui';
import { remoteSessionStateLabel } from '../../utils/remote-session-copy';

/** What "Open" hands the container: enough to title the opened view. */
export interface RemoteSessionOpenRequest {
  readonly sessionId: string;
  readonly title: string;
  readonly workspacePath: string;
}

/** One row of the approved flat session list. */
interface RemoteSessionRow {
  readonly session: RemoteMachineSessionSummary;
  readonly workspacePath: string;
  /** Short relative age of the session's `updatedAt`, e.g. "2 min". */
  readonly age: string;
}

/**
 * The sessions a machine reports as the approved flat list of bordered rows
 * (prototype screen 5): the whole row is one button that opens the session —
 * line 1 the title with provider and age, line 2 the state dot with its
 * label (Running run, Interrupted need, Idle muted; "Unknown", never failed,
 * while the machine is not connected, 3.4). A driven session shows its holder
 * label (`driver?`, plan W6) and the row's name ends "driven by <label>,
 * watch only" (4.9).
 *
 * "New session" picks the workspace in its form; the rows themselves are not
 * grouped by workspace. Loads workspaces and their sessions when the machine
 * connects and on "Refresh"; there is no timer, so an age is fixed at the
 * render that produced it.
 */
@Component({
  selector: 'ptah-remote-session-list',
  standalone: true,
  imports: [
    PtahSelectDirective,
    PtahTextareaDirective,
    PtahBadgeDirective,
    PtahButtonDirective,
    LucideAngularModule,
    DisplayTextPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="flex flex-col gap-3"
      aria-labelledby="ptah-remote-sessions-title"
      data-testid="remote-session-list"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="ptah-remote-sessions-title"
          class="text-sm font-semibold text-base-content"
        >
          Sessions
        </h3>
        <div class="flex gap-2">
          <button
            type="button"
            ptahButton
            variant="ghost"
            size="xs"
            data-testid="remote-sessions-reload"
            [disabled]="loading() || !connected()"
            (click)="reload()"
          >
            <lucide-angular
              [img]="RefreshIcon"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            />
            Refresh
          </button>
          @if (connected() && groups().length > 0 && !composing()) {
            <button
              type="button"
              ptahButton
              variant="primary"
              size="xs"
              data-testid="remote-session-new"
              (click)="startComposing()"
            >
              <lucide-angular
                [img]="PlusIcon"
                class="h-3.5 w-3.5"
                aria-hidden="true"
              />
              New session
            </button>
          }
        </div>
      </div>

      @if (composing()) {
        <form
          class="flex flex-col gap-2 rounded-box border border-surface-border bg-base-200 px-4 py-3"
          aria-label="New session"
          data-testid="remote-session-new-form"
          (submit)="onSubmit($event)"
          (keydown.escape)="composing.set(false)"
        >
          <label class="flex flex-col gap-1 text-xs text-base-content-muted">
            Workspace
            <select
              ptahSelect
              size="sm"
              tone="mono"
              name="workspace"
              data-testid="remote-session-new-workspace"
              (change)="workspaceId.set(valueOf($event))"
            >
              @for (group of groups(); track group.workspace.workspaceId) {
                <option
                  [value]="group.workspace.workspaceId"
                  [selected]="group.workspace.workspaceId === workspaceId()"
                >
                  {{ group.workspace.path | displayText: 200 }}
                </option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-xs text-base-content-muted">
            First message
            <textarea
              ptahTextarea
              size="sm"
              name="prompt"
              rows="3"
              data-testid="remote-session-new-prompt"
              [placeholder]="'Message Claude on ' + machineName()"
              [value]="prompt()"
              (input)="prompt.set(valueOf($event))"
            ></textarea>
          </label>
          @if (startError(); as failure) {
            <p
              class="text-sm text-base-content"
              role="alert"
              data-testid="remote-session-new-error"
            >
              {{ failure }}
            </p>
          }
          <div class="flex gap-2">
            <button
              type="submit"
              ptahButton
              variant="primary"
              data-testid="remote-session-new-start"
              [disabled]="
                starting() || prompt().trim() === '' || !workspaceId()
              "
            >
              Start
            </button>
            <button
              type="button"
              ptahButton
              variant="ghost"
              data-testid="remote-session-new-cancel"
              (click)="composing.set(false)"
            >
              Cancel
            </button>
          </div>
        </form>
      }

      @if (loading()) {
        <p
          class="text-sm text-base-content-muted"
          role="status"
          aria-busy="true"
          data-testid="remote-sessions-loading"
        >
          Loading sessions…
        </p>
      } @else if (error(); as failure) {
        <div
          class="flex flex-wrap items-center justify-between gap-2 rounded-box border border-state-err px-4 py-3 text-sm"
          role="alert"
          data-testid="remote-sessions-error"
        >
          <span class="text-base-content">{{ failure }}</span>
          <button
            type="button"
            ptahButton
            size="xs"
            [disabled]="!connected()"
            (click)="reload()"
          >
            Try again
          </button>
        </div>
      } @else if (groups().length === 0) {
        <p
          class="text-sm text-base-content-muted"
          data-testid="remote-sessions-empty"
        >
          @if (connected()) {
            {{ machineName() }} has no registered workspaces.
          } @else {
            Sessions show once {{ machineName() }} is connected.
          }
        </p>
      } @else {
        @if (flatRows().length === 0) {
          <p
            class="text-sm text-base-content-muted"
            data-testid="remote-sessions-empty-list"
          >
            No sessions yet.
          </p>
        } @else {
          <ul class="flex flex-col gap-2" aria-label="Sessions">
            @for (row of flatRows(); track row.session.sessionId) {
              <li class="min-w-0" data-testid="remote-session-row">
                <button
                  type="button"
                  class="block w-full min-w-0 rounded border border-base-300 px-3 py-2.5 text-left hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                  data-testid="remote-session-open"
                  [attr.aria-label]="openLabel(row)"
                  (click)="open(row.session, row.workspacePath)"
                >
                  <span class="flex min-w-0 items-baseline gap-1">
                    <span
                      class="min-w-0 truncate text-sm font-medium text-base-content"
                      >{{ title(row.session) }}</span
                    >
                    <span class="shrink-0 text-xs text-base-content-muted"
                      >· {{ row.session.provider | displayText: 24 }} ·
                      {{ row.age }}</span
                    >
                  </span>
                  <span
                    class="mt-1 flex items-center gap-2 text-xs"
                    [class.text-state-run]="
                      connected() && row.session.state === 'running'
                    "
                    [class.text-state-need]="
                      connected() && row.session.state === 'interrupted'
                    "
                    [class.text-base-content-muted]="
                      !connected() || row.session.state === 'idle'
                    "
                    data-testid="remote-session-state"
                  >
                    <span
                      class="h-2 w-2 shrink-0 rounded-full bg-current"
                      aria-hidden="true"
                    ></span>
                    {{ stateLabel(row.session) }}
                  </span>
                  @if (row.session.driver; as driver) {
                    <span
                      ptahBadge
                      appearance="outline"
                      size="sm"
                      class="mt-1 max-w-[16rem] gap-1"
                      data-testid="remote-session-driver"
                    >
                      <lucide-angular
                        [img]="LockIcon"
                        class="h-3 w-3 shrink-0"
                        aria-hidden="true"
                      />
                      <span class="ptah-badge-text"
                        >Driver: {{ driver.label | displayText }}</span
                      >
                    </span>
                  }
                </button>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class RemoteSessionListComponent {
  private readonly store = inject(MachinesStore);

  public readonly machine = input.required<RemoteMachine>();
  public readonly opened = output<RemoteSessionOpenRequest>();

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly composing = signal(false);
  protected readonly workspaceId = signal('');
  protected readonly prompt = signal('');
  protected readonly starting = signal(false);
  protected readonly startError = signal<string | null>(null);

  protected readonly PlusIcon = Plus;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly LockIcon = Lock;

  protected readonly connected = computed(
    () => this.machine().state === 'connected',
  );
  protected readonly machineName = computed(
    () =>
      displayText(this.machine().displayName) ||
      displayText(this.machine().alias),
  );
  /**
   * The id alone: each state push replaces the machine object, and only a
   * new machine (or a change of connection) closes the form and reloads.
   */
  private readonly machineId = computed(() => this.machine().machineId);

  protected readonly groups = computed(() =>
    this.store.sessionsByWorkspace(this.machineId())(),
  );

  /** The approved flat list: every session of every workspace, in order. */
  protected readonly flatRows = computed<readonly RemoteSessionRow[]>(() => {
    const now = Date.now();
    const rows: RemoteSessionRow[] = [];
    for (const group of this.groups()) {
      for (const session of group.sessions) {
        rows.push({
          session,
          workspacePath: group.workspace.path,
          age: durationText(session.updatedAt, now),
        });
      }
    }
    return rows;
  });

  /** Reloads exclude each other; a newer one wins. */
  private loadToken = 0;

  public constructor() {
    effect(() => {
      const machineId = this.machineId();
      const connected = this.connected();
      untracked(() => {
        this.composing.set(false);
        if (connected) void this.load(machineId);
      });
    });
  }

  protected reload(): void {
    void this.load(this.machineId());
  }

  protected stateLabel(session: RemoteMachineSessionSummary): string {
    return remoteSessionStateLabel(session.state, this.connected());
  }

  protected title(session: RemoteMachineSessionSummary): string {
    return displayText(session.title) || 'Untitled session';
  }

  /**
   * The accessible name replaces the visible text of the row, so it carries
   * the same facts: title, provider, age and state.
   */
  protected openLabel(row: RemoteSessionRow): string {
    const session = row.session;
    const name = [
      `Open session: ${this.title(session)}`,
      displayText(session.provider, 24),
      row.age,
      this.stateLabel(session),
    ]
      .filter((part) => part !== '')
      .join(', ');
    return session.driver
      ? `${name}, driven by ${displayText(session.driver.label)}, watch only`
      : name;
  }

  protected open(session: RemoteMachineSessionSummary, path: string): void {
    this.opened.emit({
      sessionId: session.sessionId,
      title: this.title(session),
      workspacePath: displayText(path, 200),
    });
  }

  protected startComposing(): void {
    this.startError.set(null);
    this.prompt.set('');
    if (
      !this.groups().some((g) => g.workspace.workspaceId === this.workspaceId())
    ) {
      this.workspaceId.set(this.groups()[0]?.workspace.workspaceId ?? '');
    }
    this.composing.set(true);
  }

  protected valueOf(event: Event): string {
    const target = event.target;
    return target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
      ? target.value
      : '';
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.start();
  }

  protected async start(): Promise<void> {
    const prompt = this.prompt().trim();
    const workspaceId = this.workspaceId();
    if (this.starting() || prompt === '' || workspaceId === '') return;
    this.starting.set(true);
    this.startError.set(null);
    try {
      const machineId = this.machine().machineId;
      const outcome = await this.store.startSession(
        machineId,
        workspaceId,
        prompt,
      );
      if (!outcome.ok) {
        this.startError.set(
          'error' in outcome
            ? errorSentence(outcome.error)
            : 'The session could not be started.',
        );
        return;
      }
      const group = this.groups().find(
        (g) => g.workspace.workspaceId === workspaceId,
      );
      this.composing.set(false);
      this.opened.emit({
        sessionId: outcome.value,
        title: displayText(prompt),
        workspacePath: displayText(group?.workspace.path, 200),
      });
      void this.load(machineId);
    } finally {
      this.starting.set(false);
    }
  }

  private async load(machineId: string): Promise<void> {
    const token = ++this.loadToken;
    this.loading.set(true);
    this.error.set(null);
    try {
      const workspaces = await this.store.loadWorkspaces(machineId);
      if (token !== this.loadToken) return;
      if (!workspaces.ok) {
        this.error.set(
          'error' in workspaces
            ? errorSentence(workspaces.error)
            : 'The sessions could not be loaded.',
        );
        return;
      }
      const lists = await Promise.all(
        this.store
          .workspaces(machineId)()
          .map((w) => this.store.loadSessions(machineId, w.workspaceId)),
      );
      if (token !== this.loadToken) return;
      const failed = lists.find((outcome) => !outcome.ok);
      if (failed !== undefined && 'error' in failed) {
        this.error.set(errorSentence(failed.error));
      }
    } finally {
      if (token === this.loadToken) this.loading.set(false);
    }
  }
}

function errorSentence(error: MachinesError): string {
  const text = displayText(error.message, 200);
  if (text === '') return 'The request failed.';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
