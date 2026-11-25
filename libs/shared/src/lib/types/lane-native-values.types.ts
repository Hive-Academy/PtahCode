/** Where a value came from. `native`: the lane's own API or CLI reported it (FA8.1, FA8.2). */
export const VALUE_PROVENANCE = ['native', 'ptah-fallback', 'unknown'] as const;
export type ValueProvenance = (typeof VALUE_PROVENANCE)[number];

/** Efforts a lane accepts for one model. Values are the vendor's exact strings, in vendor order. */
export type EffortSupport =
  | { readonly provenance: 'native'; readonly supported: readonly string[]; readonly default: string | null }
  | { readonly provenance: 'ptah-fallback'; readonly supported: readonly string[]; readonly default: null }
  | { readonly provenance: 'unknown' };

/** Why the sent effort differs from, or equals, the requested one (FA8.4). */
export const EFFORT_DISPOSITIONS = [
  'none-requested',            // no step offered a value
  'native-match',              // requested value is in the native list; sent unchanged
  'not-in-native-list',        // requested value is not in the native list; not sent
  'lane-takes-no-effort',      // native list is empty, or the lane has no effort transport
  'fallback-allowlist',        // no native list; Ptah fallback allowlist sent the value unchanged
  'fallback-mapped',           // no native list; Ptah fallback mapper changed the value
  'fallback-refused',          // no native list; Ptah fallback rejected the value
  'cli-has-no-effort-flag',    // installed CLI reports no effort flag (FA8.6)
  'lane-refused',              // the lane refused the value at session setup (ACP hint, Claude metadata)
] as const;
export type EffortDisposition = (typeof EFFORT_DISPOSITIONS)[number];

/** Values the lane itself reported for its session. Null: not reported. Never filled by Ptah. */
export interface LaneReportedSession {
  readonly model: string | null;
  readonly effort: string | null;
  /** Native effort list of the session's model, when the session advertised one. */
  readonly efforts: EffortSupport;
}
