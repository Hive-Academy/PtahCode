/** Model Pricing Utilities */
import type {
  PriceProvenance,
  SessionCostBasis,
  SessionCostUnavailableReason,
  SessionStatsPricingCoverage,
} from '../types/rpc/rpc-session.types';
import { ANTHROPIC_RATE_CARD, findAnthropicRate } from './anthropic-rate-card';
import { CODEX_RATE_CARD } from './codex-rate-card';
/**
 * Pricing information for a single model
 */
export interface ModelPricing {
  /** Cost per input token in USD */
  readonly inputCostPerToken: number;
  /** Cost per output token in USD */
  readonly outputCostPerToken: number;
  /** Cost per cache read token in USD (optional) */
  readonly cacheReadCostPerToken?: number;
  /** Cost per cache creation token in USD (optional) */
  readonly cacheCreationCostPerToken?: number;
  /** Anthropic one-hour cache write rate. */
  readonly cacheCreation1hCostPerToken?: number;
  /** Maximum context window size */
  readonly maxTokens?: number;
  /** Provider name (anthropic, openai, etc.) */
  readonly provider?: string;
  /** Optional non-secret catalog evidence supplied with this exact rate. */
  readonly catalogSource?: string;
  readonly catalogVersion?: string;
  readonly effectiveDate?: string;
}
/**
 * Token breakdown for cost calculation
 */
export interface TokenBreakdown {
  readonly input: number;
  readonly output: number;
  readonly cacheHit?: number; // cache read tokens
  readonly cacheCreation?: number; // total cache write tokens
  /** One-hour subset; remainder uses the five-minute rate. */
  readonly cacheCreation1h?: number;
}
/** Bundled pricing for local zero-cost surfaces (Ollama / LM Studio) plus a */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': {
    inputCostPerToken: 2.5e-6, // $2.50 per 1M tokens
    outputCostPerToken: 10e-6, // $10.00 per 1M tokens
    maxTokens: 128_000,
    provider: 'openai',
  },
  'gpt-4o-mini': {
    inputCostPerToken: 0.15e-6, // $0.15 per 1M tokens
    outputCostPerToken: 0.6e-6, // $0.60 per 1M tokens
    maxTokens: 128_000,
    provider: 'openai',
  },
  'gpt-4-turbo': {
    inputCostPerToken: 10e-6, // $10.00 per 1M tokens
    outputCostPerToken: 30e-6, // $30.00 per 1M tokens
    maxTokens: 128_000,
    provider: 'openai',
  },
  'gpt-4': {
    inputCostPerToken: 30e-6, // $30.00 per 1M tokens
    outputCostPerToken: 60e-6, // $60.00 per 1M tokens
    maxTokens: 8_192,
    provider: 'openai',
  },
  'gpt-3.5-turbo': {
    inputCostPerToken: 0.5e-6, // $0.50 per 1M tokens
    outputCostPerToken: 1.5e-6, // $1.50 per 1M tokens
    maxTokens: 16_385,
    provider: 'openai',
  },
  local: {
    inputCostPerToken: 0,
    outputCostPerToken: 0,
    cacheReadCostPerToken: 0,
    cacheCreationCostPerToken: 0,
    provider: 'local',
  },
  ':cloud': {
    inputCostPerToken: 0,
    outputCostPerToken: 0,
    cacheReadCostPerToken: 0,
    cacheCreationCostPerToken: 0,
    provider: 'ollama-cloud',
  },

  // The dated OpenAI Codex API rate card: exact published rates with
  // provenance for the seven static Codex fallback IDs. See
  // `codex-rate-card.ts` for retrieval dates and per-entry sources.
  ...CODEX_RATE_CARD,
  ...ANTHROPIC_RATE_CARD,
};

/** Set of model IDs that have already been warned about. */
const warnedModelIds = new Set<string>();

/** Model pricing map - can be updated dynamically at runtime */
let modelPricingMap: Record<string, ModelPricing> = {
  ...DEFAULT_MODEL_PRICING,
};

/** Merge new pricing entries into the runtime pricing map. */
export function updatePricingMap(
  newPricing: Record<string, ModelPricing>,
): void {
  modelPricingMap = { ...modelPricingMap, ...newPricing };
}

