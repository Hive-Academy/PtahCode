import type { IAgentAdapter, SessionId } from '@ptah-extension/shared';

/** One held message that could not be replayed to the successor. */
export interface UndeliveredHeldMessage {
  /** 1-based queue position of the message among the held messages. */
  readonly index: number;
  /** Short whitespace-collapsed preview, with the file and image counts. */
  readonly preview: string;
}

const PREVIEW_MAX_CHARS = 80;

function previewOf(
  content: string,
  fileCount: number,
  imageCount: number,
): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  const text =
    collapsed.length > PREVIEW_MAX_CHARS
      ? `${collapsed.slice(0, PREVIEW_MAX_CHARS)}...`
      : collapsed;
  const extras: string[] = [];
  if (fileCount > 0) extras.push(`${fileCount} file(s)`);
  if (imageCount > 0) extras.push(`${imageCount} image(s)`);
  return extras.length > 0 ? `${text} [${extras.join(', ')}]` : text;
}

/**
 * Claim only after the successor prompt is accepted, then replay in FIFO order.
 * A failed replay does not stop later messages; every failure is returned.
 */
export async function transferHeldPeerMessages(
  adapter: IAgentAdapter,
  predecessorId: SessionId,
  successorId: SessionId,
  log: (message: string) => void,
): Promise<readonly UndeliveredHeldMessage[]> {
  const held = adapter.claimHeldPeerMessages(predecessorId);
  const undelivered: UndeliveredHeldMessage[] = [];
  for (const [index, message] of held.entries()) {
    try {
      await adapter.sendMessageToSession(successorId, message.content, {
        origin: message.origin,
        files: message.files ? [...message.files] : undefined,
        images: message.images,
      });
      // degradation-audit: reported - a failed replay is logged and returned to the caller for the parent.
    } catch (error: unknown) {
      undelivered.push({
        index: index + 1,
        preview: previewOf(
          message.content,
          message.files?.length ?? 0,
          message.images?.length ?? 0,
        ),
      });
      log(
        `held peer message ${index + 1}/${held.length} from ${predecessorId} to ${successorId} not delivered: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return undelivered;
}
