import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { AgentStatsService } from '@ptah-extension/chat-execution-tree';
import {
  FILE_LINK_OPENER,
  type FileLinkOpenRequest,
  type IFileLinkOpener,
} from '@ptah-extension/core';
import { LucideAngularModule, Lock, RefreshCw, Square } from 'lucide-angular';
import {
  MachinesStore,
  type RemoteSessionView,
} from '../../services/machines-store';
import { EMPTY_TRANSCRIPT_EVENTS } from '../../services/transcript-events';
import { displayText } from '../../utils/display-text';
import {
  drivenElsewhereBanner,
  errorSentence,
  lockFreedBanner,
  lockUnavailableBanner,
  outcomeSentence,
  type WatchOnlyBanner,
} from '../../utils/remote-session-copy';
import { buildRemoteTranscript } from '../../utils/remote-transcript';
import { RemoteComposerComponent } from '../remote-composer/remote-composer.component';
import { ReconnectBannerComponent } from '../reconnect-banner/reconnect-banner.component';
import { SessionSyncChipComponent } from '../reconnect-banner/session-sync-chip.component';
import {
  replaySummary,
  sessionSyncState,
  type ReplaySummary,
} from '../reconnect-banner/session-sync';
import { RemoteSessionPaneComponent } from './remote-session-pane.component';
import { PtahBadgeDirective, PtahButtonDirective } from '@ptah-extension/ui';
import type { RemoteLinkActivation } from './remote-transcript.component';

const REASON_ID = 'ptah-remote-session-reason';

/**
 * One opened remote session (design 4.6-4.9): header, banners, the
 * transcript drawn with the local transcript's pieces, approval blocks and
 * the composer.
 *
 * Opening attaches through {@link MachinesStore.openSession}; leaving detaches.
 * A snapshot (another process drives the session, or it has no log) is the
 * "last saved state" and is watch-only: Send, Stop and answers are native
 * `disabled` or absent, and Refresh re-checks. Freedom is learned only on
 * Refresh, on window focus and when the session list reloads; no timer
 * (4.9 9d, D17).
 *
 * File links in tool calls point at the remote machine, so this view
 * provides its own {@link FILE_LINK_OPENER}: it never opens a remote path on
 * this machine and says where the file is instead. Links in remote markdown
 * are inert ({@link RemoteTranscriptComponent}); the notice shows a URL's
 * real target instead of opening it.
 *
 * The transcript and approval blocks are {@link RemoteSessionPaneComponent};
 * this view builds the transcript (its labels count it) and handles the
 * links the pane passes up. The composer is {@link RemoteComposerComponent};
 * a failed Stop shares its error line through `actionError`.
 */
