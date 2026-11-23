/**
 * Scope key of per-agent budget state. SDK agent ids are not unique across parent
 * sessions, so each store keys its entries by parent session and agent id together.
 * The separator cannot occur in either part.
 */
const SEPARATOR = '\u0000';

export function scopedAgentKey(sessionId: string, agentId: string): string {
  return `${sessionId}${SEPARATOR}${agentId}`;
}

/** The key that a session rekey moves `key` to, or `undefined` when `key` belongs to another session. */
export function rekeyScopedAgentKey(key: string, from: string, to: string): string | undefined {
  const prefix = `${from}${SEPARATOR}`;
  return key.startsWith(prefix) ? `${to}${SEPARATOR}${key.slice(prefix.length)}` : undefined;
}

export function scopedKeyBelongsToSession(key: string, sessionId: string): boolean {
  return key.startsWith(`${sessionId}${SEPARATOR}`);
}

/** The keys of `agentId` in any session. */
export function scopedKeysOfAgent(keys: Iterable<string>, agentId: string): string[] {
  const suffix = `${SEPARATOR}${agentId}`;
  return [...keys].filter((key) => key.endsWith(suffix));
}

/** Move every entry of `from` to `to`; an entry already under the new key is kept. */
export function rekeyScopedMap<V>(map: Map<string, V>, from: string, to: string): void {
  for (const [key, value] of [...map]) {
    const next = rekeyScopedAgentKey(key, from, to);
    if (next === undefined) continue;
    map.delete(key);
    if (!map.has(next)) map.set(next, value);
  }
}
