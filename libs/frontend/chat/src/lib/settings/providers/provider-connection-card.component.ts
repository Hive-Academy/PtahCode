import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  ElementRef,
  signal,
  viewChild,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  type OutputEmitterRef,
} from '@angular/core';
import { LucideAngularModule, AlertTriangle } from 'lucide-angular';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  SurfaceCardComponent,
} from '@ptah-extension/ui';
import type {
  ConnectionCheckRecord,
  SettingScope,
} from '@ptah-extension/shared';
import {
  SettingScopeRowComponent,
  type SettingScopeDisplay,
} from './setting-scope-row.component';
import {
  applyRecordedCheck,
  authModalityBadge,
  authModalityLabel,
  connectionAvatarTone,
  connectionCardSpine,
  connectionCardTone,
  connectionInitials,
  connectionStateCopy,
  connectionStateDot,
  connectionStateLabel,
  KEY_UNREADABLE_TEXT,
  primaryConnectionAction,
  resolveConnectionState,
  type ConnectionCardAction,
  type ProviderConnectionCardStatus,
  type ResolvedConnectionState,
} from './provider-connection-card.state';

interface InlineAction {
  readonly label: string;
  readonly testId: string;
  readonly ariaLabel: string;
  readonly emit: OutputEmitterRef<void>;
}

/**
 * Compact connection card on `ptah-surface-card` (≤ 80 px; plan :627-636, design-spec §3.3, prototype `.conn-card`).
 *
 * - A full-surface native button opens the connection drawer. Inline controls are siblings of that
 *   button so they remain independent keyboard and pointer targets.
 * - One list row: avatar; name over provenance, "Used by N" and the consumer names (`usedByLabels`); then
 *   the status dot and label, at most ONE inline repair action (the state's primary,
 *   `primaryConnectionAction`) and the auth-modality badge on the right. There is no
 *   "Use for main agent" on the face (prototype, Gate V 28): the Main Agent popover changes the main agent.
 * - Every other per-state action lives in the drawer. The state table's one-line copy is the card's
 *   accessible name (with its status) and its tooltip; the drawer's Overview repeats it.
 * - A status that is not a confirmed success is never Connected; colour sits on the dot, avatar,
 *   spine and badges only, text stays `text-base-content` (D13, deviation 6).
 *
 * Every input and output of the pre-compact card is kept. `changeMainProviderRequested`,
 * `manageRequested`, `editConnectionRequested`, `installInstructionsRequested` and
 * `scopeOverrideRequested` are no longer emitted: their actions are in the drawer or on the page
 * (see `batch-24-report.md`, "old card action → new place").
 */
