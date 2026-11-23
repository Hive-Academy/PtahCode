/**
 * Redaction for one stderr line of a provider-session lane.
 *
 * Every provider-session lane routes its agent's stderr through
 * {@link redactLaneStderr} before the line reaches the lane output or its
 * segments. That covers the Antigravity (agy) lane and the Grok lane alike, so
 * Grok stderr is redacted too: a secret on a Grok stderr line now shows as
 * `[REDACTED]` instead of in clear text.
 *
 * The rules are the ones the agy headless adapter applied to its stderr: a
 * quoted key whose name looks secret, an inline `Bearer` credential and an
 * inline `key=value` / `key: value` secret field. The lane's own Ptah MCP
 * token is scrubbed as well, wherever it appears in the line.
 *
 * {@link laneStderrLine} classifies the original line and emits only the
 * redacted text: a field rule can mask the rest of a line, status words
 * included (`authorization: Bearer x 401 Unauthorized`), and the severity
 * must not drop to `info` because of that.
 */
import { classifyCliStderr, type CliStderrSeverity } from '../cli-stderr-severity';

const REDACTED = '[REDACTED]';

/**
 * A quoted key followed by a quoted value: group 1 is everything up to and
 * including the value's opening quote, group 3 the key text. Whether the key
 * names a secret is decided in {@link redactQuotedSecrets}, so the key length
 * is unbounded and costs linear time: every body is one quantifier over two
 * alternatives that never match the same character, and a quote right after a
 * backslash never opens a key, so no two key scans share a run of escaped
 * quotes. The value runs to its own closing quote (matched by backreference),
 * so the other quote type and backslash escapes stay inside it; an
 * unterminated value runs to the end of the line.
 */
const QUOTED_PAIR =
  /((?<!\\)(["'])((?:\\.|(?!\2)[^\\\r\n])*)\2\s*:\s*(["']))(?:\\.|(?!\4)[^\\\r\n])*/g;

/** A word that marks a quoted key as secret, anywhere in the key. */
const SECRET_KEY_WORD = /token|key|secret|authorization|password|credential|cookie|session/i;

/**
 * An inline `Bearer <credential>` or `<secret field>[:=] <value>`. The secret
 * word may be the last segment of a snake- or kebab-case field
 * (`access_token`, `client_secret`, `x-api-key`): it must not follow a letter
 * or digit, which `\b` would also reject after `_`. A bare `key` counts only
 * as such a last segment (`private_key`), never on its own or inside a word
 * (`monkey`). A quote does not end either value: a field value may hold or
 * start with a quoted string (escapes allowed; an unterminated one runs to the
 * end of the line), and a comma outside quotes ends it. Each alternative
 * starts on a different character, so the match stays linear on long lines.
 */
const INLINE_SECRET =
  /\b(bearer\s+)[^\s,;]+|((?:(?<![A-Za-z0-9])(?:api[_-]?key|token|secret|authorization|password|credential|set-cookie|cookie|session)|(?<=[A-Za-z0-9])[_-]key)\s*[:=]\s*)(?:"(?:\\.|[^"\\\r\n])*"?|'(?:\\.|[^'\\\r\n])*'?|[^\r\n,"'])+/gi;

/**
 * Replace the value of every quoted pair whose key names a secret. A pair
 * whose key does not is skipped by one character only, as a failed match
 * would be, so a secret pair inside its value (`"msg": "{'token': 'x'}"`) is
 * still found.
 */
function redactQuotedSecrets(line: string): string {
  const pattern = new RegExp(QUOTED_PAIR);
  let redacted = '';
  let copied = 0;
  for (let match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
    if (!SECRET_KEY_WORD.test(match[3])) {
      pattern.lastIndex = match.index + 1;
      continue;
    }
    redacted += `${line.slice(copied, match.index)}${match[1]}${REDACTED}`;
    copied = match.index + match[0].length;
  }
  return copied === 0 ? line : redacted + line.slice(copied);
}

/**
 * Return `line` with its secrets replaced by `[REDACTED]`. Pure: no I/O, never
 * throws. An empty or missing `mcpToken` scrubs nothing extra.
 */
export function redactLaneStderr(line: string, mcpToken?: string): string {
  const redacted = redactQuotedSecrets(line).replace(
    INLINE_SECRET,
    (_match, bearer: string | undefined, field: string | undefined) =>
      `${bearer ?? field ?? ''}${REDACTED}`,
  );
  // An empty search string would insert the marker between every character.
  return mcpToken ? redacted.replaceAll(mcpToken, REDACTED) : redacted;
}

/**
 * One stderr line as the lane shows it: the severity of the original line
 * (the severity is a label, so nothing secret leaves) and the redacted text.
 */
export function laneStderrLine(
  line: string,
  mcpToken?: string,
): { readonly severity: CliStderrSeverity; readonly text: string } {
  return { severity: classifyCliStderr(line), text: redactLaneStderr(line, mcpToken) };
}