@Component({
  selector: 'ptah-remote-session-view',
  standalone: true,
  imports: [
    PtahBadgeDirective,
    PtahButtonDirective,
    LucideAngularModule,
    RemoteSessionPaneComponent,
    RemoteComposerComponent,
    ReconnectBannerComponent,
    SessionSyncChipComponent,
  ],
  providers: [
    { provide: FILE_LINK_OPENER, useExisting: RemoteSessionViewComponent },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-0 min-w-0 flex-1 flex-col',
    '(window:focus)': 'onWindowFocus()',
  },
  template: `
    <div
      class="sr-only"
      role="status"
      aria-live="polite"
      data-testid="remote-live"
    >
      {{ announcement() }}
    </div>

    <header
      class="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border py-3"
    >
      <div class="flex min-w-0 flex-col gap-1">
        <h2
          class="truncate text-base font-semibold text-base-content"
          data-testid="remote-session-title"
        >
          {{ title() || 'Remote session' }}
        </h2>
        <p
          class="truncate text-xs text-base-content-muted"
          data-testid="remote-session-meta"
        >
          on {{ machineName() }}
          @if (workspacePath()) {
            · <span class="font-mono">{{ workspacePath() }}</span>
          }
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        @if (view()?.lockUnavailable) {
          <span
            ptahBadge
            tone="err"
            appearance="outline"
            size="sm"
            data-testid="remote-owner-chip"
            >Not available</span
          >
        } @else if (view()?.watchOnly && view()?.drivenBy) {
          <span
            ptahBadge
            appearance="outline"
            size="sm"
            class="max-w-[18rem] gap-1"
            data-testid="remote-owner-chip"
          >
            <lucide-angular
              [img]="LockIcon"
              class="h-3 w-3 shrink-0"
              aria-hidden="true"
            />
            <span class="ptah-badge-text">Driver: {{ holder() }}</span>
          </span>
        } @else if (freed()) {
          <span
            ptahBadge
            appearance="outline"
            size="sm"
            data-testid="remote-owner-chip"
            >Idle</span
          >
        }
        @if (syncState(); as sync) {
          <ptah-session-sync-chip [state]="sync" />
        }
        @if (view()?.watchOnly) {
          <button
            type="button"
            ptahButton
            data-testid="remote-refresh"
            [disabled]="!connected()"
            (click)="refresh()"
          >
            <lucide-angular
              [img]="RefreshIcon"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            />
            Refresh
          </button>
        }
        <button
          type="button"
          ptahButton
          data-testid="remote-stop"
          [disabled]="!canStop()"
          [attr.aria-describedby]="view()?.watchOnly ? reasonId : null"
          (click)="stop()"
        >
          <lucide-angular
            [img]="StopIcon"
            class="h-3.5 w-3.5"
            aria-hidden="true"
          />
          Stop
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-4">
      @if (banner(); as b) {
        <div
          class="flex flex-col gap-1 rounded-box border px-4 py-3 text-sm"
          [class.border-state-run]="b.tone === 'run'"
          [class.border-state-need]="b.tone === 'need'"
          [class.border-state-err]="b.tone === 'err'"
          [class.border-state-done]="b.tone === 'done'"
          [attr.role]="b.role"
          [id]="reasonId"
          data-testid="remote-watch-banner"
          [attr.data-tone]="b.tone"
        >
          <span class="flex items-start justify-between gap-2">
            <span class="font-bold text-base-content">{{ b.label }}</span>
            @if (b.tone === 'done') {
              <button
                type="button"
                ptahButton
                variant="ghost"
                size="xs"
                data-testid="remote-freed-close"
                (click)="freed.set(null)"
              >
                Close
              </button>
            }
          </span>
          @for (line of b.lines; track $index; let first = $first) {
            <span
              [class.text-base-content]="first"
              [class.text-xs]="!first"
              [class.text-base-content-muted]="!first"
              >{{ line }}</span
            >
          }
          @if (b.command; as command) {
            <code
              class="w-fit max-w-full overflow-x-auto whitespace-pre rounded-md border border-surface-border bg-base-100 px-2 py-1 font-mono text-xs text-base-content"
              data-testid="remote-watch-command"
              >{{ command }}</code
            >
          }
          @if (b.code; as code) {
            <span
              class="font-mono text-xs text-base-content-muted"
              data-testid="remote-watch-code"
              >{{ code }}</span
            >
          }
        </div>
      }

      @if (stale()) {
        <p
          class="rounded-box border border-state-need px-4 py-2 text-sm text-base-content"
          role="status"
          data-testid="remote-stale"
        >
          {{ machineName() }} is not connected. This is the last known state;
          the session keeps running there.
        </p>
      }

      @if (replay(); as summary) {
        <ptah-reconnect-banner
          [summary]="summary"
          (dismissed)="dismissReplay()"
        />
      }

      @if (errorText(); as text) {
        <p
          class="rounded-box border border-state-err px-4 py-2 text-sm text-base-content"
          role="alert"
          data-testid="remote-error"
        >
          {{ text }}
        </p>
      }

      @if (linkNotice(); as notice) {
        <p
          class="text-xs text-base-content-muted"
          role="status"
          data-testid="remote-file-notice"
        >
          {{ notice }}
        </p>
      }

      @if (snapshotLabel(); as label) {
        <p
          class="text-xs text-base-content-muted"
          data-testid="remote-snapshot-label"
        >
          {{ label }}
        </p>
      }

      <ptah-remote-session-pane
        [machineId]="machineId()"
        [sessionId]="sessionId()"
        [view]="view()"
        [transcript]="transcript()"
        [machineName]="machineName()"
        [sessionTitle]="title()"
        [connected]="connected()"
        [streaming]="turnInFlight()"
        [savedAt]="savedAt()"
        (linkActivated)="onLink($event)"
      />
    </div>

    <ptah-remote-composer
      [machineId]="machineId()"
      [sessionId]="sessionId()"
      [view]="view()"
      [machineName]="machineName()"
      [connected]="connected()"
      [(error)]="actionError"
    />
  `,
})
export class RemoteSessionViewComponent implements IFileLinkOpener {
  private readonly store = inject(MachinesStore);
  private readonly agentStats = inject(AgentStatsService);