/** Register provider-supplied pricing into the runtime pricing map. */
export function registerProviderPricing(
  entries: Record<string, ModelPricing>,
): void {
  if (!entries || Object.keys(entries).length === 0) {
    return;
  }
  const normalized: Record<string, ModelPricing> = {};
  for (const [id, pricing] of Object.entries(entries)) {
    // A hydrated dotted catalog ID supersedes only its bundled dashed fallback.
    // Explicit runtime dashed entries retain precedence; native pricing is separate.
    const catalogId = id.trim().toLowerCase();
    const dashed = catalogId.replace(/^(claude-[a-z]+-\d+)\.(\d+)$/, '$1-$2');
    if (dashed !== catalogId && modelPricingMap[dashed] === DEFAULT_MODEL_PRICING[dashed]) {
      delete modelPricingMap[dashed];
    }
    normalized[id] = pricing;
    normalized[catalogId] = pricing;
    const lower = id.toLowerCase();
    if (lower !== id) {
      normalized[lower] = pricing;
    }
  }
  updatePricingMap(normalized);
}

/**
 * Get current pricing map (for debugging/testing)
 */
export function getPricingMap(): Record<string, ModelPricing> {
  return { ...modelPricingMap };
}

/** Reset runtime pricing map and warned-model tracker to bundled defaults. */
export function resetPricingMapForTesting(): void {
  modelPricingMap = { ...DEFAULT_MODEL_PRICING };
  warnedModelIds.clear();
}

/**
 * Per-call pricing context that the model id alone cannot carry.
 */
export interface FindPricingOptions {
  /** True when the ACTIVE provider bills a flat subscription rather than per */
  readonly subscriptionCovered?: boolean;
}

/** Find pricing for a model by ID. */
export function findModelPricing(modelId: string): ModelPricing | null {
  if (!modelId) {
    return null;
  }
  if (modelId.startsWith('<') && modelId.endsWith('>')) {
    return null;
  }

  const found = lookupPricingEntry(modelId);
  if (found) {
    return found;
  }
  if (!warnedModelIds.has(modelId)) {
    warnedModelIds.add(modelId);
    console.warn(
      `[Pricing] Model '${modelId}' not found in pricing map — cost will render as unavailable`,
    );
  }
  return null;
}

/** Pattern for date snapshot suffixes: */
const DATE_SNAPSHOT_SUFFIX = /^-(?:\d{4}-\d{2}-\d{2}|\d{8})$/;

/** The same date snapshot, anchored at the end of a whole model id. */
const TRAILING_DATE_SNAPSHOT = /-(?:\d{4}-\d{2}-\d{2}|\d{8})$/;

/** Drop trailing bracketed variant tags from a model id. */
export function stripModelVariantTags(modelId: string): string {
  // A linear scan from the end, one `[...]` tag at a time. The equivalent
  // regex, /(\[[^\]]*\])+$/, backtracks super-linearly on input like `[[[[`.
  let end = modelId.length;
  while (end > 0 && modelId[end - 1] === ']') {
    // A tag holds no `]`, so it opens at the first `[` after the previous `]`.
    const open = modelId.indexOf('[', modelId.lastIndexOf(']', end - 2) + 1);
    if (open === -1 || open >= end - 1) break;
    end = open;
  }
  return modelId.slice(0, end);
}

/** Drop everything up to the last `/` (`anthropic/`, `openrouter/x/`, ...). */
function stripProviderPrefix(modelId: string): string {
  return modelId.slice(modelId.lastIndexOf('/') + 1);
}

/** Reduce a model id to the spelling every key space shares: trimmed, */
export function normalizeModelKey(modelId: string): string {
  const lower = stripModelVariantTags(modelId.trim().toLowerCase());
  return stripProviderPrefix(lower).replace(TRAILING_DATE_SNAPSHOT, '');
}

