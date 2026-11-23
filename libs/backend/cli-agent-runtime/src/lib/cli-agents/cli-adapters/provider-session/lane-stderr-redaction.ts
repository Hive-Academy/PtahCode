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
 * A quoted key that names a secret, followed by a quoted value. The value runs
 * to the same closing quote (group 2, matched by backreference), so the other
 * quote type and backslash escapes stay inside it; an unterminated value runs
 * to the end of the line. The two body alternatives never match the same
 * character, so the value costs linear time. The key text on each side of the
 * secret word is capped at 128 characters: unbounded, a quote followed by a
 * long run of secret words made the key part quadratic (about 1.2 s on a
 * 100 KB line).
 */
const QUOTED_SECRET =
  /(["'](?:[^"'\r\n]{0,128}(?:token|key|secret|authorization|password|credential|cookie|session)[^"'\r\n]{0,128})["']\s*:\s*)(["'])(?:\\.|(?!\2)[^\\\r\n])*/gi;

/**
 * An inline `Bearer <credential>` or `<secret field>[:=] <value>`. A quote does
 * not end either value: a field value may hold or start with a quoted string
 * (escapes allowed; an unterminated one runs to the end of the line), and a
 * comma outside quotes ends it. Each alternative starts on a different
 * character, so the match stays linear on long lines.
 */
const INLINE_SECRET =
  /\b(bearer\s+)[^\s,;]+|\b((?:api[_-]?key|token|secret|authorization|password|credential|set-cookie|cookie|session)\s*[:=]\s*)(?:"(?:\\.|[^"\\\r\n])*"?|'(?:\\.|[^'\\\r\n])*'?|[^\r\n,"'])+/gi;

/**
 * Return `line` with its secrets replaced by `[REDACTED]`. Pure: no I/O, never
 * throws. An empty or missing `mcpToken` scrubs nothing extra.
 */
export function redactLaneStderr(line: string, mcpToken?: string): string {
  const redacted = line
    .replace(QUOTED_SECRET, `$1$2${REDACTED}`)
    .replace(
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
