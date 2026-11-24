import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import {
  PtahAlertComponent,
  PtahButtonDirective,
  PtahFieldComponent,
  PtahInputDirective,
  PtahStatusComponent,
} from '@ptah-extension/ui';
import { Bot, KeyRound, LucideAngularModule, ShieldCheck, Unplug } from 'lucide-angular';
import { ReviewRunsStore } from '../review-runs.store';

/** "GitHub bot identity" section of the review settings drawer (design-spec 3.4). */
@Component({
  selector: 'ptah-review-bot-identity',
  standalone: true,
  imports: [
    LucideAngularModule,
    PtahAlertComponent,
    PtahButtonDirective,
    PtahFieldComponent,
    PtahInputDirective,
    PtahStatusComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-5 border-t border-base-300 pt-5" aria-labelledby="review-bot-identity-h">
      <div class="flex items-center gap-2">
        <lucide-angular [img]="BotIcon" class="size-4 text-base-content-muted" aria-hidden="true" />
        <h3 id="review-bot-identity-h" class="text-sm font-semibold">GitHub bot identity</h3>
      </div>
      <p class="mt-1 text-xs text-base-content-muted">The bot that posts review comments.</p>
      <div class="mt-3 space-y-3">
        @if (store.tokenStorage() === 'plaintext') {
          <ptah-alert tone="warning" [compact]="true" live="assertive">
            This bot token is stored as plaintext because system encryption is unavailable.
          </ptah-alert>
        }
        <div class="space-y-1">
          @if (store.botIdentity(); as bot) {
            <ptah-status status="online" label="Connected" />
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
          } @else if (hasToken()) {
            <ptah-status status="warning" label="Unverified" />
            <p class="text-sm text-base-content-muted">Bot identity unavailable. Verify connection.</p>
          } @else {
            <ptah-status status="offline" label="Not connected" />
            <p class="text-sm text-base-content-muted">No bot connected. Live publication is unavailable.</p>
          }
        </div>
        <ptah-field [label]="hasToken() ? 'Replace bot token' : 'Connect bot token'" appearance="stacked">
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
            ptahButton
            variant="outline"
            [disabled]="store.credentialState() === 'saving'"
            (click)="submitted.emit(tokenInput)"
          >
            <lucide-angular [img]="KeyRoundIcon" class="size-4" aria-hidden="true" />
            Save token
          </button>
          <button type="button" ptahButton variant="outline" (click)="store.loadBotIdentity()">
            <lucide-angular [img]="ShieldCheckIcon" class="size-4" aria-hidden="true" />
            Verify connection
          </button>
          @if (hasToken()) {
            <button type="button" ptahButton variant="ghost" (click)="removeRequested.emit()">
              <lucide-angular [img]="UnplugIcon" class="size-4" aria-hidden="true" />
              Remove connection
            </button>
          }
        </div>
        @if (store.botIdentityError(); as identityError) {
          <ptah-alert tone="error" [compact]="true" live="assertive">{{ identityError }}</ptah-alert>
        }
        @if (store.credentialState() === 'error') {
          <ptah-alert tone="error" [compact]="true" live="assertive">Credential update failed. Retry.</ptah-alert>
        }
      </div>
    </section>
  `,
})
export class ReviewBotIdentityComponent {
  protected readonly BotIcon = Bot;
  protected readonly KeyRoundIcon = KeyRound;
  protected readonly ShieldCheckIcon = ShieldCheck;
  protected readonly UnplugIcon = Unplug;
  readonly store = inject(ReviewRunsStore);
  readonly hasToken = input(false);
  readonly submitted = output<HTMLInputElement>();
  readonly removeRequested = output<void>();
}
