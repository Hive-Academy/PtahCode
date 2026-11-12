import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { ReviewRunsStore } from '../review-runs.store';
import { PtahButtonDirective, PtahFieldComponent, PtahInputDirective } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-review-bot-identity',
  standalone: true,
  imports: [PtahButtonDirective, PtahFieldComponent, PtahInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
            <section class="space-y-2">
              <h3 class="font-semibold">GitHub bot identity</h3>
              @if (store.tokenStorage() === 'plaintext') {
                <p role="alert" class="alert alert-warning text-sm">
                  This bot token is stored as plaintext because system
                  encryption is unavailable.
                </p>
              }
              @if (store.botIdentity(); as bot) {
                <p class="text-sm">Connected as {{ bot.login }}</p>
                <p class="text-xs text-base-content-muted">
                  @if (bot.scopes.length) {
                    Reported scopes: {{ bot.scopes.join(', ') }} |
                  }
                  Connected {{ bot.connectedAt }}
                  @if (bot.verifiedAt) {
                    | Verified {{ bot.verifiedAt }}
                  }
                </p>
              } @else {
                <p class="text-sm text-base-content-muted">
                  {{
                    hasToken()
                      ? 'Bot identity unavailable. Verify connection.'
                      : 'No bot connected. Live publication is unavailable.'
                  }}
                </p>
              }
              <ptah-field
                [label]="hasToken() ? 'Replace bot token' : 'Connect bot token'"
              >
                <input
                  #tokenInput
                  ptahInput
                  id="review-bot-token"
                  type="password"
                  autocomplete="new-password"
                  class="w-full"
                />
              </ptah-field>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  ptahButton variant="primary"
                  [disabled]="store.credentialState() === 'saving'"
                  (click)="submitted.emit(tokenInput)"
                >
                  Save token
                </button>
                <button
                  type="button"
                  ptahButton variant="ghost"
                  (click)="store.loadBotIdentity()"
                >
                  Verify connection
                </button>
                @if (hasToken()) {
                  <button
                    type="button"
                    ptahButton variant="ghost"
                    (click)="removeRequested.emit()"
                  >
                    Remove connection
                  </button>
                }
              </div>
              @if (store.botIdentityError(); as identityError) {
                <p role="alert" class="text-sm text-error">{{ identityError }}</p>
              }
              @if (store.credentialState() === 'error') {
                <p role="alert" class="text-sm text-error">
                  Credential update failed. Retry.
                </p>
              }
            </section>
  `,
})
export class ReviewBotIdentityComponent {
  readonly store = inject(ReviewRunsStore);
  readonly hasToken = input(false);
  readonly submitted = output<HTMLInputElement>();
  readonly removeRequested = output<void>();
}
