import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ChevronDown, ChevronRight, CircleCheckBig, CircleX, Eye, MessageSquareText, TriangleAlert, UserRound, Bot, Waypoints, LucideAngularModule } from 'lucide-angular';
import { DeliveryStatusComponent } from '../../molecules/delivery-status/delivery-status.component';
import type { LaneThreadEntry } from './lane-thread';

@Component({
  selector: 'ptah-lane-thread-row', standalone: true, imports: [LucideAngularModule, DeliveryStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="listitem" class="min-w-0 text-sm" [class.border-l-2]="entry().kind === 'message'"
      [class.px-3]="entry().kind === 'message'" [class.py-2]="entry().kind === 'message'"
      [class.overflow-hidden]="entry().kind !== 'message'" [class.rounded-lg]="entry().kind !== 'message'"
      [class.border]="entry().kind !== 'message'" [class.bg-base-200]="entry().kind !== 'message'"
      [attr.data-sender-kind]="entry().senderKind"
      [class.border-primary]="entry().senderKind === 'user'"
      [class.border-info]="entry().senderKind === 'parent'"
      [class.border-secondary]="entry().senderKind === 'peer-lane'"
      [class.border-base-300]="entry().kind !== 'message' && !isError()"
      [class.border-error]="isError()"
      [class.text-error]="isError()"
      [attr.aria-label]="entry().sender + ', ' + absoluteTime() + ', ' + kindLabel()">
      @if (entry().kind === 'message') {
        <div class="flex min-w-0 items-center gap-2">
          <lucide-angular [img]="icon()" class="h-4 w-4 shrink-0" aria-hidden="true" />
          <span class="min-w-0 truncate font-semibold" [attr.title]="entry().senderAgentId ?? null">{{ entry().sender }}</span>
          <time class="shrink-0 text-xs text-base-content-muted" [attr.datetime]="iso()" [title]="absoluteTime()">{{ shortTime() }}</time>
        </div>
        @if (entry().body) { <p class="mt-1 whitespace-pre-wrap break-words text-base-content">{{ entry().body }}</p> }
        @if (entry().receipt; as receipt) {
          <ptah-delivery-status class="mt-1" [receipt]="receipt" [subject]="'message to ' + laneLabel()" />
        } @else if (entry().parentDelivery; as delivery) {
          <ptah-delivery-status class="mt-1" [parentDelivery]="delivery" [subject]="subject()" />
        }
      } @else {
        <button type="button" class="flex w-full min-w-0 items-center gap-2 bg-base-200 px-2 py-1.5 text-left text-xs hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          [attr.aria-expanded]="expanded()" [attr.aria-controls]="bodyId()" (click)="expanded.update(value => !value)">
          <lucide-angular [img]="icon()" class="h-4 w-4 shrink-0" aria-hidden="true" />
          <span class="max-w-32 shrink-0 truncate font-semibold" [attr.title]="entry().senderAgentId ?? null">{{ entry().sender }}</span>
          <span class="badge badge-xs shrink-0" [class.badge-info]="badgeTone() === 'info'"
            [class.badge-success]="badgeTone() === 'success'" [class.badge-warning]="badgeTone() === 'warning'"
            [class.badge-error]="badgeTone() === 'error'">{{ badgeLabel() }}</span>
          <span class="min-w-0 flex-1 truncate text-base-content/70" [title]="summary()">{{ summary() }}</span>
          <time class="shrink-0 text-base-content/60" [attr.datetime]="iso()" [title]="absoluteTime()">{{ shortTime() }}</time>
          <lucide-angular [img]="expanded() ? ChevronDownIcon : ChevronRightIcon" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
        @if (!expanded() && deliveryNeedsAttention() && entry().parentDelivery; as delivery) {
          <div class="border-t border-base-300 bg-base-100 px-3 py-1.5 text-xs">
            <ptah-delivery-status [parentDelivery]="delivery" [subject]="subject()" />
          </div>
        }
        <div [id]="bodyId()" [hidden]="!expanded()" class="border-t border-base-300 bg-base-100 px-3 py-2 text-xs">
          @if (expanded()) {
            @if (entry().body) { <p class="whitespace-pre-wrap break-words text-base-content">{{ entry().body }}</p> }
            @if (entry().verdict) { <p class="mt-1 font-medium" [class.text-error]="isError()">{{ entry().verdict }}</p> }
            @if (entry().receipt; as receipt) {
              <ptah-delivery-status class="mt-1" [receipt]="receipt" [subject]="'message to ' + laneLabel()" />
            } @else if (entry().parentDelivery; as delivery) {
              <ptah-delivery-status class="mt-1" [parentDelivery]="delivery" [subject]="subject()" />
            }
          }
        </div>
      }
    </div>
  `,
})
export class LaneThreadRowComponent {
  readonly entry = input.required<LaneThreadEntry>();
  /** Lane name used in the accessible names of the delivery actions. */
  readonly laneLabel = input('lane');
  protected readonly expanded = signal(false);
  protected readonly ChevronRightIcon = ChevronRight;
  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly YouIcon = UserRound;
  protected readonly ParentIcon = Bot;
  /** A message another lane sent to this one. */
  protected readonly PeerLaneIcon = Waypoints;
  protected readonly ReportIcon = MessageSquareText;
  protected readonly DoneIcon = CircleCheckBig;
  protected readonly FailIcon = CircleX;
  protected readonly WarningIcon = TriangleAlert;
  /** Neutral icon for a `read` ack, so it never looks like the lane acted. */
  protected readonly ReadIcon = Eye;
  protected readonly subject = computed(() => `${this.entry().kind} from ${this.laneLabel()} to the parent`);
  protected isRejectedAck(): boolean {
    return this.entry().kind === 'ack' && this.entry().ackState === 'rejected';
  }
  protected isError(): boolean {
    return (this.entry().kind === 'completion' && this.entry().verdict === 'Failed') || this.isRejectedAck();
  }
  /**
   * A pending or failed delivery to the parent stays on the collapsed card, so its
   * cancel and retry actions are never hidden. Accepted or cancelled ones show on expand.
   */
  protected deliveryNeedsAttention(): boolean {
    const state = this.entry().parentDelivery?.state;
    return state !== undefined && state !== 'delivered' && state !== 'cancelled';
  }
  /** `laneThreadEntries` writes this verdict when every declared deliverable exists. */
  private isDelivered(): boolean {
    return this.entry().kind === 'completion' && this.entry().verdict === 'Deliverables written';
  }
  protected badgeTone(): 'info' | 'success' | 'warning' | 'error' {
    if (this.isError()) return 'error';
    if (this.entry().kind === 'report') return 'info';
    if (this.entry().kind === 'ack') return this.entry().ackState === 'acted' || this.entry().ackState === 'read' ? 'success' : 'warning';
    return this.isDelivered() ? 'success' : 'warning';
  }
  protected kindLabel(): string {
    return this.entry().kind === 'ack' ? 'acknowledgment' : this.entry().kind;
  }
  protected bodyId(): string { return `lane-thread-detail-${this.entry().id}`; }
  protected badgeLabel(): string {
    if (this.entry().kind === 'completion') return this.entry().verdict || 'Completion';
    if (this.entry().kind === 'ack') {
      switch (this.entry().ackState) {
        case 'acted': return 'Acted';
        case 'read': return 'Read';
        case 'rejected': return 'Rejected';
        case 'unavailable': return 'Unavailable';
        default: return 'Pending';
      }
    }
    return 'Report';
  }
  protected summary(): string {
    if (this.entry().kind === 'completion') return this.entry().verdict || 'Completion signal';
    return this.entry().body.split(/\r?\n/, 1)[0]?.trim() || this.badgeLabel();
  }
  protected icon() {
    if (this.entry().kind === 'report') return this.ReportIcon;
    if (this.entry().kind === 'ack') {
      if (this.isRejectedAck()) return this.FailIcon;
      return this.entry().ackState === 'read' ? this.ReadIcon : this.DoneIcon;
    }
    if (this.entry().kind === 'completion') return this.entry().verdict === 'Failed' ? this.FailIcon : this.isDelivered() ? this.DoneIcon : this.WarningIcon;
    switch (this.entry().senderKind) {
      case 'user': return this.YouIcon;
      case 'peer-lane': return this.PeerLaneIcon;
      default: return this.ParentIcon;
    }
  }
  protected iso(): string { return new Date(this.entry().timestamp).toISOString(); }
  protected absoluteTime(): string { return new Date(this.entry().timestamp).toLocaleString(); }
  protected shortTime(): string { return new Date(this.entry().timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
}