  public readonly machineId = input.required<string>();
  public readonly sessionId = input.required<string>();
  /** Display-safe session title, when the list supplied it. */
  public readonly title = input('');
  /** Display-safe workspace path, when known. */
  public readonly workspacePath = input('');

  protected readonly reasonId = REASON_ID;
  protected readonly LockIcon = Lock;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly StopIcon = Square;

  /** The last send or stop failure, shown by the composer. */
  protected readonly actionError = signal<string | null>(null);
  protected readonly announcement = signal('');
  protected readonly linkNotice = signal<string | null>(null);
  protected readonly freed = signal<WatchOnlyBanner | null>(null);
  private readonly replayFrom = signal<number | null>(null);

  protected readonly view = computed<RemoteSessionView | null>(() =>
    this.store.sessionView(this.machineId(), this.sessionId())(),
  );
  private readonly machine = computed(() =>
    this.store.machine(this.machineId())(),
  );
  protected readonly machineName = computed(() => {
    const machine = this.machine();
    if (machine === null) return 'the machine';
    return displayText(machine.displayName) || displayText(machine.alias);
  });
  protected readonly connected = computed(
    () => this.machine()?.state === 'connected',
  );
  protected readonly stale = computed(() => this.view()?.stale ?? false);
  protected readonly holder = computed(() =>
    displayText(this.view()?.drivenBy),
  );
  protected readonly turnInFlight = computed(
    () => (this.view()?.turnId ?? null) !== null,
  );
  protected readonly syncState = computed(() =>
    this.connected() ? sessionSyncState(this.view()) : null,
  );

  private readonly events = computed(
    () => this.view()?.events ?? EMPTY_TRANSCRIPT_EVENTS,
  );
  protected readonly transcript = computed(() =>
    buildRemoteTranscript(this.events(), this.agentStats),
  );

  /** Local time of the newest saved event, for 4.9 labels. */
  protected readonly savedAt = computed(() => {
    let newest = 0;
    for (const event of this.events()) {
      if (Number.isFinite(event.timestamp) && event.timestamp > newest) {
        newest = event.timestamp;
      }
    }
    return newest > 0 ? clockTime(newest) : null;
  });

  protected readonly banner = computed<WatchOnlyBanner | null>(() => {
    const view = this.view();
    if (view === null) return this.freed();
    if (view.lockUnavailable) return lockUnavailableBanner(this.machineName());
    if (view.watchOnly) {
      return view.drivenBy
        ? drivenElsewhereBanner(
            this.holder(),
            this.machineName(),
            this.sessionId(),
            this.savedAt(),
          )
        : null;
    }
    return this.freed();
  });

  protected readonly snapshotLabel = computed(() => {
    const view = this.view();
    if (view === null || this.transcript().length === 0) return null;
    if (view.lockUnavailable) {
      const at = this.savedAt();
      return at
        ? `Cached from ${at}, may be out of date`
        : 'Cached, may be out of date';
    }
    if (view.mode === 'snapshot') return 'Showing the last saved state';
    return null;
  });

  protected readonly errorText = computed(() => {
    const error = this.view()?.error ?? null;
    // 9c has its own banner; its error text is not repeated.
    if (error === null || this.view()?.lockUnavailable) return null;
    return errorSentence(error);
  });

