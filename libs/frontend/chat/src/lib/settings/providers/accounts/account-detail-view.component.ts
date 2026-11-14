import { Clipboard } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { ProviderAccountActionKind } from '@ptah-extension/core';
import {
  PROVIDER_ACCOUNT_DUPLICATE_LABEL_SUMMARY,
  PROVIDER_ACCOUNT_LABEL_MAX_LENGTH,
  type ProviderAccountOperation,
  type ProviderAccountSignInFallback,
  type ProviderAccountState,
  type ProviderAccountSummary,
} from '@ptah-extension/shared';
import {
  NativeModalComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahDescriptionListComponent,
  PtahEditableSectionComponent,
  PtahEditTemplateDirective,
  PtahFieldComponent,
  PtahFormActionsComponent,
  PtahFormSectionComponent,
  PtahIconButtonDirective,
  PtahInputDirective,
  type PtahDescriptionItem,
} from '@ptah-extension/ui';
import { AlertTriangle, Copy, Lock, LucideAngularModule } from 'lucide-angular';
import { SettingsBusyDisabledDirective } from '../../feedback/busy-disabled.directive';
import { SettingsSaveFeedbackService } from '../../feedback/settings-save-feedback.service';
import {
  ACCOUNT_COPY,
  ATTENTION_STATES,
  STATE_LABEL,
  accountInitial,
  validateAccountName,
} from './account-presentation';

/** A name change for one account. */
export interface AccountRenameRequest {
  readonly profileId: string;
  readonly label: string;
}

/** Design capability map "Pending completion instruction": the state word of a pending sign-in. */
const PENDING_WORD = 'Waiting for Claude window';
/** The state word of a pending sign-in that opened no window (the host sent a terminal script instead). */
const PENDING_TERMINAL_WORD = 'Waiting for sign-in: use terminal';

/** Dot ink per state; status is always dot + word. */
const STATE_DOT: Readonly<Record<ProviderAccountState, string>> = {
  'not-signed-in': 'bg-state-idle',
  pending: 'bg-state-run',
  cancelled: 'bg-state-idle',
  failed: 'bg-state-err',
  disconnected: 'bg-state-err',
  'signed-in': 'bg-state-done',
  'signed-out': 'bg-state-idle',
};

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';

const HEADER_ROW_CLASS = 'flex w-full min-w-0 items-start gap-[var(--ptah-gap-heading)]';
/** The attention bar of the header row (failed, disconnected). Spacing from tokens only. */
const ATTENTION_CLASS = 'border-l-4 border-l-state-err pl-[var(--ptah-gap-heading)]';

const LOCK_REASON_ID = 'account-detail-lock-reason';

/**
 * Account detail, one flat panel (TASK_2026_719 plan P6 component 7, design-spec-p6 "Detail"), composed from the
 * pattern layer (TASK_2026_1177_9109 pattern-spec 6.1/6.2): `ptah-form-section` "Sign-in" (commands through
 * `ptah-form-actions`), `ptah-editable-section` "Details" (facts in view mode, the Name field in edit mode) and
 * `ptah-form-section` "Danger zone".
 *
 * Presentational: it renders one authoritative `ProviderAccountSummary` and emits intents; the parent (Accounts tab)
 * writes them, announces every host outcome and owns B-2 focus after a write. This panel announces only the copy
 * result through `SettingsSaveFeedbackService.announce` (P6-A9); a rename validation error shows as the alert of the
 * Details section. Busy controls use `ptahBusyDisabled`, so focus never drops to `body`. Names and scripts are text
 * bindings only.
 */
