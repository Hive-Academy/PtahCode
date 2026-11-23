import { type UsageAmount, type UsageMetric, type UsageState, type UsageTotal, usageState } from './session-usage-totals';

type UsageFigure = UsageAmount | Pick<UsageTotal, 'value' | 'state' | 'causes'>;

const MARKERS: Record<UsageState, string> = {
  exact: '',
  estimate: '~',
  'lower-bound': '≥',
  both: '≥ ~',
  unknown: '',
};

const SPOKEN_MARKERS: Record<UsageState, string> = {
  exact: '',
  estimate: 'about ',
  'lower-bound': 'at least ',
  both: 'at least about ',
  unknown: '',
};

function stateOf(figure: UsageFigure): UsageState {
  return 'state' in figure ? figure.state : usageState(figure);
}

function visibleMarker(figure: UsageFigure): string {
  const state = stateOf(figure);
  return state === 'both' && 'preferLowerBoundMarker' in figure && figure.preferLowerBoundMarker === true
    ? MARKERS['lower-bound']
    : MARKERS[state];
}

/** Truncate the reported decimal digits without a binary floating-point multiplication. */
function floorDecimal(value: number, decimals: number, scale = 0): string {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  const digits = integer + fraction;
  const end = integer.length + Number(exponent) - scale + decimals;
  const units = end <= 0 ? '0' : digits.slice(0, end).padEnd(end, '0');
  const padded = units.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals).replace(/^0+(?=\d)/, '');
  return decimals === 0 ? whole : `${whole}.${padded.slice(-decimals)}`;
}

export function formatUsageTokens(figure: UsageFigure): string {
  const { value } = figure;
  if (value === null) return '—';

  const mark = visibleMarker(figure);
  if (value >= 1e9) return `${mark}${floorDecimal(value, 1, 9)}B`;
  if (value >= 1e6) return `${mark}${floorDecimal(value, 1, 6)}M`;
  if (value >= 1e3) return `${mark}${floorDecimal(value, 1, 3)}k`;
  return `${mark}${floorDecimal(value, 0)}`;
}

export function formatUsageCost(figure: UsageFigure): string {
  const { value } = figure;
  if (value === null) return '—';

  const decimals = value >= 10 ? 0 : value > 0 && value < 0.01 ? 3 : 2;
  return `${visibleMarker(figure)}$${floorDecimal(value, decimals)}`;
}

/** Shared text for the usage tooltip and accessible name. */
export function usageDetailsText(figure: UsageFigure, metric: UsageMetric, scope: string): string {
  let spoken = `${metric === 'cost' ? 'Cost' : 'Tokens'} unavailable`;
  if (figure.value !== null) {
    const value = figure.value.toLocaleString('en-US', { maximumSignificantDigits: 21 });
    const [whole, fraction = ''] = value.split('.');
    const reported = metric === 'cost' ? `$${whole}.${fraction.padEnd(2, '0')}` : `${value} tokens`;
    spoken = `${SPOKEN_MARKERS[stateOf(figure)]}${reported}`;
  }
  return [`${scope}: ${spoken}`, ...figure.causes].join('. ');
}
