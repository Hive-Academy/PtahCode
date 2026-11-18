import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { AlertTriangle, Info, LucideAngularModule } from 'lucide-angular';
import { ClaudeRpcService, WorkspaceScopeService } from '@ptah-extension/core';
import type {
  DiagnosticsGoVetConsentGetResult,
  DiagnosticsGoVetConsentSetError,
  GoVetConsentStaleReasonDto,
} from '@ptah-extension/shared';
import { SettingsSectionStateComponent } from '../shared/settings-section-state.component';
import { SearchVoiceSummaryStore } from './search-voice-summary.store';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import {
  NativePopoverComponent,
  PtahButtonDirective,
  PtahToggleDirective,
  PtahFormSectionComponent,
  PtahSettingRowComponent,
  PtahDescriptionListComponent,
  PtahDescriptionItemComponent,
  PtahStatusComponent,
  PtahInlineConfirmComponent,
} from '@ptah-extension/ui';

/** Why a stored consent no longer holds (User Decision 25), in the user's words. */
const STALE_REASON_TEXT: Record<GoVetConsentStaleReasonDto, string> = {
  'root-moved': 'the workspace folder now points to a different location',
  'root-replaced':
    'the workspace folder was replaced (deleted and re-created, or re-cloned)',
  'go-changed': 'the Go toolchain changed since consent was given',
};

/** One fixed message per SET refusal (O2 §3); no host text reaches the UI. */
const SET_ERROR_TEXT: Record<DiagnosticsGoVetConsentSetError, string> = {
  'invalid-params': 'The request was rejected as malformed. Nothing changed.',
  unsupported: 'This app cannot store per-workspace consent. Nothing changed.',
  'no-workspace': 'No workspace folder is open. Nothing changed.',
  'workspace-changed':
    'The active workspace changed before the change was saved. Nothing changed; the card now shows the current workspace.',
  'go-changed':
    'The Go toolchain changed after this card was shown. Nothing changed; review the toolchain now shown and enable again.',
  'no-go-binary':
    'No Go toolchain was found on PATH outside this workspace. Nothing changed.',
  'persist-failed':
    'The change could not be saved and verified. The card shows what is stored now.',
};

const TRANSPORT_SET_ERROR =
  'Could not reach the app host. The card shows what is stored now.';
const LOAD_ERROR = 'Could not read the go vet setting for this workspace.';

/**
 * "Run `go vet` for this workspace" (TASK_2026_559 Batch 37b2, O2 §5.1).
 *
 * Electron-only card (mounted inside `@if (isElectron)`; the host capability
 * `goVetDiagnostics` is off on VS Code). Reads consent through
 * `diagnostics:go-vet-consent-get` on init and on every `scopeKey()` change,
 * discarding a response whose scope or request has been superseded. Enabling
 * opens an explicit confirmation that names the exact workspace root; the SET
 * carries that displayed root as `workspaceRoot` so the host can refuse a
 * stale view (`workspace-changed`). The toggle is optimistic and reverts on any
 * failure; every failure also re-reads the host state. The on/off result and
 * every SET failure are announced through the page toast; only the load
 * failure stays in the card. A `stale` consent
 * (folder moved or replaced, Go binary changed) is shown with its reason and is
 * never shown as on. Renders nothing while support is unknown or when the host
 * answers `supported: false`.
 */
