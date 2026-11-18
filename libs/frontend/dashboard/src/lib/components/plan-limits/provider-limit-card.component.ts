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
  PtahButtonDirective,
  PtahDescriptionListComponent,
  PtahMeterComponent,
  PtahRingComponent,
} from '@ptah-extension/ui';
import type { ProviderLimitCardVm } from './provider-limit-card.view-model';

/**
 * Compact plan-limit card: one ring for the primary window, up to two mini
 * bars, one source/age line and a Details popover with absolute times.
 */
@Component({
  selector: 'ptah-provider-limit-card',
  standalone: true,
  imports: [
    NativePopoverComponent,
    ProviderMarkComponent,
    PtahButtonDirective,
    PtahDescriptionListComponent,
    PtahMeterComponent,
    PtahRingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="surface-1 rounded-ptah-surface p-ptah-surface flex flex-col gap-ptah-group h-full border border-[var(--surface-border)]"
      [style.border-color]="card().selected ? 'var(--ptah-gold)' : null"
      [attr.aria-label]="card().label + ' plan limits'"
      data-testid="provider-limit-card"
      [attr.data-provider]="card().providerId"
      [attr.data-state]="card().state"
    >
      <header class="flex items-center gap-ptah-heading min-w-0">
        <ptah-provider-mark [providerId]="card().providerId" aria-hidden="true" />
        <div class="min-w-0 flex flex-col">
          <span class="text-sm font-semibold truncate">{{ card().label }}</span>
          @if (card().selected) {
            <span class="text-xs text-base-content-muted" data-testid="provider-limit-selected">
              Selected for chat
            </span>
          }
        </div>
        <span class="ml-auto text-xs text-base-content-muted" data-testid="provider-limit-status">
          {{ card().statusText }}
        </span>
      </header>

      <div class="flex items-center gap-ptah-group min-w-0">
        @if (card().ring; as ring) {
          <ptah-ring
            size="row"
            [value]="ring.value"
            [max]="100"
            [label]="ring.label"
            [tone]="ring.tone"
            [centerText]="ring.centerText"
            [fadeArc]="ring.fadeArc"
          />
        }
        <div class="min-w-0 flex flex-col gap-ptah-label">
          @if (card().windowLabel; as windowLabel) {
            <span class="text-xs text-base-content-muted">{{ windowLabel }}</span>
          }
          @if (card().primaryValueText; as valueText) {
            <span class="text-sm font-semibold tabular-nums">{{ valueText }}</span>
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

      <footer class="mt-auto flex items-center gap-ptah-heading min-w-0">
        <span class="text-xs text-base-content-muted truncate" data-testid="provider-limit-source">
          {{ card().sourceLine }}
        </span>
        <div class="ml-auto flex items-center gap-ptah-label">
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
