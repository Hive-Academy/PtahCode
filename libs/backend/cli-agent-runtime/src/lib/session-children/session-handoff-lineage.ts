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

export async function deliveryTarget(store: SessionHandoffAckStore | null, target: string): Promise<string> {
  return store ? latestDeliveryTarget(await store.records(), target) : target;
}
