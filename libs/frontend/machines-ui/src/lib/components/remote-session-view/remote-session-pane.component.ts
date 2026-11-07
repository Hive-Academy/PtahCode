import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import type { PermissionRequest } from '@ptah-extension/shared';
import {
  MachinesStore,
  type MachinesError,
  type RemoteSessionView,
} from '../../services/machines-store';
import { refusalSentence } from '../../utils/remote-session-copy';
import type { RemoteTranscriptItem } from '../../utils/remote-transcript';
import {
  RemoteApprovalBlockComponent,
  type RemoteApprovalDecision,
  type RemoteApprovalMode,
} from '../remote-approval-block/remote-approval-block.component';
import {
  RemoteTranscriptComponent,
  type RemoteLinkActivation,
} from './remote-transcript.component';

/** The line shown for an answer whose request rejected instead of resolving. */
const ANSWER_REJECTED_SENTENCE =
  'The answer could not be sent. Check the connection to the machine and try again.';

interface ApprovalEntry {
  readonly request: PermissionRequest;
  readonly timedOut: boolean;
}

/**
 * The transcript region of one opened remote session (design 4.6, 4.7, 4.9):
 * the opening and empty lines, the transcript, the "saved up to" divider of a
 * snapshot, and one approval block per pending or timed-out request.
 *
 * It answers requests through {@link MachinesStore.respondPermission}. An
 * answer in flight disables its block; a failed or rejected answer shows on
 * its block. Both start empty for each session, and an answer that settles
 * after the session changed is not applied. Links in the transcript are passed up
 * as `linkActivated`; the page decides what a link does.
 */
