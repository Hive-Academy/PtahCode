import {
  Component,
  inject,
  ChangeDetectionStrategy,
  computed,
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
  Key,
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
  PtahAlertComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahFieldComponent,
  PtahFormSectionComponent,
  PtahIconButtonDirective,
  PtahInlineConfirmComponent,
  PtahInputDirective,
  PtahSettingRowComponent,
  PtahStatusComponent,
} from '@ptah-extension/ui';
import { ChatStore } from '../../services/chat.store';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';

/** One fixed sentence per action (F1): no host, server or transport text reaches the UI. */
const ACTIVATE_KEY_FAILED = 'Could not activate the membership key.';
const LOGOUT_FAILED = 'Could not log out.';

/**
 * LicenseStatusCardComponent — the "Membership & data" section card
 * (TASK_2026_555 Advanced tab, pattern map rows A1-A7).
 *
 * Displays membership status, user identity, and sign-in / key-entry actions.
 * Ptah's local features are free for everyone; this card carries membership
 * identity only — no trial countdowns, no lockouts, no upgrade CTAs.
 *
 * One primary action per region (BRIEF #4): "Create Account" (community) or
 * "Manage Membership" (member) in the header; every other header action is
 * ghost/outline. The Data Portability actions (Export/Import, rows A8/A9)
 * are projected by `AdvancedSettingsComponent` through the
 * `[membership-actions]` / `[membership-notices]` slots — the writes and
 * their results stay owned by that shell.
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
    PtahAlertComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahFieldComponent,
    PtahFormSectionComponent,
    PtahIconButtonDirective,
    PtahInlineConfirmComponent,
    PtahInputDirective,
    PtahSettingRowComponent,
    PtahStatusComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (!isLoadingLicenseStatus()) {
      <ptah-form-section
        heading="Membership &amp; data"
        [divider]="true"
        data-glass-surface="content"
      >
        <!-- Membership (A1, A7): badges and status beside the actions; Export/Import are projected by the Advanced shell (A8/A9). -->
        <ptah-setting-row label="Membership" [hint]="planDescription()">
          <span status class="inline-flex flex-wrap items-center gap-[var(--ptah-gap-controls)]">
            @if (isPremium()) {
              <span ptahBadge appearance="outline" tone="accent">
                <lucide-angular
                  [img]="SparklesIcon"
                  class="w-2.5 h-2.5"
                  aria-hidden="true"
                />
                <span>Builder</span>
              </span>
            } @else {
              <span ptahBadge appearance="outline">Community</span>
            }
            @if (licenseValid() && !licenseReason()) {
              <ptah-status status="online" label="Active" appearance="inline" />
            } @else if (licenseValid() && licenseReason()) {
              <ptah-status
                status="warning"
                label="Needs Attention"
                appearance="inline"
              />
            }
          </span>
          <ng-content select="[membership-actions]" />
          @if (isPremium()) {
            <button type="button" ptahButton variant="primary" (click)="openPricing()">
              <lucide-angular
                [img]="ExternalLinkIcon"
                class="w-3 h-3"
                aria-hidden="true"
              />
              <span>Manage Membership</span>
            </button>
          } @else {
            <ptah-native-popover
              [isOpen]="keyPopoverOpen()"
              placement="bottom-end"
              [hasBackdrop]="true"
              backdropClass="transparent"
              (closed)="closeKeyPopover()"
            >
              <button
                trigger
                type="button"
                ptahButton
                variant="ghost"
                (click)="openKeyPopover()"
                data-testid="membership-key-trigger"
              >
                <lucide-angular
                  [img]="KeyIcon"
                  class="w-3 h-3"
                  aria-hidden="true"
                />
                <span>Enter Membership Key</span>
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
            <button type="button" ptahButton variant="ghost" (click)="openPricing()">
              <lucide-angular
                [img]="SparklesIcon"
                class="w-3 h-3 text-secondary"
                aria-hidden="true"
              />
              <span>Explore Ptah Builders</span>
            </button>
            <button type="button" ptahButton variant="primary" (click)="openSignup()">
              <lucide-angular
                [img]="UserPlusIcon"
                class="w-3 h-3"
                aria-hidden="true"
              />
              <span>Create Account</span>
            </button>
          }
        </ptah-setting-row>

        <!-- Import confirm / outcome, projected by the Advanced shell (A9). -->
        <ng-content select="[membership-notices]" />

        <!-- Membership key issue: key not found or inactive (A2). -->
        @if (
          isCommunity() &&
          (licenseReason() === 'no_license' || licenseReason() === 'expired')
        ) {
          <ptah-alert
            tone="warning"
            live="assertive"
            title="Membership Key Not Active"
            data-testid="membership-key-alert"
          >
            Your membership key could not be verified. Re-enter your key to
            restore your Ptah Builders membership. Ptah's local features remain
            available either way.
            <button
              alertAction
              type="button"
              ptahButton
              (click)="openKeyPopover()"
              data-testid="membership-key-alert-action"
            >
              <lucide-angular
                [img]="KeyIcon"
                class="w-3 h-3 text-warning"
                aria-hidden="true"
              />
              <span>Re-enter Membership Key</span>
            </button>
          </ptah-alert>
        }

        <!-- User profile (A3) with the inline Log out confirm (A4). -->
        @if (userEmail()) {
          <ptah-setting-row
            role="group"
            aria-label="User profile"
            [label]="(showUserName() ? userDisplayName() : userEmail()) ?? ''"
            [hint]="showUserName() ? userEmail() : null"
          >
            <div
              meta
              class="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-base-content text-xs font-bold shrink-0"
              aria-hidden="true"
            >
              {{ userInitials() }}
            </div>
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
  styles: `
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 1.25rem;
    }
  `,
})
export class LicenseStatusCardComponent {
  private readonly rpcService = inject(ClaudeRpcService);
  private readonly chatStore = inject(ChatStore);
  /** Activation and log-out outcomes show as the Settings page toast. */
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly injector = inject(Injector);
  private readonly logoutButton =
    viewChild<ElementRef<HTMLButtonElement>>('logoutButton');

  readonly SparklesIcon = Sparkles;
  readonly UserPlusIcon = UserPlus;
  readonly KeyIcon = Key;
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

  readonly userInitials = computed(() => {
    const first = this.userFirstName();
    const last = this.userLastName();
    if (first && last) {
      return `${first[0]}${last[0]}`.toUpperCase();
    }
    if (first) {
      return first[0].toUpperCase();
    }
    if (last) {
      return last[0].toUpperCase();
    }
    const email = this.userEmail();
    if (email && email.length > 0) {
      return email[0].toUpperCase();
    }
    return '?';
  });

  async openSignup(): Promise<void> {
    await this.rpcService.call('command:execute', {
      command: 'ptah.openSignup',
    });
  }

  /** Opens the key popover from either trigger; a fresh open starts empty. */
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