@Component({
  selector: 'ptah-provider-connection-card',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    LucideAngularModule,
    SurfaceCardComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    SettingScopeRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 self-start' },
  styles: `
    ptah-surface-card {
      --ptah-card-padding-sm: var(--ptah-space-2);
    }
    .connection-face {
      display: grid;
      grid-template-columns: auto minmax(7rem, 1fr) minmax(0, auto);
      column-gap: var(--ptah-gap-inline);
      row-gap: 0;
    }
    .connection-provenance > span:not([data-testid='used-by-segment']),
    .connection-provenance [data-testid='card-subtitle'] {
      display: inline;
    }
    .connection-face > div:first-of-type {
      display: contents;
    }
    .connection-face [data-testid='provider-name'] {
      grid-column: 2;
      grid-row: 1;
    }
    .connection-face > span {
      grid-row: 1 / 3;
    }
    .connection-face > div:last-child {
      grid-column: 3;
      grid-row: 1;
    }
    .connection-face
      > div:last-child
      button[data-ptah-button]:is(.btn, #ptah-button) {
      height: var(--ptah-control-h-xs);
      min-height: var(--ptah-control-h-xs);
      padding-block: 0;
    }
    .connection-provenance {
      grid-column: 2 / -1;
      grid-row: 2;
      white-space: normal;
      overflow-wrap: normal;
    }
    .connection-provenance [data-testid='card-subtitle'] {
      overflow: visible;
      white-space: normal;
      text-overflow: clip;
      -webkit-line-clamp: unset;
    }
  `,
  template: `
    <ptah-surface-card
      class="block [&>div]:hover:bg-base-200/70 [&>div]:hover:border-base-content/20"
      density="compact"
      [tone]="cardTone()"
      [spine]="cardSpine()"
      [attr.title]="keyUnreadable() ? keyUnreadableText : statusCopy()"
      [attr.data-state]="resolvedState()"
      data-testid="provider-connection-card"
    >
      <button
        type="button"
        class="absolute inset-0 z-0 w-full cursor-pointer rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-base-content"
        [attr.aria-label]="cardAriaLabel()"
        [attr.title]="triggerTitle()"
        (click)="detailsRequested.emit()"
        data-testid="provider-card-details-trigger"
      ></button>
      <div
        class="connection-face pointer-events-none relative z-10 min-h-[40px] items-center"
      >
        <span
          [class]="avatarClass()"
          aria-hidden="true"
          data-testid="card-avatar"
          >{{ initials() }}</span
        >
        <!-- The name keeps at least 7rem (a long status once squeezed it to one letter per line);
             the status shrinks instead and wraps its own chips, so the card keeps its height. -->
        <div class="min-w-[7rem] flex-1 basis-0">
          <p
            class="break-words text-sm font-semibold leading-snug text-base-content"
            data-testid="provider-name"
          >
            {{ displayName() }}
          </p>
          <!-- Usage wraps into the available column width, capped at two lines.
               The full text is added to hover titles only when measurement finds overflow. -->
          <div
            class="connection-provenance min-w-0 text-xs leading-snug text-base-content-muted"
          >
            <ng-template #provenanceSubtitle>
              @if (subtitle(); as text) {
                <span
                  class="block min-w-0 truncate text-xs leading-snug text-base-content-muted"
                  [attr.title]="text"
                  data-testid="card-subtitle"
                  >{{ text }}</span
                >
              }
            </ng-template>
            @if (usedByCount() !== null) {
              <span
                class="min-w-0 max-w-full line-clamp-2 break-words text-xs text-base-content-muted"
                #usage
                data-testid="used-by-segment"
              >
                <ng-container [ngTemplateOutlet]="provenanceSubtitle" />
                @if (subtitle()) {
                  <span aria-hidden="true">&#32;&#183;&#160;</span>
                }
                <span data-testid="used-by-count"
                  >Used by {{ usedByCount() }}</span
                >
                @if (usedByLabels().length) {
                  <span aria-hidden="true">&#32;&#183;&#160;</span>
                  <span
                    [attr.title]="usageOverflows() ? usedForText() : null"
                    data-testid="used-for"
                    >Used for: {{ usedForText() }}</span
                  >
                }
              </span>
            } @else {
              <ng-container [ngTemplateOutlet]="provenanceSubtitle" />
            }
          </div>
        </div>
        <div
          class="flex min-w-0 flex-wrap items-center justify-end gap-ptah-inline text-xs"
        >
          <span
            class="flex items-center gap-ptah-inline font-medium text-base-content"
            data-testid="status-badge"
          >
            @if (isBlockedMain()) {
              <lucide-angular
                [img]="AlertTriangleIcon"
                class="h-3.5 w-3.5"
                aria-hidden="true"
              />
              <span data-testid="blocked-main-badge"
                >Main agent · Needs attention ·</span
              >
            } @else if (keyUnreadable()) {
              <lucide-angular
                [img]="AlertTriangleIcon"
                class="h-3.5 w-3.5 shrink-0 text-warning"
                aria-hidden="true"
              />
            } @else {
              <span
                [class]="'h-2 w-2 shrink-0 rounded-full ' + dotClass()"
                aria-hidden="true"
              ></span>
            }
            @if (keyUnreadable()) {
              <span data-testid="card-key-unreadable">{{
                keyUnreadableText
              }}</span>
            } @else {
              <span data-testid="status-copy">{{ statusLabel() }}</span>
            }
          </span>
          @if (keyUnreadable()) {
            <!-- M-6: the key's state is unknown, so the repair is a re-read, never "Add API key". -->
            <button
              type="button"
              ptahButton
              variant="ghost"
              [class]="inlineActionClass"
              [attr.aria-label]="
                'Retry reading the stored key for ' + displayName()
              "
              (click)="keyRetryRequested.emit()"
              data-testid="card-key-unreadable-retry"
            >
              Retry
            </button>
          } @else if (inlineAction(); as action) {
            <button
              type="button"
              ptahButton
              variant="ghost"
              [class]="inlineActionClass"
              [attr.aria-label]="action.ariaLabel"
              (click)="action.emit.emit()"
              [attr.data-testid]="action.testId"
            >
              {{ action.label }}
            </button>
          }
          @if (hasScope()) {
            <ptah-setting-scope-row
              class="pointer-events-auto relative z-20"
              [scope]="scope()"
              [hasOverride]="hasOverride()"
              [supportedTargets]="supportedTargets()"
              [workspaceName]="workspaceName()"
              [workspaceCrossApp]="workspaceCrossApp()"
              [fieldName]="displayName()"
              (clearRequested)="scopeClearRequested.emit()"
              (useGlobalRequested)="scopeUseGlobalRequested.emit()"
              (copyGlobalRequested)="scopeCopyGlobalRequested.emit()"
              data-testid="card-scope-wrapper"
            />
          }
          @if (connectedAccounts(); as connected) {
            <span ptahBadge data-testid="connected-accounts-badge"
              >{{ connected }} connected</span
            >
          }
          @if (modalityLabel(); as modality) {
            <span
              ptahBadge
              appearance="outline"
              class="whitespace-nowrap"
              data-testid="auth-modality"
              >{{ modality }}</span
            >
          }
        </div>
      </div>
    </ptah-surface-card>
  `,
})
export class ProviderConnectionCardComponent {
  private readonly usage = viewChild<ElementRef<HTMLElement>>('usage');
  protected readonly usageOverflows = signal(false);

