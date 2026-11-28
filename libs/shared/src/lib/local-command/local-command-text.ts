/**
 * Text helpers shared by the local-command parsers and renderers.
 */

// eslint-disable-next-line no-control-regex
const ANSI_SEQUENCE = /\u001b\[[0-9;?]*[A-Za-z]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const STDOUT_WRAPPER =
  /^\s*<local-command-stdout>([\s\S]*)<\/local-command-stdout>\s*$/;

/** Unwraps `<local-command-stdout>`, strips ANSI escapes and normalises line ends. */
export function normaliseCommandText(text: string): string[] {
  const wrapped = STDOUT_WRAPPER.exec(text);
  const inner = wrapped ? wrapped[1] : text;
  return inner
    .replace(ANSI_SEQUENCE, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''));
}

/** Parses `45`, `1.2`, `18,780` into a number; `null` when it is not one. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Parses `5%` / `1.2%` into a number. */
export function parsePercent(text: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(text);
  return match ? parseNumber(match[1]) : null;
}

const TOKEN_UNITS: Readonly<Record<string, number>> = {
  k: 1_000,
  m: 1_000_000,
};

/** Parses `11.8k`, `1m`, `~140`, `227` into a numeric token count. */
export function parseTokens(text: string): number | null {
  const match = /^\s*~?\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*$/.exec(text);
  if (!match) return null;
  const base = parseNumber(match[1]);
  if (base === null) return null;
  const unit = match[2] ? TOKEN_UNITS[match[2].toLowerCase()] : 1;
  return Math.round(base * unit);
}

/** Removes control characters and collapses runs of whitespace. */
export function cleanText(text: string): string {
  return text.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
}
