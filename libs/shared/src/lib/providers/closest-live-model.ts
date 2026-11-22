/**
 * Pick the live model id closest to a preferred one.
 *
 * Used when a saved preference (a tier mapping, a default) names a model the
 * vendor no longer lists: the preference resolves to a live id of the same
 * family instead of a hardcoded replacement. Pure and deterministic; total
 * over every input string.
 */

const SUFFIX = /\[[^\]]*\]$/;
const SEPARATORS = /[-.:/_]/;
const DIGITS = /\d+/g;
const HAS_DIGIT = /\d/;

interface ParsedModelId {
  /** The id without a trailing `[...]` suffix. */
  readonly base: string;
  /** The trailing `[...]` suffix, or `''`. */
  readonly suffix: string;
  /** Tokens with no digit, in order, joined. */
  readonly family: string;
  /** The numbers found in digit-bearing tokens, in order. */
  readonly version: readonly number[];
}

function parseModelId(id: string): ParsedModelId {
  const suffix = SUFFIX.exec(id)?.[0] ?? '';
  const base = suffix ? id.slice(0, id.length - suffix.length) : id;
  const familyTokens: string[] = [];
  const version: number[] = [];
  for (const token of base.split(SEPARATORS)) {
    if (token === '') continue;
    if (HAS_DIGIT.test(token)) {
      for (const digits of token.match(DIGITS) ?? []) {
        version.push(Number(digits));
      }
    } else {
      familyTokens.push(token);
    }
  }
  // NUL cannot occur in a model id, so the join is unambiguous.
  return { base, suffix, family: familyTokens.join('\u0000'), version };
}

/** Lexicographic order; a proper prefix sorts first. */
function compareVersions(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
}

/**
 * The live id closest to `preferred`, or `null` when none qualifies.
 *
 * - `preferred` itself, when it is live.
 * - A preferred id with no family token or no version number matches only
 *   exactly.
 * - Otherwise the candidates are unsuffixed live ids with the same family
 *   (the digit-free tokens, in order). The first candidate wins from: the same
 *   version, then the smallest greater version (successor), then the greatest
 *   smaller version. Ties go to the id that sorts first.
 * - A trailing `[...]` suffix on `preferred` is re-appended to the winner only
 *   when the suffixed id is itself live.
 *
 * @example closestLiveModel('claude-opus-5-5', ['claude-opus-5-6', 'claude-opus-6-0']) // 'claude-opus-5-6'
 * @example closestLiveModel('glm-5.3-flash', ['glm-5.4']) // null
 */
export function closestLiveModel(
  preferred: string,
  liveIds: readonly string[],
): string | null {
  const live = new Set(liveIds);
  if (live.has(preferred)) return preferred;

  const wanted = parseModelId(preferred);
  if (wanted.family === '' || wanted.version.length === 0) return null;

  let same: string | null = null;
  let successor: { id: string; version: readonly number[] } | null = null;
  let predecessor: { id: string; version: readonly number[] } | null = null;

  for (const id of live) {
    const candidate = parseModelId(id);
    if (candidate.suffix !== '' || candidate.family !== wanted.family) continue;
    if (candidate.version.length === 0) continue;
    const order = compareVersions(candidate.version, wanted.version);
    if (order === 0) {
      if (same === null || id < same) same = id;
    } else if (order > 0) {
      const closer = successor
        ? compareVersions(candidate.version, successor.version)
        : -1;
      if (closer < 0 || (closer === 0 && successor && id < successor.id)) {
        successor = { id, version: candidate.version };
      }
    } else {
      const closer = predecessor
        ? compareVersions(candidate.version, predecessor.version)
        : 1;
      if (closer > 0 || (closer === 0 && predecessor && id < predecessor.id)) {
        predecessor = { id, version: candidate.version };
      }
    }
  }

  const winner = same ?? successor?.id ?? predecessor?.id ?? null;
  if (winner === null) return null;
  const suffixed = `${winner}${wanted.suffix}`;
  return wanted.suffix !== '' && live.has(suffixed) ? suffixed : winner;
}
