/**
 * Compatibility entry point for the setup RPC contracts.
 *
 * Ranking decisions: rank is one-based; session-model reason remains optional
 * so clients can consume recommendations without requiring an explanation.
 * Canonical definitions remain in rpc.types.ts and rpc/rpc-setup.types.ts.
 */
export type { SkillRecommendation } from './rpc.types';
export * from './rpc/rpc-setup.types';
