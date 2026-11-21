import {
  Component,
  inject,
  ChangeDetectionStrategy,
  computed,
  effect,
  untracked,
  signal,
  viewChild,
  ElementRef,
  Injector,
  afterNextRender,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  Sparkles,
  UserPlus,
  KeyRound,
  Layers,
  CircleCheck,
  CircleAlert,
  TriangleAlert,
  ExternalLink,
  LogOut,
  X,
  Check,
  Eye,
  EyeOff,
} from 'lucide-angular';
import { ClaudeRpcService } from '@ptah-extension/core';
import {
  NativePopoverComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahFieldComponent,
  PtahFormSectionComponent,
  PtahIconButtonDirective,
  PtahInlineConfirmComponent,
  PtahInputDirective,
  PtahDescriptionListComponent,
  PtahDescriptionItemComponent,
  PtahSettingRowComponent,
} from '@ptah-extension/ui';
import { AdvancedOverviewStore } from '../advanced/advanced-overview.store';
import { ChatStore } from '../../services/chat.store';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';

/** One fixed sentence per action (F1): no host, server or transport text reaches the UI. */
const ACTIVATE_KEY_FAILED = 'Could not activate the membership key.';
const LOGOUT_FAILED = 'Could not log out.';
/** Hint of the "Membership key" row. */
const KEY_HINT = 'Enter your key to activate a Ptah Builders membership on this machine.';
/** The copy of the former "Membership Key Not Active" alert (A-10), now the hint of the same row (M-9). */
const KEY_NOT_ACTIVE_HINT =
  "Your membership key could not be verified. Re-enter your key to restore your Ptah Builders membership. Ptah's local features remain available either way.";

/**
 * LicenseStatusCardComponent — the "Membership & data" section card
 * (TASK_2026_555 Advanced tab, pattern map rows A1-A7).
 *
 * Displays membership status, user identity, and sign-in / key-entry actions.
 * Ptah's local features are free for everyone; this card carries membership
 * identity only — no trial countdowns, no lockouts, no upgrade CTAs.
 *
 * Layout (TASK_2026_2285_304a): plan and state are two badges in the aside, the one status display.
 * The fields are setting rows: "Membership key" (community) or "Membership" (member), "Settings backup",
 * "Ptah Builders" (community) and "Log out" (signed in).
 *
 * One primary action per region (BRIEF #4): "Create account" (community) or
 * "Manage Membership" (member); every other action is ghost or secondary.
 * The Data Portability actions (Export/Import, rows A8/A9) are projected by
 * `AdvancedSettingsComponent` into the "Settings backup" row through the
 * `[membership-actions]` slot (`[membership-notices]` follows the rows) — the
 * writes and their results stay owned by that shell.
 *
 * The membership key entry is a credential popover (P12): single password
 * field with show/hide, format check plus the `license:setKey` server verify
 * before anything is shown as active (S-verify). The format error stays next to
 * the field; the activation outcome shows as the Settings page toast.
 * A key typed into the popover never persists in component state once it
 * closes, whatever route closed it (Cancel button, Esc, backdrop).
 *
 * Log out is an inline confirm (P8, S-confirm, no Undo): a successful
 * `license:clearKey` reloads the window host-side, so no success toast exists
 * to show; a failed write keeps the confirm open and the failure shows as the
 * Settings page toast.
 *
 * Self-contained: injects its own dependencies (ChatStore, ClaudeRpcService).
 */
