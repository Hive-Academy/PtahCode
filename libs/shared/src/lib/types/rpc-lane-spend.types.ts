/** Ptah-observed API spend, never provider balance or subscription allowance.
 * All instants are epoch milliseconds UTC. Costs use integer micro USD.
 */
export interface LaneSpendPeriod {
  readonly startAt: number;
  readonly endAt: number;
  readonly knownCostMicroUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly pricedEvents: number;
  readonly unpricedEvents: number;
}
export interface ApiLaneSpend {
  readonly kind: 'api-spend';
  readonly availability: 'available' | 'unavailable';
  readonly revision: number;
  readonly asOf: number;
  readonly periods: { readonly today: LaneSpendPeriod; readonly '7d': LaneSpendPeriod; readonly '30d': LaneSpendPeriod } | null;
  readonly cumulative: LaneSpendPeriod | null;
  readonly coverage: 'complete' | 'partial' | 'none';
  readonly budget: { readonly limitMicroUsd: number; readonly period: 'today' | '7d' | '30d'; readonly exceeded: boolean } | null;
  readonly creditEvidence: readonly { readonly occurredAtMs: number; readonly kind: 'credit-exhausted' | 'rate-limited' }[];
}
export interface PlanLaneUsage {
  readonly kind: 'plan';
  readonly windows: readonly import('./plan-limit.types').PlanLimitWindow[];
}
export type LaneSpend = ApiLaneSpend | PlanLaneUsage;
