import type {
  CliUsageTotals,
  SessionCostUnavailableReason,
  SessionStatsEntry,
} from '@ptah-extension/shared';

export type UsageMetric = 'tokens' | 'cost';
export type UsageState = 'exact' | 'estimate' | 'lower-bound' | 'both' | 'unknown';

export interface UsageAmount {
  readonly value: number | null;
  readonly estimated: boolean;
  readonly lowerBound: boolean;
  readonly comparable: boolean;
  readonly causes: readonly string[];
}

export interface UsageContribution {
  readonly source: 'sdk' | 'cli';
  readonly id: string;
  readonly label: string;
  readonly tokens: UsageAmount;
  readonly cost: UsageAmount;
}

export interface UsageTotal {
  readonly state: UsageState;
  readonly value: number | null;
  readonly sdk: number | null;
  readonly cli: number | null;
  readonly coverage: 'full' | 'partial' | 'missing';
  readonly reportedCount: number;
  readonly missingCount: number;
  readonly causes: readonly string[];
}

/** Detected CLI coverage gaps for the metric being totaled. */
export interface CliCoverage {
  readonly complete: boolean;
  readonly causes: readonly string[];
}

export interface CliUsageRun {
  readonly kind: string;
  readonly id: string;
  readonly label: string;
  /** CLI that produced the usage (`MonitoredAgent.cli`); decides how token classes overlap. */
  readonly provider?: string;
  readonly usage: CliUsageTotals | null;
  /** Resolved lane cost, when the caller has one apart from the raw usage. */
  readonly cost?: number | null;
  readonly costEstimated?: boolean;
  readonly costPartial?: boolean;
  readonly costUnavailableReason?: SessionCostUnavailableReason;
}

// Only CLIs with four disjoint token classes belong here. A ptah CLI lane runs
// the Claude Agent SDK, whose `inputTokens` exclude cache reads and writes
// (cli-agent-runtime ptah-cli-stream-loop.service.ts `turnUsage`). Codex input
// already includes its cached input, so it stays out.
const FOUR_CLASS_CLI_PROVIDERS: ReadonlySet<string> = new Set(['ptah-cli']);

const SDK_USAGE_GAP = 'Some SDK usage could not be counted';
const SDK_LOAD_PENDING = 'SDK usage not loaded yet';
const SDK_COST_GAP = 'SDK cost not reported';
const NOT_PRICED = 'Not priced';

