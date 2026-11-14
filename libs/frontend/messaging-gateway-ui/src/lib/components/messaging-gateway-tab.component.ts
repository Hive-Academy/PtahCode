import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  LucideAngularModule,
  Mic,
  MessagesSquare,
  RadioTower,
  UserCheck,
  UserPlus,
} from 'lucide-angular';
import { VSCodeService } from '@ptah-extension/core';
import type { GatewayPlatformId } from '@ptah-extension/shared';

import { GatewayStateService } from '../services/gateway-state.service';
import { GatewayPlatformTabsComponent } from './gateway-platform-tabs.component';
import {
  GatewayPlatformPaneComponent,
  type PlatformCardConfig,
} from './gateway-platform-pane.component';
import { GatewaySetupGuideComponent } from './gateway-setup-guide.component';
import {
  PtahButtonDirective,
  PtahStatComponent,
  PtahSurfaceDirective,
} from '@ptah-extension/ui';

const PLATFORM_CARDS: readonly PlatformCardConfig[] = [
  {
    id: 'discord',
    label: 'Discord',
    tokenPlaceholder: 'Paste bot token (MTAxNzU...)',
    hasAppToken: false,
  },
  {
    id: 'slack',
    label: 'Slack',
    tokenPlaceholder: 'Paste bot token (xoxb-...)',
    hasAppToken: true,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    tokenPlaceholder: 'Paste bot token (123456:ABC-...)',
    hasAppToken: false,
  },
];

