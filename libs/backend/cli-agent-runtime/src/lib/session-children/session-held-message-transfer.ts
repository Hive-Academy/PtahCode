import type { IAgentAdapter, SessionId } from '@ptah-extension/shared';

/** Claim only after the successor prompt is accepted, then replay in FIFO order. */
export async function transferHeldPeerMessages(
  adapter: IAgentAdapter,
  predecessorId: SessionId,
  successorId: SessionId,
  log: (message: string) => void,
): Promise<void> {
  const held = adapter.claimHeldPeerMessages(predecessorId);
  for (const [index, message] of held.entries()) {
    try {
      await adapter.sendMessageToSession(successorId, message.content, {
        origin: message.origin,
        files: message.files ? [...message.files] : undefined,
        images: message.images,
      });
      // degradation-audit: reported - a failed replay is logged with both ids and queue position.
    } catch (error: unknown) {
      log(
        `held peer message ${index + 1}/${held.length} from ${predecessorId} to ${successorId} not delivered: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
