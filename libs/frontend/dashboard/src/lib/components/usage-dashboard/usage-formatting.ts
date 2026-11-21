/** Pure dashboard formatting and UTC day labels. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Hard stop for day enumeration so a broken window cannot loop forever. */
const MAX_WINDOW_DAYS = 400;

// ---------------------------------------------------------------------------
// Formatting (pure; the components reuse these so every surface agrees)
// ---------------------------------------------------------------------------

const usdFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const compactUsdFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const smallUsdFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumSignificantDigits: 2,
});
const compactTokenFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const percentFormat = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});
const shortDayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const shortDayYearFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "$1,234.56" — the big total and table costs. */
export function formatUsd(value: number): string {
  return usdFormat.format(value);
}

/** "$1.2K" — chart axis labels and compact cost chips. */
export function formatCompactUsd(value: number): string {
  return compactUsdFormat.format(value);
}

/**
 * Chart axis and readout values: sub-dollar amounts keep two significant
 * digits so small scales never collapse to identical "$0" labels.
 */
export function formatChartUsd(value: number): string {
  if (value > 0 && value < 1) return smallUsdFormat.format(value);
  return compactUsdFormat.format(value);
}

/** "48B", "46.2M" — token counts everywhere. */
export function formatCompactTokens(value: number): string {
  return compactTokenFormat.format(value);
}

/** "34.3%" — share columns and quality panel. */
export function formatPercent(value: number): string {
  return percentFormat.format(value);
}

const tokenCountFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

/**
 * Table cost cells: "$1,234.56", and two significant digits ("$0.0034") for
 * a positive amount under a cent, so a real cost never reads as "$0.00".
 */
export function formatTableUsd(value: number): string {
  if (value > 0 && value < 0.01) return smallUsdFormat.format(value);
  return usdFormat.format(value);
}

/**
 * One cost cell label: `unknownLabel` when unpriced, "≥ $3.00" when the
 * known sum is a lower bound, "$3.00" otherwise.
 */
export function formatCostCell(
  costUsd: number | null,
  lowerBound: boolean,
  unknownLabel = '—',
): string {
  if (costUsd === null) return unknownLabel;
  const label = formatTableUsd(costUsd);
  return lowerBound ? `≥ ${label}` : label;
}

/**
 * Share cells: "—" when unknown, "<0.1%" for a positive share that would
 * round to "0%", ">99.9%" for a share under one that would round to "100%".
 */
export function formatShare(share: number | null): string {
  if (share === null) return '—';
  if (share > 0 && share < 0.001) return '<0.1%';
  if (share > 0.999 && share < 1) return '>99.9%';
  return formatPercent(share);
}

/** "1,200,424,998" — an exact count with thousands separators. */
export function formatCount(value: number): string {
  return tokenCountFormat.format(value);
}

/** "12,345 tokens" — the exact count behind a compact token cell. */
export function formatTokenCount(value: number): string {
  return `${formatCount(value)} ${value === 1 ? 'token' : 'tokens'}`;
}

/**
 * Short repository name: the last segment of a path or remote id without a
 * trailing ".git" ("/work/ptah-extension.git" → "ptah-extension",
 * "git@host:org/repo.git" → "repo"). Falls back to the id itself.
 */
export function repositoryDisplayName(repositoryId: string): string {
  const segments = repositoryId.split(/[\\/:]/).filter((part) => part.length > 0);
  const last = segments.at(-1) ?? '';
  const name = last.replace(/\.git$/i, '');
  return name.length > 0 ? name : repositoryId;
}

/**
 * Short age of `fromIso` at `nowIso`: "Just now", "12m ago", "5h ago",
 * "3d ago", then the UTC day ("Oct 14") after 30 days. "—" when either
 * timestamp does not parse. A timestamp after `now` counts as "Just now".
 */