/** Exact-then-partial lookup against the runtime map. Silent: the "unknown */
function lookupPricingEntry(
  modelId: string,
  stripVariantTags = true,
): ModelPricing | null {
  const lowerId = modelId.trim().toLowerCase();
  const untaggedId = stripVariantTags
    ? stripModelVariantTags(lowerId)
    : lowerId;
  // Candidate spellings, most specific first; duplicates are harmless.
  const exactIds = [
    lowerId,
    stripProviderPrefix(lowerId),
    untaggedId,
    stripProviderPrefix(untaggedId),
  ];
  // Resolve tagged catalog spellings before considering an untagged base.
  if (stripVariantTags && lowerId !== untaggedId) {
    const tagged = resolvePricingKey(stripProviderPrefix(lowerId));
    if (tagged !== null) return modelPricingMap[tagged];
  }
  for (const id of exactIds) {
    // Own keys only: an id such as `x/constructor` or `__proto__` must not
    // resolve to an inherited Object.prototype member and yield NaN costs.
    if (id && Object.hasOwn(modelPricingMap, id) && modelPricingMap[id]) {
      return modelPricingMap[id];
    }
  }

  const normalizedId = untaggedId;
  const strippedId = stripProviderPrefix(untaggedId);

  let bestMatch: ModelPricing | null = null;
  let bestMatchKeyLength = -1;

  for (const [key, pricing] of Object.entries(modelPricingMap)) {
    const lowerKey = key.toLowerCase();

    let remainder: string | null = null;
    if (normalizedId.startsWith(lowerKey)) {
      remainder = normalizedId.slice(lowerKey.length);
    } else if (strippedId.startsWith(lowerKey)) {
      remainder = strippedId.slice(lowerKey.length);
    }

    if (remainder !== null && DATE_SNAPSHOT_SUFFIX.test(remainder)) {
      if (lowerKey.length > bestMatchKeyLength) {
        bestMatch = pricing;
        bestMatchKeyLength = lowerKey.length;
      }
    }
  }

  if (bestMatch || !stripVariantTags) return bestMatch;
  // A tagged dotted entry wins over the base entry, as rule 1 does. A dated
  // id resolves like its undated model, as rule 2 does.
  const key =
    (lowerId === untaggedId
      ? null
      : resolvePricingKey(stripProviderPrefix(lowerId))) ??
    resolvePricingKey(strippedId.replace(TRAILING_DATE_SNAPSHOT, ''));
  return key === null ? null : modelPricingMap[key];
}

/** `claude-<family>-<major>-<minor>`, then at most a `[1m]` context tag. */
const CLAUDE_DASHED_VERSION = /^(claude-[a-z]+-\d+)-(\d{1,2})(\[1m\])?$/;

/** The map key a lowercase model id is priced under: the id itself when it */
function resolvePricingKey(key: string): string | null {
  if (Object.hasOwn(modelPricingMap, key) && modelPricingMap[key]) return key;
  const match = CLAUDE_DASHED_VERSION.exec(key);
  if (!match) return null;
  const dotted = `${match[1]}.${match[2]}${match[3] ?? ''}`;
  return Object.hasOwn(modelPricingMap, dotted) && modelPricingMap[dotted]
    ? dotted
    : null;
}

/** Calculate message cost in USD for a specific model */
export function calculateMessageCost(
  modelId: string,
  tokens: TokenBreakdown,
  pricing?: ModelPricing | null,
): number | null {
  const resolved = pricing !== undefined ? pricing : findModelPricing(modelId);
  if (!resolved) return null;

  const inputCost = tokens.input * resolved.inputCostPerToken;
  const outputCost = tokens.output * resolved.outputCostPerToken;
  const cacheReadCost =
    (tokens.cacheHit ?? 0) * (resolved.cacheReadCostPerToken ?? 0);
  const cacheCreationCost =
    ((tokens.cacheCreation ?? 0) - (tokens.cacheCreation1h ?? 0)) * (resolved.cacheCreationCostPerToken ?? 0) +
    (tokens.cacheCreation1h ?? 0) * (resolved.cacheCreation1hCostPerToken ?? 0);

  const totalCost = inputCost + outputCost + cacheReadCost + cacheCreationCost;
  return Math.round(totalCost * 1000000) / 1000000;
}

