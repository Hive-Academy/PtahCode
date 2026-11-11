import { Injectable, signal } from '@angular/core';
import type { ChatFile } from './file-picker.service';
import type { ComposerDraftImage } from './composer-draft.store';

/**
 * Text that must go back into one tab's composer (TASK_2026_884): follow-ups
 * a Stop withdrew, a withdrawn queued item, or a follow-up that failed.
 *
 * Kept per tab until that tab's composer is shown and takes it, so a restore
 * for a hidden tab is not lost. Several restores for one tab join in the
 * order they arrived. No dependencies, so every composer can read it.
 */
@Injectable({ providedIn: 'root' })
export class ComposerRestoreService {
  private readonly pending = signal<ReadonlyMap<string, string>>(new Map());
  private readonly pendingAttachments = signal<ReadonlyMap<string, {
    files: readonly ChatFile[];
    images: readonly ComposerDraftImage[];
  }>>(new Map());

  restoreAttachments(tabId: string, files: readonly ChatFile[], images: readonly ComposerDraftImage[]): void {
    if (files.length === 0 && images.length === 0) return;
    this.pendingAttachments.update((current) => {
      const next = new Map(current);
      const earlier = next.get(tabId);
      next.set(tabId, {
        files: [...(earlier?.files ?? []), ...files],
        images: [...(earlier?.images ?? []), ...images],
      });
      return next;
    });
  }

  pendingAttachmentsFor(tabId: string) {
    return this.pendingAttachments().get(tabId) ?? null;
  }

  consumeAttachments(tabId: string) {
    const attachments = this.pendingAttachments().get(tabId) ?? null;
    if (attachments) {
      this.pendingAttachments.update((current) => {
        const next = new Map(current);
        next.delete(tabId);
        return next;
      });
    }
    return attachments;
  }

  mergeAttachments(tabId: string, files: ChatFile[], images: ComposerDraftImage[]) {
    const restored = this.consumeAttachments(tabId);
    if (!restored) return null;
    return {
      files: [...files, ...restored.files.filter((file) => !files.some((current) => current.path === file.path))],
      images: [...images, ...restored.images.filter((image) => !images.some((current) => current.id === image.id))],
    };
  }

  /** Queue `texts` (FIFO) for the tab's composer. Blank texts are skipped. */
  restore(tabId: string, texts: readonly string[]): void {
    const content = texts
      .map((text) => text.trim())
      .filter((text) => text.length > 0)
      .join('\n');
    if (!content) return;
    this.pending.update((current) => {
      const next = new Map(current);
      const earlier = next.get(tabId);
      next.set(tabId, earlier ? `${earlier}\n${content}` : content);
      return next;
    });
  }

  /** The text waiting for the tab's composer, or `null`. Reactive. */
  pendingFor(tabId: string): string | null {
    return this.pending().get(tabId) ?? null;
  }

  /** Take the tab's waiting text (the composer calls this once it shows it). */
  consume(tabId: string): string | null {
    const content = this.pending().get(tabId) ?? null;
    if (content !== null) {
      this.pending.update((current) => {
        const next = new Map(current);
        next.delete(tabId);
        return next;
      });
    }
    return content;
  }

  /** Forget the tab's waiting text (the tab closed). */
  discard(tabId: string): void {
    if (this.pendingAttachments().has(tabId)) {
      this.pendingAttachments.update((current) => {
        const next = new Map(current);
        next.delete(tabId);
        return next;
      });
    }
    if (!this.pending().has(tabId)) return;
    this.pending.update((current) => {
      const next = new Map(current);
      next.delete(tabId);
      return next;
    });
  }
}
