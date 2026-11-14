import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import type { GatewayPlatformId } from '@ptah-extension/shared';

import { GatewayStateService } from '../services/gateway-state.service';
import { PtahButtonDirective, PtahFieldComponent, PtahInputDirective } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-platform-token-form',
  standalone: true,
  imports: [PtahButtonDirective, PtahFieldComponent, PtahInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-[var(--ptah-gap-field)]" (submit)="onSubmit($event)">
      <ptah-field label="Bot token" appearance="stacked" hint="Paste the bot token for this platform.">
        <input
          type="password"
          autocomplete="new-password"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          name="bot-token"
          ptahInput
          size="sm"
          tone="mono"
          [placeholder]="tokenPlaceholder()"
          [value]="botToken()"
          (input)="onTokenInput('bot', $event)"
          [attr.aria-label]="label() + ' bot token'"
        />
      </ptah-field>

      @if (hasAppToken()) {
        <ptah-field label="App-level token (xapp-...)" appearance="stacked" hint="Required for Slack socket mode.">
          <input
            type="password"
            autocomplete="new-password"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            name="app-token"
            ptahInput
            size="sm"
            tone="mono"
            placeholder="Paste app-level token (xapp-...)"
            [value]="appToken()"
            (input)="onTokenInput('app', $event)"
            [attr.aria-label]="label() + ' app-level token'"
          />
        </ptah-field>
      }

      <div class="flex items-center justify-between gap-[var(--ptah-gap-controls)]">
        <span class="text-xs text-base-content-muted">
          Tokens are encrypted by the OS keychain and never persisted in the
          renderer.
        </span>
        <button
          type="submit"
          ptahButton
          variant="primary"
          [disabled]="submitting() || !canSubmit()"
        >
          @if (submitting()) {
            Saving&hellip;
          } @else {
            Save & start
          }
        </button>
      </div>
    </form>
  `,
})
export class PlatformTokenFormComponent {
  private readonly state = inject(GatewayStateService);

  public readonly platform = input.required<GatewayPlatformId>();
  public readonly label = input.required<string>();
  public readonly tokenPlaceholder = input.required<string>();
  public readonly hasAppToken = input.required<boolean>();

  protected readonly botToken = signal('');
  protected readonly appToken = signal('');
  protected readonly submitting = signal(false);

  protected onTokenInput(kind: 'bot' | 'app', event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    if (kind === 'bot') {
      this.botToken.set(target.value);
    } else {
      this.appToken.set(target.value);
    }
  }

  protected canSubmit(): boolean {
    if (this.botToken().trim().length === 0) return false;
    if (this.hasAppToken() && this.appToken().trim().length === 0) {
      return false;
    }
    return true;
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const bot = this.botToken();
    const app = this.appToken();
    if (bot.trim().length === 0) return;

    this.submitting.set(true);
    try {
      if (this.platform() === 'slack') {
        await this.state.setToken(this.platform(), bot, app);
      } else {
        await this.state.setToken(this.platform(), bot);
      }
    } finally {
      this.botToken.set('');
      this.appToken.set('');
      this.submitting.set(false);
    }
  }
}