/** Whether `pricing` has a price for every cache token kind `tokens` uses. A */
export function pricesCacheTokens(
  pricing: ModelPricing,
  tokens: TokenBreakdown,
): boolean {
  const readPriced =
    !tokens.cacheHit || pricing.cacheReadCostPerToken !== undefined;
  const writePriced =
    (tokens.cacheCreation ?? 0) === (tokens.cacheCreation1h ?? 0) || pricing.cacheCreationCostPerToken !== undefined;
  return readPriced && writePriced &&
    (!tokens.cacheCreation1h || pricing.cacheCreation1hCostPerToken !== undefined);
}

/** Exact catalog key and its rate. No provider prefix or date-family fallback. */
export interface ExactModelPricing {
  readonly modelIdUsed: string;
  readonly pricing: ModelPricing;
}

/** Resolve only the exact catalog key, except Claude's documented `[1m]` */
export function findExactModelPricing(
  modelId: string,
): ExactModelPricing | null {
  if (!modelId || modelId.startsWith('<')) return null;
  const key = modelId.toLowerCase();
  if (Object.hasOwn(modelPricingMap, key)) {
    const pricing = modelPricingMap[key];
    return pricing ? { modelIdUsed: key, pricing } : null;
  }
  const spelled = resolvePricingKey(key);
  if (spelled !== null) {
    return { modelIdUsed: spelled, pricing: modelPricingMap[spelled] };
  }
  if (!/^claude-[a-z0-9.-]+\[1m\]$/.test(key)) return null;
  const baseKey = resolvePricingKey(key.slice(0, -4));
  if (baseKey === null) return null;
  return { modelIdUsed: baseKey, pricing: modelPricingMap[baseKey] };
}

export interface ExactCostOptions {
  readonly providerReportedCost?: number | null;
  /** Native Anthropic API prices are isolated from third-party catalogs. */
  readonly pricingProvider?: 'anthropic';
  readonly contextTokens?: number;
  readonly billingMode: 'subscription' | 'api-key' | 'unknown';
  /** Must be verified before cache counters can be treated as disjoint. */
  readonly cacheSemantics?: 'disjoint' | 'ambiguous';
  /** Explicit usage evidence permits a real zero-token turn to cost $0. */
  readonly usageObserved?: boolean;
}

export interface ExactCostResult {
  readonly totalCost: number | null;
  readonly costBasis: SessionCostBasis;
  readonly pricingCoverage: SessionStatsPricingCoverage;
  readonly priceProvenance?: PriceProvenance;
  /** Present only when `totalCost` is null, naming the one narrow cause. A */
  readonly costUnavailableReason?: SessionCostUnavailableReason;
}

function validRate(rate: number | undefined): rate is number {
  return rate !== undefined && Number.isFinite(rate) && rate > 0;
}

