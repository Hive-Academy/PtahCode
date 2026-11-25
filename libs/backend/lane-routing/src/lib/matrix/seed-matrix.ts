import type { CapabilityMatrix } from './matrix.types';
import { SEED_ALIASES } from './seed-aliases';
import { compileSeed, isStale, type SeedSourceRow } from './seed-source';

export { isStale };

/**
 * Shipped seed of the capability matrix (part A §3, Requirements 6.2, 6.3).
 *
 * Evidence: `research-routing-landscape.md` (TASK_2026_646_136a) as of
 * 2026-10-14. Public data supports only the implement kind, from SWE-bench
 * Verified under mini-SWE-agent (source [1]). No other task kind is seeded
 * and no value is carried from implement to another kind.
 *
 * A labelled row is seeded only when the row names a Ptah lane family and its
 * model id appeared exactly in that lane's list when the seed was written.
 * Rows left out:
 * - Claude Opus 4.5 high, Claude Opus 4.6 (in-process): the subagent lane
 *   lists the tiers `opus` / `sonnet`, not these ids.
 * - GPT-5.2 high, GPT-5.2-Codex, GPT-5.1-Codex medium (Codex CLI): the Codex
 *   lane has no shipped model list; its catalog is the app-server `model/list`.
 * - Claude Sonnet 4.5 high: its row cites Copilot CLI, whose list had no
 *   Sonnet 4.5 id.
 * - Claude Haiku 4.5 high, GPT-5.1 medium, GPT-5 medium, GPT-5 mini medium,
 *   Gemini 3 Flash high, Gemini 3 Pro: the row names no lane.
 * Seeded: GLM-5 high (Z.ai) as provider `z-ai`, model `glm-5`, the id the
 * benchmark row names. Provider model lists are live-only, so the id is not
 * checked against a shipped list; a row whose model the live catalogue
 * lacks simply never matches a lane.
 *
 * The seed holds no family-level profile: the benchmark scores models, and a
 * family value would be inferred.
 */

/** Source [1]: the SWE-bench Verified board the seed rates were read from. */
export const SEED_SOURCE_REF =
  'https://www.benchleader.com/benchmarks/swe_bench_verified_any';

/** What a seed value measures (Requirement 6.2). */
export const SEED_NOTE = 'backend implementation only';

export const SEED_SOURCE_ROWS: readonly SeedSourceRow[] = [
  {
    sourceId: 'swe-bench-verified',
    licenseId: 'NOASSERTION',
    fetchedAt: '2026-10-14',
    sourceRow: 'GLM-5 high',
    benchmarkModel: 'GLM-5 high',
    benchmarkEffort: null,
    taskKind: 'implement',
    asOf: '2026-02-17',
    note: SEED_NOTE,
    sourceRef: SEED_SOURCE_REF,
    value: { label: 'strong' },
  },
];

/**
 * The seed as a matrix, with `stale` computed at `nowMs`. Returns fresh
 * objects on every call.
 */
export function buildSeedMatrix(nowMs: number): CapabilityMatrix {
  return compileSeed(SEED_SOURCE_ROWS, SEED_ALIASES, nowMs).matrix;
}