function validUsage(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function amount(
  value: number | null | undefined,
  causes: readonly string[] = [],
  lowerBound = false,
  estimated = false,
  comparable = true,
): UsageAmount {
  return { value: validUsage(value) ? value : null, estimated, lowerBound, comparable, causes };
}

function sdkCostCause(snapshot: SessionStatsEntry): string {
  switch (snapshot.costUnavailableReason) {
    case 'rate-missing': return NOT_PRICED;
    case 'billing-unknown': return 'SDK billing mode is unknown';
    case 'usage-incomplete': return 'Some SDK usage could not be priced';
    default:
      if (snapshot.pricingCoverage === 'partial') return 'Some SDK cost was not reported';
      return snapshot.status === 'empty' ? 'No priced SDK usage recorded' : SDK_COST_GAP;
  }
}

export function sdkContribution(snapshot: SessionStatsEntry | null): UsageContribution {
  const identity = { source: 'sdk', id: snapshot?.sessionId ?? 'sdk', label: 'SDK' } as const;
  if (!snapshot || snapshot.status === 'error') {
    const cause = snapshot ? 'SDK usage could not be read' : SDK_LOAD_PENDING;
    const unavailable = amount(null, [cause], !!snapshot);
    return { ...identity, tokens: unavailable, cost: unavailable };
  }

  const partial = snapshot.coverage === 'partial';
  const estimated = snapshot.provisional === true;
  const tokens = amount(
    snapshot.tokenCount,
    partial ? [SDK_USAGE_GAP] : validUsage(snapshot.tokenCount) ? [] : ['SDK tokens not reported'],
    partial,
    estimated,
  );

  const pricingPartial = snapshot.pricingCoverage === 'partial';
  const pricedValue = pricingPartial ? snapshot.knownCost
    : snapshot.pricingCoverage === 'none' ? null
    : snapshot.totalCost;
  const costCauses: string[] = [];
  if (partial) costCauses.push(SDK_USAGE_GAP);
  if (pricingPartial || (!validUsage(pricedValue) && (!partial || snapshot.costUnavailableReason))) {
    costCauses.push(sdkCostCause(snapshot));
  }
  if (snapshot.costBasis === 'covered-by-subscription') {
    costCauses.push('Published-rate value covered by the subscription');
  }

  return {
    ...identity,
    tokens,
    cost: amount(
      pricedValue,
      costCauses,
      partial || pricingPartial,
      estimated || snapshot.costBasis === 'estimated',
    ),
  };
}

function cliTokens(run: CliUsageRun): UsageAmount {
  const noTokens = [`${run.label} reported no tokens`];
  if (!run.usage) return amount(null, noTokens, true);

  const { inputTokens, outputTokens, totalTokens, cacheReadTokens, cacheWriteTokens } = run.usage;
  if (inputTokens === undefined && outputTokens === undefined) {
    return validUsage(totalTokens)
      ? amount(totalTokens, [`${run.label} reports a provider total on another basis`], true, false, false)
      : amount(null, noTokens, true);
  }

  const includesCache = run.provider !== undefined && FOUR_CLASS_CLI_PROVIDERS.has(run.provider);
  const fields = includesCache
    ? [inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens]
    : [inputTokens, outputTokens];
  if (fields.some((value) => value !== undefined && !validUsage(value))) {
    return amount(null, noTokens, true);
  }

  const value = fields.reduce<number>((sum, field) => sum + (field ?? 0), 0);
  if (!validUsage(value)) return amount(null, noTokens, true);
  if (inputTokens !== undefined && outputTokens !== undefined) return amount(value);
  const tokenClass = inputTokens === undefined ? 'output' : 'input';
  return amount(value, [`${run.label} reported only ${tokenClass} tokens`], true);
}

export function cliContribution(run: CliUsageRun): UsageContribution | null {
  if (run.kind !== 'cli') return null;

  const value = run.cost === undefined ? run.usage?.costUsd : run.cost;
  const gap = run.costPartial === true || !validUsage(value);
  const causes = gap
    ? [run.costUnavailableReason === 'rate-missing'
        ? `${run.label}: ${NOT_PRICED}`
        : `${run.label} reported incomplete cost`]
    : [];
  return {
    source: 'cli',
    id: run.id,
    label: run.label,
    tokens: cliTokens(run),
    cost: amount(value, causes, gap, run.costEstimated === true),
  };
}

export function sessionTotal(
  contributions: readonly UsageContribution[],
  cliCoverage: CliCoverage,
  metric: UsageMetric,
): UsageTotal {
  const sdkValues: number[] = [];
  const cliValues: number[] = [];
  let reportedCount = 0;
  let missingCount = 0;
  let cliCount = 0;
  let missingCliCount = 0;
  let estimated = false;
  let lowerBound = !cliCoverage.complete;
  const causes = new Set(cliCoverage.causes);

  for (const contribution of contributions) {
    const usage = contribution[metric];
    const isCli = contribution.source === 'cli';
    if (isCli) cliCount++;
    for (const cause of usage.causes) causes.add(cause);
    lowerBound ||= usage.lowerBound;

    if (usage.value === null || !usage.comparable) {
      missingCount++;
      if (isCli && usage.value === null) missingCliCount++;
      lowerBound = true;
      continue;
    }

    reportedCount++;
    estimated ||= usage.estimated;
    (isCli ? cliValues : sdkValues).push(usage.value);
  }

  if (missingCliCount) {
    causes.add(`${missingCliCount} of ${cliCount} lanes report no ${metric === 'tokens' ? 'usage' : 'cost'}`);
  }
  // Allow callers to leave out an unloaded SDK contribution.
  if (!contributions.some(({ source }) => source === 'sdk')) {
    missingCount++;
    lowerBound = true;
    causes.add(SDK_LOAD_PENDING);
  }

  const sdk = sdkValues.length ? sumUsageValues(sdkValues, metric) : null;
  const cli = cliValues.length ? sumUsageValues(cliValues, metric) : null;
  const sum = sumUsageValues([...sdkValues, ...cliValues], metric);
  const value = reportedCount > 0 && validUsage(sum) ? sum : null;
  if (reportedCount && value === null) causes.add('Session usage exceeds the supported range');
  return {
    value,
    sdk: validUsage(sdk) ? sdk : null,
    cli: validUsage(cli) ? cli : null,
    state: value === null ? 'unknown' : usageState({ estimated, lowerBound }),
    coverage: value === null ? 'missing' : lowerBound ? 'partial' : 'full',
    reportedCount,
    missingCount,
    causes: [...causes],
  };
}

/** Sum dollar amounts in decimal units so rounding noise does not change a displayed bound. */
export function sumUsageValues(values: readonly number[], metric: UsageMetric): number {
  if (metric === 'tokens') return values.reduce((sum, value) => sum + value, 0);

  const base = BigInt(10);
  let units = BigInt(0);
  let unitExponent = 0;
  for (const value of values) {
    const [mantissa, exponent = '0'] = String(value).split('e');
    const [integer, fraction = ''] = mantissa.split('.');
    const valueExponent = Number(exponent) - fraction.length;
    const commonExponent = Math.min(unitExponent, valueExponent);
    units = units * base ** BigInt(unitExponent - commonExponent)
      + BigInt(integer + fraction) * base ** BigInt(valueExponent - commonExponent);
    unitExponent = commonExponent;
  }
  return Number(`${units}e${unitExponent}`);
}

export function usageState(amount: Pick<UsageAmount, 'estimated' | 'lowerBound'>): Exclude<UsageState, 'unknown'> {
  if (amount.lowerBound) return amount.estimated ? 'both' : 'lower-bound';
  return amount.estimated ? 'estimate' : 'exact';
}
