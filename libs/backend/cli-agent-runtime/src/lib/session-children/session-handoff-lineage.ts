import { SessionHandoffAckStore, type HandoffAckRecord } from './session-handoff-ack.store';

const MAX_HOPS = 64;

/** Only committed acknowledgement records establish a routing edge. */
function committed(record: HandoffAckRecord): boolean {
  return record.state !== 'starting';
}

function matchesPredecessor(record: HandoffAckRecord, id: string): boolean {
  return record.predecessorTabId === id || record.predecessorSdkId === id;
}

/**
 * Delivery walks forward: a report or completion addressed to a predecessor
 * goes to its latest kept successor. Ownership never uses this result; a
 * kept handoff re-parents the predecessor's children to the successor
 * instead (SessionHandoffService.adoptWork), so an old ID gains nothing.
 */
export function latestDeliveryTarget(records: readonly HandoffAckRecord[], target: string): string {
  const seen = new Set([target]);
  let current = target;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const edge = records.find((record) => committed(record) && matchesPredecessor(record, current));
    if (!edge || seen.has(edge.successorTabId)) break;
    seen.add(edge.successorTabId);
    current = edge.successorTabId;
  }
  return current;
}

/**
 * Resolve the forward delivery target from the persisted ack records. When
 * the store cannot be read, `onError` receives the error and the recorded
 * target is returned, which is the delivery behaviour without any handoff.
 */
export async function deliveryTarget(
  store: SessionHandoffAckStore | null,
  target: string,
  onError: (error: Error) => void,
): Promise<string> {
  if (!store) return target;
  try {
    return latestDeliveryTarget(await store.records(), target);
  } catch (error: unknown) {
    onError(error instanceof Error ? error : new Error(String(error)));
    return target;
  }
}
