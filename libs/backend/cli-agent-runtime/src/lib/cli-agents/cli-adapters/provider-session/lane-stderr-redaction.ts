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
 */

const REDACTED = '[REDACTED]';

/** A quoted key that names a secret, followed by a quoted value. */
const QUOTED_SECRET =
  /(["'](?:[^"']*(?:token|key|secret|authorization|password|credential|cookie|session)[^"']*)["']\s*:\s*["'])[^"']+/gi;

/** An inline `Bearer <credential>` or `<secret field>[:=] <value>`. */
const INLINE_SECRET =
  /\b(bearer\s+)[^\s,;"']+|\b((?:api[_-]?key|token|secret|authorization|password|credential|set-cookie|cookie|session)\s*[:=]\s*)[^\r\n,"']+/gi;

/**
 * Return `line` with its secrets replaced by `[REDACTED]`. Pure: no I/O, never
 * throws. An empty or missing `mcpToken` scrubs nothing extra.
 */
export function redactLaneStderr(line: string, mcpToken?: string): string {
  const redacted = line
    .replace(QUOTED_SECRET, `$1${REDACTED}`)
    .replace(
      INLINE_SECRET,
      (_match, bearer: string | undefined, field: string | undefined) =>
        `${bearer ?? field ?? ''}${REDACTED}`,
    );
  // An empty search string would insert the marker between every character.
  return mcpToken ? redacted.replaceAll(mcpToken, REDACTED) : redacted;
}