// Left raw: the Voice tile uses the theme text-info color, but ptah-stat maps info to the state color.
@Component({
  selector: 'ptah-messaging-gateway-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    GatewayPlatformTabsComponent,
    GatewayPlatformPaneComponent,
    GatewaySetupGuideComponent,
    PtahButtonDirective,
    PtahStatComponent,
    PtahSurfaceDirective,
  ],
  template: `
    @if (!isElectron) {
      <div
        class="flex flex-col items-center gap-[var(--ptah-gap-field)] py-16 text-center"
        role="alert"
      >
        <lucide-angular
          [img]="MessagesSquareIcon"
          class="size-8 text-base-content-muted"
          aria-hidden="true"
        />
        <p class="text-sm font-medium">Messaging is desktop-only</p>
        <p class="text-xs text-base-content-muted">
          The gateway runs adapters locally, so it needs the PtahCode desktop app.
        </p>
        <a
          class="link link-primary text-xs"
          href="https://github.com/Hive-Academy/PtahCode/releases"
          rel="noopener noreferrer"
          target="_blank"
          >Download PtahCode desktop</a
        >
      </div>
    } @else {
      <div class="flex flex-col gap-[var(--ptah-gap-section)]" data-testid="messaging-gateway-section">
        <header
          ptahSurface variant="surface-1" padding="lg"
          class="flex flex-wrap items-start justify-between gap-[var(--ptah-gap-field)] rounded-2xl"
        >
          <div class="flex items-start gap-[var(--ptah-gap-field)]">
            <span
              class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-surface-2 text-secondary"
            >
              <lucide-angular
                [img]="RadioTowerIcon"
                class="w-5 h-5"
                aria-hidden="true"
              />
            </span>
            <div>
              <h1 class="text-xl font-semibold tracking-tight">Messaging</h1>
              <p class="mt-0.5 text-sm text-base-content-muted">
                Drive PtahCode agents from Telegram, Discord, and Slack.
              </p>
              <p class="mt-0.5 text-xs text-base-content-muted">
                {{
                  enabled()
                    ? 'Gateway running — per-platform adapters managed below.'
                    : 'Gateway stopped — add a token to a platform to start it.'
                }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-[var(--ptah-gap-controls)]">
            <span
            class="inline-flex items-center gap-[var(--ptah-gap-controls)] text-xs text-base-content-muted"
            >
              <span
                class="inline-block size-1.5 rounded-full"
                [class.bg-success]="enabled()"
                [class.bg-base-content/30]="!enabled()"
              ></span>
              {{ enabled() ? 'Running' : 'Stopped' }}
            </span>
            <button
              type="button"
              ptahButton
              variant="ghost"
              (click)="toggleHelp()"
              aria-label="Open gateway setup guide"
            >
              Setup guide
            </button>
          </div>
        </header>

        @if (globalError(); as msg) {
          <div
            role="alert"
            class="alert alert-error"
            data-testid="gateway-global-error"
          >
            <span class="text-sm">{{ msg }}</span>
            <button
              type="button"
              ptahButton
              variant="ghost"
              size="xs"
              (click)="onDismissGlobalError()"
            >
              Dismiss
            </button>
          </div>
        }

        @if (voiceDownload(); as v) {
          <div
            role="status"
            aria-live="polite"
            class="rounded-xl border p-[var(--ptah-surface-pad)]"
            [class.border-base-300]="!v.error"
            [class.bg-base-200/40]="!v.error"
            [class.border-error/40]="!!v.error"
            [class.bg-error/10]="!!v.error"
          >
            <div class="flex items-start gap-[var(--ptah-gap-field)]">
              <div class="flex flex-1 flex-col gap-[var(--ptah-gap-heading)]">
                <span class="text-xs">
                  @if (v.error) {
                    Failed to download Whisper model
                    <span class="font-mono">{{ v.modelName }}</span
                    >: {{ v.error }}
                  } @else if (v.done) {
                    Whisper model
                    <span class="font-mono">{{ v.modelName }}</span> ready.
                  } @else {
                    Downloading Whisper model
                    <span class="font-mono">{{ v.modelName }}</span> &mdash;
                    {{ v.percent.toFixed(0) }}%
                  }
                </span>
                @if (!v.error && !v.done) {
                  <progress
                    class="progress progress-primary w-full"
                    [value]="v.percent"
                    max="100"
                  ></progress>
                }
              </div>
              <button
                type="button"
                ptahButton
                variant="ghost"
                size="xs"
                (click)="onDismissVoiceToast()"
              >
                Dismiss
              </button>
            </div>
          </div>
        }

        <div
          class="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-[var(--ptah-gap-field)]"
          aria-label="Gateway statistics"
        >
          <ptah-stat layout="tile" radius="2xl" label="Adapters running" [value]="runningCount()" valueTone="success" data-testid="gateway-stat-running">
            <lucide-angular ptahStatIcon [img]="RadioTowerIcon" class="w-6 h-6 text-success" aria-hidden="true" />
          </ptah-stat>

          <ptah-stat layout="tile" radius="2xl" label="Pending approvals" [value]="pendingCount()" valueTone="warning" data-testid="gateway-stat-pending">
            <lucide-angular ptahStatIcon [img]="UserPlusIcon" class="w-6 h-6 text-warning" aria-hidden="true" />
          </ptah-stat>

          <ptah-stat layout="tile" radius="2xl" label="Approved senders" [value]="approvedCount()" valueTone="primary" data-testid="gateway-stat-approved">
            <lucide-angular ptahStatIcon [img]="UserCheckIcon" class="w-6 h-6 text-primary" aria-hidden="true" />
          </ptah-stat>

          <!-- Raw tile: ptah-stat info maps to state-run, which differs from theme text-info. -->
          <div data-testid="gateway-stat-voice" class="stats surface-2 min-w-0 overflow-hidden rounded-2xl">
            <div class="stat min-w-0 overflow-hidden p-[var(--ptah-surface-pad)]">
              <div class="stat-figure text-info">
                <lucide-angular
                  [img]="MicIcon"
                  class="w-6 h-6"
                  aria-hidden="true"
                />
              </div>
              <div class="stat-title min-w-0 whitespace-normal text-base-content-muted">Voice</div>
              <div class="stat-value min-w-0 break-words text-sm font-medium text-info">
                {{ voiceEnabled() ? 'On' : 'Off' }}
              </div>
            </div>
          </div>
        </div>

        <section
          ptahSurface variant="surface-1" padding="none"
          class="overflow-hidden rounded-2xl"
          aria-label="Platform configuration"
        >
          <div
            class="flex flex-wrap items-center justify-between gap-[var(--ptah-gap-controls)] border-b border-surface-border p-[var(--ptah-surface-pad)]"
          >
            <ptah-gateway-platform-tabs
              [platforms]="platforms()"
              [selected]="selectedPlatform()"
              (selectedChange)="selectedPlatform.set($event)"
            />
          </div>

          <div class="p-[var(--ptah-surface-pad)]">
            @for (cfg of platformCards; track cfg.id) {
              <div
                role="tabpanel"
                [id]="'gateway-pane-' + cfg.id"
                [attr.aria-labelledby]="'gateway-tab-' + cfg.id"
                [hidden]="selectedPlatform() !== cfg.id"
              >
                <ptah-gateway-platform-pane [config]="cfg" />
              </div>
            }
          </div>
        </section>

        <section
          class="surface-1 rounded-2xl p-[var(--ptah-surface-pad)]"
          aria-label="Voice and rate-limit settings"
        >
          <div class="flex flex-col gap-[var(--ptah-gap-heading)]">
            <h2 class="text-sm font-semibold">Voice & rate limits</h2>
            <p class="text-xs text-base-content-muted">
              Read-only — configure these in
              <span class="font-mono">~/.ptah/settings.json</span>.
            </p>
          </div>
          <div
            class="mt-4 grid gap-x-[var(--ptah-gap-group)] gap-y-[var(--ptah-gap-controls)] rounded-lg border border-surface-border bg-surface-2 p-[var(--ptah-surface-pad)] font-mono text-xs sm:grid-cols-2"
          >
            <p>
              gateway.voice.enabled =
              <span class="text-base-content-muted">{{ voiceEnabled() }}</span>
            </p>
            <p>
              gateway.rateLimit.minTimeMs =
              <span class="text-base-content-muted">{{
                rateLimit().minTimeMs
              }}</span>
            </p>
            <p>
              gateway.rateLimit.maxConcurrent =
              <span class="text-base-content-muted">{{
                rateLimit().maxConcurrent
              }}</span>
            </p>
            <p
              class="pt-1 text-base-content-muted sm:col-span-2"
              data-testid="gateway-voice-model-hint"
            >
              The Whisper voice model is configured in Settings.
            </p>
          </div>
        </section>
      </div>

      @if (helpOpen()) {
        <ptah-gateway-setup-guide (closed)="closeHelp()" />
      }
    }
  `,
})
export class MessagingGatewayTabComponent implements OnInit {
  private readonly state = inject(GatewayStateService);
  private readonly vscode = inject(VSCodeService);

