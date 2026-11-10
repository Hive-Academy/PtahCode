import { escapeText } from './review-markdown.renderer';

const unsafeText = /(?:[A-Za-z]:\\[^\s]+|\/(?:Users|home|tmp|var|private)\/[^\s]+|(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{8,}|(?:ignore previous instructions|system prompt|developer message))/gi;

/** Removes each configured secret (for example the bot token) from text that leaves the host. */
export function redactSecrets(value: string, secrets: readonly string[]): string {
  let text = value;
  for (const secret of secrets) if (secret.length >= 4) text = text.split(secret).join('[redacted]');
  return text;
}

/** Removes local paths, credentials, prompt-injection phrases and forged finding markers from published text. */
export function safeText(value: string, secrets: readonly string[]): string {
  const text = redactSecrets(value.replace(unsafeText, '[redacted]'), secrets);
  return text.replace(/<!--\s*ptah-review:finding:/gi, '&lt;!-- ptah-review:finding:');
}

/** The hidden marker that publication adds to the GitHub comment of a finding. */
export function findingMarker(findingId: string): string {
  return `<!-- ptah-review:finding:${findingId} -->`;
}

/**
 * The title text that publication writes after `### <badge> · ` in a finding heading.
 * Publication and thread matching must both use this function, so a title always matches its own heading.
 */
export function publishedFindingTitle(title: string, secrets: readonly string[]): string {
  return escapeText(safeText(title, secrets));
}