/** Opt-in strict valuation. The four token classes are disjoint; reasoning */
export function calculateExactMessageCost(
  modelId: string,
  tokens: TokenBreakdown,
  options: ExactCostOptions,
): ExactCostResult {
  const unavailable = (
    costUnavailableReason: SessionCostUnavailableReason,
  ): ExactCostResult => ({
    totalCost: null,
    costBasis: 'unknown',
    pricingCoverage: 'none',
    costUnavailableReason,
  });
  if (options.billingMode === 'api-key' && options.providerReportedCost !== undefined && options.providerReportedCost !== null &&
      Number.isFinite(options.providerReportedCost) && options.providerReportedCost >= 0) {
    return { totalCost: options.providerReportedCost, costBasis: 'reported', pricingCoverage: 'full' };
  }
  if (options.billingMode === 'unknown') return unavailable('billing-unknown');
  if (!modelId.trim()) return unavailable('usage-incomplete');
  const counts = [
    tokens.input,
    tokens.output,
    tokens.cacheHit ?? 0,
    tokens.cacheCreation ?? 0,
    tokens.cacheCreation1h ?? 0,
  ];
  const usageIncomplete = counts.some((count) =>
    !Number.isSafeInteger(count) || count < 0) ||
    (counts.every((count) => count === 0) && !options.usageObserved) ||
    (tokens.cacheCreation1h ?? 0) > (tokens.cacheCreation ?? 0);
  if (normalizeModelKey(modelId).replace(/(haiku-5)\.5$/, '$1-5') === 'claude-haiku-5-5' &&
    (options.pricingProvider !== 'anthropic' || options.contextTokens === undefined || !Number.isSafeInteger(options.contextTokens) || options.contextTokens < 0)) return unavailable('rate-missing');
  const nativeRate = options.pricingProvider === 'anthropic' ? findAnthropicRate(modelId, options.contextTokens) : null;
  const found = options.pricingProvider === 'anthropic'
    ? (nativeRate ? { modelIdUsed: modelId, pricing: nativeRate } : null)
    : findExactModelPricing(modelId);
  // No catalog entry (or only a base Claude entry for a `[1m]` request) means
  // Ptah lacks a needed rate: "not priced", never a fabricated
  // substitute rate or zero.
  if (!found) return unavailable(usageIncomplete ? 'usage-incomplete' : 'rate-missing');
  const { pricing } = found;
  const provenance: PriceProvenance = {
    modelIdUsed: found.modelIdUsed,
    catalogSource: pricing.catalogSource ?? null,
    catalogVersion: pricing.catalogVersion ?? null,
    effectiveDate: pricing.effectiveDate ?? null,
  };
  if (usageIncomplete) {
    return {
      totalCost: null,
      costBasis: 'unknown',
      pricingCoverage: 'none',
      priceProvenance: provenance,
      costUnavailableReason: 'usage-incomplete',
    };
  }
  // Only the id's own entry (or its catalog spelling) prices it: a `[1m]`
  // request resolved to its base entry stays unpriced.
  if (options.pricingProvider !== 'anthropic' && found.modelIdUsed !== resolvePricingKey(modelId.toLowerCase())) {
    return unavailable('rate-missing');
  }
  const availableBasis: SessionCostBasis =
    options.billingMode === 'subscription'
      ? 'covered-by-subscription'
      : 'estimated';
  const inputPriced = validRate(pricing.inputCostPerToken);
  const outputPriced = validRate(pricing.outputCostPerToken);
  const readPriced =
    !tokens.cacheHit || validRate(pricing.cacheReadCostPerToken);
  const writePriced =
    ((tokens.cacheCreation ?? 0) === (tokens.cacheCreation1h ?? 0) || validRate(pricing.cacheCreationCostPerToken)) &&
    (!tokens.cacheCreation1h || validRate(pricing.cacheCreation1hCostPerToken));
  const cacheUnverified =
    ((tokens.cacheHit ?? 0) > 0 || (tokens.cacheCreation ?? 0) > 0) &&
    options.cacheSemantics !== 'disjoint';
  const rateMissing =
    !inputPriced ||
    !outputPriced ||
    !pricesCacheTokens(pricing, tokens) ||
    !readPriced ||
    !writePriced;
  if (rateMissing || cacheUnverified) {
    const someUsedRate =
      (tokens.input > 0 && inputPriced) ||
      (tokens.output > 0 && outputPriced) ||
      ((tokens.cacheHit ?? 0) > 0 && readPriced && !cacheUnverified) ||
      ((tokens.cacheCreation ?? 0) > 0 && writePriced && !cacheUnverified);
    return {
      totalCost: null,
      costBasis: 'unknown',
      pricingCoverage: someUsedRate ? 'partial' : 'none',
      priceProvenance: provenance,
      // A missing used rate is an absent published rate; only ambiguous cache
      // semantics alone keeps the cause on the usage side.
      costUnavailableReason: rateMissing
        ? 'rate-missing'
        : 'usage-incomplete',
    };
  }
  const oneHour = tokens.cacheCreation1h ?? 0;
  const unrounded =
    tokens.input * pricing.inputCostPerToken +
    tokens.output * pricing.outputCostPerToken +
    (tokens.cacheHit ?? 0) * (pricing.cacheReadCostPerToken ?? 0) +
    ((tokens.cacheCreation ?? 0) - oneHour) * (pricing.cacheCreationCostPerToken ?? 0) +
    oneHour * (pricing.cacheCreation1hCostPerToken ?? 0);
  const rounded = Math.round(unrounded * 1e6) / 1e6;
  return {
    // Rounding to 6 decimals must not turn real non-zero usage into $0.
    totalCost: rounded === 0 && unrounded > 0 ? unrounded : rounded,
    costBasis: availableBasis,
    pricingCoverage: (tokens.cacheCreation ?? 0) > 0 && tokens.cacheCreation1h === undefined &&
      (pricing.cacheCreation1hCostPerToken !== undefined || /claude-/.test(modelId) || pricing.provider === 'anthropic') ? 'partial' : 'full',
    priceProvenance: provenance,
  };
}

