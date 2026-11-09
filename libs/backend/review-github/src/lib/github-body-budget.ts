import { GitHubReviewError } from './github-review.error';

export const MAX_BODY_CHARS = 65_536;

function closeBlocks(value: string): string {
  let inFence = false;
  let details = 0;
  for (const line of value.split('\n')) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const tag of line.match(/<details(?:\s[^>]*)?>|<\/details>/g) ?? []) {
      details += tag.startsWith('</') ? -1 : 1;
    }
  }
  return value + (inFence ? '\n```' : '') + '\n</details>'.repeat(Math.max(0, details));
}

/** Keep marker suffixes whole; optional Markdown is removed as complete sections. */
export function boundedBody(content: string, markers: readonly string[], maxChars = MAX_BODY_CHARS): string {
  const suffix = markers.length ? `\n\n${markers.join('\n')}` : '';
  const full = `${content}${suffix}`;
  if (full.length <= maxChars) return full;
  const pieces = content.split(/\n\n/);
  // The heading and impact are required for an inline comment. For a summary,
  // this retains its heading and count before omitting optional tables/details.
  const requiredCount = pieces[1] ? 2 : 1;
  const requiredPieces = pieces.slice(0, requiredCount);
  if (requiredPieces[1]?.length > 2_000) requiredPieces[1] = `${requiredPieces[1].slice(0, 1_999)}…`;
  const required = requiredPieces.join('\n\n');
  const omitted = `\n\n… ${Math.max(0, pieces.length - requiredCount)} sections omitted because of GitHub's comment limit.`;
  const reduced = `${closeBlocks(required)}${omitted}${suffix}`;
  if (reduced.length > maxChars) {
    throw new GitHubReviewError('publication-unavailable', 'Required review body exceeds GitHub limit');
  }
  return reduced;
}
