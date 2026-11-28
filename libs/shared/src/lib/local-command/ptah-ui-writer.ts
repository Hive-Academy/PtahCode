/**
 * Small writer for ptah-ui source text (grammar:
 * `.claude/skills/ptah-surface-authoring/references/ptah-ui.md`). It escapes
 * every value so parsed command output can never change the block structure.
 */
import { cleanText } from './local-command-text';

/** Fence body limits from the grammar ("Limits and budgets"). */
export const PTAH_UI_BODY_MAX_BYTES = 8_192;
export const PTAH_UI_BODY_MAX_LINES = 200;

const MAX_TEXT_LENGTH = 80;

/**
 * Escapes a value for a ptah-ui cell or text position: `\`, `|` and `$` are
 * escaped everywhere (the escapes decode identically in both positions), and
 * control characters are removed. Long values are shortened with an ellipsis.
 */
export function escapePtahUi(value: string, maxLength = MAX_TEXT_LENGTH): string {
  let text = cleanText(value);
  const chars = [...text];
  if (chars.length > maxLength)
    text = `${chars.slice(0, maxLength - 1).join('').trimEnd()}…`;
  return text.replace(/[\\|$]/g, (char) => `\\${char}`);
}

/** A grammar `number`/`udecimal`: at most one decimal, no exponent. */
export function formatPtahUiNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  const text = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return value < 0 && rounded !== 0 ? `-${text}` : text;
}

/** A progress percent, clamped to 0..100. */
export function formatPercentValue(value: number): string {
  return formatPtahUiNumber(Math.min(100, Math.max(0, value)));
}

/** `ok` below 50 %, `warn` below 80 %, otherwise `error`. */
export function percentTone(value: number): 'ok' | 'warn' | 'error' {
  if (value < 50) return 'ok';
  if (value < 80) return 'warn';
  return 'error';
}

/** Collects indented lines of a ptah-ui body. */
export class PtahUiWriter {
  private readonly lines: string[] = [];

  /** Lines other than the `title`: a body needs at least one item. */
  get itemCount(): number {
    return this.lines.filter((line) => !line.startsWith('title ')).length;
  }

  line(depth: number, text: string): this {
    this.lines.push(`${'  '.repeat(depth)}${text}`);
    return this;
  }

  /** The body text, ending with a newline, as the fence grammar requires. */
  body(): string {
    return `${this.lines.join('\n')}\n`;
  }
}

/** UTF-8 byte length without relying on `TextEncoder` or `Buffer`. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** True when the body is within the grammar's byte and line limits. */
export function fitsPtahUiLimits(body: string): boolean {
  const lineCount = body.endsWith('\n')
    ? body.split('\n').length - 1
    : body.split('\n').length;
  return (
    lineCount <= PTAH_UI_BODY_MAX_LINES &&
    utf8Length(body) <= PTAH_UI_BODY_MAX_BYTES
  );
}

/** Wraps a body in an inline ```ptah-ui fence. */
export function ptahUiFence(body: string): string {
  return `\`\`\`ptah-ui\n${body}\`\`\``;
}