  protected readonly MessagesSquareIcon = MessagesSquare;
  protected readonly RadioTowerIcon = RadioTower;
  protected readonly UserPlusIcon = UserPlus;
  protected readonly UserCheckIcon = UserCheck;
  protected readonly MicIcon = Mic;

  protected readonly platformCards = PLATFORM_CARDS;
  protected readonly enabled = this.state.enabled;
  protected readonly platforms = this.state.platforms;
  protected readonly globalError = this.state.globalError;
  protected readonly voiceEnabled = this.state.voiceEnabled;
  protected readonly rateLimit = this.state.rateLimit;
  protected readonly voiceDownload = this.state.voiceDownload;

  protected readonly runningCount = computed(
    () =>
      Object.values(this.platforms()).filter((p) => p.state === 'running')
        .length,
  );
  protected readonly pendingCount = computed(
    () => this.state.pendingBindings().length,
  );
  protected readonly approvedCount = computed(
    () => this.state.approvedBindings().length,
  );

  protected readonly selectedPlatform = signal<GatewayPlatformId>('discord');
  protected readonly helpOpen = signal(false);

  public get isElectron(): boolean {
    return this.vscode.isElectron;
  }

  public ngOnInit(): void {
    if (!this.isElectron) return;
    void this.state.initialize();
  }

  protected onDismissGlobalError(): void {
    this.state.clearGlobalError();
  }

  protected onDismissVoiceToast(): void {
    this.state.dismissVoiceToast();
  }

  protected toggleHelp(): void {
    this.helpOpen.update((open) => !open);
  }

  protected closeHelp(): void {
    this.helpOpen.set(false);
  }
}
