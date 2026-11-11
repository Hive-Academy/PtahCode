/** Redaction hook supplied by the publication service (secrets, local paths, forged markers). */
export type Redact = (value: string) => string;

export const identityRedact: Redact = (value) => value;

/** Shortens text to `max` characters and ends it with an ellipsis. */
export function cut(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Zero-width space. It breaks a mention, an issue reference or a link without a visible change. */
const ZWSP = String.fromCharCode(0x200b);

/**
 * Model and bot text is untrusted. It must not notify a user, reference an issue or become a link.
 * A backslash does not stop GitHub from linking the text, so a zero-width space breaks the pattern.
 */
function neutralizeReferences(value: string): string {
  return value
    .replace(/@/g, `@${ZWSP}`)
    .replace(/#(?=\d)/g, `#${ZWSP}`)
    .replace(/\b([a-z][a-z0-9+.-]*):\/\//gi, `$1:${ZWSP}//`)
    .replace(/\bwww\./gi, `www${ZWSP}.`);
}

/** Model text is plain text. Escape HTML and Markdown syntax once, fold newlines, redact first. */
export function plain(value: string, redact: Redact = identityRedact): string {
  return neutralizeReferences(redact(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]|~])/g, '\\$1')
    .replace(/\s*\r?\n\s*/g, ' ').trim());
}

/** Inline code span that cannot be closed by its own content. Long values keep their tail. */
export function code(value: string, redact: Redact = identityRedact, max = 80): string {
  const clean = redact(value).replace(/[`\r\n|<>]/g, ' ').replace(/\s+/g, ' ').trim();
  const shown = clean.length > max ? `…${clean.slice(clean.length - max + 1)}` : clean;
  return shown ? `\`${shown}\`` : '';
}

/** A table cell: plain text with a length cap. */
export function cell(value: string, max: number, redact: Redact = identityRedact): string {
  return plain(cut(redact(value).replace(/\s+/g, ' ').trim(), max));
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function isSha(value: string): boolean {
  return /^[0-9a-f]{7,40}$/.test(value);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Lists the first `limit` items and ends with "+N more" when some are left out. */
export function listWithMore(items: readonly string[], limit: number): string {
  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest} more` : shown.join(', ');
}
