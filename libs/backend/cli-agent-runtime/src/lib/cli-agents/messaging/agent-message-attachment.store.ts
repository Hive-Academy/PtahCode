/**
 * Host-memory side store for the images of held lane messages (D4).
 *
 * Image bytes are never written to durable storage or logs: the envelope keeps
 * only `turn.imageCount`, and the bytes live here, keyed by envelope id, until
 * the envelope ends (the envelope store's terminal listener calls
 * {@link AgentMessageAttachmentStore.releaseForTerminal}). A `failed` message
 * keeps its images for Recover text and Retry, bounded by a TTL and evicted
 * first when the cap is reached. After a host restart nothing is held, so a
 * delivery that expects images fails `attachments-unavailable` with its text kept.
 */
import type { InlineImageAttachment } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { AgentMessageEnvelope } from './envelope/agent-message-envelope.schema';

/** Host-wide cap on held image data (base64 characters), 64 MiB. */
export const AGENT_MESSAGE_ATTACHMENT_CAP_BYTES = 64 * 1024 * 1024;

/** How long the images of a failed message stay held for Recover text or Retry. */
export const AGENT_MESSAGE_FAILED_IMAGES_TTL_MS = 30 * 60 * 1000;

/** The held images would push the host over its cap; nothing was held. */
export class AgentMessageAttachmentCapacityError extends Error {
  readonly code = 'attachments-capacity' as const;
  constructor() {
    super('attachments-capacity');
    this.name = 'AgentMessageAttachmentCapacityError';
  }
}

interface HeldImages {
  readonly images: readonly InlineImageAttachment[];
  readonly bytes: number;
  /** Set while the envelope is `failed`: the images are dropped after this time. */
  readonly retainUntil?: number;
}

/** Memory cost of an image: its base64 text and media type, as held. */
function costOf(images: readonly InlineImageAttachment[]): number {
  return images.reduce((sum, image) => sum + image.data.length + image.mediaType.length, 0);
}

export class AgentMessageAttachmentStore {
  private readonly held = new Map<string, HeldImages>();
  private total = 0;

  constructor(
    private readonly logger?: Logger,
    private readonly capBytes: number = AGENT_MESSAGE_ATTACHMENT_CAP_BYTES,
    private readonly clock: () => number = Date.now,
    private readonly failedTtlMs: number = AGENT_MESSAGE_FAILED_IMAGES_TTL_MS,
  ) {}

  /**
   * Hold the images of envelope `id`, replacing what it held before. Throws
   * {@link AgentMessageAttachmentCapacityError} when the host cap would be
   * exceeded even after the images of failed messages are evicted; the
   * previous holding (if any) is kept then.
   */
  hold(id: string, images: readonly InlineImageAttachment[]): void {
    this.sweep();
    if (images.length === 0) {
      this.release(id);
      return;
    }
    const bytes = costOf(images);
    const previous = this.held.get(id)?.bytes ?? 0;
    this.evictRetained(this.total - previous + bytes - this.capBytes, id);
    if (this.total - previous + bytes > this.capBytes) {
      this.logger?.warn('[AgentMessageAttachmentStore] Image cap reached', {
        envelopeId: id, images: images.length, heldBytes: this.total,
      });
      throw new AgentMessageAttachmentCapacityError();
    }
    this.held.set(id, { images: [...images], bytes });
    this.total += bytes - previous;
  }

  /**
   * The images held for envelope `id`, or undefined when none are (never
   * held, released, or lost in a host restart). They stay held until
   * {@link release}, so a retried delivery reads them again.
   */
  take(id: string): readonly InlineImageAttachment[] | undefined {
    this.sweep();
    return this.held.get(id)?.images;
  }

  /**
   * The envelope reached a terminal state. A `failed` one keeps its images
   * for Recover text or Retry until the TTL (unless they were incomplete,
   * `attachments-unavailable`); every other terminal state releases them.
   */
  releaseForTerminal(envelope: Pick<AgentMessageEnvelope, 'id' | 'state' | 'reason'>): void {
    const entry = this.held.get(envelope.id);
    if (!entry) return;
    if (envelope.state !== 'failed' || envelope.reason === 'attachments-unavailable') {
      this.release(envelope.id);
      return;
    }
    this.held.set(envelope.id, { ...entry, retainUntil: this.clock() + this.failedTtlMs });
  }

  /** A failed envelope was reopened (Retry): its images are held until it ends again. */
  keep(id: string): void {
    const entry = this.held.get(id);
    if (entry?.retainUntil === undefined) return;
    this.held.set(id, { images: entry.images, bytes: entry.bytes });
  }

  /** Drop the images of envelope `id`; a no-op when none are held. */
  release(id: string): void {
    const entry = this.held.get(id);
    if (!entry) return;
    this.held.delete(id);
    this.total -= entry.bytes;
  }

  /** Held image data across the host, in the units of the cap. */
  heldBytes(): number {
    this.sweep();
    return this.total;
  }

  /** Drop failed messages' images whose TTL has passed. Bounded by the cap, so no timer. */
  private sweep(): void {
    const now = this.clock();
    for (const [id, entry] of this.held) {
      if (entry.retainUntil !== undefined && entry.retainUntil <= now) this.release(id);
    }
  }

  /**
   * Free at least `needed` bytes from failed messages' images, oldest first,
   * never `except`. Nothing is evicted when eviction alone cannot make room.
   */
  private evictRetained(needed: number, except: string): void {
    if (needed <= 0) return;
    const retained = [...this.held]
      .filter(([id, entry]) => id !== except && entry.retainUntil !== undefined)
      .sort(([, a], [, b]) => (a.retainUntil ?? 0) - (b.retainUntil ?? 0));
    if (retained.reduce((sum, [, entry]) => sum + entry.bytes, 0) < needed) return;
    let freed = 0;
    for (const [id, entry] of retained) {
      if (freed >= needed) break;
      this.release(id);
      freed += entry.bytes;
    }
  }
}
