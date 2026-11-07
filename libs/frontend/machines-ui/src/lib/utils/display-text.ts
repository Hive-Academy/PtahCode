import { Pipe, type PipeTransform } from '@angular/core';

/** Default cap for one worker-supplied string in the Machines view. */
export const DISPLAY_TEXT_MAX_LENGTH = 80;

const ELLIPSIS = '…';

/**
 * C0 and C1 control characters, bidi embeddings, overrides, isolates and
 * marks (Trojan Source), and zero-width characters.
 */
const UNSAFE_CHARACTERS =
  // eslint-disable-next-line no-control-regex -- matching control characters is the purpose: they are removed.
  /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/** Control characters that separate words; they become a space. */
const SEPARATING_CONTROL = /[\t\n\v\f\r\u0085]/;

const WHITESPACE_RUN = /\s+/g;

/**
 * Make one worker-supplied string (display name, host name, version, error
 * text) safe to show as plain text: drop control, bidi and zero-width
 * characters, collapse whitespace, trim, and cap the length at `max` code
 * points, ending with an ellipsis when cut. `null` and `undefined` give `''`.
 *
 * This is the only path such strings take into a template, and templates
 * bind the result through interpolation, never `[innerHTML]`.
 */
export function displayText(
  value: string | null | undefined,
  max: number = DISPLAY_TEXT_MAX_LENGTH,
): string {
  if (value === null || value === undefined) return '';
  // Controls become spaces first so "a\nb" reads "a b", not "ab".
  const clean = value
    .replace(UNSAFE_CHARACTERS, (char) =>
      SEPARATING_CONTROL.test(char) ? ' ' : '',
    )
    .replace(WHITESPACE_RUN, ' ')
    .trim();
  const points = Array.from(clean);
  if (points.length <= max) return clean;
  const limit = Math.max(max - 1, 0);
  return points.slice(0, limit).join('').trimEnd() + ELLIPSIS;
}

/** Template form of {@link displayText}: `{{ name | displayText }}`. */
@Pipe({ name: 'displayText', standalone: true })
export class DisplayTextPipe implements PipeTransform {
  public transform(value: string | null | undefined, max?: number): string {
    return displayText(value, max);
  }
}