@Component({
  selector: 'ptah-go-vet-consent-config',
  standalone: true,
  imports: [
    LucideAngularModule,
    NativePopoverComponent,
    PtahButtonDirective,
    PtahToggleDirective,
    PtahFormSectionComponent,
    PtahSettingRowComponent,
    PtahDescriptionListComponent,
    PtahDescriptionItemComponent,
    PtahStatusComponent,
    PtahInlineConfirmComponent,
    SettingsSectionStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (visible()) {
      <!-- P2 section card (pattern map V26-V29). -->
      <section
        data-glass-surface="content"
        class="border-b border-surface-border"
        data-testid="go-vet-consent-card"
      >
        <ptah-form-section
          id="go-vet-consent-title"
          tabindex="-1"
          heading="go vet checks"
          description="Let agents run go vet in Go workspaces to find problems before they edit."
          level="2"
          wide
        >
          <span aside data-testid="go-vet-consent-state"
            ><ptah-status
              [status]="
                badgeView() === 'on'
                  ? 'online'
                  : badgeView() === 'stale'
                    ? 'warning'
                    : badgeView() === 'pending'
                      ? 'pending'
                      : 'offline'
              "
              [label]="badgeLabel()"
          /></span>
          <ptah-setting-row
            label="Allow go vet in this workspace"
            hint="Ptah asks again when the folder or the Go binary changes."
            controlId="go-vet-consent-toggle"
          >
            <ptah-native-popover
              meta
              [isOpen]="whatRunsOpen()"
              [keepInViewport]="true"
              (closed)="whatRunsOpen.set(false)"
            >
              <button trigger ptahButton variant="ghost" size="sm"
                [attr.aria-expanded]="whatRunsOpen()"
                (click)="whatRunsOpen.set(!whatRunsOpen())">
                <lucide-angular [img]="InfoIcon" size="16" aria-hidden="true" />
                What runs
              </button>
              <p content class="max-w-prose p-ptah-controls text-sm text-base-content-muted">
                When on, Ptah's diagnostics tools run your installed Go toolchain
                (<span class="font-mono">go vet</span>) on the Go packages they are asked to check. It
                reads the module source and module cache and writes the build cache.
                It does not run go:generate, tests, build scripts, custom vet tools,
                downloaded toolchains, network fetches, git or C compilers. Turning
                this on authorises that run for this folder only; it is not a
                sandbox. Consent ends when the folder moves or is replaced, or when
                the Go binary changes.
              </p>
            </ptah-native-popover>
            <label data-testid="go-vet-consent-toggle-target">
              <input
                #toggle
                id="go-vet-consent-toggle"
                type="checkbox"
                ptahToggle
                size="sm"
                [checked]="toggleChecked()"
                [attr.aria-checked]="toggleChecked()"
                [disabled]="toggleDisabled()"
                aria-describedby="go-vet-consent-status"
                (change)="onToggle($event)"
                data-testid="go-vet-consent-toggle"
              />
            </label>
          </ptah-setting-row>
          <ptah-description-list
            ariaLabel="go vet consent details"
            data-testid="go-vet-consent-table"
          >
            @if (consent(); as c) {
              <div ptahDescriptionItem term="Workspace">
                <span
                  class="font-mono break-all"
                  data-testid="go-vet-consent-root"
                  >{{
                    c.workspace?.root ?? 'No workspace folder is open'
                  }}</span
                >
              </div>
              <div ptahDescriptionItem term="Go binary">
                <span
                  class="font-mono break-all"
                  data-testid="go-vet-consent-binary"
                  >{{ c.goBinary ?? 'none found on PATH' }}</span
                >
              </div>
            }
          </ptah-description-list>

          @if (loading()) {
            <div data-testid="go-vet-consent-loading">
              <ptah-settings-section-state
                state="loading"
                [skeletonLines]="1"
              />
            </div>
          }
          <div id="go-vet-consent-status" aria-live="polite" class="mt-1">
            <!-- V29: the stale reason is safety-relevant, so it stays in the
                 card rather than only in a toast. -->
            @if (staleText(); as reason) {
              <p
                class="flex items-start gap-1 text-xs text-base-content"
                data-testid="go-vet-consent-stale"
              >
                <lucide-angular
                  [img]="AlertTriangleIcon"
                  class="w-3.5 h-3.5 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <span>
                  Consent is out of date: {{ reason }}. go vet does not run
                  until you turn it on again.
                </span>
              </p>
            }
          </div>

          @if (errorMessage(); as message) {
            <ptah-settings-section-state
              state="error"
              [errorText]="message"
              errorTestId="go-vet-consent-error"
              (retry)="load()"
            />
          }

          @if (confirmingRoot(); as root) {
            <div
              role="group"
              aria-labelledby="go-vet-confirm-title"
              aria-describedby="go-vet-confirm-root"
              data-testid="go-vet-consent-confirm"
              (keydown.escape)="cancelEnable($event)"
            >
              <ptah-inline-confirm
                id="go-vet-confirm-title"
                message="Allow go vet to run in this folder?"
                ariaLabel="Allow go vet to run in this folder?"
                confirmLabel="Allow go vet"
                confirmTestId="go-vet-consent-allow"
                cancelTestId="go-vet-consent-cancel"
                (confirm)="confirmEnable()"
                (cancelled)="cancelEnable()"
              />
              <span
                id="go-vet-confirm-root"
                class="block font-mono text-xs text-base-content-muted"
                data-testid="go-vet-consent-confirm-root"
                >{{ root }}</span
              >
            </div>
          }
        </ptah-form-section>
      </section>
    }
  `,
  styles: `
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 0 1.25rem;
    }
  `,
})
export class GoVetConsentConfigComponent {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly scope = inject(WorkspaceScopeService);
  private readonly injector = inject(Injector);
  private readonly feedback = inject(SettingsSaveFeedbackService);

  private readonly summary = inject(SearchVoiceSummaryStore, { optional: true });

  readonly whatRunsOpen = signal(false);
  readonly InfoIcon = Info;
  readonly AlertTriangleIcon = AlertTriangle;

  /** Last applied GET answer; `null` until the first one arrives. */
  readonly consent = signal<DiagnosticsGoVetConsentGetResult | null>(null);
  /** At least one GET has settled (answer or failure). */
  readonly settled = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  /** Root named in the open enable confirmation, or `null` when closed. */
  readonly confirmingRoot = signal<string | null>(null);
  /** The GET `confirmToken` captured when the confirmation opened. */
  private confirmingToken: string | undefined;
  /** Toggle position while a SET is in flight; `null` shows the host state. */
  readonly optimisticEnabled = signal<boolean | null>(null);
  /** The load failure only; on/off results and SET failures go to the page toast. */
  readonly errorMessage = signal<string | null>(null);

  private readonly toggleRef =
    viewChild<ElementRef<HTMLInputElement>>('toggle');

  /** Hidden while support is unknown and when the host answers unsupported. */
  readonly visible = computed(
    () => this.settled() && this.consent()?.supported !== false,
  );
  /**
   * What the badge shows. While the enable confirmation is open or a SET is in
   * flight the switch shows the pending choice, so the badge says "pending"
   * too instead of the committed state (the two must never disagree).
   */
  readonly badgeView = computed<'on' | 'off' | 'stale' | 'pending'>(() =>
    this.confirmingRoot() !== null || this.saving()
      ? 'pending'
      : (this.consent()?.state ?? 'off'),
  );
  readonly badgeLabel = computed(() => {
    switch (this.badgeView()) {
      case 'on':
        return 'On';
      case 'stale':
        return 'Stale';
      case 'pending':
        return 'Pending';
      default:
        return 'Off';
    }
  });
  readonly staleText = computed(() => {
    const c = this.consent();
    if (c?.state !== 'stale') return null;
    return c.staleReason
      ? STALE_REASON_TEXT[c.staleReason]
      : 'the stored consent no longer matches this folder';
  });
  readonly toggleChecked = computed(
    () =>
      this.optimisticEnabled() ??
      (this.confirmingRoot() !== null || this.consent()?.state === 'on'),
  );
  readonly toggleDisabled = computed(
    () =>
      this.loading() ||
      this.saving() ||
      !this.consent()?.supported ||
      !this.consent()?.workspace,
  );

  private getSeq = 0;

  constructor() {
    effect(() => {
      if (!this.visible()) {
        this.summary?.clear('go-vet');
        return;
      }
      const state = this.badgeView();
      this.summary?.report('go-vet', {
        value: this.badgeLabel(),
        meta: state === 'on' ? 'Runs in this workspace'
          : state === 'stale' ? 'Consent is out of date'
            : state === 'pending' ? 'Saving' : 'Asks before it runs',
        tone: state === 'on' ? 'ok' : state === 'stale' ? 'warn'
          : state === 'pending' ? 'info' : 'idle',
      });
    });
    effect(() => {
      this.scope.scopeKey();
      untracked(() => {
        // A new workspace: nothing shown for the previous one still applies.
        this.confirmingRoot.set(null);
        this.errorMessage.set(null);
        void this.load();
      });
    });
  }

  /** GET; applied only if no newer GET started and the scope is unchanged. */
  async load(): Promise<void> {
    this.errorMessage.set(null);
    const seq = ++this.getSeq;
    const key = this.scope.scopeKey();
    const isCurrent = (): boolean =>
      seq === this.getSeq && key === this.scope.scopeKey();
    this.loading.set(true);
    try {
      const result = await this.rpc.call(
        'diagnostics:go-vet-consent-get',
        {} as Record<string, never>,
      );
      if (!isCurrent()) return;
      if (result.isSuccess()) {
        this.consent.set(result.data);
      } else {
        this.consent.set(null);
        this.errorMessage.set(LOAD_ERROR);
      }
    } catch {
      // The RPC layer resolves failures as results; a throw is a broken
      // transport and gets the same fixed message.
      if (isCurrent()) {
        this.consent.set(null);
        this.errorMessage.set(LOAD_ERROR);
      }
    } finally {
      if (seq === this.getSeq) {
        this.loading.set(false);
        this.settled.set(true);
      }
    }
  }

  onToggle(event: Event): void {
    const wanted = (event.target as HTMLInputElement).checked;
    const root = this.consent()?.workspace?.root;
    if (!root) return;
    if (wanted) {
      this.openConfirm(root);
      return;
    }
    if (this.confirmingRoot() !== null) {
      this.cancelEnable();
      return;
    }
    void this.submit(false, root);
  }

  confirmEnable(): void {
    const root = this.confirmingRoot();
    if (!root) return;
    // The identity of the root and binary the confirmation displayed.
    const token = this.confirmingToken;
    this.confirmingRoot.set(null);
    this.confirmingToken = undefined;
    this.focusToggle();
    void this.submit(true, root, token);
  }

  /** Cancel and Esc close the confirm; Esc stops here only when it closed it (P8). */
  cancelEnable(event?: Event): void {
    if (this.confirmingRoot() === null) return;
    event?.stopPropagation();
    this.confirmingRoot.set(null);
    this.confirmingToken = undefined;
    this.focusToggle();
  }

  private openConfirm(root: string): void {
    this.errorMessage.set(null);
    this.confirmingToken = this.consent()?.confirmToken;
    this.confirmingRoot.set(root);
  }

  private focusToggle(): void {
    afterNextRender(() => this.toggleRef()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /** SET with the displayed root; success only as the host read it back. */
  private async submit(
    enabled: boolean,
    workspaceRoot: string,
    confirmToken?: string,
  ): Promise<void> {
    const key = this.scope.scopeKey();
    this.errorMessage.set(null);
    this.saving.set(true);
    this.optimisticEnabled.set(enabled);
    try {
      const result = await this.rpc.call('diagnostics:go-vet-consent-set', {
        enabled,
        workspaceRoot,
        ...(confirmToken !== undefined ? { confirmToken } : {}),
        source: 'settings-ui',
      });
      // A workspace switch already triggered a fresh GET for the new scope.
      if (key !== this.scope.scopeKey()) return;
      if (!result.isSuccess()) {
        this.fail(TRANSPORT_SET_ERROR);
        return;
      }
      const answer = result.data;
      if (!answer.success) {
        this.fail(SET_ERROR_TEXT[answer.error] ?? TRANSPORT_SET_ERROR);
        return;
      }
      this.applyReadBack(answer.state, answer.goBinary);
    } catch {
      if (key === this.scope.scopeKey()) this.fail(TRANSPORT_SET_ERROR);
    } finally {
      this.optimisticEnabled.set(null);
      this.saving.set(false);
    }
  }

  /** Revert (by dropping the optimistic value) and re-read the host state. */
  private fail(message: string): void {
    this.optimisticEnabled.set(null);
    this.feedback.announce(message, 'alert');
    void this.load();
  }

  private applyReadBack(state: 'on' | 'off', committedBinary?: string): void {
    const current = this.consent();
    if (current) {
      // An enable shows the binary the host committed, not the one on screen.
      const goBinary = committedBinary ?? current.goBinary;
      this.consent.set({
        supported: current.supported,
        workspace: current.workspace,
        state,
        ...(goBinary !== undefined ? { goBinary } : {}),
        ...(current.confirmToken !== undefined
          ? { confirmToken: current.confirmToken }
          : {}),
      });
    }
    this.feedback.announce(
      state === 'on'
        ? 'go vet is on for this workspace.'
        : 'go vet is off for this workspace.',
      'status',
    );
  }
}
