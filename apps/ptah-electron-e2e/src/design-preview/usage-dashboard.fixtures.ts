import type {
  PlanLimitOwnerSnapshot,
  PlanLimitsSnapshot,
  PlanLimitWindow,
  UsageFact,
  UsageSummary,
  UsageTopSession,
} from '@ptah-extension/shared';

const DAY_MS = 86_400_000;
const RANGE = 30;

interface ModelSpec {
  providerId: string;
  modelId: string;
  /** Total cost over the range in USD; null = unpriced. */
  totalUsd: number | null;
  /** Total output tokens over the range. */
  output: number;
  source: UsageFact['costSource'];
}

const MODELS: readonly ModelSpec[] = [
  { providerId: 'anthropic', modelId: 'claude-opus-4', totalUsd: 460, output: 5_200_000, source: 'model-priced' },
  { providerId: 'anthropic', modelId: 'claude-sonnet-4', totalUsd: 220, output: 9_800_000, source: 'model-priced' },
  { providerId: 'anthropic', modelId: 'claude-haiku-4', totalUsd: 50, output: 6_100_000, source: 'model-priced' },
  { providerId: 'codex', modelId: 'gpt-5-codex', totalUsd: 230, output: 4_400_000, source: 'provider-reported' },
  { providerId: 'codex', modelId: 'gpt-5-mini', totalUsd: 90, output: 3_900_000, source: 'provider-reported' },
  { providerId: 'grok', modelId: 'grok-code-fast', totalUsd: 12, output: 2_700_000, source: 'model-priced' },
  { providerId: 'mystery-cli', modelId: 'mystery-large', totalUsd: 3, output: 600_000, source: 'model-priced' },
  { providerId: 'mystery-cli', modelId: 'mystery-preview', totalUsd: null, output: 900_000, source: 'unpriced' },
];

function dayString(now: number, offset: number): string {
  return new Date(now - offset * DAY_MS).toISOString().slice(0, 10);
}

/** Deterministic weekday-heavy weight per day so the chart has a shape. */
function weight(index: number): number {
  const base = 0.55 + 0.45 * Math.abs(Math.sin(index * 1.7));
  return index % 7 === 5 || index % 7 === 6 ? base * 0.35 : base;
}

function buildFacts(now: number): UsageFact[] {
  const weights = Array.from({ length: RANGE }, (_, i) => weight(i));
  const sum = weights.reduce((a, b) => a + b, 0);
  const facts: UsageFact[] = [];
  for (const m of MODELS) {
    for (let i = 0; i < RANGE; i++) {
      // The unknown-provider model only appears on some days.
      if (m.providerId === 'mystery-cli' && i % 3 !== 0) continue;
      const share = weights[i] / sum;
      const output = Math.round(m.output * share);
      const costUsd =
        m.totalUsd === null ? null : Number((m.totalUsd * share).toFixed(4));
      facts.push({
        day: dayString(now, RANGE - 1 - i),
        providerId: m.providerId,
        modelId: m.modelId,
        inputUncachedTokens: Math.round(output * 0.4),
        cacheReadTokens: Math.round(output * 9),
        cacheWriteTokens: Math.round(output * 0.8),
        outputTokens: output,
        costUsd,
        knownCostUsd: costUsd ?? 0,
        cacheSavingsUsd: costUsd === null ? null : Number((costUsd * 1.8).toFixed(4)),
        costSource: m.source,
        requestCount: Math.max(1, Math.round(output / 6000)),
        sourceId: `${m.providerId}-local`,
      });
    }
  }
  return facts;
}

function session(
  now: number,
  n: number,
  title: string,
  providerId: string,
  modelId: string,
  costUsd: number | null,
  tokens: number,
): UsageTopSession {
  return {
    sessionId: `sess-${n}`,
    title,
    providerId,
    modelId,
    costUsd,
    unpriced: costUsd === null,
    tokens,
    messageCount: 40 + n * 17,
    subagentCount: n % 3,
    lastActive: new Date(now - n * 7 * 3_600_000).toISOString(),
  };
}