@Component({
  selector: 'ptah-account-detail-view',
  standalone: true,
  imports: [
    NativeModalComponent,
    LucideAngularModule,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahDescriptionListComponent,
    PtahEditableSectionComponent,
    PtahEditTemplateDirective,
    PtahFieldComponent,
    PtahFormActionsComponent,
    PtahFormSectionComponent,
    PtahIconButtonDirective,
    PtahInputDirective,
    SettingsBusyDisabledDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col gap-[var(--ptah-gap-group)] text-sm text-base-content"
      data-testid="account-detail"
      (focusin)="noteFocus($event)"
    >
      <div class="flex flex-col items-start gap-[var(--ptah-gap-heading)]">
        <button
          type="button"
          ptahButton
          variant="ghost"
          (click)="back.emit()"
          data-testid="account-detail-back"
        >
          <span aria-hidden="true">←</span> Accounts
        </button>
        <div [class]="headerRowClass()">
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-base-300 font-bold"
            aria-hidden="true"
          >{{ initial() }}</span>
          <div class="flex min-w-0 flex-1 flex-col gap-[var(--ptah-gap-label)]">
            <h3
              #heading
              tabindex="-1"
              class="truncate text-[15px] font-semibold outline-none"
              [attr.title]="account().label"
              data-testid="account-detail-heading"
            >{{ account().label }}</h3>
            <div class="flex flex-wrap items-center gap-[var(--ptah-gap-inline)]">
              <span class="flex items-center gap-[var(--ptah-gap-label)]" data-testid="account-detail-state">
                @if (account().state === 'pending') {
                  <span
                    class="inline-block h-3 w-3 shrink-0 loading loading-spinner text-base-content-muted motion-reduce:animate-none"
                    aria-hidden="true"
                  ></span>
                } @else {
                  <span [class]="'inline-block h-2 w-2 shrink-0 rounded-full ' + stateDot()" aria-hidden="true"></span>
                }
                <span>{{ stateWord() }}</span>
              </span>
              @if (account().activeRunCount > 0) {
                <span ptahBadge data-testid="account-detail-runs">{{ account().activeRunCount }} running</span>
              }
              @if (resumeUnavailable()) {
                <span
                  ptahBadge
                  class="gap-[var(--ptah-gap-label)]"
                  [attr.title]="copy.resumeUnavailable"
                  data-testid="account-detail-resume-unavailable"
                >
                  <lucide-angular [img]="AlertTriangleIcon" class="h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
                  <span aria-hidden="true">Cannot resume</span>
                  <span class="sr-only">{{ copy.resumeUnavailable }}</span>
                </span>
              }
            </div>
          </div>
        </div>
      </div>

      <ptah-form-section
        heading="Sign-in"
        description="Connect this account to Claude."
        [level]="4"
        divider
        data-testid="account-detail-sign-in-section"
      >
        <ptah-form-actions label="Sign-in actions">
          @switch (account().state) {
            @case ('signed-in') {
              <button type="button" [class]="'btn btn-outline btn-error btn-sm min-h-8 ' + focusRing" [ptahBusyDisabled]="busyNow()" (click)="act('sign-out')" data-testid="account-detail-sign-out">Sign out</button>
            }
            @case ('pending') {
              <button type="button" ptahButton [busy]="busyNow()" (click)="act('cancel-sign-in')" data-pending-control data-testid="account-detail-cancel-sign-in">Cancel sign-in</button>
            }
            @default {
              <button type="button" ptahButton variant="primary" [busy]="busyNow()" (click)="act('sign-in')" data-testid="account-detail-sign-in">{{ account().state === 'failed' ? 'Try again' : 'Sign in' }}</button>
            }
          }
          <button type="button" ptahButton variant="ghost" [busy]="busyNow()" (click)="act('check-status')" data-testid="account-detail-check-status">Check status</button>
          @if (fallbackShown()) {
            <button
              type="button"
              ptahButton
              variant="ghost"
              [attr.aria-expanded]="terminalOpen()"
              aria-controls="account-detail-terminal"
              (click)="terminalOpen.set(!terminalOpen())"
              data-pending-control
              data-testid="account-detail-terminal-toggle"
            >Use terminal</button>
          }
        </ptah-form-actions>
        @if (fallbackShown(); as f) {
          @if (terminalOpen()) {
            <div
              id="account-detail-terminal"
              class="flex items-start gap-[var(--ptah-gap-controls)]"
              data-testid="account-detail-fallback"
            >
              <pre
                tabindex="0"
                aria-label="Sign-in script"
                data-pending-control
                [class]="'max-h-40 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-box border border-base-content/15 bg-base-100 p-[var(--ptah-gap-controls)] font-mono text-xs text-base-content ' + focusRing"
                data-testid="account-detail-fallback-script"
              >{{ f.script }}</pre>
              <button
                type="button"
                ptahIconButton
                label="Copy script"
                class="shrink-0"
                (click)="copyScript(f.script)"
                data-pending-control
                data-testid="account-detail-copy-script"
              >
                <lucide-angular [img]="CopyIcon" class="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          }
        }
      </ptah-form-section>

      <ptah-editable-section
        heading="Details"
        description="The name shows in the account list."
        [level]="4"
        data-testid="account-detail-details"
        [editing]="editing()"
        [dirty]="edited()"
        [saving]="renaming()"
        [error]="renameError()"
        [disabled]="locked()"
        [disabledReason]="pending() ? copy.signInLocked : null"
        (edit)="startEdit()"
        (save)="submitRename()"
        (cancelEdit)="stopEdit()"
      >
        @if (pending()) {
          <span status class="inline-flex" role="img" [attr.aria-label]="copy.signInLocked" [attr.title]="copy.signInLocked" data-testid="account-detail-locked">
            <lucide-angular [img]="LockIcon" class="h-3.5 w-3.5 text-base-content-muted" aria-hidden="true" />
          </span>
        }
        <ptah-description-list view ariaLabel="Account details" [items]="facts()" data-testid="account-detail-facts" />
        <ng-template ptahEditTemplate>
          <ptah-field label="Name">
            <input
              ptahInput
              id="account-detail-name"
              type="text"
              [value]="draftLabel()"
              (input)="onDraft($event)"
              autocomplete="off"
              [attr.maxlength]="maxLength"
              [ptahBusyDisabled]="locked()"
              [attr.aria-describedby]="pending() ? lockReasonId : null"
              data-testid="account-detail-rename-input"
            />
          </ptah-field>
        </ng-template>
      </ptah-editable-section>

      <ptah-form-section heading="Danger zone" [level]="4" data-testid="account-detail-danger-zone">
        <button
          footer
          #removeButton
          type="button"
          [class]="'btn btn-outline btn-error btn-sm min-h-8 self-start ' + focusRing"
          [ptahBusyDisabled]="locked()"
          [attr.aria-describedby]="pending() ? lockReasonId : null"
          (click)="askRemove()"
          data-testid="account-detail-remove"
        >Remove account</button>
      </ptah-form-section>

      @if (pending()) {
        <span [id]="lockReasonId" class="sr-only">{{ copy.signInLocked }}</span>
      }

      <ptah-native-modal
        [isOpen]="confirmingRemove()"
        ariaLabelledby="account-detail-remove-title"
        size="sm"
        (closed)="cancelRemove()"
      >
        <h3 modal-header id="account-detail-remove-title" class="text-sm font-bold text-base-content">Remove {{ account().label }}?</h3>
        <div modal-footer class="mt-[var(--ptah-gap-group)] flex justify-end gap-[var(--ptah-gap-controls)]">
          <button #removeCancel type="button" ptahButton (click)="cancelRemove()" data-testid="account-detail-remove-cancel">Cancel</button>
          <button type="button" ptahButton variant="danger" [busy]="busyNow()" [disabled]="pending()" (click)="confirmRemove()" data-testid="account-detail-remove-confirm">Remove</button>
        </div>
      </ptah-native-modal>
    </div>
  `,
})
export class AccountDetailViewComponent {
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly clipboard = inject(Clipboard);
  private readonly feedback = inject(SettingsSaveFeedbackService);

  /** The authoritative summary from the latest host snapshot. */
  readonly account = input.required<ProviderAccountSummary>();
  /** Every named account, for the rename uniqueness rule. */
  readonly accounts = input<readonly ProviderAccountSummary[]>([]);
  /** This account's sign-in/out handle; the fallback script belongs to its `sign-in` operation only. */
  readonly operation = input<ProviderAccountOperation | null>(null);
  /** The host's manual sign-in script for this account's pending sign-in. */
  readonly fallback = input<ProviderAccountSignInFallback | null>(null);
  /** The action of this account in flight, if any. */
  readonly busy = input<ProviderAccountActionKind | null>(null);

  readonly back = output<void>();
  readonly signIn = output<string>();
  /** Explicit Cancel only; leaving the view never emits it. */
  readonly cancelSignIn = output<string>();
  readonly signOut = output<string>();
  readonly checkStatus = output<string>();
  readonly rename = output<AccountRenameRequest>();
  /** Emitted only after the confirmation dialog. Nothing is reassigned locally (B-1). */
  readonly remove = output<string>();

  protected readonly copy = ACCOUNT_COPY;
  protected readonly focusRing = FOCUS;
  protected readonly maxLength = PROVIDER_ACCOUNT_LABEL_MAX_LENGTH;
  protected readonly lockReasonId = LOCK_REASON_ID;
  protected readonly AlertTriangleIcon = AlertTriangle;
  protected readonly CopyIcon = Copy;
  protected readonly LockIcon = Lock;

  protected readonly draftLabel = signal('');
  /** The Details section is in edit mode (pattern-spec 6.3: rename is an explicit edit mode). */
  protected readonly editing = signal(false);
  /** The local rename validation error, shown as the alert of the Details section. */
  protected readonly renameError = signal<string | null>(null);
  protected readonly confirmingRemove = signal(false);
  protected readonly terminalOpen = signal(false);

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly removeButton = viewChild<ElementRef<HTMLButtonElement>>('removeButton');
  private readonly removeCancel = viewChild<ElementRef<HTMLButtonElement>>('removeCancel');

  private readonly committedLabel = computed(() => this.account().label);
  protected readonly busyNow = computed(() => this.busy() !== null);
  protected readonly renaming = computed(() => this.busy() === 'rename');
  protected readonly pending = computed(() => this.account().state === 'pending');
  /** A pending sign-in holds name and removal; any action in flight holds everything. */
  protected readonly locked = computed(() => this.busyNow() || this.pending());
  protected readonly initial = computed(() => accountInitial(this.account().label));
  protected readonly headerRowClass = computed(() =>
    ATTENTION_STATES.has(this.account().state) ? `${HEADER_ROW_CLASS} ${ATTENTION_CLASS}` : HEADER_ROW_CLASS,
  );
  protected readonly stateDot = computed(() => STATE_DOT[this.account().state]);
  protected readonly stateWord = computed(() =>
    this.pending()
      ? this.fallbackShown() ? PENDING_TERMINAL_WORD : PENDING_WORD
      : STATE_LABEL[this.account().state],
  );
  protected readonly resumeUnavailable = computed(
    () => this.account().activeRunCount > 0 && this.account().state !== 'signed-in',
  );
  /** The view-mode facts of the Details section. */
  protected readonly facts = computed<readonly PtahDescriptionItem[]>(() => [
    { key: 'name', term: 'Name', value: this.account().label, truncate: true },
    { key: 'state', term: 'Status', value: this.stateWord() },
    { key: 'runs', term: 'Active runs', value: this.account().activeRunCount },
  ]);
  /** The script exists only for this account's pending `sign-in` operation (the service drops it otherwise). */
  protected readonly fallbackShown = computed(() => {
    const fallback = this.fallback();
    return this.pending() &&
      this.operation()?.kind === 'sign-in' &&
      fallback !== null &&
      fallback.script.trim().length > 0
      ? fallback
      : null;
  });
  /** Save is enabled only once the name differs from the committed one (a case-only change counts). */
  protected readonly edited = computed(() => {
    const draft = this.draftLabel().trim();
    return draft.length > 0 && draft !== this.account().label;
  });

  private shownProfileId: string | null = null;
  /** The account and pending flag of the last render, to see a pending sign-in end. */
  private pendingSeen: { readonly profileId: string; readonly pending: boolean } | null = null;
  /** The last element inside this panel that took focus. */
  private lastFocus: Element | null = null;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    // B-2: a push that ends the pending sign-in removes Cancel and the fallback controls. If one of them held focus
    // and focus fell to the body, the heading takes it; focus the user moved elsewhere is left alone.
    effect(() => {
      const profileId = this.account().profileId;
      const pending = this.pending();
      untracked(() => {
        const before = this.pendingSeen;
        this.pendingSeen = { profileId, pending };
        if (before?.profileId === profileId && before.pending && !pending) this.repairPendingFocus();
      });
    });
    // A different account starts closed, in view mode and with its committed name; focus goes to the heading.
    effect(() => {
      const account = this.account();
      untracked(() => {
        if (account.profileId === this.shownProfileId) return;
        this.shownProfileId = account.profileId;
        this.resetDraft(account.label);
        this.confirmingRemove.set(false);
        this.terminalOpen.set(false);
        afterNextRender(() => this.heading().nativeElement.focus(), { injector: this.injector });
      });
    });
    // A committed rename resets the field and closes edit mode; an unrelated snapshot does not touch the draft.
    effect(() => {
      const label = this.committedLabel();
      untracked(() => this.resetDraft(label));
    });
    // The disclosure closes with its script (sign-in finished, cancelled or failed).
    effect(() => {
      if (this.fallbackShown() === null) untracked(() => this.terminalOpen.set(false));
    });
  }

  protected act(action: 'sign-in' | 'cancel-sign-in' | 'sign-out' | 'check-status'): void {
    if (this.busyNow()) return;
    const profileId = this.account().profileId;
    switch (action) {
      case 'sign-in':
        this.signIn.emit(profileId);
        break;
      case 'cancel-sign-in':
        this.cancelSignIn.emit(profileId);
        break;
      case 'sign-out':
        this.signOut.emit(profileId);
        break;
      case 'check-status':
        this.checkStatus.emit(profileId);
        break;
    }
  }

  protected onDraft(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.draftLabel.set(event.target.value);
    this.renameError.set(null);
  }

  /** Edit opens with the committed name. A pending sign-in or an action in flight keeps the view mode. */
  protected startEdit(): void {
    if (this.locked()) return;
    this.draftLabel.set(this.account().label);
    this.renameError.set(null);
    this.editing.set(true);
  }

  /** Cancel, Escape or Discard (the section confirms a dirty draft first). */
  protected stopEdit(): void {
    this.resetDraft(this.account().label);
  }

  /** The value is re-read and re-validated at submit; an invalid name shows as the section alert (D60). */
  protected submitRename(): void {
    if (this.locked() || !this.edited()) return;
    const check = validateAccountName(this.draftLabel(), this.accounts(), this.account().profileId);
    if (!check.ok) {
      if (check.message !== null) {
        this.renameError.set(
          check.message === PROVIDER_ACCOUNT_DUPLICATE_LABEL_SUMMARY ? ACCOUNT_COPY.nameTaken : check.message,
        );
      }
      return;
    }
    this.renameError.set(null);
    this.rename.emit({ profileId: this.account().profileId, label: check.label });
  }

  protected askRemove(): void {
    if (this.locked()) return;
    this.confirmingRemove.set(true);
    afterNextRender(() => this.removeCancel()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Cancel, Escape or the backdrop: only the dialog closes; focus returns to "Remove account". */
  protected cancelRemove(): void {
    if (!this.confirmingRemove()) return;
    this.confirmingRemove.set(false);
    afterNextRender(() => this.removeButton()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Focus after the write belongs to the parent (B-2: `Accounts` heading when this view goes). */
  protected confirmRemove(): void {
    if (this.locked()) return;
    this.confirmingRemove.set(false);
    this.remove.emit(this.account().profileId);
  }

  protected noteFocus(event: FocusEvent): void {
    this.lastFocus = event.target instanceof Element ? event.target : null;
  }

  private resetDraft(label: string): void {
    this.draftLabel.set(label);
    this.renameError.set(null);
    this.editing.set(false);
  }

  /**
   * Runs when this account's sign-in stops being pending. Only a pending control (Cancel, Use terminal, the script or
   * Copy) that still held focus counts; after the next render, if it is gone and focus is on the body, the heading
   * takes focus. Destroyed (navigated away) or focus moved elsewhere: nothing happens.
   */
  private repairPendingFocus(): void {
    const held = this.lastFocus;
    if (!held?.hasAttribute('data-pending-control')) return;
    // The render that removes the control may not have happened yet: then focus must still be on it.
    if (held.isConnected && this.document.activeElement !== held) return;
    afterNextRender(
      () => {
        if (this.destroyed || held.isConnected) return;
        const active = this.document.activeElement;
        if (active !== null && active !== this.document.body) return;
        this.heading().nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  /** Copies the script text only; the script is never logged. */
  protected copyScript(script: string): void {
    if (this.clipboard.copy(script)) this.feedback.announce(ACCOUNT_COPY.copied, 'status');
    else this.feedback.announce(ACCOUNT_COPY.copyFailed, 'alert');
  }
}
