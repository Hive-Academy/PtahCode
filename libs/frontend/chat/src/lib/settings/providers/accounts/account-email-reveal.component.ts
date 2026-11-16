import { ChangeDetectionStrategy, Component, effect, inject, input, linkedSignal } from '@angular/core';
import { ClaudeRpcService } from '@ptah-extension/core';
import { Eye, EyeOff, LucideAngularModule } from 'lucide-angular';

/** Email exists only in this component while explicitly revealed. */
@Component({
  selector: 'ptah-account-email-reveal',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center gap-2 text-sm" data-testid="account-email">
      <span class="text-base-content-muted">Email</span>
      <span class="break-all" data-testid="account-email-value">{{ email() ?? '••••••••' }}</span>
      <button type="button" class="btn btn-ghost btn-xs" [disabled]="loading()"
        [attr.aria-label]="email() ? 'Hide email' : 'Show email'"
        [attr.aria-pressed]="email() !== null"
        (click)="toggle()" data-testid="account-email-toggle">
        <lucide-angular [img]="email() ? EyeOffIcon : EyeIcon" class="h-4 w-4" aria-hidden="true" />
      </button>
      @if (loading()) { <span role="status">Loading…</span> }
      @if (error()) { <span role="alert" class="text-error">Email unavailable. Try again.</span> }
    </div>
  `,
})
export class AccountEmailRevealComponent {
  readonly profileId = input.required<string>();
  private readonly rpc = inject(ClaudeRpcService);
  protected readonly EyeIcon = Eye;
  protected readonly EyeOffIcon = EyeOff;
  protected readonly email = linkedSignal<string, string | null>({ source: this.profileId, computation: () => null });
  protected readonly error = linkedSignal<string, boolean>({ source: this.profileId, computation: () => false });
  protected readonly loading = linkedSignal<string, boolean>({ source: this.profileId, computation: () => false });
  private request = 0;
  constructor() {
    effect(() => { this.profileId(); this.request++; });
  }

  protected async toggle(): Promise<void> {
    if (this.loading()) return;
    if (this.email()) { this.email.set(null); this.error.set(false); return; }
    const profileId = this.profileId();
    const request = ++this.request;
    this.error.set(false);
    this.loading.set(true);
    try {
      const response = await this.rpc.call('provider:revealAccountEmail', { profileId }, { timeout: 15_000 });
      if (request !== this.request || profileId !== this.profileId()) return;
      const data = response.isSuccess() ? response.data : null;
      if (data?.ok) this.email.set(data.email);
      else this.error.set(true);
    } catch {
      // degradation-audit: reported - the UI displays fixed failure copy and retains no raw error.
      if (request === this.request && profileId === this.profileId()) this.error.set(true);
    } finally {
      if (request === this.request && profileId === this.profileId()) this.loading.set(false);
    }
  }
}
