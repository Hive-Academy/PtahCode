/**
 * Exact mappings from benchmark model and effort names to Ptah profiles.
 * A row matches an alias on `[sourceId, benchmarkModel, benchmarkEffort]`,
 * exactly. A row with no alias is dropped and counted.
 */
export const SEED_ALIASES = [
  {
    sourceId: 'swe-bench-verified',
    benchmarkModel: 'GLM-5 high',
    benchmarkEffort: null,
    targets: [{ family: 'z-ai', model: 'glm-5' }],
  },
] as const;