/** Non-secret identity of the effective query route, captured at creation. */
export interface ContextCapacityRoute {
  readonly kind: 'native' | 'proxy';
  readonly providerId: string | null;
}

export interface ContextCapacity {
  readonly tokens: number | null;
  readonly source: 'sdk-native' | 'provider-catalog' | 'unknown';
  readonly providerId: string | null;
  readonly model: string;
}

const MAX_DISCOVERED_CONTEXT_WINDOW_KEYS = 4096;
/** Exact provider/model pairs. The empty provider namespace is legacy only. */
const discoveredContextWindows = new Map<string, number>();

function contextWindowKey(modelId: string, providerId?: string): string {
  return JSON.stringify([providerId ?? null, modelId]);
}

/** Record only positive finite provider observations; refresh recency on write. */
export function registerModelContextWindows(
  entries: ReadonlyArray<{
    readonly id: string;
    readonly contextLength: number;
  }>,
  providerId?: string,
): void {
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id) continue;
    const length = entry.contextLength;
    if (typeof length !== 'number' || !Number.isFinite(length) || length < 1)
      continue;
    const key = contextWindowKey(entry.id, providerId);
    discoveredContextWindows.delete(key);
    discoveredContextWindows.set(key, Math.floor(length));
  }
  while (discoveredContextWindows.size > MAX_DISCOVERED_CONTEXT_WINDOW_KEYS) {
    const oldest = discoveredContextWindows.keys().next().value;
    if (oldest === undefined) break;
    discoveredContextWindows.delete(oldest);
  }
}

/** Make `entries` the provider's complete capacity evidence: a refreshed */
export function replaceProviderContextWindows(
  providerId: string,
  entries: ReadonlyArray<{
    readonly id: string;
    readonly contextLength: number;
  }>,
): void {
  for (const key of Array.from(discoveredContextWindows.keys())) {
    const [keyProvider] = JSON.parse(key) as [string | null, string];
    if (keyProvider === providerId) discoveredContextWindows.delete(key);
  }
  registerModelContextWindows(entries, providerId);
}

/** No aliases, model-family defaults or cross-provider discovery. */
export function getDiscoveredContextWindow(
  modelId: string,
  providerId?: string,
): number {
  return (
    discoveredContextWindows.get(contextWindowKey(modelId, providerId)) ?? 0
  );
}

/** Capacity evidence is independent of pricing and cumulative usage accounting. */
export function resolveContextCapacity(params: {
  readonly route?: ContextCapacityRoute;
  readonly model: string;
  readonly sdkContextWindow?: number;
}): ContextCapacity {
  const { route, model, sdkContextWindow } = params;
  const providerId = route?.providerId ?? null;
  if (
    route?.kind === 'native' &&
    typeof sdkContextWindow === 'number' &&
    Number.isFinite(sdkContextWindow) &&
    sdkContextWindow > 0
  ) {
    return {
      tokens: sdkContextWindow,
      source: 'sdk-native',
      providerId,
      model,
    };
  }
  const catalog = providerId
    ? getDiscoveredContextWindow(model, providerId)
    : 0;
  return catalog > 0
    ? { tokens: catalog, source: 'provider-catalog', providerId, model }
    : { tokens: null, source: 'unknown', providerId, model };
}