  protected readonly canStop = computed(() => {
    const view = this.view();
    return (
      view !== null &&
      !view.watchOnly &&
      this.connected() &&
      this.turnInFlight()
    );
  });

  protected readonly replay = computed<ReplaySummary | null>(() => {
    const from = this.replayFrom();
    const view = this.view();
    return from === null || view === null ? null : replaySummary(from, view);
  });

  private announcedTurn: string | null = null;
  private lastBannerAnnouncement = '';
  private wasWatchOnly = false;
  private lastHolder: string | null = null;
  private wasConnected: boolean | null = null;

  public constructor() {
    // Attach on open and on a new session; detach on leaving.
    effect((onCleanup) => {
      const machineId = this.machineId();
      const sessionId = this.sessionId();
      untracked(() => {
        this.resetForSession();
        void this.store.openSession(machineId, sessionId);
      });
      onCleanup(() => void this.store.closeSession(machineId, sessionId));
    });

    // Announcements and the 9d transition, once per change.
    effect(() => {
      const view = this.view();
      const banner = this.banner();
      const holder = this.holder();
      untracked(() => {
        if (view === null) return;
        const turnId = view.turnId;
        if (turnId !== null && turnId !== this.announcedTurn) {
          this.announcedTurn = turnId;
          this.announce('Claude is responding');
        }
        if (view.watchOnly) {
          this.wasWatchOnly = true;
          if (view.drivenBy) this.lastHolder = holder;
          if (this.freed() !== null) this.freed.set(null);
        } else if (this.wasWatchOnly && view.mode === 'log') {
          this.wasWatchOnly = false;
          // 9d is about a holder that finished; other re-checks say nothing.
          this.freed.set(
            this.lastHolder !== null ? lockFreedBanner(this.lastHolder) : null,
          );
          this.lastHolder = null;
        }
        const next = banner?.announcement ?? '';
        if (next !== '' && next !== this.lastBannerAnnouncement) {
          this.announce(next);
        }
        this.lastBannerAnnouncement = next;
      });
    });

    // 4.8: remember where the view stood when the machine came back.
    effect(() => {
      const connected = this.connected();
      untracked(() => {
        const view = this.view();
        if (this.wasConnected === false && connected && view?.mode === 'log') {
          this.replayFrom.set(view.last);
        }
        this.wasConnected = connected;
      });
    });
  }

  /** {@link IFileLinkOpener}: a remote path is never opened on this machine. */
  public open(request: FileLinkOpenRequest): Promise<void> {
    this.linkNotice.set(
      `${displayText(request.path, 200)} is on ${this.machineName()}. Open it there.`,
    );
    return Promise.resolve();
  }

  /** A link in remote content: never followed; the notice names its real target. */
  protected onLink(link: RemoteLinkActivation): void {
    if (link.kind === 'file') {
      void this.open({ path: link.target });
      return;
    }
    this.linkNotice.set(
      `Links from ${this.machineName()} do not open here. This one points to ${displayText(link.target, 200)}.`,
    );
  }

  protected onWindowFocus(): void {
    // 9d: freedom is learned on focus while a watch-only session is open.
    if (this.view()?.watchOnly && this.connected()) void this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.announce('Checking');
    await this.store.openSession(this.machineId(), this.sessionId());
  }

  protected dismissReplay(): void {
    this.replayFrom.set(null);
  }

  protected async stop(): Promise<void> {
    if (!this.canStop()) return;
    const outcome = await this.store.stopSession(
      this.machineId(),
      this.sessionId(),
    );
    if (!outcome.ok) {
      this.actionError.set(outcomeSentence(outcome, this.machineName()));
    }
  }

  private announce(text: string): void {
    this.announcement.set(text);
  }

  private resetForSession(): void {
    this.actionError.set(null);
    this.linkNotice.set(null);
    this.freed.set(null);
    this.replayFrom.set(null);
    this.announcedTurn = null;
    this.lastBannerAnnouncement = '';
    this.wasWatchOnly = false;
    this.lastHolder = null;
    this.wasConnected = null;
  }
}

function clockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour12: false });
}
