import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { NotificationService, type AttentionItem } from '@ptah-extension/core';

/**
 * One shell-owned live region for new attention lifecycles. A region keeps
 * its text only while the item it announced is still open: an answered
 * permission or question leaves no stale "Needs your attention" node.
 */
@Component({
  selector: 'ptah-notification-announcer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ polite() }}</span>
    <span class="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{{ assertive() }}</span>
  `,
})
export class NotificationAnnouncerComponent {
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly announced = new Set<string>();
  private readonly queue: { identity: string; message: string; assertive: boolean }[] = [];
  /** Identity of the item each region shows now. */
  private readonly shown: { polite: string | null; assertive: string | null } = { polite: null, assertive: null };
  /** Identity whose text is about to be written (the region was just cleared). */
  private inFlight: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  protected readonly polite = signal('');
  protected readonly assertive = signal('');

  constructor() {
    this.destroyRef.onDestroy(() => { if (this.timer) clearTimeout(this.timer); });
    effect(() => {
      const items = [...this.notifications.needsYou(), ...this.notifications.recentNotices()];
      const live = new Set(items.map(item => `${item.key}:${item.generation}`));
      for (const identity of this.announced) if (!live.has(identity)) this.announced.delete(identity);
      this.dropResolved(live);
      for (const item of items) {
        const identity = `${item.key}:${item.generation}`;
        if (this.announced.has(identity)) continue;
        this.announced.add(identity);
        const message = this.message(item);
        this.queue.push({ identity, message, assertive: item.kind === 'failure' });
        if (this.queue.length > 100) this.queue.shift();
      }
      this.pump();
    });
  }

  private pump(): void {
    if (this.timer || !this.queue.length) return;
    const next = this.queue.shift();
    if (!next) return;
    const key = next.assertive ? 'assertive' : 'polite';
    const region = next.assertive ? this.assertive : this.polite;
    region.set('');
    this.shown[key] = null;
    this.inFlight = next.identity;
    this.timer = setTimeout(() => {
      // Resolved between the clear and the write: say nothing about it.
      if (this.inFlight === next.identity) {
        region.set(next.message);
        this.shown[key] = next.identity;
      }
      this.inFlight = null;
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.pump();
      }, 100);
    }, 0);
  }

  /** Clears a region, and drops queued text, whose item is no longer open. */
  private dropResolved(live: ReadonlySet<string>): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (!live.has(this.queue[i].identity)) this.queue.splice(i, 1);
    }
    if (this.inFlight !== null && !live.has(this.inFlight)) this.inFlight = null;
    if (this.shown.polite !== null && !live.has(this.shown.polite)) {
      this.polite.set('');
      this.shown.polite = null;
    }
    if (this.shown.assertive !== null && !live.has(this.shown.assertive)) {
      this.assertive.set('');
      this.shown.assertive = null;
    }
  }

  private message(item: AttentionItem): string {
    const location = item.workspaceName ? ` in ${item.workspaceName}` : '';
    if (item.kind === 'failure') return `Attention needed: ${item.title}${location}`;
    if (item.kind === 'warning') return `Warning: ${item.title}${location}`;
    return `${item.title}${location}. Needs your attention.`;
  }
}