@Component({
  selector: 'ptah-license-status-card',
  standalone: true,
  imports: [
    LucideAngularModule,
    FormsModule,
    NativePopoverComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahFieldComponent,
    PtahFormSectionComponent,
    PtahIconButtonDirective,
    PtahInlineConfirmComponent,
    PtahInputDirective,
    PtahDescriptionListComponent,
    PtahDescriptionItemComponent,
    PtahSettingRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (!isLoadingLicenseStatus()) {
      <!-- Glass on: the card owns the inset (global .settings-page rule), so the form section has no block padding. -->
      <ptah-form-section
        id="advanced-membership"
        heading="Membership &amp; data"
        description="Your plan, your membership key, and a copy of your settings."
        [wide]="true"
        [divider]="true"
        [icon]="KeyIcon"
        class="[[data-glass=on]_&>section]:py-0"
        data-glass-surface="content"
      >
        <!-- Membership (A1, A7): the one status display. Plan and state are badges in the aside (M-8); the
             status word keeps the text color, the icon carries the state ink. -->
        <div aside class="flex flex-col gap-[var(--ptah-gap-controls)]">
          <span class="inline-flex flex-wrap items-center gap-[var(--ptah-gap-controls)]" data-testid="membership-badges">
            <span ptahBadge appearance="outline" [tone]="isPremium() ? 'accent' : 'neutral'" data-testid="membership-plan-badge">
              <lucide-angular
                [img]="isPremium() ? SparklesIcon : LayersIcon"
                class="size-3 shrink-0"
                aria-hidden="true"
              />
              <span>{{ isPremium() ? 'Builder' : 'Community' }}</span>
            </span>
            <span ptahBadge appearance="outline" [tone]="membershipState().tone" data-testid="membership-state-badge">
              <lucide-angular
                [img]="membershipState().icon"
                [class]="'size-3 shrink-0 ' + membershipState().iconClass"
                aria-hidden="true"
              />
              <span class="text-base-content">{{ membershipState().label }}</span>
            </span>
          </span>
          @if (planDescription(); as description) {
            @if (description.length <= 80) {
              <p class="text-xs text-base-content-muted" data-testid="membership-plan-description">{{ description }}</p>
            }
          }
        </div>
        @if (userEmail()) {
          <ptah-description-list density="compact">
            <div ptahDescriptionItem term="Account" role="group" aria-label="User profile">
              @if (showUserName()) { <span>{{ userDisplayName() }}</span> }
              <span class="text-base-content-muted">{{ userEmail() }}</span>
            </div>
          </ptah-description-list>
        }
        <!-- A-10: the key warning keeps its announcement. The region is always in the card, so a change of the
             license status to expired or not active is announced with the recovery instruction. The visible copy is
             the hint of the "Membership key" row. -->
        <p class="sr-only" role="alert" aria-live="assertive" aria-atomic="true" data-testid="membership-key-announcement">{{ keyNotActive() ? keyNotActiveAnnouncement : '' }}</p>
        <!-- One container for the rows: the first row has no top padding and the last row has no divider. -->
        <div class="flex flex-col" data-testid="membership-rows">
          @if (isPremium()) {
            <ptah-setting-row
              label="Membership"
              hint="Your plan and billing open in the browser."
              controlAlign="end"
              edgePadding="trim"
              data-testid="membership-manage-row"
            >
              <button type="button" ptahButton variant="primary" (click)="openPricing()" data-testid="membership-manage">
                <lucide-angular
                  [img]="ExternalLinkIcon"
                  class="w-3 h-3"
                  aria-hidden="true"
                />
                <span>Manage Membership</span>
              </button>
            </ptah-setting-row>
          } @else {
            <!-- M-9: one key action. The former "Membership Key Not Active" alert is the hint of this row. -->
            <ptah-setting-row
              label="Membership key"
              [hint]="keyNotActive() ? keyNotActiveHint : keyHint"
              hintElementId="membership-key-hint"
              controlAlign="end"
              edgePadding="trim"
              data-testid="membership-key-row"
            >
              <ptah-native-popover
                [isOpen]="keyPopoverOpen()"
                placement="bottom-end"
                [keepInViewport]="true"
                [hasBackdrop]="true"
                backdropClass="transparent"
                (closed)="closeKeyPopover()"
              >
                <button
                  trigger
                  type="button"
                  ptahButton
                  variant="secondary"
                  (click)="openKeyPopover()"
                  aria-haspopup="dialog"
                  aria-describedby="membership-key-hint"
                  data-testid="membership-key-trigger"
                >
                  <lucide-angular
                    [img]="KeyIcon"
                    class="w-3 h-3"
                    aria-hidden="true"
                  />
                  <span>Enter membership key</span>
                </button>
                  <div
                    content
                    role="dialog"
                    aria-labelledby="membership-key-popover-title"
                    class="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-[var(--ptah-gap-controls)] p-[var(--ptah-gap-field)] text-xs"
                    data-testid="membership-key-popover"
                  >
                    <div class="flex items-center justify-between gap-[var(--ptah-gap-controls)]">
                      <div class="flex items-center gap-[var(--ptah-gap-controls)]">
                        <lucide-angular
                          [img]="KeyIcon"
                          class="w-3.5 h-3.5 text-primary"
                          aria-hidden="true"
                        />
                        <h3
                          id="membership-key-popover-title"
                          class="text-xs font-bold text-base-content"
                        >
                          Enter Membership Key
                        </h3>
                      </div>
                      <button
                        type="button"
                        ptahIconButton
                        label="Close"
                        (click)="closeKeyPopover()"
                      >
                        <lucide-angular
                          [img]="CloseIcon"
                          class="w-3 h-3"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                    <ptah-field
                      label="Membership key"
                      size="sm"
                      [error]="licenseKeyError() || null"
                      errorRole="alert"
                      errorTestId="membership-key-error"
                    >
                      <input
                        ptahInput
                        size="sm"
                        tone="mono"
                        id="membership-key-input"
                        [attr.type]="keyVisible() ? 'text' : 'password'"
                        autocomplete="off"
                        spellcheck="false"
                        class="w-full text-xs text-base-content"
                        placeholder="ptah_lic_..."
                        aria-describedby="membership-key-help"
                        [(ngModel)]="licenseKeyInput"
                        (keydown.enter)="submitLicenseKey()"
                        [disabled]="isSubmittingKey()"
                        data-testid="membership-key-input"
                      />
                      <span ptahFieldTrailing class="flex items-center">
                        <button
                          type="button"
                          ptahIconButton
                          [label]="
                            keyVisible()
                              ? 'Hide membership key'
                              : 'Show membership key'
                          "
                          (click)="keyVisible.set(!keyVisible())"
                          [attr.aria-pressed]="keyVisible()"
                          data-testid="membership-key-visibility"
                        >
                          <lucide-angular
                            [img]="keyVisible() ? EyeOffIcon : EyeIcon"
                            class="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        </button>
                      </span>
                      <p
                        ptahFieldBeforeHint
                        id="membership-key-help"
                        class="text-xs text-base-content-muted"
                      >
                        Starts with "ptah_lic_" followed by 64 hex characters.
                      </p>
                    </ptah-field>
                    <button
                      type="button"
                      ptahButton
                      variant="primary"
                      class="w-full"
                      (click)="submitLicenseKey()"
                      [busy]="isSubmittingKey()"
                      [disabled]="isSubmittingKey() || !licenseKeyInput()"
                      data-testid="membership-key-activate"
                    >
                      @if (!isSubmittingKey()) {
                        <lucide-angular
                          [img]="CheckIcon"
                          class="w-3 h-3"
                          aria-hidden="true"
                        />
                      }
                      <span>{{
                        isSubmittingKey() ? 'Verifying...' : 'Activate'
                      }}</span>
                    </button>
                  </div>
              </ptah-native-popover>
            </ptah-setting-row>
          }
          <!-- Export / Import and the import confirm, projected by the Advanced shell (A8/A9). -->
          <ptah-setting-row
            label="Settings backup"
            hint="Export a copy of your settings, or import one."
            controlAlign="end"
            edgePadding="trim"
            data-testid="membership-backup-row"
          >
            <ng-content select="[membership-actions]" />
          </ptah-setting-row>
          @if (!isPremium()) {
            <ptah-setting-row
              label="Ptah Builders"
              hint="Create an account to unlock membership features."
              controlAlign="end"
              edgePadding="trim"
              data-testid="membership-builders-row"
            >
              <button type="button" ptahButton variant="ghost" (click)="openPricing()" data-testid="membership-explore">
                <span>Explore Ptah Builders</span>
                <lucide-angular
                  [img]="ExternalLinkIcon"
                  class="w-3 h-3"
                  aria-hidden="true"
                />
              </button>
              <button type="button" ptahButton variant="primary" (click)="openSignup()" data-testid="membership-create-account">
                <lucide-angular
                  [img]="UserPlusIcon"
                  class="w-3 h-3"
                  aria-hidden="true"
                />
                <span>Create account</span>
              </button>
            </ptah-setting-row>
          }
          @if (userEmail()) {
            <ptah-setting-row
              label="Log out"
              hint="Removes the membership key from this machine."
              controlAlign="end"
              edgePadding="trim"
              data-testid="membership-logout-row"
            >
              <button
                #logoutButton
                type="button"
                ptahButton
                variant="ghost"
                (click)="requestLogout()"
                aria-label="Remove membership key and log out"
                data-testid="logout-button"
              >
                <lucide-angular
                  [img]="LogOutIcon"
                  class="w-3 h-3 text-error"
                  aria-hidden="true"
                />
                <span>Log Out</span>
              </button>
            </ptah-setting-row>
          }
        </div>

        <!-- Import outcome, projected by the Advanced shell (A9). -->
        <ng-content select="[membership-notices]" />

        <!-- The inline Log out confirm (A4). -->
        @if (userEmail()) {
          @if (confirmingLogout()) {
            <ptah-inline-confirm
              message="Remove your membership key and log out?"
              detail="You can enter a new key after reloading."
              ariaLabel="Confirm log out"
              confirmLabel="Log Out"
              tone="danger"
              confirmTestId="logout-confirm-button"
              cancelTestId="logout-cancel-button"
              [busy]="isLoggingOut()"
              (confirm)="confirmLogout()"
              (cancelled)="cancelLogout()"
              data-testid="logout-confirm"
            />
          }
        }
      </ptah-form-section>
    }
  `,

})
export class LicenseStatusCardComponent {
  private readonly rpcService = inject(ClaudeRpcService);
  private readonly overview = inject(AdvancedOverviewStore, { optional: true });
  private readonly chatStore = inject(ChatStore);
  /** Activation and log-out outcomes show as the Settings page toast. */
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly injector = inject(Injector);
  private readonly logoutButton =
    viewChild<ElementRef<HTMLButtonElement>>('logoutButton');

  readonly SparklesIcon = Sparkles;
  readonly UserPlusIcon = UserPlus;
  readonly KeyIcon = KeyRound;
  readonly LayersIcon = Layers;
  protected readonly keyHint = KEY_HINT;
  protected readonly keyNotActiveHint = KEY_NOT_ACTIVE_HINT;
  /** The former alert title, then its copy. */
  protected readonly keyNotActiveAnnouncement = `Membership key not active. ${KEY_NOT_ACTIVE_HINT}`;
  readonly ExternalLinkIcon = ExternalLink;
  readonly LogOutIcon = LogOut;
  readonly CloseIcon = X;
  readonly CheckIcon = Check;
  readonly EyeIcon = Eye;
  readonly EyeOffIcon = EyeOff;

  /** The membership key popover (A5, P12). */
  readonly keyPopoverOpen = signal(false);
  readonly keyVisible = signal(false);
  readonly licenseKeyInput = signal('');
  /** The key-format validation message next to the field. */
  readonly licenseKeyError = signal('');
  readonly isSubmittingKey = signal(false);

  /** The inline Log out confirm (A4, P8). */
  readonly confirmingLogout = signal(false);
  readonly isLoggingOut = signal(false);

  readonly isPremium = computed(
    () => this.chatStore.licenseStatus()?.isPremium ?? false,
  );

  readonly isLoadingLicenseStatus = computed(
    () => this.chatStore.licenseStatus() === null,
  );

  readonly licenseValid = computed(
    () => this.chatStore.licenseStatus()?.valid ?? false,
  );

  readonly planDescription = computed(
    () => this.chatStore.licenseStatus()?.plan?.description ?? null,
  );

  readonly isCommunity = computed(
    () => this.chatStore.licenseStatus()?.isCommunity ?? false,
  );

  readonly userEmail = computed(
    () => this.chatStore.licenseStatus()?.user?.email ?? null,
  );

  readonly userFirstName = computed(
    () => this.chatStore.licenseStatus()?.user?.firstName ?? null,
  );

  readonly userLastName = computed(
    () => this.chatStore.licenseStatus()?.user?.lastName ?? null,
  );

  readonly licenseReason = computed(
    () => this.chatStore.licenseStatus()?.reason,
  );

  /** Key not found or inactive (A2): the "Membership key" row explains it and offers the one key action. */
  readonly keyNotActive = computed(
    () => this.isCommunity() && !!this.licenseReason(),
  );

  /** The state badge of the aside: a word in the text color and an icon that carries the state ink. */
  readonly membershipState = computed(() => {
    if (this.licenseReason()) {
      return {
        label: 'Needs attention',
        tone: 'warn',
        icon: TriangleAlert,
        iconClass: 'text-warning',
      } as const;
    }
    if (this.licenseValid()) {
      return {
        label: 'Active',
        tone: 'ok',
        icon: CircleCheck,
        iconClass: 'text-success',
      } as const;
    }
    return {
      label: 'Inactive',
      tone: 'neutral',
      icon: CircleAlert,
      iconClass: 'text-base-content-muted',
    } as const;
  });

  readonly userDisplayName = computed(() => {
    const first = this.userFirstName();
    const last = this.userLastName();
    if (first || last) {
      return [first, last].filter(Boolean).join(' ');
    }
    return this.userEmail();
  });

  readonly showUserName = computed(() => {
    const name = this.userDisplayName();
    return !!name && name !== this.userEmail();
  });

  constructor() {
    effect(() => {
      const loading = this.isLoadingLicenseStatus();
      const premium = this.isPremium();
      const valid = this.licenseValid();
      const reason = this.licenseReason();
      untracked(() => {
        if (loading) {
          this.overview?.clear('membership');
        } else {
          this.overview?.report('membership', {
            value: `${premium ? 'Builder' : 'Community'}, ${reason ? 'attention' : valid ? 'active' : 'inactive'}`,
            meta: premium && valid ? 'Key active' : 'No key',
            tone: reason ? 'warn' : valid ? 'ok' : 'idle',
          });
        }
      });
    });
  }

  async openSignup(): Promise<void> {
    await this.rpcService.call('command:execute', {
      command: 'ptah.openSignup',
    });
  }

  /** Opens the key popover from its one trigger; a fresh open starts empty. */
  openKeyPopover(): void {
    this.resetKeyState();
    this.keyPopoverOpen.set(true);
  }

  /**
   * Closes the popover and drops every draft field, so a typed key never
   * persists in component state after it closes (Cancel, Esc and backdrop all
   * land here — the `(closed)` output covers the last two).
   */
  closeKeyPopover(): void {
    this.keyPopoverOpen.set(false);
    this.resetKeyState();
  }

  /**
   * Activates the membership key (S-verify): the format is checked locally,
   * then `license:setKey` verifies against the server; success is shown only
   * from the write's own result (D15). The app reloads on success, so the
   * success copy stays as it is.
   */
  async submitLicenseKey(): Promise<void> {
    const key = this.licenseKeyInput().trim();
    if (!key) return;
    if (!/^ptah_lic_[a-f0-9]{64}$/.test(key)) {
      this.licenseKeyError.set(
        'Invalid format. Key must start with "ptah_lic_" followed by 64 hex characters.',
      );
      return;
    }

    this.isSubmittingKey.set(true);
    this.licenseKeyError.set('');

    try {
      const result = await this.rpcService.call('license:setKey', {
        licenseKey: key,
      });

      if (result.isSuccess() && result.data.success) {
        this.feedback.announce(
          `Membership activated! Plan: ${result.data.plan?.name ?? result.data.tier}. Reloading...`,
          'status',
        );
        this.licenseKeyInput.set('');
      } else {
        this.feedback.announce(ACTIVATE_KEY_FAILED, 'alert');
      }
    } catch {
      // A thrown transport error gets the same fixed sentence.
      this.feedback.announce(ACTIVATE_KEY_FAILED, 'alert');
    } finally {
      this.isSubmittingKey.set(false);
    }
  }

  /** Shows the inline confirm. */
  requestLogout(): void {
    this.confirmingLogout.set(true);
  }

  /**
   * Cancel and Esc close the confirm and return focus to the Log Out button
   * (P8). Esc stops here only when it closed the confirm, so an enclosing
   * overlay does not also close; while the write is in flight it is ignored.
   */
  cancelLogout(event?: Event): void {
    if (!this.confirmingLogout() || this.isLoggingOut()) return;
    event?.stopPropagation();
    this.confirmingLogout.set(false);
    afterNextRender(() => this.logoutButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /**
   * Confirmed log out (S-confirm, no Undo). A successful `license:clearKey`
   * reloads the window host-side, so nothing is shown on success; a failed
   * write keeps the confirm open and shows the failure as an alert toast (D15).
   */
  async confirmLogout(): Promise<void> {
    if (this.isLoggingOut()) return;
    this.isLoggingOut.set(true);
    try {
      const result = await this.rpcService.call('license:clearKey', {});
      if (result.isSuccess() && result.data.success) {
        this.confirmingLogout.set(false);
      } else {
        this.feedback.announce(LOGOUT_FAILED, 'alert');
      }
    } catch {
      // A thrown transport error gets the same fixed sentence.
      this.feedback.announce(LOGOUT_FAILED, 'alert');
    } finally {
      this.isLoggingOut.set(false);
    }
  }

  /**
   * Open an external page (Ptah Builders / membership) in the browser via the
   * host `ptah.openPricing` command. The target URL is resolved host-side.
   */
  async openPricing(): Promise<void> {
    await this.rpcService.call('command:execute', {
      command: 'ptah.openPricing',
    });
  }

  private resetKeyState(): void {
    this.licenseKeyInput.set('');
    this.licenseKeyError.set('');
    this.keyVisible.set(false);
  }
}