@Component({
  selector: 'ptah-remote-session-pane',
  standalone: true,
  imports: [RemoteTranscriptComponent, RemoteApprovalBlockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <section
      class="flex flex-col gap-4 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
      tabindex="0"
      aria-label="Transcript"
      data-testid="remote-transcript-region"
    >
      @if (
        view() === null ||
        (view()?.mode === 'attaching' && transcript().length === 0)
      ) {
        <p
          class="text-sm text-base-content-muted"
          role="status"
          data-testid="remote-opening"
        >
          Opening session…
        </p>
      } @else if (transcript().length === 0) {
        <p class="text-sm text-base-content-muted" data-testid="remote-empty">
          {{ emptyText() }}
        </p>
      } @else {
        <ptah-remote-transcript
          [items]="transcript()"
          [machineName]="machineName()"
          [streaming]="streaming()"
          (linkActivated)="linkActivated.emit($event)"
        />
      }

      @if (savedUpTo(); as saved) {
        <p
          class="border-t border-dashed border-surface-border pt-2 text-xs text-base-content-muted"
          data-testid="remote-saved-divider"
        >
          {{ saved }}
        </p>
      }

      @for (entry of approvals(); track entry.request.id) {
        <ptah-remote-approval-block
          [request]="entry.request"
          [machineName]="machineName()"
          [sessionTitle]="sessionTitle()"
          [mode]="approvalMode()"
          [timedOut]="entry.timedOut"
          [busy]="answering().has(entry.request.id)"
          [unavailableReason]="answerUnavailable()"
          [error]="answerErrors().get(entry.request.id) ?? null"
          (answered)="answer(entry.request, $event)"
        />
      }
    </section>
  `,
})
export class RemoteSessionPaneComponent {
  private readonly store = inject(MachinesStore);

  public readonly machineId = input.required<string>();
  public readonly sessionId = input.required<string>();
  /** The session as the store shows it; `null` before the first attach. */
  public readonly view = input.required<RemoteSessionView | null>();
  /** The transcript built from the session's events. */
  public readonly transcript =
    input.required<readonly RemoteTranscriptItem[]>();
  /** Display-safe machine name. */
  public readonly machineName = input.required<string>();
  /** Display-safe session title, for the approval blocks. */
  public readonly sessionTitle = input('');
  public readonly connected = input.required<boolean>();
  /** True while a turn is in flight. */
  public readonly streaming = input(false);
  /** Local time of the newest saved event, or `null` when none has a time. */
  public readonly savedAt = input<string | null>(null);

  /** A link in the transcript was activated; it is never followed here. */
  public readonly linkActivated = output<RemoteLinkActivation>();

  private readonly sessionKey = computed(
    () => [this.machineId(), this.sessionId()] as const,
    {
      equal: (a, b) => a[0] === b[0] && a[1] === b[1],
    },
  );

  /**
   * A new object each time the session changes (A to B and back to A gives a
   * third object). An answer remembers the token it started under and
   * settles only while it is still current, so an outcome that arrives after
   * a switch never touches the next session's state, even for a request id
   * that session reuses.
   */
  private readonly sessionToken = computed(() => {
    this.sessionKey();
    return {};
  });

  /** Requests with an answer in flight; empty for each session. */
  protected readonly answering = linkedSignal<
    readonly [string, string],
    ReadonlySet<string>
  >({
    source: this.sessionKey,
    computation: () => new Set(),
  });
  /** The last failed answer per request; empty for each session. */
  protected readonly answerErrors = linkedSignal<
    readonly [string, string],
    ReadonlyMap<string, MachinesError>
  >({
    source: this.sessionKey,
    computation: () => new Map(),
  });

  protected readonly savedUpTo = computed(() => {
    if (this.view()?.mode !== 'snapshot' || this.transcript().length === 0) {
      return null;
    }
    const at = this.savedAt();
    return at
      ? `Saved up to ${at}. Newer activity is not shown.`
      : 'Newer activity is not shown.';
  });

  protected readonly emptyText = computed(() => {
    const view = this.view();
    if (view?.lockUnavailable) {
      return 'No saved history is available because the session could not be checked.';
    }
    if (view?.mode === 'snapshot')
      return 'Nothing was saved in this session yet.';
    if (view?.mode === 'detached') return 'The session could not be opened.';
    return 'No messages yet.';
  });

  protected readonly approvalMode = computed<RemoteApprovalMode>(() => {
    const view = this.view();
    if (view?.lockUnavailable) return 'cached';
    return view?.watchOnly ? 'watch-only' : 'answerable';
  });

  protected readonly approvals = computed<readonly ApprovalEntry[]>(() => {
    const view = this.view();
    if (view === null) return [];
    return [
      ...view.pendingPermissions.map((request) => ({
        request,
        timedOut: false,
      })),
      ...view.timedOutPermissions.map((request) => ({
        request,
        timedOut: true,
      })),
    ];
  });

  protected readonly answerUnavailable = computed(() =>
    this.connected() ? null : `${this.machineName()} is not connected.`,
  );

  protected async answer(
    request: PermissionRequest,
    decision: RemoteApprovalDecision,
  ): Promise<void> {
    if (this.answering().has(request.id)) return;
    const token = this.sessionToken();
    this.answering.update((set) => new Set(set).add(request.id));
    this.answerErrors.update((map) => {
      const next = new Map(map);
      next.delete(request.id);
      return next;
    });
    let error: MachinesError | null;
    try {
      const outcome = await this.store.respondPermission(
        this.machineId(),
        this.sessionId(),
        request.id,
        decision,
      );
      error = outcome.ok
        ? null
        : 'error' in outcome
          ? outcome.error
          : { message: refusalSentence(outcome.refused, this.machineName()) };
    } catch {
      // The store reports failures as outcomes; a rejection is unexpected,
      // so it is shown on the request's block instead of being dropped. Its
      // raw message may carry transport or provider detail and stays out of
      // the UI.
      error = { message: ANSWER_REJECTED_SENTENCE };
    }
    if (token !== this.sessionToken()) return;
    this.answering.update((set) => {
      const next = new Set(set);
      next.delete(request.id);
      return next;
    });
    if (error !== null) {
      const failure = error;
      this.answerErrors.update((map) => new Map(map).set(request.id, failure));
    }
  }
}
