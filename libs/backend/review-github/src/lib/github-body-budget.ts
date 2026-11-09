import { GitHubReviewError } from './github-review.error';

const MAX_BODY_BYTES = 65_536;

/** Keep marker suffixes whole; optional Markdown is removed as complete sections. */
export function boundedBody(content: string, markers: readonly string[]): string {
  const suffix = markers.length ? `\n\n${markers.join('\n')}` : '';
  const full = `${content}${suffix}`;
  if (Buffer.byteLength(full, 'utf8') <= MAX_BODY_BYTES && full.length <= MAX_BODY_BYTES) return full;
  const pieces = content.split(/\n\n/);
  // The heading and impact are required for an inline comment. For a summary,
  // this retains its heading and count before omitting optional tables/details.
  const requiredCount = pieces[1] && pieces[1].length <= 2_000 ? 2 : 1;
  const required = pieces.slice(0, requiredCount).join('\n\n');
  const omitted = `\n\n… ${Math.max(0, pieces.length - requiredCount)} sections omitted because of GitHub's comment limit.`;
  const reduced = `${required}${omitted}${suffix}`;
  if (Buffer.byteLength(reduced, 'utf8') > MAX_BODY_BYTES || reduced.length > MAX_BODY_BYTES) {
    throw new GitHubReviewError('publication-unavailable', 'Required review body exceeds GitHub limit');
  }
  return reduced;
}