export function usageSummary(now: number): UsageSummary {
  return {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    timeZone: 'UTC',
    fromDay: dayString(now, RANGE - 1),
    untilDayExclusive: dayString(now, -1),
    facts: buildFacts(now),
    topSessions: [
      session(now, 1, 'Redesign the analytics usage page layout', 'anthropic', 'claude-opus-4', 84.2, 18_400_000),
      session(now, 2, 'Migrate the quota readers to the shared parser', 'codex', 'gpt-5-codex', 61.75, 12_900_000),
      session(now, 3, 'Investigate flaky Electron e2e launch on Windows', 'anthropic', 'claude-sonnet-4', 48.1, 15_200_000),
      session(now, 4, 'Add Antigravity plan windows', 'anthropic', 'claude-sonnet-4', 33.9, 9_700_000),
      session(now, 5, 'Grok lane smoke test', 'grok', 'grok-code-fast', 2.4, 1_200_000),
      session(now, 6, 'Prototype with an unpriced provider', 'mystery-cli', 'mystery-preview', null, 800_000),
    ].slice(0, 5),
    sessionCount: 212,
    messageCount: 9_840,
    subagentCount: 431,
    sources: [
      { sourceId: 'anthropic-local', status: 'complete', scannedFiles: 1_204 },
      { sourceId: 'codex-local', status: 'complete', scannedFiles: 388 },
      { sourceId: 'grok-local', status: 'partial', reason: 'Some records lack token counts', malformedRecords: 3 },
      { sourceId: 'mystery-cli-local', status: 'partial', reason: 'No pricing for mystery-preview' },
    ],
    repositories: [
      {
        repositoryId: 'C:\\work\\ptah-extension',
        worktreePaths: [
          'C:\\work\\ptah-extension',
          'C:\\work\\ptah-extension\\.claude-worktrees\\fix-usage-layout',
        ],
        inputTokens: 41_000_000,
        outputTokens: 18_500_000,
        cacheReadTokens: 410_000_000,
        cacheWriteTokens: 33_000_000,
        knownCostMicroUsd: 905_000_000,
        hasUnknownTokens: false,
      },
      {
        repositoryId: 'C:\\work\\legacy-service',
        worktreePaths: ['C:\\work\\legacy-service'],
        inputTokens: null,
        outputTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        knownCostMicroUsd: 160_000_000,
        hasUnknownTokens: true,
      },
    ],
    pricing: { source: 'bundled', asOf: new Date(now - 3 * DAY_MS).toISOString() },
  };
}

function windowOf(
  now: number,
  w: Partial<PlanLimitWindow> & Pick<PlanLimitWindow, 'key' | 'kind' | 'label'>,
  percent: number,
  resetInMs: number,
): PlanLimitWindow {
  return {
    used: { kind: 'percent', percent },
    usedSource: 'provider-api',
    usedObservedAt: now,
    resetsAt: now + resetInMs,
    resetSource: 'provider-api',
    observedAt: now,
    ...w,
  };
}

function owner(
  now: number,
  key: string,
  providerId: string,
  label: string,
  windows: readonly PlanLimitWindow[],
  extra: Partial<PlanLimitOwnerSnapshot> = {},
): PlanLimitOwnerSnapshot {
  return {
    owner: { key, providerId, identityKind: 'account', label },
    status: 'available',
    fetchedAt: now,
    source: 'provider-api',
    readAt: now,
    windowSetEstablished: windows.length > 0,
    windows,
    ownerEvidence: [],
    ...extra,
  };
}

export function planLimitsSnapshot(now: number): PlanLimitsSnapshot {
  const H = 3_600_000;
  return {
    generatedAt: now,
    sessionOwners: {},
    owners: [
      owner(now, 'anthropic:max', 'anthropic', 'Claude Max (work)', [
        windowOf(now, { key: 'five_hour', kind: 'five_hour', label: '5 hour', durationMins: 300 }, 38, 2 * H),
        windowOf(now, { key: 'weekly', kind: 'weekly', label: 'Weekly', durationMins: 10_080 }, 61, 70 * H),
      ]),
      owner(now, 'codex:pro', 'codex', 'Codex Pro', [
        windowOf(now, { key: 'five_hour', kind: 'five_hour', label: '5 hour', durationMins: 300 }, 94, 50 * 60_000),
      ]),
      owner(now, 'grok:cli', 'grok', 'Grok CLI', [], {
        status: 'cli-unavailable',
        windowSetEstablished: false,
        statusReason: 'cli-not-signed-in',
      }),
      owner(now, 'antigravity:main', 'antigravity', 'Antigravity (personal)', [
        windowOf(now, { key: 'weekly_model:gemini-pro', kind: 'weekly_model', label: 'Gemini Pro', modelScope: 'gemini-pro' }, 22, 40 * H),
        windowOf(now, { key: 'weekly_model:gemini-flash', kind: 'weekly_model', label: 'Gemini Flash', modelScope: 'gemini-flash' }, 47, 40 * H),
        windowOf(now, { key: 'weekly_model:claude', kind: 'weekly_model', label: 'Claude (via Antigravity)', modelScope: 'claude' }, 78, 40 * H),
        windowOf(now, { key: 'other:image', kind: 'other', label: 'Image generation' }, 9, 40 * H),
      ]),
    ],
  };
}
