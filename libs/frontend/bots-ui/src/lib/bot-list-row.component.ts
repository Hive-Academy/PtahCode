import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { BotSummary, BotsListResult } from '@ptah-extension/shared';
import { PtahBadgeDirective, PtahStatusComponent } from '@ptah-extension/ui';
import {
  Bot,
  Code,
  LucideAngularModule,
  Shield,
  Sparkles,
  Wrench,
} from 'lucide-angular';
import type { AvatarState } from './bot-avatar-cache';
import { avatarErrorMessage, botErrorMessage } from './bot-error-messages';

@Component({
  selector: 'ptah-bot-list-row',
  standalone: true,
  imports: [PtahBadgeDirective, PtahStatusComponent, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (unreadable(); as item) {
      <div
        class="p-3"
        role="note"
        [attr.aria-label]="'Unreadable bot ' + item.id"
      >
        <p>Unreadable bot {{ item.id }}</p>
        @if (item.schemaVersion !== undefined) {
          <p>Format version {{ item.schemaVersion }}</p>
        }
        @for (
          diagnostic of item.diagnostics;
          track diagnostic.code + ':' + $index
        ) {
          <p>{{ diagnosticMessage(diagnostic.code) }}</p>
        }
      </div>
    } @else if (bot(); as item) {
      <button
        type="button"
        class="bot-row"
        [attr.aria-label]="accessibleName()"
        [attr.aria-current]="selected() ? 'true' : null"
        (click)="selectedBot.emit(item.id)"
      >
        <span class="avatar" aria-hidden="true">
          @if (imageUrl(); as url) {
            <img
              [src]="url"
              alt=""
              width="32"
              height="32"
              (error)="imageFailed.set(true)"
            />
          } @else {
            <lucide-icon [img]="avatarIcon()" [size]="24" />
          }
        </span>
        <span class="name">{{ item.name }}</span>
        <ptah-status
          [status]="status() === 'enabled' ? 'online' : 'pending'"
          [label]="statusLabel()"
        />
        @if (item.description) {
          <span class="description">{{ item.description }}</span>
        }
        <span class="metadata">
          <span ptahBadge>{{
            item.scope.kind === 'user' ? 'User' : 'Workspace'
          }}</span>
          <span class="font-mono">{{ runtimeLabel() }}</span>
          <span>{{ lastEdit() }}</span>
        </span>
      </button>
      @if (avatarFailed()) {
        <p class="px-3 text-xs">{{ avatarError() }}</p>
        <button
          type="button"
          (click)="retryAvatar()"
          [attr.aria-label]="'Retry avatar for ' + item.name"
        >
          Retry avatar
        </button>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .bot-row {
        display: grid;
        grid-template-columns: 32px minmax(0, 1fr) auto;
        gap: 4px 8px;
        width: 100%;
        text-align: left;
        padding: 10px 12px;
        border: 1px solid transparent;
        border-radius: var(--glass-radius-inner, 8px);
        background: transparent;
        position: relative;
      }
      .bot-row:hover {
        background: var(--surface-1);
      }
      .bot-row[aria-current='true'] {
        background: var(--surface-2);
        border-color: transparent;
      }
      .bot-row[aria-current='true']::before {
        content: '';
        position: absolute;
        left: -1px;
        top: 10px;
        bottom: 10px;
        width: 3px;
        border-radius: 3px;
        background: var(--ptah-btn-primary-bg);
      }
      .avatar {
        grid-row: 1 / 4;
        display: flex;
        align-items: center;
      }
      img {
        object-fit: cover;
        border-radius: 6px;
      }
      .name {
        font-weight: 600;
      }
      .name,
      .description {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .description,
      .metadata {
        grid-column: 2 / -1;
        color: var(--bcm);
      }
      .metadata {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 8px;
        align-items: center;
        font-size: 0.75rem;
      }
      button:focus-visible {
        outline: 2px solid var(--ptah-btn-primary-bg);
        outline-offset: 2px;
      }
    `,
  ],
})
export class BotListRowComponent implements OnChanges {
  public readonly bot = input<BotSummary | null>(null);
  public readonly unreadable = input<
    BotsListResult['unreadable'][number] | null
  >(null);
  public readonly avatar = input<AvatarState | null>(null);
  public readonly selected = input(false);
  /** Parent supplies the same localized relative edit text used in the accessible name. */
  public readonly lastEdit = input('');
  public readonly selectedBot = output<string>();
  public readonly avatarNeeded = output<string>();
  public readonly avatarRetry = output<string>();
  protected diagnosticMessage(code: string): string {
    const message = botErrorMessage(code);
    return message === botErrorMessage()
      ? 'This bot could not be read.'
      : message;
  }
  protected readonly imageFailed = signal(false);
  private readonly requested = new Set<string>();
  private previousImage: string | null = null;
  protected readonly status = computed(() =>
    this.bot()?.archivedAt != null
      ? 'archived'
      : this.bot()?.enabled
        ? 'enabled'
        : 'disabled',
  );
  protected readonly statusLabel = computed(() => {
    const status = this.status();
    return status[0].toUpperCase() + status.slice(1);
  });
  public readonly runtimeLabel = computed(() => {
    const runtime = this.bot()?.runtime;
    if (!runtime || runtime.kind === 'default') return 'Default';
    if (runtime.kind === 'main')
      return `${runtime.providerId} ${runtime.model}`;
    const target =
      runtime.target.kind === 'system'
        ? `System lane: ${runtime.target.cli}`
        : `ptah-cli: ${runtime.target.ptahCliId}`;
    return `${target}${runtime.model ? ' ' + runtime.model : runtime.modelTier ? ' ' + runtime.modelTier : ''}`;
  });
  public readonly accessibleName = computed(() => {
    const bot = this.bot();
    return bot
      ? [
          bot.name,
          this.status(),
          `${bot.scope.kind} scope`,
          this.runtimeLabel(),
          this.lastEdit(),
        ]
          .filter((part) => part.trim().length > 0)
          .join(', ')
      : '';
  });
  protected readonly avatarIcon = computed(() => {
    const avatar = this.bot()?.avatar;
    return avatar?.kind === 'icon'
      ? {
          bot: Bot,
          sparkles: Sparkles,
          wrench: Wrench,
          shield: Shield,
          code: Code,
        }[avatar.name]
      : Bot;
  });
  protected readonly imageUrl = computed(() => {
    const avatar = this.avatar();
    return this.bot()?.avatar?.kind === 'image' &&
      avatar?.status === 'ready' &&
      !this.imageFailed() &&
      /^data:image\/(png|jpeg|webp);base64,/.test(avatar.dataUrl)
      ? avatar.dataUrl
      : null;
  });
  protected readonly avatarFailed = computed(() => {
    const avatar = this.avatar();
    return (
      this.bot()?.avatar?.kind === 'image' &&
      (avatar?.status === 'error' ||
        this.imageFailed() ||
        (avatar?.status === 'ready' && !this.imageUrl()))
    );
  });
  protected readonly avatarError = computed(() => {
    const avatar = this.avatar();
    return avatar?.status === 'error'
      ? avatarErrorMessage(avatar.error.code, 'load')
      : 'The avatar image could not be displayed.';
  });
  public ngOnChanges(): void {
    const avatar = this.bot()?.avatar;
    const imageId =
      !this.unreadable() && avatar?.kind === 'image' ? avatar.imageId : null;
    if (imageId !== this.previousImage) {
      this.imageFailed.set(false);
      this.previousImage = imageId;
    }
    if (imageId && this.avatar() === null && !this.requested.has(imageId)) {
      this.requested.add(imageId);
      this.avatarNeeded.emit(imageId);
    }
  }
  public retryAvatar(): void {
    const avatar = this.bot()?.avatar;
    if (!this.unreadable() && avatar?.kind === 'image') {
      this.imageFailed.set(false);
      this.avatarRetry.emit(avatar.imageId);
    }
  }
}
