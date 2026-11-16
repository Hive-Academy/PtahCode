/** The single deadline for a ptah_agent_spawn MCP reply. */
export const SPAWN_REPLY_DEADLINE_MS = 2_000;

/** Admit synchronously, observe the gate and launch, and mark a deadline reply. */
export async function admitAndRaceSpawn<Ticket, Value>(
  begin: () => Ticket,
  execute: (ticket: Ticket) => Promise<Value>,
  markReplied: (ticket: Ticket) => boolean,
  starting: (ticket: Ticket) => Value,
): Promise<Value> {
  const ticket = begin();
  const pipeline = Promise.resolve().then(() => execute(ticket));
  let markHeld = false;
  const raced = await raceSpawnReply(ticket, pipeline, SPAWN_REPLY_DEADLINE_MS,
    () => { markHeld = markReplied(ticket); });
  if (raced.kind === 'deadline' && !markHeld) {
    throw new Error('Spawn was stopped before it started');
  }
  return raced.kind === 'settled' ? raced.value : starting(ticket);
}

export type SpawnReplyRace<Ticket, Value> =
  | { readonly kind: 'settled'; readonly value: Value }
  | { readonly kind: 'deadline'; readonly ticket: Ticket };

/**
 * Bound only the reply. The underlying pipeline stays observed after the timer
 * wins and its owner remains responsible for terminalizing a late failure.
 */
export async function raceSpawnReply<Ticket, Value>(
  ticket: Ticket,
  pipeline: Promise<Value>,
  deadlineMs = SPAWN_REPLY_DEADLINE_MS,
  onDeadline?: () => void,
): Promise<SpawnReplyRace<Ticket, Value>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<SpawnReplyRace<Ticket, Value>>((resolve) => {
    timer = setTimeout(() => {
      onDeadline?.();
      resolve({ kind: 'deadline', ticket });
    }, deadlineMs);
  });
  try {
    return await Promise.race([
      pipeline.then((value): SpawnReplyRace<Ticket, Value> => ({
        kind: 'settled', value,
      })),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
