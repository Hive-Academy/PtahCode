import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { PtahButtonDirective, PtahFieldControlDirective, PtahStatusBadgeComponent } from '@ptah-extension/ui';
import type { FindingTriage, ReviewFindingView } from './review-finding-view';

@Component({
  selector: 'ptah-review-finding-card', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahButtonDirective, PtahFieldControlDirective, PtahStatusBadgeComponent],
  template: `
    <article class="surface-1 rounded-lg border border-base-300 p-4 space-y-3" [attr.aria-label]="view().title">
      <div class="flex flex-wrap items-center gap-2 text-xs">
        @if (view().severity === 'Critical' || view().severity === 'Major') { <ptah-ui-status-badge [status]="view().severity === 'Critical' ? 'failed' : 'needs-review'" [label]="view().severity" /> }
        @else { <span class="badge badge-sm" [class.badge-outline]="view().severity === 'Minor'" [class.badge-ghost]="view().severity === 'Nitpick'">{{ view().severity }}</span> }
        <span class="badge badge-ghost badge-xs">{{ view().lens }}</span>
        <span>{{ (view().confidence * 100).toFixed(0) }}% confidence</span>
        <span>{{ view().verification }}</span>
      </div>
      <h4 class="font-semibold leading-snug">{{ view().title }}</h4>
      <p class="text-sm"><span class="font-medium">Impact:</span> {{ view().impact }}</p>
      <button ptahButton variant="ghost" size="xs" type="button" class="font-mono" [attr.aria-label]="'Open ' + view().path + ' at line ' + (view().line ?? 'unknown')" (click)="openEvidence.emit({path: view().path, line: view().line})">{{ view().path }}:{{ view().line ?? '—' }}</button>
      <div>
        <h5 class="text-sm font-medium">Evidence</h5>
        <ul class="mt-1 space-y-2">@for (item of view().evidence; track $index) {
          <li class="rounded bg-base-200 p-2 text-sm">
            <button ptahButton variant="ghost" size="xs" type="button" class="font-mono" [attr.aria-label]="'Open evidence ' + item.path + ' at line ' + item.line" (click)="openEvidence.emit({path: item.path, line: item.line})">{{ item.path }}:{{ item.line }}</button>
            <p class="mt-1 whitespace-pre-wrap break-words">{{ item.excerpt }}</p>
          </li>
        }</ul>
      </div>
      <details class="text-sm"><summary class="cursor-pointer font-medium">Details</summary>
        <dl class="mt-2 space-y-2"><dt class="font-medium">Failure mode</dt><dd class="whitespace-pre-wrap">{{ view().failureMode }}</dd>
          <dt class="font-medium">Scenario</dt><dd class="whitespace-pre-wrap">{{ view().scenario }}</dd>
          @if (view().affectedCaller) { <dt class="font-medium">Affected caller</dt><dd>{{ view().affectedCaller }}</dd> }
          @if (view().suggestedDiff) { <dt class="font-medium">Suggested diff</dt><dd><pre class="overflow-x-auto whitespace-pre-wrap break-words">{{ view().suggestedDiff }}</pre></dd> }
          <dt class="font-medium">Fix prompt</dt><dd class="whitespace-pre-wrap">{{ view().fixPrompt }}</dd>
        </dl>
      </details>
      <div class="flex flex-wrap gap-2">
        @if (triage().state === 'open') {
          <button ptahButton variant="primary" size="xs" type="button" [disabled]="triage().pending || triage().state !== 'open'" (click)="respond.emit({action: 'accept'})">Accept</button>
          <button ptahButton variant="ghost" size="xs" type="button" [disabled]="triage().pending || triage().state !== 'open'" (click)="reasonOpen.set(!reasonOpen())">Dismiss</button>
        } @else {
          <span class="badge badge-outline badge-sm self-center" data-triage-state>{{ triage().state === 'accepted' ? 'Accepted' : 'Dismissed' }}</span>
        }
        <button ptahButton variant="ghost" size="xs" type="button" [disabled]="triage().pending" (click)="replyOpen.set(!replyOpen())">Reply</button>
        <button ptahButton variant="secondary" size="xs" type="button" (click)="sendToLane.emit()">Copy fix prompt</button>
      </div>
      @if (reasonOpen()) { <form class="space-y-2" (submit)="submitDismiss($event)"><label class="block text-sm" [for]="'reason-' + view().key">Reason (optional)</label>
        <textarea ptahFieldControl class="textarea textarea-bordered w-full" [id]="'reason-' + view().key" maxlength="4000" [disabled]="triage().pending" [value]="reason()" (input)="reason.set(readValue($event))"></textarea>
        <button ptahButton size="xs" type="submit" [disabled]="triage().pending">Submit dismissal</button></form> }
      @if (replyOpen()) { <form class="space-y-2" (submit)="submitReply($event)"><label class="block text-sm" [for]="'reply-' + view().key">Reply on GitHub</label>
        <textarea ptahFieldControl class="textarea textarea-bordered w-full" [id]="'reply-' + view().key" maxlength="4000" required [disabled]="triage().pending" [value]="reply()" (input)="reply.set(readValue($event))"></textarea>
        <button ptahButton size="xs" type="submit" [disabled]="triage().pending || !reply().trim()">Send reply</button></form> }
      @if (triage().pending) { <p role="status" class="text-sm">Sending to GitHub…</p> }
      @if (triage().state !== 'open') { <p role="status" class="text-sm">{{ triage().state === 'accepted' ? 'Accepted' : 'Dismissed' }}. The reply is on GitHub.</p> }
      @if (triage().replied) { <p role="status" class="text-sm">Reply sent to GitHub.</p> }
      @if (triage().error) { <p role="alert" class="text-sm text-error">{{ triage().error }}</p> }
    </article>
  `,
})
export class ReviewFindingCardComponent {
  readonly view = input.required<ReviewFindingView>();
  readonly triage = input.required<FindingTriage>();
  readonly openEvidence = output<{ path: string; line: number | null }>();
  readonly respond = output<{ action: 'accept' | 'dismiss' | 'reply'; body?: string }>();
  readonly sendToLane = output<void>();
  readonly reasonOpen = signal(false);
  readonly replyOpen = signal(false);
  readonly reason = signal('');
  readonly reply = signal('');
  constructor() {
    // Keep a draft until GitHub accepts it, so a failure does not lose the typed text.
    effect(() => {
      const triage = this.triage();
      if (triage.pending) return;
      if (triage.replied) { this.replyOpen.set(false); this.reply.set(''); }
      if (triage.state !== 'open') { this.reasonOpen.set(false); this.reason.set(''); }
    });
  }
  readValue(event: Event): string { return event.target instanceof HTMLTextAreaElement ? event.target.value : ''; }
  submitDismiss(event: Event): void { event.preventDefault(); if (!this.triage().pending) this.respond.emit({ action: 'dismiss', body: this.reason().trim() || undefined }); }
  submitReply(event: Event): void { event.preventDefault(); const body = this.reply().trim(); if (body && !this.triage().pending) this.respond.emit({ action: 'reply', body }); }
}
