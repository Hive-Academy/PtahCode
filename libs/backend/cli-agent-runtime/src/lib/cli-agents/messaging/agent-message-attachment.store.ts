/**
 * Host-memory side store for the images of held lane messages (D4).
 *
 * Image bytes are never written to durable storage or logs: the envelope keeps
 * only `turn.imageCount`, and the bytes live here, keyed by envelope id, until
 * the envelope ends (the envelope store's terminal listener calls
 * {@link AgentMessageAttachmentStore.release}). After a host restart nothing
 * is held, so a delivery that expects images fails `attachments-unavailable`
 * with its text kept.
 */
import type { InlineImageAttachment } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';

/** Host-wide cap on held image data (base64 characters), 64 MiB. */
export const AGENT_MESSAGE_ATTACHMENT_CAP_BYTES = 64 * 1024 * 1024;

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
  ) {}

  /**
   * Hold the images of envelope `id`, replacing what it held before. Throws
   * {@link AgentMessageAttachmentCapacityError} when the host cap would be
   * exceeded; the previous holding (if any) is kept then.
   */
  hold(id: string, images: readonly InlineImageAttachment[]): void {
    if (images.length === 0) {
      this.release(id);
      return;
    }
    const bytes = costOf(images);
    const previous = this.held.get(id)?.bytes ?? 0;
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
    return this.held.get(id)?.images;
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
    return this.total;
  }
}
