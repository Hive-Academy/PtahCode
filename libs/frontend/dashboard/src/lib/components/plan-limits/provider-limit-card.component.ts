import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import {
  NativePopoverComponent,
  ProviderMarkComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahDescriptionListComponent,
  PtahMeterComponent,
  PtahRingComponent,
  PtahSurfaceDirective,
} from '@ptah-extension/ui';
import type { ProviderLimitCardVm } from './provider-limit-card.view-model';

/**
 * Compact plan-limit card: one ring for the primary window (percent in the
 * center, name on the ring role only), a status badge, up to two mini bars,
 * one source/age line and a Details popover with absolute times.
 */
@Component({
  selector: 'ptah-provider-limit-card',
  standalone: true,
  imports: [
    NativePopoverComponent,
    ProviderMarkComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahDescriptionListComponent,
    PtahMeterComponent,
    PtahRingComponent,
    PtahSurfaceDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      ptahSurface
      variant="inset"
      padding="md"
      class="flex h-full min-w-0 flex-col gap-ptah-heading"
      [style.border-color]="card().selected ? 'var(--ptah-gold)' : null"
      [attr.aria-label]="card().label + ' plan limits'"
      data-testid="provider-limit-card"
      [attr.data-provider]="card().providerId"
      [attr.data-state]="card().state"
    >
      <header class="flex items-start gap-ptah-heading min-w-0">
        <ptah-provider-mark [providerId]="card().providerId" aria-hidden="true" />
        <div class="min-w-0 flex-1 flex flex-col">
          <span
            class="text-sm font-semibold line-clamp-2 break-words"
            [attr.title]="card().label"
            data-testid="provider-limit-title"
          >
            {{ card().titleText }}
          </span>
          @if (card().accountLine; as accountLine) {
            <span
              class="text-xs text-base-content-muted line-clamp-2 break-words"
              [attr.title]="accountLine"
              data-testid="provider-limit-account"
            >
              {{ accountLine }}
            </span>
          }
        </div>
        @if (card().selected) {
          <span
            ptahBadge
            tone="accent"
            size="xs"
            class="shrink-0"
            title="Selected for chat"
            data-testid="provider-limit-selected"
          >
            Selected<span class="sr-only"> for chat</span>
          </span>
        }
      </header>

      <div class="flex items-center gap-ptah-field min-w-0">
        @if (card().ring; as ring) {
          <ptah-ring
            size="row"
            [value]="ring.value"
            [max]="100"
            [label]="ring.label"
            [ariaLabel]="ring.label"
            [centerOnly]="true"
            [tone]="ring.tone"
            [centerText]="ring.centerText"
            [fadeArc]="ring.fadeArc"
          />
        }
        <div class="min-w-0 flex flex-col items-start gap-ptah-label">
          <span
            ptahBadge
            size="xs"
            [tone]="card().statusTone"
            data-testid="provider-limit-status"
          >
            @if (card().statusGlyph; as glyph) {
              <span aria-hidden="true">{{ glyph }}</span>
            }
            {{ card().statusText }}
          </span>
          @if (card().windowLabel; as windowLabel) {
            <span class="text-xs text-base-content-muted break-words">{{ windowLabel }}</span>
          }
          @if (card().primaryValueText; as valueText) {
            <span class="text-sm font-semibold tabular-nums break-words">{{ valueText }}</span>
          }
          @if (card().resetLine; as resetLine) {
            <span class="text-xs" data-testid="provider-limit-reset">{{ resetLine }}</span>
          }
        </div>
      </div>

      @if (card().notice; as notice) {
        <p class="text-xs" data-testid="provider-limit-notice">{{ notice }}</p>
      }

      @if (card().miniRows.length > 0) {
        <div class="flex flex-col gap-ptah-label">
          @for (row of card().miniRows; track row.key) {
            <div class="flex flex-col gap-ptah-label" data-testid="provider-limit-mini-row">
              <div class="flex items-center justify-between gap-ptah-heading text-xs">
                <span class="truncate">{{ row.label }}</span>
                <span class="tabular-nums text-base-content-muted">{{ row.valueText }}</span>
              </div>
              @if (row.percent !== null) {
                <ptah-meter
                  size="xs"
                  [value]="row.percent"
                  [max]="100"
                  [label]="row.label"
                  [tone]="row.tone"
                  [hideLabel]="true"
                  [showValue]="false"
                />
              }
            </div>
          }
          @if (card().hiddenRowCount > 0) {
            <span class="text-xs text-base-content-muted">
              +{{ card().hiddenRowCount }} more in Details
            </span>
          }
        </div>
      }

      <footer
        class="mt-auto flex flex-col gap-ptah-controls border-t border-[var(--surface-border)] pt-ptah-heading min-w-0"
      >
        <span
          class="text-xs text-base-content-muted line-clamp-2 break-words"
          [attr.title]="card().sourceLine"
          data-testid="provider-limit-source"
        >
          {{ card().sourceLine }}
        </span>
        <div class="flex items-center justify-end gap-ptah-label">
          @if (card().action; as action) {
            <button
              type="button"
              ptahButton
              variant="ghost"
              size="xs"
              data-testid="provider-limit-action"
              (click)="runAction()"
            >
              {{ action.label }}
            </button>
          }
          <ptah-native-popover
            [isOpen]="detailsOpen()"
            placement="bottom"
            [hasBackdrop]="true"
            backdropClass="transparent"
            (closed)="detailsOpen.set(false)"
            (backdropClicked)="detailsOpen.set(false)"
          >
            <button
              trigger
              type="button"
              ptahButton
              variant="ghost"
              size="xs"
              [attr.aria-expanded]="detailsOpen()"
              data-testid="provider-limit-details"
              (click)="detailsOpen.set(!detailsOpen())"
            >
              Details
            </button>
            <div content class="surface-1 rounded-ptah-surface p-ptah-surface">
              <ptah-description-list
                [items]="card().details"
                density="compact"
                [ariaLabel]="card().label + ' limit details'"
              />
            </div>
          </ptah-native-popover>
        </div>
      </footer>
    </article>
  `,
})
export class ProviderLimitCardComponent {
  readonly card = input.required<ProviderLimitCardVm>();
  /** Emits the provider id; the parent opens chat for that provider. */
  readonly openChat = output<string>();
  /** Emits the provider id; the parent opens Settings on the Providers tab. */
  readonly openSettings = output<string>();

  protected readonly detailsOpen = signal(false);

  protected runAction(): void {
    const action = this.card().action;
    if (action === null) return;
    if (action.kind === 'open-session') this.openChat.emit(action.providerId);
    else this.openSettings.emit(action.providerId);
  }
}