export function getModelContextWindow(modelId: string): number {
  if (!modelId) return 0;
  const discovered = discoveredContextWindows.get(contextWindowKey(modelId));
  if (discovered !== undefined) return discovered;
  const pricing = lookupPricingEntry(modelId, false);
  if (pricing?.maxTokens) return pricing.maxTokens;

  const stripped = modelId
    .replace(/^(?:anthropic|openrouter|google|openai|moonshot|zai)\//i, '')
    .toLowerCase();

  // The minor version is OPTIONAL. Anthropic's ids carried one up to
  // `claude-opus-4-5`, then dropped it at `claude-opus-5`. Requiring it meant
  // every id in the new scheme fell through to `return 0` — no context window
  // at all, so the header's context-fill bar read 0% for the whole Opus 5 line.
  const claudeModern = stripped.match(
    /^claude-(opus|sonnet|haiku)-(\d+)(?:[-.](\d+))?/,
  );
  if (claudeModern) {
    const family = claudeModern[1];
    const major = Number.parseInt(claudeModern[2], 10);
    // Absent minor reads as .0 — `claude-opus-5` is 5.0, not 5.undefined.
    const minor = claudeModern[3] ? Number.parseInt(claudeModern[3], 10) : 0;
    if (family === 'opus' && (major > 4 || (major === 4 && minor >= 6))) {
      return 1_000_000;
    }
    return 200_000;
  }

  if (/^claude-3/.test(stripped)) return 200_000;

  return 0;
}

/** Get a human-readable description of model pricing */
export function getModelPricingDescription(
  modelId: string,
  options?: FindPricingOptions,
): string {
  const pricing = findModelPricing(modelId);
  if (!pricing) return 'Pricing unavailable';

  const inputPer1M = (pricing.inputCostPerToken * 1000000).toFixed(2);
  const outputPer1M = (pricing.outputCostPerToken * 1000000).toFixed(2);
  const rates = `Input: $${inputPer1M}/1M, Output: $${outputPer1M}/1M`;

  // Same rates, flagged as reference: the user is not billed these per token,
  // they are what the tokens would cost on the open market.
  return options?.subscriptionCovered
    ? `${rates} · covered by subscription`
    : rates;
}

export function formatClaudeModelDisplayName(modelId: string): string {
  if (!modelId) return 'Unknown';
  const stripped = modelId.replace(
    /^(?:anthropic|openrouter|google|openai|moonshot|zai)\//i,
    '',
  );
  // A trailing bracketed variant tag — `claude-opus-5[1m]` for the 1M-context
  // beta — is part of the id the SDK reports back in `modelUsage`, so it lands
  // in front of users. It is not part of the version, so lift it out before
  // matching and re-attach it as the suffix.
  const variantMatch = stripped.match(/^(.*?)\[([^\]]+)\]$/);
  const withoutVariant = variantMatch ? variantMatch[1] : stripped;
  const variant = variantMatch ? variantMatch[2] : null;
  const noDate = withoutVariant
    .replace(/-\d{8}$/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '');
  // Minor version OPTIONAL — Anthropic dropped it after `claude-opus-4-5`, so
  // requiring it left the whole Opus 5 line falling through to the raw id.
  const modern = noDate.match(
    /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?(?:-(.+))?$/i,
  );
  if (modern) {
    const [, family, maj, min, suffix] = modern;
    const cap = family[0].toUpperCase() + family.slice(1).toLowerCase();
    const version = min ? `${maj}.${min}` : maj;
    // A variant tag and a name suffix can both be present
    // (`claude-opus-5-fast[1m]`); show both rather than silently dropping one.
    const qualifiers = [suffix, variant].filter(Boolean).join(', ');
    return qualifiers
      ? `${cap} ${version} (${qualifiers})`
      : `${cap} ${version}`;
  }
  const legacy = noDate.match(/^claude-(\d+)(?:-(\d+))?-(opus|sonnet|haiku)$/i);
  if (legacy) {
    const [, gen, sub, family] = legacy;
    const cap = family[0].toUpperCase() + family.slice(1).toLowerCase();
    return sub ? `${cap} ${gen}.${sub}` : `${cap} ${gen}`;
  }
  if (noDate.length > 30) return noDate.slice(0, 30) + '...';
  return noDate;
}

export function resolveModelDisplayName(
  modelId: string,
  availableModels?: ReadonlyArray<{ id: string; name: string }>,
): string {
  if (!modelId) return 'Unknown';
  if (availableModels) {
    const match = availableModels.find((m) => m.id === modelId);
    if (match) return match.name;
  }
  return formatClaudeModelDisplayName(modelId);
}