export function formatRelativeAge(fromIso: string, nowIso: string): string {
  const from = Date.parse(fromIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(from) || Number.isNaN(now)) return '—';
  const minutes = Math.floor(Math.max(0, now - from) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days <= 30) return `${days}d ago`;
  return shortDayFormat.format(from);
}

// ---------------------------------------------------------------------------
// Inline bars (decorative next to a text value)
// ---------------------------------------------------------------------------

/** Smallest drawn width (%) of a positive value, so it never vanishes. */
const MIN_VISIBLE_BAR_PERCENT = 2;

/**
 * Bar width in percent of its track for `value` against `max`: 0 for an
 * unknown, zero or negative value or an unusable max; at least
 * {@link MIN_VISIBLE_BAR_PERCENT} for a positive value; at most 100.
 */
export function barWidthPercent(value: number | null, max: number): number {
  if (value === null || !(value > 0) || !(max > 0)) return 0;
  const percent = (value / max) * 100;
  return Math.min(100, Math.max(MIN_VISIBLE_BAR_PERCENT, percent));
}

/** "Oct 14" for a "2026-10-14" UTC day. */
export function formatDayShort(day: string): string {
  const ms = parseUtcDay(day);
  return Number.isNaN(ms) ? day : shortDayFormat.format(ms);
}

// ---------------------------------------------------------------------------
// Day-window helpers
// ---------------------------------------------------------------------------

function parseUtcDay(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function nextUtcDay(day: string): string {
  return new Date(parseUtcDay(day) + DAY_MS).toISOString().slice(0, 10);
}

/** Every UTC day in `[fromDay, untilDayExclusive)`, oldest first. */
export function enumerateDays(
  fromDay: string,
  untilDayExclusive: string,
): string[] {
  const from = parseUtcDay(fromDay);
  const until = parseUtcDay(untilDayExclusive);
  if (Number.isNaN(from) || Number.isNaN(until) || until <= from) return [];
  const days: string[] = [];
  let cursor = fromDay;
  while (parseUtcDay(cursor) < until && days.length < MAX_WINDOW_DAYS) {
    days.push(cursor);
    cursor = nextUtcDay(cursor);
  }
  return days;
}

/** "Oct 14 – Oct 20, 2026" for the header's date span. */
export function daySpanLabel(days: readonly string[]): string {
  if (days.length === 0) return '';
  const first = parseUtcDay(days[0]!);
  const last = parseUtcDay(days[days.length - 1]!);
  if (Number.isNaN(first) || Number.isNaN(last)) {
    return days.length === 1 ? days[0]! : `${days[0]} – ${days[days.length - 1]}`;
  }
  const sameYear =
    new Date(first).getUTCFullYear() === new Date(last).getUTCFullYear();
  const right = shortDayYearFormat.format(last);
  return sameYear
    ? `${shortDayFormat.format(first)} – ${right}`
    : `${shortDayYearFormat.format(first)} – ${right}`;
}

// ---------------------------------------------------------------------------
// Provider display names (ids in facts are machine slugs)
// ---------------------------------------------------------------------------

const PROVIDER_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  anthropic: 'Anthropic',
  'claude-cli': 'Claude CLI',
  'openai-codex': 'OpenAI Codex',
  codex: 'Codex',
  opencode: 'OpenCode',
  'opencode-go': 'OpenCode Go',
  'opencode-zen': 'OpenCode Zen',
  antigravity: 'Antigravity',
  'github-copilot': 'GitHub Copilot',
  copilot: 'Copilot',
  ollama: 'Ollama',
  'ollama-cloud': 'Ollama Cloud',
  openrouter: 'OpenRouter',
  'kimi-code': 'Kimi Code',
  'z-ai': 'Z.ai',
  grok: 'Grok',
};

/** Readable provider name; unknown ids fall back to a title-cased slug. */
export function providerDisplayName(providerId: string): string {
  if (Object.hasOwn(PROVIDER_DISPLAY_NAMES, providerId)) {
    return PROVIDER_DISPLAY_NAMES[providerId]!;
  }
  return providerId
    .split(/[-._]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