  constructor() {
    afterRenderEffect((cleanup) => {
      this.usedByCount();
      this.usedByLabels();
      const element = this.usage()?.nativeElement;
      const measure = () =>
        this.usageOverflows.set(
          !!element &&
            [element, element.parentElement].some(
              (node) =>
                node &&
                (node.scrollHeight > node.clientHeight ||
                  node.scrollWidth > node.clientWidth),
            ),
        );
      measure();
      if (!element || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      if (element.parentElement) observer.observe(element.parentElement);
      cleanup(() => observer.disconnect());
    });
  }

  protected readonly AlertTriangleIcon = AlertTriangle;
  protected readonly keyUnreadableText = KEY_UNREADABLE_TEXT;
  protected readonly inlineActionClass =
    'pointer-events-auto relative z-20 underline underline-offset-2';

  /** Provider registry or connection identifier (e.g. 'anthropic', 'kimi-code', 'claude-cli'). */
  readonly providerId = input<string>('');
  /** Human-readable provider name. Defaults to providerId if empty. */
  readonly providerName = input<string>('');
  /** Auth modality identifier (e.g. 'api-key', 'cli', 'oauth', 'local-native'). */
  readonly authModality = input<string | null>(null);
  /** Preformatted auth modality label; overrides the derived label when set. */
  readonly authModalityText = input<string | null>(null);
  /** Reported or candidate status of this connection. */
  readonly status = input<ProviderConnectionCardStatus>('not-configured');
  /** Explicit probe evidence: required for Connected / Active; `false` downgrades to Not checked. */
  readonly positiveProbeEvidence = input<boolean | null>(null);
  /** This provider route is selected for the main agent. */
  readonly isActive = input<boolean>(false);
  /** The active route is blocked and needs the user. */
  readonly isBlocked = input<boolean>(false);
  /** This connection's last recorded check (`route.providers[].lastCheck`); a newer failed one wins (Batch 53.1). */
  readonly lastCheck = input<ConnectionCheckRecord | null>(null);
  /** When the route's own statuses were probed (`route.probedAt`): a failed check older than that does not win. */
  readonly routeProbedAt = input<string | null>(null);
  /** Kept for API stability: the card always opens the drawer; the drawer gates its own edits. */
  readonly canManage = input<boolean>(true);
  /** CLI name used in the not-installed copy (e.g. 'Claude CLI'). */
  readonly cliName = input<string | null>(null);
  /** "Sign-in required" vs "Credential rejected"; derived from `authModality` when null. */
  readonly unauthenticatedVariant = input<
    'sign-in' | 'credential-rejected' | null
  >(null);
  /** Timestamp of the last successful probe (ISO 8601 or formatted string). */
  readonly lastConnectedAt = input<string | null>(null);
  /** Display string for the last connected time (e.g. "2 hours ago"). */
  readonly lastConnectedText = input<string | null>(null);
  /** Display string for the last failed check (e.g. "10 minutes ago"). */
  readonly lastFailedText = input<string | null>(null);
  /** Kept for API stability: the card shows an initials avatar (prototype), not the vendor mark. */
  readonly fallbackMark = input<'Bot' | 'Server' | 'Terminal' | null>(null);
  /** Provenance line under the name (e.g. "Key stored on this machine"). */
  readonly sourceLabel = input<string | null>(null);
  /** Scope of this connection's configuration: a D16 badge when overridden. */
  readonly scope = input<SettingScopeDisplay | null>(null);
  readonly hasOverride = input<boolean>(false);
  readonly supportedTargets = input<readonly SettingScope[]>([]);
  readonly workspaceName = input<string | null>(null);
  readonly workspaceCrossApp = input<boolean>(false);
  /** Consumers using this connection ("Used by N"); null while unknown (hidden, never a guessed 0). */
  readonly usedByCount = input<number | null>(null);
  /**
   * Presentational: the names behind "Used by N" ("Main agent", "Memory curator"). Shown only beside a known
   * `usedByCount` (not null); empty hides "Used for".
   */
  readonly usedByLabels = input<readonly string[]>([]);
  /**
   * Claude CLI only (D41): signed-in named accounts + the existing login when connected. Display only;
   * hidden for `null` (loading, failed or not applicable) and `0`. Never carries a name or other detail.
   */
  readonly connectedAccounts = input<number | null>(null);
  /**
   * The host could not read this connection's stored key (M-6): the card shows "Could not read the stored key."
   * with Retry (`keyRetryRequested`) instead of its state label and action, so it never asks to add a key.
   */
  readonly keyUnreadable = input<boolean>(false);

  // --- Actions ---
  /** The card itself was activated: open this connection's details (the drawer). */
  readonly detailsRequested = output<void>();
  readonly changeMainProviderRequested = output<void>();
  readonly manageRequested = output<void>();
  readonly addKeyRequested = output<void>();
  readonly signInRequested = output<void>();
  readonly replaceKeyRequested = output<void>();
  readonly retryRequested = output<void>();
  readonly editConnectionRequested = output<void>();
  readonly installInstructionsRequested = output<void>();
  readonly checkAgainRequested = output<void>();
  readonly setupRequested = output<void>();
  readonly checkConnectionRequested = output<void>();
  /** Retry on an unreadable stored key: the parent re-reads the connections. */
  readonly keyRetryRequested = output<void>();

  // --- Scope badge intent forwarding ---
  readonly scopeOverrideRequested = output<void>();
  readonly scopeClearRequested = output<void>();
  readonly scopeUseGlobalRequested = output<void>();
  readonly scopeCopyGlobalRequested = output<void>();

  protected readonly displayName = computed(
    () => this.providerName() || this.providerId() || 'Provider',
  );
  protected readonly hasScope = computed(() => this.scope() !== null);
  protected readonly modalityLabel = computed(
    () => this.authModalityText() || authModalityBadge(this.authModality()),
  );
  protected readonly usedForText = computed(() =>
    this.usedByLabels().join(', '),
  );
  protected readonly initials = computed(() =>
    connectionInitials(this.displayName()),
  );
  protected readonly avatarClass = computed(
    () =>
      `flex h-8 w-8 shrink-0 items-center justify-center rounded border text-xs font-bold text-base-content ${connectionAvatarTone(this.providerId() || this.displayName())}`,
  );

  readonly resolvedState = computed<ResolvedConnectionState>(() =>
    applyRecordedCheck(
      resolveConnectionState(
        this.status(),
        this.positiveProbeEvidence(),
        this.isActive(),
        this.isBlocked(),
      ),
      this.lastCheck(),
      this.routeProbedAt(),
    ),
  );

  /** The host cannot check this connection (`unknown`/`skipped`): not checkable is not failed. */
  private readonly uncheckable = computed(
    () => this.status() === 'unknown' || this.status() === 'skipped',
  );

  /** The selected main route, currently blocked or failing. */
  protected readonly isBlockedMain = computed(
    () =>
      (this.isActive() || this.isBlocked()) &&
      this.resolvedState() !== 'active',
  );

  private readonly credentialRejected = computed(() => {
    const variant = this.unauthenticatedVariant();
    if (variant) return variant === 'credential-rejected';
    const modality = this.authModality();
    return modality === 'api-key' || modality === 'apiKey';
  });

  protected readonly cardTone = computed(() =>
    connectionCardTone(this.resolvedState(), this.isBlockedMain()),
  );
  protected readonly cardSpine = computed(() =>
    connectionCardSpine(this.resolvedState(), this.isBlockedMain()),
  );
  protected readonly dotClass = computed(() =>
    connectionStateDot(this.resolvedState()),
  );
  protected readonly statusLabel = computed(() =>
    connectionStateLabel(this.resolvedState(), this.credentialRejected()),
  );
  protected readonly statusCopy = computed(() =>
    connectionStateCopy(
      this.resolvedState(),
      this.displayName(),
      this.cliName() || `${this.displayName()} CLI`,
    ),
  );
  protected readonly cardAriaLabel = computed(() =>
    this.keyUnreadable()
      ? `${this.displayName()}: ${this.isBlockedMain() ? 'main agent needs attention, ' : ''}${KEY_UNREADABLE_TEXT} Open connection details.`
      : `${this.displayName()}: ${this.isBlockedMain() ? 'main agent needs attention, ' : ''}${this.statusLabel()}. ${this.statusCopy()} Open connection details.`,
  );

  /** Provenance line: the stored credential, else the last connected / failed time, else the full modality. */
  protected readonly subtitle = computed(() => {
    const connected = this.lastConnectedText() || this.lastConnectedAt();
    const failed = this.lastFailedText();
    return (
      this.sourceLabel() ||
      (connected
        ? `Last connected ${connected}`
        : failed
          ? `Last check failed ${failed}`
          : null) ||
      authModalityLabel(this.authModality())
    );
  });

  protected readonly triggerTitle = computed(() =>
    [
      this.keyUnreadable() ? this.keyUnreadableText : this.statusCopy(),
      this.subtitle(),
      this.usageOverflows() && this.usedByLabels().length
        ? `Used for: ${this.usedForText()}`
        : null,
    ]
      .filter((part): part is string => part !== null)
      .join('\n'),
  );

  protected readonly inlineAction = computed<InlineAction | null>(() => {
    const action = primaryConnectionAction(this.resolvedState(), {
      uncheckable: this.uncheckable(),
      credentialRejected: this.credentialRejected(),
    });
    return action ? this.describe(action) : null;
  });

  private describe(action: ConnectionCardAction): InlineAction {
    const name = this.displayName();
    switch (action) {
      case 'add-key':
        return {
          label: 'Add API key',
          testId: 'btn-add-key',
          ariaLabel: `Add API key for ${name}`,
          emit: this.addKeyRequested,
        };
      case 'replace-key':
        return {
          label: 'Replace key',
          testId: 'btn-replace-key',
          ariaLabel: `Replace key for ${name}`,
          emit: this.replaceKeyRequested,
        };
      case 'sign-in':
        return {
          label: 'Sign in',
          testId: 'btn-sign-in',
          ariaLabel: `Sign in to ${name}`,
          emit: this.signInRequested,
        };
      case 'retry':
        return {
          label: 'Retry',
          testId: 'btn-retry',
          ariaLabel: `Retry connection to ${name}`,
          emit: this.retryRequested,
        };
      case 'check-again':
        return {
          label: 'Check again',
          testId: 'btn-check-again',
          ariaLabel: `Check again for ${this.cliName() || `${name} CLI`}`,
          emit: this.checkAgainRequested,
        };
      case 'set-up':
        return {
          label: 'Set up',
          testId: 'btn-setup',
          ariaLabel: `Set up ${name}`,
          emit: this.setupRequested,
        };
      case 'check-connection':
        return {
          label: 'Check connection',
          testId: 'btn-check-connection',
          ariaLabel: `Check connection for ${name}`,
          emit: this.checkConnectionRequested,
        };
    }
  }
}
